import 'reflect-metadata';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createConnection } from 'node:net';
import type { Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { Body, Controller, Delete, Get, Headers, Module, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { z } from 'zod';
import type { AuthPrincipal } from '@gc/contracts';
import { tenantPoolFromId, withTransaction } from '@gc/database';
import { assertActivityRead, assertSafeOfficeArchive, bootstrapNest, currentUser, HEALTH_RESPONSE, JwtAuthGuard, officeMediaType, Public, requirePermission } from '@gc/platform';
import { assertActivityAttachmentWrite, assertMemberPhotoRead, assertUploadQuota } from './authorization.js';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_file_service';

const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.txt', '.csv', '.png', '.jpg', '.jpeg']);
const officeZipExtensions = new Set(['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp']);
const departmentDocumentSchema = z.object({
  departmentId: z.uuid(),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(3000).default(''),
  documentType: z.enum(['PROGRAM', 'GUIDE', 'MINUTES', 'BUDGET', 'REPORT', 'TEMPLATE', 'OTHER']),
  ministryYear: z.coerce.number().int().min(2000).max(2100),
  alignmentBasis: z.enum(['ANNUAL_CHURCH_PLAN', 'ADVENTIST_MANUAL', 'DEPARTMENTAL_GUIDE', 'LOCAL_STRATEGIC_PLAN', 'OTHER']),
  alignmentReference: z.string().trim().min(3).max(500),
  alignmentNotes: z.string().trim().max(3000).default(''),
  visibility: z.enum(['DEPARTMENT', 'LEADERSHIP', 'TENANT']).default('DEPARTMENT'),
  alignmentConfirmed: z.union([z.literal('true'), z.literal(true)]).transform(() => true)
});
const departmentDocumentQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  departmentId: z.uuid().optional(),
  documentType: z.enum(['PROGRAM', 'GUIDE', 'MINUTES', 'BUDGET', 'REPORT', 'TEMPLATE', 'OTHER']).optional(),
  ministryYear: z.coerce.number().int().min(2000).max(2100).optional(),
  alignmentStatus: z.enum(['DECLARED', 'VERIFIED', 'NEEDS_CHANGES']).optional()
});
const alignmentReviewSchema = z.object({
  status: z.enum(['VERIFIED', 'NEEDS_CHANGES']),
  notes: z.string().trim().min(5).max(3000)
});

type ScanResult = { status: 'CLEAN' | 'INFECTED' | 'ERROR' | 'SKIPPED'; engine: string; signature?: string; engineVersion?: string };
type DepartmentAccess = { role: string | null; canUpload: boolean; canManage: boolean };

const writableDepartmentRoles = new Set(['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY', 'PLANNER', 'CONTRIBUTOR']);
const leadershipDepartmentRoles = new Set(['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY']);

function escapeHtml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function leadershipUser(user: AuthPrincipal): boolean {
  return user.roles.some((role) => ['TENANT_ADMIN', 'PASTOR', 'BOARD_SECRETARY', 'FIRST_ELDER', 'AUDITOR'].includes(role));
}

async function departmentAccess(pool: Pool | PoolClient, user: AuthPrincipal, departmentId: string): Promise<DepartmentAccess> {
  const membership = await pool.query<{ role: string }>(
    `SELECT role FROM identity.department_memberships WHERE user_id=$1 AND department_id=$2`, [user.sub, departmentId]
  );
  const role = membership.rows[0]?.role ?? null;
  return {
    role,
    canUpload: user.permissions.includes('documents.manage') || Boolean(role && writableDepartmentRoles.has(role)),
    canManage: user.permissions.includes('documents.manage') || ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(role ?? '')
  };
}

async function canReadDepartmentDocument(pool: Pool, user: AuthPrincipal, documentId: string): Promise<boolean> {
  const document = await pool.query<{ department_id: string; visibility: string; created_by: string }>(
    `SELECT department_id,visibility,created_by FROM files.department_documents WHERE id=$1`, [documentId]
  );
  const item = document.rows[0];
  if (!item) return false;
  if (user.permissions.includes('documents.manage') || user.permissions.includes('documents.review')) return true;
  if (item.visibility === 'TENANT') return true;
  if (item.visibility === 'LEADERSHIP' && (leadershipUser(user) || item.created_by === user.sub)) return true;
  const membership = await pool.query<{ role: string }>(`SELECT role FROM identity.department_memberships WHERE user_id=$1 AND department_id=$2`, [user.sub, item.department_id]);
  if (item.visibility === 'LEADERSHIP') return leadershipDepartmentRoles.has(membership.rows[0]?.role ?? '');
  return item.visibility === 'DEPARTMENT' && Boolean(membership.rowCount);
}

function previewHtml(title: string, content: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{margin:0;padding:32px;background:#f6faf8;color:#152b26;font:15px/1.55 Arial,sans-serif}main{max-width:1000px;margin:auto;padding:34px;background:#fff;border:1px solid #dce8e4;border-radius:18px;box-shadow:0 16px 40px #143d3212}h1{margin-top:0;font-size:24px}h2{margin-top:28px;color:#087266}pre{white-space:pre-wrap;font:14px/1.65 Arial,sans-serif}table{width:100%;border-collapse:collapse;margin:14px 0 28px}th,td{padding:9px;border:1px solid #dbe7e3;text-align:left;vertical-align:top}th{background:#eaf5f1}.note{padding:16px;border-radius:12px;background:#fff7dd;color:#6b541e}</style></head><body><main><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`;
}

function s3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:59000',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'gestionchurch',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'gestionchurch-local-only'
    }
  });
}

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try { await client.send(new HeadBucketCommand({ Bucket: bucket })); }
  catch { await client.send(new CreateBucketCommand({ Bucket: bucket })); }
}

async function clamScan(buffer: Buffer): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (!host) {
    const infected = buffer.toString('ascii').includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
    return infected ? { status: 'INFECTED', engine: 'EICAR-local', signature: 'EICAR-Test-Signature' } : { status: 'SKIPPED', engine: 'signature-fallback' };
  }
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  return new Promise((resolveScan) => {
    const socket = createConnection({ host, port });
    let output = '';
    const finish = (result: ScanResult) => { if (!socket.destroyed) socket.destroy(); resolveScan(result); };
    socket.setTimeout(Number(process.env.CLAMAV_TIMEOUT_MS ?? 20_000), () => finish({ status: 'ERROR', engine: 'ClamAV', signature: 'timeout' }));
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        const chunk = buffer.subarray(offset, Math.min(buffer.length, offset + 64 * 1024));
        const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length); socket.write(size); socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (data) => { output += data.toString('utf8'); });
    socket.on('end', () => {
      if (output.includes('FOUND')) finish({ status: 'INFECTED', engine: 'ClamAV', signature: output.replaceAll('\0', '').trim() });
      else if (output.includes('OK')) finish({ status: 'CLEAN', engine: 'ClamAV' });
      else finish({ status: 'ERROR', engine: 'ClamAV', signature: output.replaceAll('\0', '').trim() || 'respuesta inválida' });
    });
    socket.on('error', (error) => finish({ status: 'ERROR', engine: 'ClamAV', signature: error.message }));
  });
}

async function storeObject(tenantId: string, storedName: string, buffer: Buffer, mediaType: string): Promise<'LOCAL' | 'S3'> {
  if ((process.env.OBJECT_STORAGE_PROVIDER ?? 'local').toLowerCase() === 's3') {
    const client = s3Client();
    const bucket = process.env.S3_BUCKET ?? 'gestionchurch-programs';
    await ensureBucket(client, bucket);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: `${tenantId}/${storedName}`, Body: buffer, ContentType: mediaType }));
    return 'S3';
  }
  const root = resolve(process.env.UPLOAD_ROOT ?? '.local/uploads', tenantId);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, storedName), buffer, { flag: 'wx' });
  return 'LOCAL';
}

async function loadObject(tenantId: string, storedName: string, provider: string): Promise<Buffer> {
  if (provider === 'S3') {
    const response = await s3Client().send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET ?? 'gestionchurch-programs', Key: `${tenantId}/${storedName}`
    }));
    if (!response.Body) throw new Error('Objeto sin contenido.');
    return Buffer.from(await response.Body.transformToByteArray());
  }
  return readFile(join(resolve(process.env.UPLOAD_ROOT ?? '.local/uploads', tenantId), basename(storedName)));
}

/** Rollback compensation for this request's successfully created UUID object only. */
async function removeNewObject(tenantId: string, storedName: string, provider: 'LOCAL' | 'S3'): Promise<void> {
  if (!/^[a-f0-9-]{36}$/.test(tenantId) || !/^[a-f0-9-]{36}\.[a-z0-9]+$/.test(storedName)) throw new Error('Unsafe upload compensation target.');
  if (provider === 'S3') {
    await s3Client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET ?? 'gestionchurch-programs', Key: `${tenantId}/${storedName}` }));
    return;
  }
  const root = resolve(process.env.UPLOAD_ROOT ?? '.local/uploads', tenantId), target = resolve(root, storedName);
  if (dirname(target) !== root) throw new Error('Unsafe upload compensation path.');
  try { await unlink(target); }
  catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error; }
}

function detectSafeType(buffer: Buffer, extension: string, _supplied: string): string | null {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (extension === '.pdf' && buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (officeZipExtensions.has(extension) && signature.startsWith('504b0304')) {
    assertSafeOfficeArchive(buffer, extension);
    return officeMediaType(extension);
  }
  if (['.doc', '.xls', '.ppt'].includes(extension) && signature.startsWith('d0cf11e0a1b11ae1')) return 'application/x-ole-storage';
  if (['.png'].includes(extension) && signature.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (['.jpg', '.jpeg'].includes(extension) && signature.startsWith('ffd8ff')) return 'image/jpeg';
  if (['.txt', '.csv'].includes(extension) && !buffer.includes(0)) return extension === '.csv' ? 'text/csv' : 'text/plain';
  return null;
}

@Controller()
class FileController {
  @Public()
  @Get('health/live')
  health() { return HEALTH_RESPONSE; }

  @Get('files/department-documents/context')
  async departmentDocumentContext(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'documents.read');
    const { pool } = await tenantPoolFromId(user.tenantId!);
    const broadAccess = user.permissions.includes('documents.manage');
    const departments = await pool.query(
      broadAccess
        ? `SELECT id,name,color,description,true "canUpload" FROM calendar.departments WHERE active ORDER BY name`
        : `SELECT d.id,d.name,d.color,d.description,(m.role=ANY($2::text[])) "canUpload"
             FROM identity.department_memberships m JOIN calendar.departments d ON d.id=m.department_id
            WHERE m.user_id=$1 AND d.active ORDER BY d.name`,
      broadAccess ? [] : [user.sub, [...writableDepartmentRoles]]
    );
    return {
      departments: departments.rows,
      canReview: user.permissions.includes('documents.review'),
      canUpload: departments.rows.some((item) => item.canUpload),
      currentYear: new Date().getFullYear()
    };
  }

  @Get('files/department-documents')
  async departmentDocuments(@Req() request: Request & { user?: AuthPrincipal }, @Query() query: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'documents.read');
    const filters = departmentDocumentQuerySchema.parse(query);
    const { pool } = await tenantPoolFromId(user.tenantId!);
    const memberships = await pool.query<{ department_id: string; role: string }>(
      `SELECT department_id,role FROM identity.department_memberships WHERE user_id=$1`, [user.sub]
    );
    const membershipIds = memberships.rows.map((item) => item.department_id);
    const leadershipDepartmentIds = memberships.rows.filter((item) => leadershipDepartmentRoles.has(item.role)).map((item) => item.department_id);
    const broadRead = user.permissions.includes('documents.manage') || user.permissions.includes('documents.review');
    const result = await pool.query(
      `SELECT d.id,d.file_id "fileId",d.department_id "departmentId",dep.name "departmentName",dep.color "departmentColor",
              d.title,d.description,d.document_type "documentType",d.ministry_year "ministryYear",
              d.alignment_basis "alignmentBasis",d.alignment_reference "alignmentReference",d.alignment_notes "alignmentNotes",
              d.alignment_status "alignmentStatus",d.visibility,d.created_by "createdBy",creator.name "createdByName",
              reviewer.name "reviewedByName",d.reviewed_at "reviewedAt",d.created_at "createdAt",d.updated_at "updatedAt",
              f.original_name "originalName",f.media_type "mediaType",f.size_bytes "sizeBytes",f.version,f.sha256
         FROM files.department_documents d
         JOIN files.file_objects f ON f.id=d.file_id
         JOIN calendar.departments dep ON dep.id=d.department_id
         JOIN identity.users creator ON creator.id=d.created_by
         LEFT JOIN identity.users reviewer ON reviewer.id=d.reviewed_by
        WHERE f.status='AVAILABLE' AND f.deleted_at IS NULL
          AND ($1::boolean OR d.visibility='TENANT' OR (d.visibility='DEPARTMENT' AND d.department_id=ANY($2::uuid[]))
               OR (d.visibility='LEADERSHIP' AND ($3::boolean OR d.created_by=$9::uuid OR d.department_id=ANY($10::uuid[]))))
          AND ($4::uuid IS NULL OR d.department_id=$4::uuid)
          AND ($5::text IS NULL OR d.document_type=$5::text)
          AND ($6::integer IS NULL OR d.ministry_year=$6::integer)
          AND ($7::text IS NULL OR d.alignment_status=$7::text)
          AND ($8::text IS NULL OR lower(d.title||' '||d.description||' '||d.alignment_reference||' '||f.original_name) LIKE '%'||lower($8)||'%')
        ORDER BY d.created_at DESC`,
      [broadRead, membershipIds, leadershipUser(user), filters.departmentId ?? null, filters.documentType ?? null,
        filters.ministryYear ?? null, filters.alignmentStatus ?? null, filters.q ?? null, user.sub, leadershipDepartmentIds]
    );
    const membershipRoles = new Map(memberships.rows.map((item) => [item.department_id, item.role]));
    return {
      items: result.rows.map((item) => ({
        ...item,
        capabilities: {
          canDelete: user.permissions.includes('documents.manage') || item.createdBy === user.sub || ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(membershipRoles.get(item.departmentId) ?? ''),
          canReview: user.permissions.includes('documents.review')
        }
      }))
    };
  }

  @Post('files/department-documents')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 15 * 1024 * 1024), files: 1 }
  }))
  async uploadDepartmentDocument(
    @Req() request: Request & { user?: AuthPrincipal },
    @Body() body: unknown,
    @UploadedFile() file?: Express.Multer.File
  ) {
    const user = currentUser(request);
    requirePermission(user, 'documents.read');
    if (!user.tenantId) throw Object.assign(new Error('Se requiere un tenant.'), { status: 403 });
    const input = departmentDocumentSchema.parse(body);
    if (!file) throw Object.assign(new Error('Seleccione un documento.'), { status: 400, code: 'FILE_REQUIRED' });
    const { pool } = await tenantPoolFromId(user.tenantId);
    const department = await pool.query(`SELECT 1 FROM calendar.departments WHERE id=$1 AND active`, [input.departmentId]);
    if (!department.rowCount) throw Object.assign(new Error('El departamento no está disponible.'), { status: 404 });
    const access = await departmentAccess(pool, user, input.departmentId);
    if (!access.canUpload) throw Object.assign(new Error('Su rol departamental no permite cargar documentos.'), { status: 403, code: 'DOCUMENT_UPLOAD_DENIED' });
    const extension = extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) throw Object.assign(new Error('Formato de archivo no permitido.'), { status: 415, code: 'FILE_TYPE_NOT_ALLOWED' });
    const detectedType = detectSafeType(file.buffer, extension, file.mimetype);
    const id = randomUUID();
    const storedName = `${id}${extension}`;
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const quota = Number(process.env.TENANT_UPLOAD_QUOTA_BYTES ?? 1024 * 1024 * 1024);
    const usage = await pool.query<{ total: string }>(`SELECT COALESCE(sum(size_bytes),0)::text total FROM files.file_objects WHERE deleted_at IS NULL AND status='AVAILABLE'`);
    if (Number(usage.rows[0]?.total ?? 0) + file.size > quota) throw Object.assign(new Error('La cuota de archivos de la iglesia fue alcanzada.'), { status: 413, code: 'TENANT_FILE_QUOTA_EXCEEDED' });
    await pool.query(
      `INSERT INTO files.file_objects(id,activity_id,original_name,stored_name,media_type,size_bytes,sha256,status,version,uploaded_by)
       VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, basename(file.originalname), storedName, detectedType ?? file.mimetype, file.size, hash, detectedType ? 'SCANNING' : 'REJECTED', 1, user.sub]
    );
    if (!detectedType) {
      await pool.query(`INSERT INTO files.scan_results(file_id,engine,status,signature) VALUES($1,'signature-validation','ERROR',$2)`, [id, 'La firma no coincide con la extensión.']);
      throw Object.assign(new Error('La firma del archivo no coincide con su extensión.'), { status: 422, code: 'REJECTED' });
    }
    const scan = await clamScan(file.buffer);
    await pool.query(
      `INSERT INTO files.scan_results(file_id,engine,engine_version,status,signature) VALUES($1,$2,$3,$4,$5)`,
      [id, scan.engine, scan.engineVersion ?? null, scan.status, scan.signature ?? null]
    );
    const scanAcceptable = scan.status === 'CLEAN' || (scan.status === 'SKIPPED' && process.env.NODE_ENV !== 'production');
    if (!scanAcceptable) {
      await pool.query(`UPDATE files.file_objects SET status='QUARANTINED',scan_engine=$2,scan_signature=$3 WHERE id=$1`, [id, scan.engine, scan.signature ?? null]);
      throw Object.assign(new Error('El documento fue puesto en cuarentena.'), { status: 422, code: 'QUARANTINED' });
    }
    let storedProvider: 'LOCAL' | 'S3' | undefined;
    try {
      return await withTransaction(pool, async (client) => {
        const currentAccess = await departmentAccess(client, user, input.departmentId);
        if (!currentAccess.canUpload) throw Object.assign(new Error('Su rol departamental no permite cargar documentos.'), { status: 403, code: 'DOCUMENT_UPLOAD_DENIED' });
        await assertUploadQuota(client, file.size);
        await client.query("SELECT pg_advisory_xact_lock(hashtext('department-document:'||$1::text||':'||lower($2)))", [input.departmentId, input.title]);
        const versionResult = await client.query<{ next_version: number }>(
          `SELECT COALESCE(max(f.version),0)+1 next_version FROM files.file_objects f JOIN files.department_documents d ON d.file_id=f.id
            WHERE d.department_id=$1 AND lower(d.title)=lower($2)`, [input.departmentId, input.title],
        );
        const version = versionResult.rows[0]?.next_version ?? 1;
        storedProvider = await storeObject(user.tenantId!, storedName, file.buffer, detectedType);
        await client.query(`UPDATE files.file_objects SET status='AVAILABLE',version=$2,storage_provider=$3,scan_engine=$4,scan_signature=$5 WHERE id=$1`, [id, version, storedProvider, scan.engine, scan.signature ?? null]);
        const document = await client.query<{ id: string }>(
          `INSERT INTO files.department_documents(file_id,department_id,title,description,document_type,ministry_year,
            alignment_basis,alignment_reference,alignment_notes,visibility,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [id, input.departmentId, input.title, input.description, input.documentType, input.ministryYear,
            input.alignmentBasis, input.alignmentReference, input.alignmentNotes, input.visibility, user.sub],
        );
        await client.query(
          `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
           VALUES($1,'department_document.uploaded','department_document',$2,$3::jsonb,$4)`,
          [user.sub, document.rows[0]!.id, JSON.stringify({ ...input, fileId: id, version, provider: storedProvider, hash }), request.headers['x-correlation-id'] ?? null],
        );
        return { id: document.rows[0]!.id, fileId: id, version, alignmentStatus: 'DECLARED', status: 'AVAILABLE' };
      });
    } catch (error) {
      try {
        // COMMIT can succeed while its response is lost. Reconcile before
        // removing an object; a DB outage leaves it intact for later recovery.
        const state = await pool.query<{ document_id: string | null; version: number; status: string }>(
          'SELECT d.id document_id,f.version,f.status FROM files.file_objects f LEFT JOIN files.department_documents d ON d.file_id=f.id WHERE f.id=$1', [id],
        );
        if (state.rows[0]?.document_id && state.rows[0].status === 'AVAILABLE') {
          return { id: state.rows[0].document_id, fileId: id, version: state.rows[0].version, alignmentStatus: 'DECLARED', status: 'AVAILABLE', reconciled: true };
        }
        if (storedProvider) await removeNewObject(user.tenantId!, storedName, storedProvider);
        await pool.query("UPDATE files.file_objects SET status='REJECTED' WHERE id=$1 AND status='SCANNING'", [id]);
      } catch {
        console.error(JSON.stringify({ level: 'warn', service: 'file-service', event: 'document_publication_reconciliation_deferred' }));
      }
      throw error;
    }
  }

  @Get('files/department-documents/:id/preview')
  async previewDepartmentDocument(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Res() response: Response) {
    const user = currentUser(request);
    requirePermission(user, 'documents.read');
    const { pool } = await tenantPoolFromId(user.tenantId!);
    if (!(await canReadDepartmentDocument(pool, user, id))) return response.status(403).json({ status: 403, detail: 'No puede visualizar este documento.' });
    const result = await pool.query<{ title: string; original_name: string; stored_name: string; media_type: string; storage_provider: string; status: string }>(
      `SELECT d.title,f.original_name,f.stored_name,f.media_type,f.storage_provider,f.status
         FROM files.department_documents d JOIN files.file_objects f ON f.id=d.file_id
        WHERE d.id=$1 AND f.deleted_at IS NULL`, [id]
    );
    const item = result.rows[0];
    if (!item || item.status !== 'AVAILABLE') return response.status(404).json({ status: 404, detail: 'El documento no está disponible.' });
    const contents = await loadObject(user.tenantId!, item.stored_name, item.storage_provider);
    const extension = extname(item.original_name).toLowerCase();
    if (officeZipExtensions.has(extension)) assertSafeOfficeArchive(contents, extension);
    response.setHeader('cache-control', 'private, no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(item.original_name)}`);
    if (item.media_type === 'application/pdf' || item.media_type.startsWith('image/')) {
      response.type(item.media_type).send(contents);
      return;
    }
    let content: string;
    if (extension === '.docx') {
      const extracted = await mammoth.extractRawText({ buffer: contents });
      content = `<pre>${escapeHtml(extracted.value)}</pre>`;
    } else if (extension === '.xlsx') {
      const workbook = new ExcelJS.Workbook();
      const workbookBytes = contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength) as ArrayBuffer;
      await workbook.xlsx.load(workbookBytes);
      content = workbook.worksheets.slice(0, 5).map((sheet) => {
        const rows: string[] = [];
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber > 100) return;
          const cells: string[] = [];
          for (let column = 1; column <= Math.min(row.cellCount, 20); column++) cells.push(`<td>${escapeHtml(row.getCell(column).text)}</td>`);
          rows.push(`<tr>${cells.join('')}</tr>`);
        });
        return `<h2>${escapeHtml(sheet.name)}</h2><table><tbody>${rows.join('')}</tbody></table>`;
      }).join('');
    } else if (['.txt', '.csv'].includes(extension)) {
      content = `<pre>${escapeHtml(contents.toString('utf8'))}</pre>`;
    } else {
      content = `<div class="note"><strong>Vista protegida disponible.</strong><p>Este formato no puede convertirse de manera segura en el navegador. Consulta sus metadatos y utiliza la descarga autorizada para abrirlo en su aplicación original.</p></div>`;
    }
    response.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'");
    response.type('text/html; charset=utf-8').send(previewHtml(item.title, content));
  }

  @Patch('files/department-documents/:id/alignment')
  async reviewDepartmentDocument(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Body() body: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'documents.review');
    const input = alignmentReviewSchema.parse(body);
    const { pool } = await tenantPoolFromId(user.tenantId!);
    const updated = await pool.query(
      `UPDATE files.department_documents
          SET alignment_status=$2,alignment_notes=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now()
        WHERE id=$1 RETURNING id,alignment_status "alignmentStatus",reviewed_at "reviewedAt"`,
      [id, input.status, input.notes, user.sub]
    );
    if (!updated.rowCount) throw Object.assign(new Error('El documento no existe.'), { status: 404 });
    await pool.query(
      `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
       VALUES($1,'department_document.alignment_reviewed','department_document',$2,$3::jsonb,$4)`,
      [user.sub, id, JSON.stringify(input), request.headers['x-correlation-id'] ?? null]
    );
    return updated.rows[0];
  }

  @Delete('files/department-documents/:id')
  async removeDepartmentDocument(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string) {
    const user = currentUser(request);
    requirePermission(user, 'documents.read');
    const { pool } = await tenantPoolFromId(user.tenantId!);
    const document = await pool.query<{ file_id: string; department_id: string; created_by: string }>(
      `SELECT file_id,department_id,created_by FROM files.department_documents WHERE id=$1`, [id]
    );
    const item = document.rows[0];
    if (!item) throw Object.assign(new Error('El documento no existe.'), { status: 404 });
    const access = await departmentAccess(pool, user, item.department_id);
    if (!access.canManage && !(access.canUpload && item.created_by === user.sub)) throw Object.assign(new Error('No puede retirar este documento.'), { status: 403 });
    await pool.query(`UPDATE files.file_objects SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL`, [item.file_id]);
    await pool.query(
      `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
       VALUES($1,'department_document.deleted','department_document',$2,'{}'::jsonb,$3)`,
      [user.sub, id, request.headers['x-correlation-id'] ?? null]
    );
    return { id, deleted: true };
  }

  @Post('files/activity/:activityId')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 15 * 1024 * 1024), files: 1 }
  }))
  async upload(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('activityId') activityId: string,
    @UploadedFile() file?: Express.Multer.File,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    if (!user.tenantId) throw Object.assign(new Error('Se requiere un tenant.'), { status: 403 });
    if (!file) throw Object.assign(new Error('Seleccione un archivo.'), { status: 400, code: 'FILE_REQUIRED' });
    const extension = extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) throw Object.assign(new Error('Formato de archivo no permitido.'), { status: 415, code: 'FILE_TYPE_NOT_ALLOWED' });
    const detectedType = detectSafeType(file.buffer, extension, file.mimetype);
    const id = randomUUID();
    const storedName = `${id}${extension}`;
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const { pool } = await tenantPoolFromId(user.tenantId);
    await assertActivityAttachmentWrite(pool, user, activityId);
    if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) throw Object.assign(new Error('Idempotency-Key no es válida.'), { status: 400, code: 'INVALID_IDEMPOTENCY_KEY' });
    const keyDigest = idempotencyKey ? createHash('sha256').update(`${user.sub}/${idempotencyKey}`).digest('hex') : null;
    const requestHash = createHash('sha256').update(JSON.stringify({ activityId, name: basename(file.originalname), hash, size: file.size, mediaType: detectedType ?? file.mimetype })).digest('hex');
    const replay = async (client: Pool | PoolClient) => {
      if (!keyDigest) return null;
      const previous = await client.query(
        `SELECT f.id,f.activity_id,f.original_name,f.media_type,f.size_bytes,f.sha256,f.status,f.version,f.storage_provider,f.created_at,f.deleted_at,
          ae.after_data->>'requestHash' request_hash
          FROM audit.audit_events ae JOIN files.file_objects f ON f.id::text=ae.resource_id
          WHERE ae.action='file.uploaded' AND ae.actor_id=$1 AND ae.after_data->>'idempotencyKeyDigest'=$2
          ORDER BY ae.created_at DESC LIMIT 1`, [user.sub, keyDigest]
      );
      const receipt = previous.rows[0];
      if (!receipt) return null;
      if (receipt.request_hash !== requestHash) throw Object.assign(new Error('La misma Idempotency-Key fue usada con otro archivo.'), { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
      if (receipt.deleted_at || receipt.status !== 'AVAILABLE') throw Object.assign(new Error('El archivo de esta solicitud ya no está disponible. Revise el registro antes de enviar otra solicitud.'), { status: 409, code: 'IDEMPOTENT_FILE_UNAVAILABLE' });
      const { request_hash: _hash, deleted_at: _deleted, ...result } = receipt;
      return { ...result, replayed: true };
    };
    const previous = await replay(pool);
    if (previous) return previous;
    const quota = Number(process.env.TENANT_UPLOAD_QUOTA_BYTES ?? 1024 * 1024 * 1024);
    const usage = await pool.query<{ total: string }>(
      `SELECT COALESCE(sum(size_bytes),0)::text total FROM files.file_objects WHERE deleted_at IS NULL AND status='AVAILABLE'`
    );
    if (Number(usage.rows[0]?.total ?? 0) + file.size > quota) {
      throw Object.assign(new Error('La cuota de archivos de la iglesia fue alcanzada.'), { status: 413, code: 'TENANT_FILE_QUOTA_EXCEEDED' });
    }
    const version = await withTransaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`activity-file:${activityId}:${basename(file.originalname)}`]);
      const versionResult = await client.query<{ next_version: number }>(
      `SELECT COALESCE(max(version),0)+1 next_version FROM files.file_objects WHERE activity_id=$1 AND original_name=$2`,
      [activityId, basename(file.originalname)]
    );
      const nextVersion = versionResult.rows[0]?.next_version ?? 1;
      await client.query(
      `INSERT INTO files.file_objects(id,activity_id,original_name,stored_name,media_type,size_bytes,sha256,status,version,uploaded_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, activityId, basename(file.originalname), storedName, detectedType ?? file.mimetype, file.size, hash,
        detectedType ? 'SCANNING' : 'REJECTED', nextVersion, user.sub]
    );
      return nextVersion;
    });
    if (!detectedType) {
      await pool.query(
        `INSERT INTO files.scan_results(file_id,engine,status,signature) VALUES($1,'signature-validation','ERROR',$2)`,
        [id, 'La firma no coincide con la extensión.']
      );
      throw Object.assign(new Error('La firma del archivo no coincide con su extensión.'), { status: 422, code: 'REJECTED' });
    }
    const scan = await clamScan(file.buffer);
    await pool.query(
      `INSERT INTO files.scan_results(file_id,engine,engine_version,status,signature)
       VALUES($1,$2,$3,$4,$5)`, [id, scan.engine, scan.engineVersion ?? null, scan.status, scan.signature ?? null]
    );
    const scanAcceptable = scan.status === 'CLEAN' || (scan.status === 'SKIPPED' && process.env.NODE_ENV !== 'production');
    if (!scanAcceptable) {
      await pool.query(`UPDATE files.file_objects SET status='QUARANTINED',scan_engine=$2,scan_signature=$3 WHERE id=$1`, [id, scan.engine, scan.signature ?? null]);
      await pool.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
         VALUES($1,'file.quarantined','file',$2,$3::jsonb,$4)`,
        [user.sub, id, JSON.stringify(scan), request.headers['x-correlation-id'] ?? null]
      );
      throw Object.assign(new Error('El archivo fue puesto en cuarentena.'), { status: 422, code: 'QUARANTINED' });
    }
    let storedProvider: 'LOCAL' | 'S3' | undefined;
    try {
    const result = await withTransaction(pool, async (client) => {
      if (keyDigest) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`file.upload:${keyDigest}`]);
      const previous = await replay(client);
      if (previous) {
        // Only this uncommitted attempt's staging metadata is disposable.
        await client.query("DELETE FROM files.file_objects WHERE id=$1 AND status='SCANNING'", [id]);
        return previous;
      }
      // Recheck under the activity lock after scanning; approval may have changed.
      await assertActivityAttachmentWrite(client, user, activityId, false, true);
      await assertUploadQuota(client, file.size);
      const provider = await storeObject(user.tenantId!, storedName, file.buffer, detectedType);
      storedProvider = provider;
      const updated = await client.query(
      `UPDATE files.file_objects SET status='AVAILABLE',storage_provider=$2,scan_engine=$3,scan_signature=$4
       WHERE id=$1 RETURNING id,activity_id,original_name,media_type,size_bytes,sha256,status,version,storage_provider,created_at`,
      [id, provider, scan.engine, scan.signature ?? null]
      );
      await client.query(
      `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
       VALUES($1,'file.uploaded','file',$2,$3::jsonb,$4)`,
      [user.sub, id, JSON.stringify({ activityId, version, provider, hash, ...(keyDigest ? { idempotencyKeyDigest: keyDigest, requestHash } : {}) }), request.headers['x-correlation-id'] ?? null]
      );
      return updated.rows[0];
    });
    return result;
    } catch (error) {
      try {
        const committed = await pool.query('SELECT id,activity_id,original_name,media_type,size_bytes,sha256,status,version,storage_provider,created_at FROM files.file_objects WHERE id=$1', [id]);
        if (committed.rows[0]?.status === 'AVAILABLE') return { ...committed.rows[0], reconciled: true };
        if (storedProvider) await removeNewObject(user.tenantId!, storedName, storedProvider);
        await pool.query("UPDATE files.file_objects SET status='REJECTED' WHERE id=$1 AND status='SCANNING'", [id]);
      } catch { console.error(JSON.stringify({ level: 'warn', service: 'file-service', event: 'attachment_publication_reconciliation_deferred' })); }
      throw error;
    }
  }

  @Get('files/activity/:activityId')
  async list(@Req() request: Request & { user?: AuthPrincipal }, @Param('activityId') activityId: string) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const { pool } = await tenantPoolFromId(user.tenantId!);
    await assertActivityRead(pool, user, activityId);
    const result = await pool.query(
      `SELECT id,activity_id,original_name,media_type,size_bytes,sha256,status,version,created_at
       FROM files.file_objects WHERE activity_id=$1 AND status <> 'REJECTED' AND deleted_at IS NULL ORDER BY created_at DESC`, [activityId]
    );
    return { items: result.rows };
  }

  @Post('files/member-photos/:memberId')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.MEMBER_PHOTO_MAX_BYTES ?? 5 * 1024 * 1024), files: 1 }
  }))
  async uploadMemberPhoto(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('memberId') rawMemberId: string,
    @UploadedFile() file?: Express.Multer.File
  ) {
    const user = currentUser(request);
    requirePermission(user, 'users.manage');
    const memberId = z.uuid().parse(rawMemberId);
    if (!user.tenantId) throw Object.assign(new Error('Se requiere un tenant.'), { status: 403 });
    if (!file) throw Object.assign(new Error('Seleccione una fotografía.'), { status: 400, code: 'MEMBER_PHOTO_REQUIRED' });
    const extension = extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(extension)) throw Object.assign(new Error('La fotografía debe estar en formato JPG o PNG.'), { status: 415, code: 'MEMBER_PHOTO_TYPE_NOT_ALLOWED' });
    const detectedType = detectSafeType(file.buffer, extension, file.mimetype);
    if (!detectedType?.startsWith('image/')) throw Object.assign(new Error('La firma del archivo no corresponde a una imagen válida.'), { status: 422, code: 'MEMBER_PHOTO_INVALID' });
    const { pool } = await tenantPoolFromId(user.tenantId);
    const member = await pool.query<{ display_name: string }>(`SELECT display_name FROM identity.church_members WHERE id=$1`, [memberId]);
    if (!member.rows[0]) throw Object.assign(new Error('La persona no existe en el padrón.'), { status: 404, code: 'CHURCH_MEMBER_NOT_FOUND' });
    const quota = Number(process.env.TENANT_UPLOAD_QUOTA_BYTES ?? 1024 * 1024 * 1024);
    const usage = await pool.query<{ total: string }>(`SELECT COALESCE(sum(size_bytes),0)::text total FROM files.file_objects WHERE deleted_at IS NULL AND status='AVAILABLE'`);
    if (Number(usage.rows[0]?.total ?? 0) + file.size > quota) throw Object.assign(new Error('La cuota de archivos de la iglesia fue alcanzada.'), { status: 413, code: 'TENANT_FILE_QUOTA_EXCEEDED' });
    const previous = await pool.query<{ file_id: string; version: number }>(
      `SELECT p.file_id,f.version FROM files.member_photos p JOIN files.file_objects f ON f.id=p.file_id WHERE p.member_id=$1`, [memberId]
    );
    const id = randomUUID();
    const storedName = `${id}${extension}`;
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const version = (previous.rows[0]?.version ?? 0) + 1;
    await pool.query(
      `INSERT INTO files.file_objects(id,activity_id,original_name,stored_name,media_type,size_bytes,sha256,status,version,uploaded_by)
       VALUES($1,NULL,$2,$3,$4,$5,$6,'SCANNING',$7,$8)`,
      [id, basename(file.originalname), storedName, detectedType, file.size, hash, version, user.sub]
    );
    const scan = await clamScan(file.buffer);
    await pool.query(
      `INSERT INTO files.scan_results(file_id,engine,engine_version,status,signature) VALUES($1,$2,$3,$4,$5)`,
      [id, scan.engine, scan.engineVersion ?? null, scan.status, scan.signature ?? null]
    );
    const scanAcceptable = scan.status === 'CLEAN' || (scan.status === 'SKIPPED' && process.env.NODE_ENV !== 'production');
    if (!scanAcceptable) {
      await pool.query(`UPDATE files.file_objects SET status='QUARANTINED',scan_engine=$2,scan_signature=$3 WHERE id=$1`, [id, scan.engine, scan.signature ?? null]);
      throw Object.assign(new Error('La fotografía fue puesta en cuarentena.'), { status: 422, code: 'QUARANTINED' });
    }
    const provider = await withTransaction(pool, async (client) => {
      await assertUploadQuota(client, file.size);
      const provider = await storeObject(user.tenantId!, storedName, file.buffer, detectedType);
      await client.query(`UPDATE files.file_objects SET status='AVAILABLE',storage_provider=$2,scan_engine=$3,scan_signature=$4 WHERE id=$1`, [id, provider, scan.engine, scan.signature ?? null]);
      return provider;
    });
    await pool.query(
      `INSERT INTO files.member_photos(member_id,file_id,uploaded_by) VALUES($1,$2,$3)
       ON CONFLICT(member_id) DO UPDATE SET file_id=EXCLUDED.file_id,uploaded_by=EXCLUDED.uploaded_by,updated_at=now()`,
      [memberId, id, user.sub]
    );
    if (previous.rows[0]) await pool.query(`UPDATE files.file_objects SET deleted_at=now() WHERE id=$1`, [previous.rows[0].file_id]);
    await pool.query(
      `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
       VALUES($1,'church_roster.photo.updated','church_member',$2,$3::jsonb,$4)`,
      [user.sub, memberId, JSON.stringify({ fileId: id, mediaType: detectedType, sizeBytes: file.size, hash, version, provider, outcome: 'SUCCESS' }), request.headers['x-correlation-id'] ?? null]
    );
    return { memberId, fileId: id, hasPhoto: true, version, updatedAt: new Date().toISOString() };
  }

  @Get('files/member-photos/:memberId')
  async memberPhoto(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('memberId') rawMemberId: string,
    @Res() response: Response
  ) {
    const user = currentUser(request);
    if (!user.tenantId) return response.status(403).json({ status: 403, detail: 'Se requiere un tenant.' });
    if (!user.permissions.includes('users.manage') && !user.permissions.includes('womens_ministry.read')) {
      return response.status(403).json({ status: 403, detail: 'No tiene permiso para consultar fotografías del padrón.' });
    }
    const memberId = z.uuid().parse(rawMemberId);
    const { pool } = await tenantPoolFromId(user.tenantId);
    await assertMemberPhotoRead(pool, user, memberId);
    const result = await pool.query<{ stored_name: string; media_type: string; storage_provider: string; sha256: string; status: string }>(
      `SELECT f.stored_name,f.media_type,f.storage_provider,f.sha256,f.status
         FROM files.member_photos p JOIN files.file_objects f ON f.id=p.file_id
         JOIN identity.church_members m ON m.id=p.member_id
        WHERE p.member_id=$1 AND f.deleted_at IS NULL`, [memberId]
    );
    const photo = result.rows[0];
    if (!photo || photo.status !== 'AVAILABLE') return response.status(404).json({ status: 404, detail: 'La fotografía no está disponible.' });
    if (request.headers['if-none-match'] === `"${photo.sha256}"`) return response.status(304).send();
    const contents = await loadObject(user.tenantId, photo.stored_name, photo.storage_provider);
    response.setHeader('content-type', photo.media_type);
    response.setHeader('content-disposition', 'inline');
    response.setHeader('cache-control', 'private, no-store');
    response.setHeader('etag', `"${photo.sha256}"`);
    response.setHeader('x-content-type-options', 'nosniff');
    response.send(contents);
  }

  @Get('files/:id/download')
  async download(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() response: Response
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    if (!user.tenantId) throw Object.assign(new Error('Se requiere un tenant.'), { status: 403 });
    const { pool } = await tenantPoolFromId(user.tenantId);
    if (token) {
      const valid = await pool.query(
        `SELECT 1 FROM files.file_access_tokens WHERE token_hash=$1 AND file_id=$2 AND user_id=$3 AND expires_at>now()`,
        [createHash('sha256').update(token).digest('hex'), id, user.sub]
      );
      if (!valid.rowCount) throw Object.assign(new Error('El enlace de descarga no es válido o ha vencido.'), { status: 403, code: 'SIGNED_URL_INVALID' });
    }
    const result = await pool.query<{ activity_id: string | null; original_name: string; stored_name: string; media_type: string; status: string; storage_provider: string }>(
      `SELECT activity_id,original_name,stored_name,media_type,status,storage_provider
       FROM files.file_objects WHERE id=$1 AND deleted_at IS NULL`, [id]
    );
    const file = result.rows[0];
    if (!file || file.status !== 'AVAILABLE') throw Object.assign(new Error('El archivo no está disponible.'), { status: 404 });
    if (file.activity_id) await assertActivityRead(pool, user, file.activity_id);
    const departmentDocument = await pool.query<{ id: string }>(`SELECT id FROM files.department_documents WHERE file_id=$1`, [id]);
    if (departmentDocument.rows[0] && !(await canReadDepartmentDocument(pool, user, departmentDocument.rows[0].id))) {
      throw Object.assign(new Error('No puede descargar este documento departamental.'), { status: 403 });
    }
    const memberPhoto = await pool.query<{ member_id: string }>(`SELECT member_id FROM files.member_photos WHERE file_id=$1`, [id]);
    if (memberPhoto.rows[0]) await assertMemberPhotoRead(pool, user, memberPhoto.rows[0].member_id);
    const contents = await loadObject(user.tenantId, file.stored_name, file.storage_provider);
    await pool.query(
      `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
       VALUES($1,'file.downloaded','file',$2,'{}'::jsonb,$3)`, [user.sub, id, request.headers['x-correlation-id'] ?? null]
    );
    response.setHeader('content-type', file.media_type);
    response.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('cache-control', 'private, no-store');
    response.send(contents);
  }

  @Post('files/:id/access-token')
  async accessToken(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    if (!user.tenantId) throw Object.assign(new Error('Se requiere un tenant.'), { status: 403 });
    const { pool } = await tenantPoolFromId(user.tenantId);
    const exists = await pool.query<{ activity_id: string | null }>(`SELECT activity_id FROM files.file_objects WHERE id=$1 AND status='AVAILABLE' AND deleted_at IS NULL`, [id]);
    if (!exists.rowCount) throw Object.assign(new Error('El archivo no está disponible.'), { status: 404 });
    if (exists.rows[0]?.activity_id) await assertActivityRead(pool, user, exists.rows[0].activity_id);
    const document = await pool.query<{ id: string }>(`SELECT id FROM files.department_documents WHERE file_id=$1`, [id]);
    if (document.rows[0] && !(await canReadDepartmentDocument(pool, user, document.rows[0].id))) throw Object.assign(new Error('No puede acceder a este documento.'), { status: 403 });
    const photo = await pool.query<{ member_id: string }>(`SELECT member_id FROM files.member_photos WHERE file_id=$1`, [id]);
    if (photo.rows[0]) await assertMemberPhotoRead(pool, user, photo.rows[0].member_id);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await pool.query(
      `INSERT INTO files.file_access_tokens(token_hash,file_id,user_id,expires_at) VALUES($1,$2,$3,$4)`,
      [createHash('sha256').update(token).digest('hex'), id, user.sub, expiresAt]
    );
    return { url: `/api/v1/files/${id}/download?token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString() };
  }

  @Delete('files/:id')
  async remove(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    if (!user.tenantId) throw Object.assign(new Error('Se requiere un tenant.'), { status: 403 });
    const { pool } = await tenantPoolFromId(user.tenantId);
    const departmentDocument = await pool.query<{ id: string; department_id: string; created_by: string }>(
      `SELECT id,department_id,created_by FROM files.department_documents WHERE file_id=$1`, [id]
    );
    if (departmentDocument.rows[0]) {
      const access = await departmentAccess(pool, user, departmentDocument.rows[0].department_id);
      if (!access.canManage && !(access.canUpload && departmentDocument.rows[0].created_by === user.sub)) throw Object.assign(new Error('No puede eliminar este documento departamental.'), { status: 403 });
    }
    const result = await withTransaction(pool, async (client) => {
      const object = await client.query<{ activity_id: string | null }>(`SELECT activity_id FROM files.file_objects WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (object.rows[0]?.activity_id) await assertActivityAttachmentWrite(client, user, object.rows[0].activity_id, true, true);
      else if (!departmentDocument.rows[0]) requirePermission(user, 'users.manage');
      return client.query(
      `UPDATE files.file_objects SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [id]
      );
    });
    if (!result.rowCount) throw Object.assign(new Error('El archivo no existe.'), { status: 404 });
    await pool.query(
      `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
       VALUES($1,'file.deleted','file',$2,'{}'::jsonb,$3)`, [user.sub, id, request.headers['x-correlation-id'] ?? null]
    );
    return { id, deleted: true };
  }
}

@Module({ controllers: [FileController], providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }] })
class FileModule {}

await bootstrapNest(FileModule, 4014, 'file-service');
