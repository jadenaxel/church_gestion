import 'reflect-metadata';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { basename, extname } from 'node:path';
import type { Request, Response } from 'express';
import argon2 from 'argon2';
import ExcelJS from 'exceljs';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UnauthorizedException
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import {
  globalLoginSchema,
  loginSchema,
  permissionsFor,
  roles,
  type AuthPrincipal,
  type Role
} from '@gc/contracts';
import { controlPool, tenantPoolFromId, tenantPoolFromSlug, withTransaction } from '@gc/database';
import {
  assertSafeOfficeArchive,
  bootstrapNest,
  currentUser,
  HEALTH_RESPONSE,
  isProductionDemoPassword,
  JwtAuthGuard,
  Public,
  requirePermission,
  signAccessToken
} from '@gc/platform';
import { dispatchPasswordResets, listPasswordResetDeadLetters, passwordResetRetrySchema, requestPasswordReset, retryPasswordReset } from './password-reset-outbox.js';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_identity_service';

const departmentRoles = ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY', 'PLANNER', 'CONTRIBUTOR', 'VIEWER'] as const;
const departmentMembershipSchema = z.object({
  departmentId: z.uuid(),
  role: z.enum(departmentRoles)
});

type DepartmentApplication = {
  key: string;
  label: string;
  href: string;
  kind: 'SPECIALIZED' | 'WORKSPACE';
  departmentId: string;
  role: string | null;
};

function normalizedDepartmentName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function applicationForDepartment(department: { id: string; name: string; role: string | null }): DepartmentApplication {
  const name = normalizedDepartmentName(department.name);
  if (name.includes('ancianos')) {
    return { key: 'elders', label: department.name, href: '/elders', kind: 'SPECIALIZED', departmentId: department.id, role: department.role };
  }
  if (name.includes('ministerios personales') || name.includes('personal ministries')) {
    return { key: 'personal-ministries', label: department.name, href: '/personal-ministries', kind: 'SPECIALIZED', departmentId: department.id, role: department.role };
  }
  if (/ministerio(s)? de la mujer|women.?s ministr/.test(name)) {
    return { key: 'womens-ministry', label: department.name, href: '/womens-ministry', kind: 'SPECIALIZED', departmentId: department.id, role: department.role };
  }
  return {
    key: `workspace:${department.id}`,
    label: department.name,
    href: `/ministry-hub?departmentId=${encodeURIComponent(department.id)}`,
    kind: 'WORKSPACE',
    departmentId: department.id,
    role: department.role
  };
}

function rolesWithDepartmentAccess(assignedRoles: Role[], memberships: Array<z.infer<typeof departmentMembershipSchema>>): Role[] {
  const next = new Set<Role>(assignedRoles);
  if (memberships.some((membership) => ['DIRECTOR', 'ASSISTANT_DIRECTOR'].includes(membership.role))) next.add('DEPARTMENT_LEADER');
  if (memberships.some((membership) => ['DEPARTMENT_SECRETARY', 'PLANNER', 'CONTRIBUTOR'].includes(membership.role))) next.add('DEPARTMENT_PLANNER');
  return [...next];
}

const createUserSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).optional().or(z.literal('')),
  password: z.string().min(10).max(200).refine((value) => !isProductionDemoPassword(value), 'No use contraseñas de demostración en producción.'),
  assignedRoles: z.array(z.enum(roles)).min(1),
  departmentIds: z.array(z.uuid()).max(30).default([]),
  memberships: z.array(departmentMembershipSchema).max(30).optional()
});

const forgotPasswordSchema = z.object({
  tenant: z.string().trim().min(2).max(80),
  email: z.email().transform((value) => value.toLowerCase())
});
const resetPasswordSchema = z.object({
  tenant: z.string().trim().min(2).max(80),
  token: z.string().min(32).max(200),
  newPassword: z.string().min(12).max(200).refine((value) => !isProductionDemoPassword(value), 'No use contraseñas de demostración en producción.')
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(12).max(200).refine((value) => !isProductionDemoPassword(value), 'No use contraseñas de demostración en producción.')
});
const nominationsLaunchSchema = z.object({ tenantId: z.uuid().optional() }).strict();
const nominationsRedeemSchema = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const nominationsAuthorizeSchema = z.object({
  tenantId: z.uuid(),
  subjectId: z.uuid(),
  subjectScope: z.enum(['global', 'tenant']),
  sourceSessionId: z.uuid()
}).strict();
const nominationsOrganizationSchema = nominationsAuthorizeSchema;

type RosterRecord = {
  memberCode: string;
  firstName: string;
  middleName: string;
  lastName: string;
  displayName: string;
  sex: 'FEMALE' | 'MALE' | 'UNSPECIFIED';
  dateOfBirth: string | null;
  email: string;
  phone: string;
  whatsapp: string;
  maritalStatus: 'SINGLE' | 'MARRIED' | 'WIDOWED' | 'DIVORCED' | 'SEPARATED' | 'UNSPECIFIED';
  membershipStatus: 'MEMBER' | 'VISITOR' | 'INACTIVE' | 'TRANSFERRED';
  baptismDate: string | null;
  joinedOn: string | null;
  address: string;
  emergencyContact: string;
  notes: string;
  active: boolean;
};

type RosterPreviewRow = {
  rowNumber: number;
  source: Record<string, string>;
  normalized: Partial<RosterRecord>;
  status: 'VALID' | 'INVALID';
  errors: string[];
  warnings: string[];
};

const rosterHeaderAliases: Record<string, keyof Omit<RosterRecord, 'displayName' | 'active'>> = {
  codigo: 'memberCode', codigo_miembro: 'memberCode', codigo_de_miembro: 'memberCode', member_code: 'memberCode', id_miembro: 'memberCode',
  nombres: 'firstName', nombre: 'firstName', first_name: 'firstName',
  segundo_nombre: 'middleName', otros_nombres: 'middleName', middle_name: 'middleName',
  apellidos: 'lastName', apellido: 'lastName', last_name: 'lastName',
  sexo: 'sex', genero: 'sex', sex: 'sex', gender: 'sex',
  fecha_de_nacimiento: 'dateOfBirth', fecha_nacimiento: 'dateOfBirth', date_of_birth: 'dateOfBirth', nacimiento: 'dateOfBirth',
  correo_electronico: 'email', correo: 'email', email: 'email',
  telefono: 'phone', phone: 'phone',
  whatsapp: 'whatsapp', celular: 'whatsapp', movil: 'whatsapp',
  estado_civil: 'maritalStatus', marital_status: 'maritalStatus',
  estado_de_membresia: 'membershipStatus', estado_membresia: 'membershipStatus', membership_status: 'membershipStatus',
  fecha_de_bautismo: 'baptismDate', fecha_bautismo: 'baptismDate', baptism_date: 'baptismDate',
  fecha_de_ingreso: 'joinedOn', fecha_ingreso: 'joinedOn', joined_on: 'joinedOn',
  direccion: 'address', address: 'address',
  contacto_de_emergencia: 'emergencyContact', contacto_emergencia: 'emergencyContact', emergency_contact: 'emergencyContact',
  notas: 'notes', observaciones: 'notes', notes: 'notes'
};

function normalizeRosterHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const delimiter = (text.split(/\r?\n/, 1)[0]?.match(/;/g)?.length ?? 0) > (text.split(/\r?\n/, 1)[0]?.match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(field.trim()); field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field.trim()); field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += character;
  }
  row.push(field.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function isoDate(value: unknown): { value: string | null; error?: string } {
  if (value === null || value === undefined || String(value).trim() === '') return { value: null };
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'number' && Number.isFinite(value)) date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
  else {
    const text = String(value).trim();
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
    const local = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text);
    if (iso) date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    else if (local) date = new Date(Date.UTC(Number(local[3]), Number(local[2]) - 1, Number(local[1])));
  }
  if (!date || Number.isNaN(date.getTime())) return { value: null, error: 'La fecha no tiene un formato válido (AAAA-MM-DD o DD/MM/AAAA).' };
  const result = date.toISOString().slice(0, 10);
  const year = Number(result.slice(0, 4));
  if (year < 1900 || date.getTime() > Date.now()) return { value: null, error: 'La fecha está fuera del rango permitido.' };
  return { value: result };
}

function mappedSex(value: unknown): RosterRecord['sex'] | null {
  const key = normalizeRosterHeader(value);
  if (['f', 'femenino', 'female', 'mujer'].includes(key)) return 'FEMALE';
  if (['m', 'masculino', 'male', 'hombre'].includes(key)) return 'MALE';
  if (['', 'no_especificado', 'unspecified'].includes(key)) return 'UNSPECIFIED';
  return null;
}

function mappedMembership(value: unknown): RosterRecord['membershipStatus'] | null {
  const key = normalizeRosterHeader(value);
  if (['miembro', 'member', 'activo', 'activa'].includes(key)) return 'MEMBER';
  if (['visitante', 'visitor'].includes(key)) return 'VISITOR';
  if (['inactivo', 'inactiva', 'inactive'].includes(key)) return 'INACTIVE';
  if (['trasladado', 'trasladada', 'transferido', 'transferida', 'transferred'].includes(key)) return 'TRANSFERRED';
  return null;
}

function mappedMarital(value: unknown): RosterRecord['maritalStatus'] | null {
  const key = normalizeRosterHeader(value);
  const values: Record<string, RosterRecord['maritalStatus']> = {
    soltero: 'SINGLE', soltera: 'SINGLE', soltero_a: 'SINGLE', single: 'SINGLE',
    casado: 'MARRIED', casada: 'MARRIED', casado_a: 'MARRIED', married: 'MARRIED',
    viudo: 'WIDOWED', viuda: 'WIDOWED', viudo_a: 'WIDOWED', widowed: 'WIDOWED',
    divorciado: 'DIVORCED', divorciada: 'DIVORCED', divorciado_a: 'DIVORCED', divorced: 'DIVORCED',
    separado: 'SEPARATED', separada: 'SEPARATED', separado_a: 'SEPARATED', separated: 'SEPARATED',
    no_especificado: 'UNSPECIFIED', unspecified: 'UNSPECIFIED', '': 'UNSPECIFIED'
  };
  return values[key] ?? null;
}

function validateRosterRow(rowNumber: number, source: Record<string, unknown>): RosterPreviewRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const value = (key: keyof Omit<RosterRecord, 'displayName' | 'active'>) => String(source[key] ?? '').trim();
  const memberCode = value('memberCode');
  const firstName = value('firstName');
  const middleName = value('middleName');
  const lastName = value('lastName');
  if (!memberCode || memberCode.length > 80 || !/^[\p{L}\p{N}._-]+$/u.test(memberCode)) errors.push('Código de miembro requerido; use letras, números, punto, guion o guion bajo.');
  if (firstName.length < 2 || firstName.length > 120) errors.push('Nombres requeridos (2 a 120 caracteres).');
  if (lastName.length < 2 || lastName.length > 160) errors.push('Apellidos requeridos (2 a 160 caracteres).');
  const sex = mappedSex(source.sex);
  if (!sex) errors.push('Sexo no reconocido. Use Femenino, Masculino o No especificado.');
  const membershipStatus = mappedMembership(source.membershipStatus);
  if (!membershipStatus) errors.push('Estado de membresía no reconocido.');
  const maritalStatus = mappedMarital(source.maritalStatus);
  if (!maritalStatus) errors.push('Estado civil no reconocido.');
  const birth = isoDate(source.dateOfBirth);
  const baptism = isoDate(source.baptismDate);
  const joined = isoDate(source.joinedOn);
  if (birth.error) errors.push(`Fecha de nacimiento: ${birth.error}`);
  if (baptism.error) errors.push(`Fecha de bautismo: ${baptism.error}`);
  if (joined.error) errors.push(`Fecha de ingreso: ${joined.error}`);
  const email = value('email').toLowerCase();
  if (email && !z.email().safeParse(email).success) errors.push('Correo electrónico no válido.');
  if (!birth.value) warnings.push('Sin fecha de nacimiento; no podrá generar alertas de cumpleaños ni rango de edad.');
  if (!email && !value('phone') && !value('whatsapp')) warnings.push('Sin medio de contacto registrado.');
  const normalized: Partial<RosterRecord> = {
    memberCode, firstName, middleName, lastName,
    displayName: [firstName, middleName, lastName].filter(Boolean).join(' '),
    ...(sex ? { sex } : {}), dateOfBirth: birth.value, email, phone: value('phone'), whatsapp: value('whatsapp'),
    ...(maritalStatus ? { maritalStatus } : {}), ...(membershipStatus ? { membershipStatus } : {}),
    baptismDate: baptism.value, joinedOn: joined.value, address: value('address'), emergencyContact: value('emergencyContact'), notes: value('notes'),
    active: membershipStatus ? ['MEMBER', 'VISITOR'].includes(membershipStatus) : false
  };
  return {
    rowNumber,
    source: Object.fromEntries(Object.entries(source).map(([key, item]) => [key, item instanceof Date ? item.toISOString().slice(0, 10) : String(item ?? '')])),
    normalized,
    status: errors.length ? 'INVALID' : 'VALID', errors, warnings
  };
}

async function parseRoster(file: Express.Multer.File): Promise<RosterPreviewRow[]> {
  const extension = extname(file.originalname).toLowerCase();
  let matrix: unknown[][];
  let sourceRowNumbers: number[];
  if (extension === '.csv') {
    if (file.buffer.includes(0)) throw new BadRequestException('El archivo CSV no contiene texto válido.');
    matrix = csvRows(file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
    sourceRowNumbers = matrix.map((_, index) => index + 1);
  }
  else if (extension === '.xlsx') {
    if (!file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new BadRequestException('La firma del archivo no corresponde a un libro XLSX válido.');
    }
    const workbook = new ExcelJS.Workbook();
    assertSafeOfficeArchive(file.buffer, '.xlsx');
    const bytes = file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(bytes);
    const sheet = workbook.getWorksheet('Padrón') ?? workbook.getWorksheet('Padron') ?? workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('El libro no contiene hojas.');
    if (sheet.rowCount > 5_020) throw new BadRequestException('El archivo supera el máximo de 5,000 personas por importación.');
    matrix = [];
    sourceRowNumbers = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 5_020) return;
      const values: unknown[] = [];
      for (let column = 1; column <= Math.min(Math.max(sheet.columnCount, row.cellCount), 60); column++) {
        const cell = row.getCell(column);
        const raw = cell.value;
        values.push(raw instanceof Date ? raw : typeof raw === 'object' && raw !== null && 'result' in raw ? (raw as { result: unknown }).result : cell.text);
      }
      matrix.push(values);
      sourceRowNumbers.push(rowNumber);
    });
  } else throw Object.assign(new Error('Solo se permiten archivos XLSX o CSV.'), { status: 415, code: 'ROSTER_FILE_TYPE_NOT_ALLOWED' });
  if (matrix.length < 2) throw new BadRequestException('El archivo no contiene filas de datos.');
  const required = new Set<keyof Omit<RosterRecord, 'displayName' | 'active'>>(['memberCode', 'firstName', 'lastName', 'sex', 'membershipStatus']);
  const headerIndex = matrix.slice(0, 20).findIndex((candidate) => {
    const mapped = candidate.map((item) => rosterHeaderAliases[normalizeRosterHeader(item)] ?? null);
    return [...required].every((field) => mapped.includes(field));
  });
  if (headerIndex < 0) throw new BadRequestException('No se encontró la fila de encabezados requerida. Descargue y use la plantilla oficial.');
  const headers = matrix[headerIndex]!.map((item) => rosterHeaderAliases[normalizeRosterHeader(item)] ?? null);
  for (const field of required) if (!headers.includes(field)) throw new BadRequestException(`Falta una columna requerida en la plantilla: ${field}.`);
  const rows = matrix.slice(headerIndex + 1).map((cells, index) => {
    const source: Record<string, unknown> = {};
    headers.forEach((header, column) => { if (header) source[header] = cells[column] ?? ''; });
    return validateRosterRow(sourceRowNumbers[index + headerIndex + 1] ?? index + headerIndex + 2, source);
  }).filter((row) => Object.values(row.source).some((item) => item.trim() !== ''));
  if (rows.length > 5_000) throw new BadRequestException('El archivo supera el máximo de 5,000 personas por importación.');
  const counts = new Map<string, number>();
  for (const row of rows) if (row.normalized.memberCode) counts.set(row.normalized.memberCode, (counts.get(row.normalized.memberCode) ?? 0) + 1);
  for (const row of rows) if (row.normalized.memberCode && (counts.get(row.normalized.memberCode) ?? 0) > 1) {
    row.errors.push('El código de miembro está duplicado dentro del archivo.');
    row.status = 'INVALID';
  }
  return rows;
}

function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function rolesFingerprint(assignedRoles: readonly Role[]): string {
  return tokenHash([...assignedRoles].sort().join('\n'));
}

async function currentNominationsAccount(tenantId: string, subjectScope: 'global' | 'tenant', subjectId: string, sourceSessionId: string) {
  const pool = subjectScope === 'global' ? controlPool : (await tenantPoolFromId(tenantId)).pool;
  const account = await pool.query<{ roles: Role[]; active: boolean }>(
    subjectScope === 'global'
      ? `SELECT u.roles,u.active FROM control.global_users u JOIN control.global_sessions s ON s.user_id=u.id
         WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()`
      : `SELECT u.roles,u.active FROM identity.users u JOIN identity.sessions s ON s.user_id=u.id
         WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()`,
    [subjectId, sourceSessionId]
  );
  const user = account.rows[0];
  return user?.active && permissionsFor(user.roles).includes('nominations.access') ? user : null;
}

function integrationSecretMatches(value: string | undefined): boolean {
  const expected = process.env.NOMINATIONS_INTEGRATION_SECRET;
  if (!expected || expected.length < 32 || !value) return false;
  const expectedBytes = Buffer.from(expected);
  const candidateBytes = Buffer.from(value);
  return expectedBytes.length === candidateBytes.length && timingSafeEqual(expectedBytes, candidateBytes);
}

type SupportedUiLocale = 'es' | 'en' | 'fr';

function uiLocaleFromHeader(value: string | string[] | undefined): SupportedUiLocale {
  const requested = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim().split('-')[0]?.toLowerCase();
  return requested === 'en' || requested === 'fr' ? requested : 'es';
}

function nominationsLaunchUrl(code: string, locale: SupportedUiLocale): string {
  const configured = process.env.NOMINATIONS_WEB_URL ?? 'http://localhost:3300';
  const url = new URL(`/${locale}/integration/gestionchurch`, configured);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('NOMINATIONS_WEB_URL no es una URL HTTP(S) válida.');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('NOMINATIONS_WEB_URL debe usar HTTPS en producción.');
  }
  url.searchParams.set('code', code);
  return url.toString();
}

function setSessionCookie(response: Response, token: string): void {
  response.cookie('gc_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  });
}

@Controller()
class IdentityController {
  @Public()
  @Get('health/live')
  health() {
    return HEALTH_RESPONSE;
  }

  @Public()
  @Post('auth/login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = loginSchema.parse(body);
    if (isProductionDemoPassword(input.password)) throw new UnauthorizedException('Correo, contraseña o iglesia incorrectos.');
    let tenantContext: Awaited<ReturnType<typeof tenantPoolFromSlug>>;
    try {
      tenantContext = await tenantPoolFromSlug(input.tenant);
    } catch {
      throw new UnauthorizedException('Correo, contraseña o iglesia incorrectos.');
    }
    const result = await tenantContext.pool.query<{
      id: string; email: string; name: string; password_hash: string; roles: Role[]; active: boolean; failed_attempts: number; locked_until: Date | null;
    }>(
      `SELECT u.id,u.email,u.name,COALESCE(c.password_hash,u.password_hash) password_hash,u.roles,u.active,
              COALESCE(c.failed_attempts,0) failed_attempts,c.locked_until
       FROM identity.users u LEFT JOIN identity.credentials c ON c.user_id=u.id WHERE u.email=$1`,
      [input.email]
    );
    const user = result.rows[0];
    if (user?.locked_until && user.locked_until > new Date()) {
      await tenantContext.pool.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
         VALUES($1,'auth.login.rejected','session',$2,jsonb_build_object('outcome','REJECTED','reason','ACCOUNT_LOCKED'))`,
        [user.id, user.id]
      );
      throw new UnauthorizedException('Correo, contraseña o iglesia incorrectos.');
    }
    if (!user?.active || !(await argon2.verify(user.password_hash, input.password))) {
      if (user) {
        await withTransaction(tenantContext.pool, async (client) => {
        await client.query(
          `UPDATE identity.credentials SET failed_attempts=failed_attempts+1,
             locked_until=CASE WHEN failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END
          WHERE user_id=$1`, [user.id]
        );
        await client.query(
          `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
           VALUES($1,'auth.login.rejected','session',$2,jsonb_build_object('outcome','REJECTED','reason','INVALID_CREDENTIALS_OR_INACTIVE'))`,
          [user.id, user.id]
        );
        });
      }
      throw new UnauthorizedException('Correo, contraseña o iglesia incorrectos.');
    }
    const sessionId = randomUUID();
    const principal: AuthPrincipal = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: permissionsFor(user.roles),
      tenantId: tenantContext.tenant.id,
      tenantSlug: tenantContext.tenant.slug,
      scope: 'tenant',
      sessionId
    };
    const token = await withTransaction(tenantContext.pool, async (client) => {
      await client.query(`UPDATE identity.credentials SET failed_attempts=0,locked_until=NULL WHERE user_id=$1`, [user.id]);
      await client.query(
        `INSERT INTO identity.sessions(id,user_id,expires_at) VALUES ($1,$2,now() + interval '8 hours')`,
        [sessionId, user.id]
      );
      const signed = await signAccessToken(principal);
      await client.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
         VALUES($1,'auth.login.succeeded','session',$2,jsonb_build_object('outcome','SUCCESS'))`,
        [user.id, sessionId]
      );
      return signed;
    });
    setSessionCookie(response, token);
    return { user: principal, tenant: tenantContext.tenant };
  }

  @Public()
  @Post('auth/password/forgot')
  async forgotPassword(@Body() body: unknown) {
    const input = forgotPasswordSchema.parse(body);
    const accepted = { accepted: true, message: 'Si la cuenta existe, recibirá instrucciones para restablecer la contraseña.' };
    try {
      const { tenant, pool } = await tenantPoolFromSlug(input.tenant);
      const reset = await requestPasswordReset(pool, tenant, input.email);
      if (!reset) return accepted;
      // A lost COMMIT response leaves an independently recoverable durable intent.
      // Do not wait for transport or interpret enqueue as provider delivery.
      void dispatchPasswordResets(pool, tenant.id).catch(() => undefined);
      return process.env.NODE_ENV === 'production' ? accepted : { ...accepted, developmentToken: reset.token };
    } catch {
      return accepted;
    }
  }

  @Get('auth/password/outbox/dead-letter')
  async passwordResetDeadLetters(@Req() request: Request & { user?: AuthPrincipal }) {
    const actor = currentUser(request); requirePermission(actor, 'users.manage');
    if (!actor.tenantId) throw Object.assign(new Error('Seleccione una sesión de iglesia autorizada.'), { status: 403, code: 'TENANT_CONTEXT_REQUIRED' });
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    return listPasswordResetDeadLetters(pool);
  }

  @Post('auth/password/outbox/:id/retry')
  async retryPasswordResetNotification(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') rawId: string, @Body() body: unknown) {
    const actor = currentUser(request); requirePermission(actor, 'users.manage');
    if (!actor.tenantId) throw Object.assign(new Error('Seleccione una sesión de iglesia autorizada.'), { status: 403, code: 'TENANT_CONTEXT_REQUIRED' });
    const id = z.uuid().parse(rawId), input = passwordResetRetrySchema.parse(body);
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    return retryPasswordReset(pool, id, actor.sub, input.reason);
  }

  @Public()
  @Post('auth/password/reset')
  async resetPassword(@Body() body: unknown) {
    const input = resetPasswordSchema.parse(body);
    let context: Awaited<ReturnType<typeof tenantPoolFromSlug>>;
    try { context = await tenantPoolFromSlug(input.tenant); } catch { throw new BadRequestException('El enlace no es válido o ha vencido.'); }
    const hash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    await withTransaction(context.pool, async (client) => {
      const token = await client.query<{ id: string; user_id: string }>(
        `SELECT id,user_id FROM identity.password_reset_tokens
         WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`, [tokenHash(input.token)]
      );
      const record = token.rows[0];
      if (!record) throw new BadRequestException('El enlace no es válido o ha vencido.');
      await client.query(`UPDATE identity.users SET password_hash=$1,updated_at=now() WHERE id=$2`, [hash, record.user_id]);
      await client.query(
        `INSERT INTO identity.credentials(user_id,password_hash,password_changed_at,failed_attempts,locked_until)
         VALUES($1,$2,now(),0,NULL) ON CONFLICT(user_id) DO UPDATE
         SET password_hash=EXCLUDED.password_hash,password_changed_at=now(),failed_attempts=0,locked_until=NULL`,
        [record.user_id, hash]
      );
      await client.query(`UPDATE identity.password_reset_tokens SET used_at=now() WHERE id=$1`, [record.id]);
      await client.query(`UPDATE identity.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [record.user_id]);
      await client.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
         VALUES($1::uuid,'auth.password_reset.completed','user',$1::text,jsonb_build_object('outcome','SUCCESS','sessionsRevoked',true))`,
        [record.user_id]
      );
    });
    return { changed: true };
  }

  @Public()
  @Post('auth/global/login')
  async globalLogin(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = globalLoginSchema.parse(body);
    if (isProductionDemoPassword(input.password)) throw new UnauthorizedException('Credenciales globales incorrectas.');
    const result = await controlPool.query<{
      id: string; email: string; name: string; password_hash: string; roles: Role[]; active: boolean;
    }>(`SELECT id,email,name,password_hash,roles,active FROM control.global_users WHERE email=$1`, [input.email]);
    const user = result.rows[0];
    if (!user?.active || !(await argon2.verify(user.password_hash, input.password))) {
      if (user) {
        await controlPool.query(
          `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
           VALUES($1::uuid,'auth.global_login.rejected','session',$1::text,jsonb_build_object('outcome','REJECTED'))`,
          [user.id]
        );
      }
      throw new UnauthorizedException('Credenciales globales incorrectas.');
    }
    const sessionId = randomUUID();
    const principal: AuthPrincipal = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: permissionsFor(user.roles),
      scope: 'global',
      sessionId
    };
    const token = await withTransaction(controlPool, async (client) => {
      await client.query(
        `INSERT INTO control.global_sessions(id,user_id,expires_at) VALUES ($1,$2,now() + interval '8 hours')`,
        [sessionId, user.id]
      );
      const signed = await signAccessToken(principal);
      await client.query(
        `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
         VALUES($1,'auth.global_login.succeeded','session',$2,jsonb_build_object('outcome','SUCCESS'))`,
        [user.id, sessionId]
      );
      return signed;
    });
    setSessionCookie(response, token);
    return { user: principal };
  }

  @Post('auth/logout')
  async logout(@Req() request: Request & { user?: AuthPrincipal }, @Res({ passthrough: true }) response: Response) {
    const user = currentUser(request);
    if (user.scope === 'global') {
      await withTransaction(controlPool, async (client) => {
      await client.query(`UPDATE control.global_sessions SET revoked_at=now() WHERE id=$1`, [user.sessionId]);
      await client.query(
        `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
         VALUES($1,'auth.logout','session',$2,jsonb_build_object('outcome','SUCCESS'))`, [user.sub, user.sessionId]
      );
      });
    } else if (user.tenantId) {
      const { pool } = await tenantPoolFromId(user.tenantId);
      await withTransaction(pool, async (client) => {
      await client.query(`UPDATE identity.sessions SET revoked_at=now() WHERE id=$1`, [user.sessionId]);
      await client.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
         VALUES($1,'auth.logout','session',$2,jsonb_build_object('outcome','SUCCESS'))`, [user.sub, user.sessionId]
      );
      });
    }
    response.clearCookie('gc_session', { path: '/' });
    return { success: true };
  }

  @Patch('auth/password')
  async changePassword(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request);
    if (user.scope !== 'tenant' || !user.tenantId) throw new BadRequestException('Esta operación requiere una cuenta de iglesia.');
    const input = changePasswordSchema.parse(body);
    const { pool } = await tenantPoolFromId(user.tenantId);
    const credential = await pool.query<{ password_hash: string }>(
      `SELECT COALESCE(c.password_hash,u.password_hash) password_hash FROM identity.users u
       LEFT JOIN identity.credentials c ON c.user_id=u.id WHERE u.id=$1`, [user.sub]
    );
    if (!credential.rows[0] || !(await argon2.verify(credential.rows[0].password_hash, input.currentPassword))) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }
    const hash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    await withTransaction(pool, async (client) => {
    await client.query(`UPDATE identity.users SET password_hash=$1,updated_at=now() WHERE id=$2`, [hash, user.sub]);
    await client.query(
      `INSERT INTO identity.credentials(user_id,password_hash,password_changed_at) VALUES($1,$2,now())
       ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,password_changed_at=now(),failed_attempts=0,locked_until=NULL`,
      [user.sub, hash]
    );
    await client.query(`UPDATE identity.sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL`, [user.sub, user.sessionId]);
    await client.query(
      `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
       VALUES($1::uuid,'auth.password.changed','user',$1::text,jsonb_build_object('outcome','SUCCESS','otherSessionsRevoked',true))`, [user.sub]
    );
    });
    return { changed: true, otherSessionsRevoked: true };
  }

  @Post('auth/sessions/revoke-all')
  async revokeAll(@Req() request: Request & { user?: AuthPrincipal }, @Res({ passthrough: true }) response: Response) {
    const user = currentUser(request);
    if (user.scope === 'global') {
      await withTransaction(controlPool, async (client) => {
      await client.query(`UPDATE control.global_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [user.sub]);
      await client.query(
        `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
         VALUES($1::uuid,'auth.sessions.revoked','user',$1::text,jsonb_build_object('outcome','SUCCESS','scope','all'))`, [user.sub]
      );
      });
    } else if (user.tenantId) {
      const { pool } = await tenantPoolFromId(user.tenantId);
      await withTransaction(pool, async (client) => {
      await client.query(`UPDATE identity.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [user.sub]);
      await client.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
         VALUES($1::uuid,'auth.sessions.revoked','user',$1::text,jsonb_build_object('outcome','SUCCESS','scope','all'))`, [user.sub]
      );
      });
    }
    response.clearCookie('gc_session', { path: '/' });
    return { revoked: true };
  }

  @Get('me')
  async me(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    let departmentNames: string[] = [];
    let departmentApps: DepartmentApplication[] = [];
    let tenantTimezone: string | null = null;
    const moduleAccess = new Set<string>();
    if (user.scope === 'global') {
      const session = await controlPool.query(`SELECT 1 FROM control.global_sessions WHERE id=$1 AND revoked_at IS NULL AND expires_at > now()`, [user.sessionId]);
      if (!session.rowCount) throw new UnauthorizedException('La sesión fue revocada.');
      if (user.permissions.includes('nominations.access')) moduleAccess.add('nominations');
    } else {
      const { pool, tenant } = await tenantPoolFromId(user.tenantId!);
      tenantTimezone = tenant.timezone;
      const session = await pool.query(`SELECT 1 FROM identity.sessions WHERE id=$1 AND revoked_at IS NULL AND expires_at > now()`, [user.sessionId]);
      if (!session.rowCount) throw new UnauthorizedException('La sesión fue revocada.');
      const hasTenantOversight = user.roles.some((role) => ['TENANT_ADMIN', 'PASTOR', 'BOARD_SECRETARY'].includes(role));
      const departments = hasTenantOversight
        ? await pool.query<{ id: string; name: string; role: string | null }>(
            `SELECT d.id,d.name,m.role
               FROM calendar.departments d
               LEFT JOIN identity.department_memberships m ON m.department_id=d.id AND m.user_id=$1
              WHERE d.active ORDER BY CASE WHEN m.role IS NULL THEN 1 ELSE 0 END,d.name`, [user.sub]
          )
        : await pool.query<{ id: string; name: string; role: string | null }>(
            `SELECT d.id,d.name,m.role
               FROM identity.department_memberships m JOIN calendar.departments d ON d.id=m.department_id
              WHERE m.user_id=$1 AND d.active ORDER BY d.name`, [user.sub]
          );
      departmentNames = departments.rows.filter((item) => item.role !== null).map((item) => item.name);
      departmentApps = departments.rows.map(applicationForDepartment);
      if (departmentApps.length) moduleAccess.add('department-workspaces');
      for (const application of departmentApps) {
        if (application.key === 'elders') moduleAccess.add('elders');
        if (application.key === 'personal-ministries') moduleAccess.add('personal-ministries');
        if (application.key === 'womens-ministry') moduleAccess.add('womens-ministry');
      }
      if (user.roles.some((role) => ['FIRST_ELDER', 'ELDER'].includes(role))) moduleAccess.add('elders');
      if (departmentNames.some((name) => /(publicidad|comunicaci|adoraci|música|musica)/i.test(name))) moduleAccess.add('worship-programs');
      if (user.permissions.includes('documents.read')) moduleAccess.add('documents');
      if (user.permissions.includes('nominations.access')) moduleAccess.add('nominations');
      if (user.permissions.includes('audit.read')) moduleAccess.add('audit');
    }
    return { user: { ...user, tenantTimezone, departmentNames, departmentApps, moduleAccess: [...moduleAccess] } };
  }

  @Post('integrations/nominations/launch')
  async launchNominations(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const actor = currentUser(request);
    requirePermission(actor, 'nominations.access');
    const input = nominationsLaunchSchema.parse(body ?? {});
    const tenantId = actor.scope === 'global' ? input.tenantId : actor.tenantId;
    if (!tenantId) throw new BadRequestException('Selecciona la iglesia que deseas administrar.');
    if (actor.scope === 'tenant' && input.tenantId && input.tenantId !== actor.tenantId) {
      throw Object.assign(new Error('No puede abrir Nombramientos para otro tenant.'), { status: 403, code: 'TENANT_BOUNDARY_VIOLATION' });
    }
    const tenantResult = await controlPool.query<{
      id: string; slug: string; name: string; timezone: string; status: string;
    }>(`SELECT id,slug,name,timezone,status FROM control.tenants WHERE id=$1`, [tenantId]);
    const tenant = tenantResult.rows[0];
    if (!tenant || tenant.status !== 'ACTIVE') throw new BadRequestException('La iglesia seleccionada no está activa.');

    const code = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 60_000);
    const launchId = randomUUID();
    await withTransaction(controlPool, async (client) => {
      await client.query(
        `INSERT INTO control.module_launch_codes(
           id,code_hash,module,tenant_id,subject_id,subject_scope,subject_email,subject_name,subject_roles,expires_at,subject_session_id
         ) VALUES($1,$2,'nominations',$3,$4,$5,$6,$7,$8::text[],$9,$10)`,
        [launchId, tokenHash(code), tenant.id, actor.sub, actor.scope, actor.email, actor.name, actor.roles, expiresAt, actor.sessionId]
      );
      await client.query(
        `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
         VALUES($1,'integration.nominations.launch_issued','module_launch',$2,$3::jsonb)`,
        [actor.sub, launchId, JSON.stringify({ tenantId: tenant.id, scope: actor.scope, expiresAt: expiresAt.toISOString() })]
      );
      await client.query(
        `DELETE FROM control.module_launch_codes
          WHERE (consumed_at IS NOT NULL AND consumed_at < now()-interval '24 hours')
             OR expires_at < now()-interval '24 hours'`
      );
    });
    const locale = uiLocaleFromHeader(request.headers['accept-language']);
    return { launchUrl: nominationsLaunchUrl(code, locale), expiresAt: expiresAt.toISOString() };
  }

  @Public()
  @Post('integrations/nominations/redeem')
  async redeemNominations(@Req() request: Request, @Body() body: unknown) {
    const secretHeader = request.headers['x-integration-secret'];
    const suppliedSecret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
    if (!integrationSecretMatches(suppliedSecret)) throw new UnauthorizedException('Credencial de integración no válida.');
    const input = nominationsRedeemSchema.parse(body);
    const result = await controlPool.query<{
      launch_id: string; subject_id: string; subject_scope: 'global' | 'tenant'; subject_email: string;
      subject_name: string; subject_roles: Role[]; tenant_id: string; tenant_slug: string;
      tenant_name: string; tenant_timezone: string;
      subject_session_id: string | null;
    }>(
      `WITH consumed AS (
         UPDATE control.module_launch_codes
            SET consumed_at=now()
          WHERE code_hash=$1 AND module='nominations' AND consumed_at IS NULL AND expires_at>now()
          RETURNING *
       )
       SELECT consumed.id launch_id,consumed.subject_id,consumed.subject_scope,consumed.subject_email,
              consumed.subject_name,consumed.subject_roles,consumed.subject_session_id,tenant.id tenant_id,tenant.slug tenant_slug,
              tenant.name tenant_name,tenant.timezone tenant_timezone
         FROM consumed JOIN control.tenants tenant ON tenant.id=consumed.tenant_id
        WHERE tenant.status='ACTIVE'`,
      [tokenHash(input.code)]
    );
    const exchange = result.rows[0];
    if (!exchange) throw new UnauthorizedException('El acceso de un solo uso venció o ya fue utilizado.');
    if (!exchange.subject_session_id) throw new UnauthorizedException('Abra el módulo nuevamente desde GestionChurch.');
    const account = await currentNominationsAccount(exchange.tenant_id, exchange.subject_scope, exchange.subject_id, exchange.subject_session_id);
    if (!account) throw new UnauthorizedException('La sesión original o el acceso al módulo fueron revocados.');
    await controlPool.query(
      `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
       VALUES($1,'integration.nominations.launch_redeemed','module_launch',$2,$3::jsonb)`,
      [exchange.subject_id, exchange.launch_id, JSON.stringify({ tenantId: exchange.tenant_id, scope: exchange.subject_scope })]
    );
    return {
      subject: {
        id: exchange.subject_id,
        scope: exchange.subject_scope,
        email: exchange.subject_email,
        name: exchange.subject_name,
        roles: account.roles,
        roleFingerprint: rolesFingerprint(account.roles),
        sourceSessionId: exchange.subject_session_id
      },
      tenant: {
        id: exchange.tenant_id,
        slug: exchange.tenant_slug,
        name: exchange.tenant_name,
        timezone: exchange.tenant_timezone
      }
    };
  }

  @Public()
  @Post('integrations/nominations/authorize')
  async authorizeNominations(@Req() request: Request, @Body() body: unknown) {
    const secretHeader = request.headers['x-integration-secret'];
    const suppliedSecret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
    if (!integrationSecretMatches(suppliedSecret)) throw new UnauthorizedException('Credencial de integración no válida.');
    const input = nominationsAuthorizeSchema.parse(body);
    const tenant = await controlPool.query<{ status: string }>(
      `SELECT status FROM control.tenants WHERE id=$1`, [input.tenantId]
    );
    if (tenant.rows[0]?.status !== 'ACTIVE') return { authorized: false };

    const account = await currentNominationsAccount(input.tenantId, input.subjectScope, input.subjectId, input.sourceSessionId);
    if (!account?.active || !permissionsFor(account.roles).includes('nominations.access')) {
      return { authorized: false };
    }
    return { authorized: true, roles: account.roles, roleFingerprint: rolesFingerprint(account.roles) };
  }

  @Public()
  @Post('integrations/nominations/organization')
  async nominationsOrganization(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown
  ) {
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    const secretHeader = request.headers['x-integration-secret'];
    const suppliedSecret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
    if (!integrationSecretMatches(suppliedSecret)) throw new UnauthorizedException('Credencial de integración no válida.');
    const input = nominationsOrganizationSchema.parse(body);
    // The organization chart contains tenant-private identities. A platform
    // operator is deliberately not treated as a member of the selected church.
    if (input.subjectScope !== 'tenant') throw new UnauthorizedException('Esta información requiere una cuenta del tenant.');

    const tenant = await controlPool.query<{ status: string; name: string }>(
      `SELECT status,name FROM control.tenants WHERE id=$1`, [input.tenantId]
    );
    const tenantRecord = tenant.rows[0];
    if (!tenantRecord || tenantRecord.status !== 'ACTIVE') throw new UnauthorizedException('El tenant no está activo.');
    const context = await tenantPoolFromId(input.tenantId);
    const actor = await currentNominationsAccount(input.tenantId, input.subjectScope, input.subjectId, input.sourceSessionId);
    if (!actor?.active || !permissionsFor(actor.roles).includes('nominations.access')) {
      throw new UnauthorizedException('La cuenta no tiene acceso al módulo de Nombramientos.');
    }

    const directory = await context.pool.query<{
      id: string; member_id: string; department_id: string; office_name: string;
      department_name: string; display_name: string; source: string; updated_at: Date;
    }>(
      `SELECT appointment.id::text,appointment.user_id::text member_id,
              appointment.department_id::text,appointment.title office_name,
              department.name department_name,user_account.name display_name,
              appointment.source,appointment.updated_at
         FROM identity.department_appointments appointment
         JOIN identity.users user_account ON user_account.id=appointment.user_id AND user_account.active
         JOIN calendar.departments department ON department.id=appointment.department_id AND department.active
        WHERE appointment.active
        ORDER BY department.name,
          CASE
            WHEN lower(appointment.title) LIKE 'primer anciano%' THEN 0
            WHEN lower(appointment.title) LIKE 'dirección%' OR lower(appointment.title) IN ('secretaría','tesorería') THEN 1
            WHEN lower(appointment.title) LIKE 'subdirección%' THEN 2
            WHEN lower(appointment.title) LIKE 'coordinación%' OR lower(appointment.title) LIKE 'responsable%' THEN 3
            WHEN lower(appointment.title) LIKE 'secretaría de%' OR lower(appointment.title) LIKE 'asistencia%' THEN 4
            ELSE 5
          END,
          appointment.title,user_account.name,appointment.id`
    );
    const people = new Set(directory.rows.map((item) => item.member_id));
    const departments = new Set(directory.rows.map((item) => item.department_id));
    const appointmentCount = directory.rowCount ?? directory.rows.length;
    const latestUpdate = directory.rows.reduce<Date | null>(
      (latest, item) => !latest || item.updated_at > latest ? item.updated_at : latest,
      null
    );
    await context.pool.query(
      `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,reason,correlation_id)
       VALUES($1,'integration.nominations.organization.read','organization',$2,$3::jsonb,$4,$5)`,
      [
        input.subjectId,
        input.tenantId,
        JSON.stringify({ departments: departments.size, people: people.size, appointments: appointmentCount }),
        'Lectura federada del organigrama vigente.',
        `nominations-organization-${randomUUID()}`
      ]
    );
    return {
      source: 'gestionchurch',
      tenantId: input.tenantId,
      tenantName: tenantRecord.name,
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: latestUpdate?.toISOString() ?? null,
      summary: { departments: departments.size, people: people.size, appointments: appointmentCount },
      items: directory.rows.map((item) => ({
        id: item.id,
        memberId: item.member_id,
        departmentId: item.department_id,
        officeCode: `gestionchurch.appointment.${item.id}`,
        officeName: item.office_name,
        officeNames: { es: item.office_name, en: item.office_name, fr: item.office_name },
        departmentName: item.department_name,
        departmentNames: { es: item.department_name, en: item.department_name, fr: item.department_name },
        displayName: item.display_name,
        status: 'elected',
        processState: 'VIGENTE',
        effective: true,
        independent: true,
        source: item.source
      }))
    };
  }

  @Get('roster/context')
  async rosterContext(@Req() request: Request & { user?: AuthPrincipal }) {
    const actor = currentUser(request);
    requirePermission(actor, 'users.manage');
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    const [members, imports, clock] = await Promise.all([
      pool.query(
        `SELECT m.id,m.member_code "memberCode",m.first_name "firstName",m.middle_name "middleName",m.last_name "lastName",
                m.display_name "displayName",m.sex,m.date_of_birth "dateOfBirth",m.email,m.phone,m.whatsapp,
                m.marital_status "maritalStatus",m.membership_status "membershipStatus",m.baptism_date "baptismDate",
                m.joined_on "joinedOn",m.address,m.emergency_contact "emergencyContact",m.notes,m.active,
                CASE WHEN m.date_of_birth IS NULL THEN NULL ELSE EXTRACT(year FROM age(current_date,m.date_of_birth))::int END age,
                CASE WHEN m.date_of_birth IS NULL THEN 'UNSPECIFIED'
                  WHEN EXTRACT(year FROM age(current_date,m.date_of_birth))<18 THEN 'UNDER_18'
                  WHEN EXTRACT(year FROM age(current_date,m.date_of_birth))<=25 THEN '18_25'
                  WHEN EXTRACT(year FROM age(current_date,m.date_of_birth))<=39 THEN '26_39'
                  WHEN EXTRACT(year FROM age(current_date,m.date_of_birth))<=59 THEN '40_59' ELSE '60_PLUS' END "ageBand",
                (p.member_id IS NOT NULL) "hasPhoto",p.updated_at "photoUpdatedAt",m.created_at "createdAt",m.updated_at "updatedAt"
           FROM identity.church_members m LEFT JOIN files.member_photos p ON p.member_id=m.id
          ORDER BY m.active DESC,m.last_name,m.first_name`
      ),
      pool.query(
        `SELECT id,original_name "originalName",status,total_rows "totalRows",valid_rows "validRows",
                invalid_rows "invalidRows",warning_rows "warningRows",committed_rows "committedRows",
                created_at "createdAt",committed_at "committedAt"
           FROM identity.roster_imports ORDER BY created_at DESC LIMIT 8`
      ),
      pool.query<{ today: string }>(`SELECT current_date::text today`)
    ]);
    const today = new Date(`${clock.rows[0]!.today}T00:00:00Z`);
    const birthdayWithin = (dateOfBirth: string | Date | null, days: number) => {
      if (!dateOfBirth) return false;
      const normalized = dateOfBirth instanceof Date ? dateOfBirth.toISOString().slice(0, 10) : dateOfBirth;
      const [, month, day] = normalized.split('-').map(Number);
      let next = new Date(Date.UTC(today.getUTCFullYear(), month! - 1, day));
      if (next < today) next = new Date(Date.UTC(today.getUTCFullYear() + 1, month! - 1, day));
      return Math.round((next.getTime() - today.getTime()) / 86_400_000) <= days;
    };
    const active = members.rows.filter((member) => member.active);
    const birthdayMemberIds = active.filter((member) => birthdayWithin(member.dateOfBirth, 30)).map((member) => member.id);
    return {
      today: clock.rows[0]!.today,
      birthdayMemberIds,
      access: { canManage: true },
      metrics: {
        total: active.length,
        women: active.filter((member) => member.sex === 'FEMALE').length,
        men: active.filter((member) => member.sex === 'MALE').length,
        birthdaysNext30: birthdayMemberIds.length,
        withPhoto: active.filter((member) => member.hasPhoto).length,
        missingBirthDate: active.filter((member) => !member.dateOfBirth).length
      },
      members: members.rows,
      recentImports: imports.rows
    };
  }

  @Post('roster/imports/preview')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.ROSTER_MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024), files: 1 }
  }))
  async previewRosterImport(
    @Req() request: Request & { user?: AuthPrincipal },
    @UploadedFile() file?: Express.Multer.File
  ) {
    const actor = currentUser(request);
    requirePermission(actor, 'users.manage');
    if (!file) throw Object.assign(new Error('Seleccione un archivo XLSX o CSV.'), { status: 400, code: 'ROSTER_FILE_REQUIRED' });
    const rows = await parseRoster(file);
    if (!rows.length) throw new BadRequestException('El archivo no contiene personas para importar.');
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const validRows = rows.filter((row) => row.status === 'VALID').length;
    const invalidRows = rows.length - validRows;
    const warningRows = rows.filter((row) => row.warnings.length > 0).length;
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    return withTransaction(pool, async (client) => {
      const created = await client.query<{ id: string }>(
        `INSERT INTO identity.roster_imports(original_name,file_sha256,total_rows,valid_rows,invalid_rows,warning_rows,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [basename(file.originalname), hash, rows.length, validRows, invalidRows, warningRows, actor.sub]
      );
      const importId = created.rows[0]!.id;
      for (const row of rows) {
        await client.query(
          `INSERT INTO identity.roster_import_rows(import_id,row_number,source_data,normalized_data,status,errors,warnings)
           VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6::text[],$7::text[])`,
          [importId, row.rowNumber, JSON.stringify(row.source), JSON.stringify(row.normalized), row.status, row.errors, row.warnings]
        );
      }
      await client.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
         VALUES($1,'church_roster.import.previewed','roster_import',$2,$3::jsonb,$4)`,
        [actor.sub, importId, JSON.stringify({ originalName: basename(file.originalname), hash, totalRows: rows.length, validRows, invalidRows, warningRows, outcome: 'SUCCESS' }), request.headers['x-correlation-id'] ?? null]
      );
      return { id: importId, status: 'PREVIEWED', totalRows: rows.length, validRows, invalidRows, warningRows, rows: rows.slice(0, 500), truncated: rows.length > 500 };
    });
  }

  @Post('roster/imports/:id/commit')
  async commitRosterImport(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') rawId: string) {
    const actor = currentUser(request);
    requirePermission(actor, 'users.manage');
    const id = z.uuid().parse(rawId);
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    return withTransaction(pool, async (client) => {
      const batch = await client.query<{ status: string; invalid_rows: number }>(
        `SELECT status,invalid_rows FROM identity.roster_imports WHERE id=$1 FOR UPDATE`, [id]
      );
      if (!batch.rows[0]) throw Object.assign(new Error('La previsualización no existe.'), { status: 404, code: 'ROSTER_IMPORT_NOT_FOUND' });
      if (batch.rows[0].status !== 'PREVIEWED') throw Object.assign(new Error('Esta importación ya fue procesada.'), { status: 409, code: 'ROSTER_IMPORT_ALREADY_PROCESSED' });
      const rows = await client.query<{ id: string; normalized_data: RosterRecord }>(
        `SELECT id,normalized_data FROM identity.roster_import_rows WHERE import_id=$1 AND status='VALID' ORDER BY row_number`, [id]
      );
      if (!rows.rowCount) throw new BadRequestException('No hay filas válidas para importar.');
      const codes = rows.rows.map((row) => row.normalized_data.memberCode);
      const existing = await client.query<{ member_code: string }>(`SELECT member_code FROM identity.church_members WHERE member_code=ANY($1::text[])`, [codes]);
      const existingCodes = new Set(existing.rows.map((row) => row.member_code));
      for (const row of rows.rows) {
        const member = row.normalized_data;
        const saved = await client.query<{ id: string }>(
          `INSERT INTO identity.church_members(member_code,first_name,middle_name,last_name,display_name,sex,date_of_birth,email,phone,whatsapp,
             marital_status,membership_status,baptism_date,joined_on,address,emergency_contact,notes,active,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT(member_code) DO UPDATE SET
             first_name=EXCLUDED.first_name,middle_name=EXCLUDED.middle_name,last_name=EXCLUDED.last_name,display_name=EXCLUDED.display_name,
             sex=EXCLUDED.sex,date_of_birth=EXCLUDED.date_of_birth,email=EXCLUDED.email,phone=EXCLUDED.phone,whatsapp=EXCLUDED.whatsapp,
             marital_status=EXCLUDED.marital_status,membership_status=EXCLUDED.membership_status,baptism_date=EXCLUDED.baptism_date,
             joined_on=EXCLUDED.joined_on,address=EXCLUDED.address,emergency_contact=EXCLUDED.emergency_contact,notes=EXCLUDED.notes,
             active=EXCLUDED.active,updated_at=now()
           RETURNING id`,
          [member.memberCode, member.firstName, member.middleName, member.lastName, member.displayName, member.sex, member.dateOfBirth,
            member.email, member.phone, member.whatsapp, member.maritalStatus, member.membershipStatus, member.baptismDate, member.joinedOn,
            member.address, member.emergencyContact, member.notes, member.active, actor.sub]
        );
        await client.query(`UPDATE identity.roster_import_rows SET status='IMPORTED',member_id=$2 WHERE id=$1`, [row.id, saved.rows[0]!.id]);
      }
      const created = codes.filter((code) => !existingCodes.has(code)).length;
      const updated = codes.length - created;
      await client.query(
        `UPDATE identity.roster_imports SET status='COMPLETED',committed_rows=$2,committed_at=now() WHERE id=$1`, [id, rows.rowCount]
      );
      await client.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
         VALUES($1,'church_roster.import.committed','roster_import',$2,$3::jsonb,$4)`,
        [actor.sub, id, JSON.stringify({ imported: rows.rowCount, created, updated, skippedInvalid: batch.rows[0].invalid_rows, womenRosterSynchronized: true, outcome: 'SUCCESS' }), request.headers['x-correlation-id'] ?? null]
      );
      return { id, status: 'COMPLETED', imported: rows.rowCount, created, updated, skippedInvalid: batch.rows[0].invalid_rows, womenRosterSynchronized: true };
    });
  }

  @Get('users')
  async users(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'users.manage');
    const { pool } = await tenantPoolFromId(user.tenantId!);
    const result = await pool.query(
      `SELECT u.id,u.email,u.name,u.phone,u.roles,u.department_ids,u.active,u.created_at,
              COALESCE(jsonb_agg(jsonb_build_object('departmentId',m.department_id,'role',m.role)
                ORDER BY m.created_at) FILTER (WHERE m.department_id IS NOT NULL),'[]'::jsonb) memberships
         FROM identity.users u
         LEFT JOIN identity.department_memberships m ON m.user_id=u.id
        GROUP BY u.id ORDER BY u.name`
    );
    return { items: result.rows };
  }

  @Get('roles')
  rolesList(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'users.manage');
    return {
      items: roles.filter((role) => role !== 'GLOBAL_ADMIN').map((role) => ({
        id: role,
        permissions: permissionsFor([role])
      }))
    };
  }

  @Post('users')
  async createUser(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const actor = currentUser(request);
    requirePermission(actor, 'users.manage');
    const input = createUserSchema.parse(body);
    if (input.assignedRoles.includes('GLOBAL_ADMIN')) throw new BadRequestException('Rol global no permitido en un tenant.');
    const memberships = [...new Map(
      (input.memberships ?? input.departmentIds.map((departmentId) => ({ departmentId, role: 'CONTRIBUTOR' as const })))
        .map((membership) => [membership.departmentId, membership])
    ).values()];
    const assignedRoles = rolesWithDepartmentAccess(input.assignedRoles, memberships);
    const hash = await argon2.hash(input.password, { type: argon2.argon2id });
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    return withTransaction(pool, async (client) => {
      const result = await client.query(
        `INSERT INTO identity.users(email,name,phone,password_hash,roles,department_ids) VALUES ($1,$2,$3,$4,$5::text[],$6::uuid[])
         RETURNING id,email,name,phone,roles,department_ids,active,created_at`,
        [input.email, input.name, input.phone || null, hash, assignedRoles, memberships.map((membership) => membership.departmentId)]
      );
      const created = result.rows[0] as { id: string };
      await client.query(`INSERT INTO identity.credentials(user_id,password_hash) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING`, [created.id, hash]);
      for (const membership of memberships) {
        await client.query(
          `INSERT INTO identity.department_memberships(user_id,department_id,role,assigned_by)
          VALUES($1,$2,$3,$4)`, [created.id, membership.departmentId, membership.role, actor.sub]
        );
      }
      await client.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
         VALUES($1,'user.created','user',$2,$3::jsonb)`,
        [actor.sub, created.id, JSON.stringify({
          email: input.email, name: input.name, roles: assignedRoles,
          memberships, active: true, outcome: 'SUCCESS'
        })]
      );
      return { ...result.rows[0], memberships };
    });
  }

  @Patch('users/:id')
  async updateUser(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const actor = currentUser(request);
    requirePermission(actor, 'users.manage');
    const input = z.object({
      name: z.string().trim().min(2).max(160).optional(),
      phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).nullable().optional(),
      assignedRoles: z.array(z.enum(roles)).min(1).optional(),
      expectedRoles: z.array(z.enum(roles)).min(1).optional(),
      departmentIds: z.array(z.uuid()).max(30).optional(),
      memberships: z.array(departmentMembershipSchema).max(30).optional(),
      active: z.boolean().optional()
    }).parse(body);
    if (input.assignedRoles?.includes('GLOBAL_ADMIN')) throw new BadRequestException('Rol global no permitido en un tenant.');
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    return withTransaction(pool, async (client) => {
      const existing = await client.query<{ email: string; name: string; roles: Role[]; department_ids: string[]; active: boolean }>(
        `SELECT email,name,roles,department_ids,active FROM identity.users WHERE id=$1 FOR UPDATE`, [id]
      );
      if (!existing.rows[0]) throw Object.assign(new Error('El usuario no existe.'), { status: 404 });
      if (input.expectedRoles && rolesFingerprint(input.expectedRoles) !== rolesFingerprint(existing.rows[0].roles)) {
        throw Object.assign(new Error('Las asignaciones cambiaron desde que fueron consultadas. Recargue antes de guardar.'), { status: 412, code: 'STALE_USER_ROLES' });
      }
      const memberships = input.memberships ?? input.departmentIds?.map((departmentId) => ({ departmentId, role: 'CONTRIBUTOR' as const }));
      const assignedRoles = memberships
        ? rolesWithDepartmentAccess(input.assignedRoles ?? existing.rows[0].roles, memberships)
        : input.assignedRoles;
      const departmentIds = memberships?.map((membership) => membership.departmentId) ?? input.departmentIds;
      const updated = await client.query(
        `UPDATE identity.users SET name=COALESCE($2,name),phone=CASE WHEN $3::boolean THEN $4 ELSE phone END,
           roles=COALESCE($5::text[],roles),department_ids=COALESCE($6::uuid[],department_ids),
           active=COALESCE($7,active),updated_at=now() WHERE id=$1
         RETURNING id,email,name,phone,roles,department_ids,active,updated_at`,
        [id, input.name ?? null, input.phone !== undefined, input.phone ?? null, assignedRoles ?? null,
          departmentIds ?? null, input.active ?? null]
      );
      if (memberships) {
        await client.query(`DELETE FROM identity.department_memberships WHERE user_id=$1`, [id]);
        for (const membership of memberships) {
          await client.query(
            `INSERT INTO identity.department_memberships(user_id,department_id,role,assigned_by)
             VALUES($1,$2,$3,$4)`, [id, membership.departmentId, membership.role, actor.sub]
          );
        }
      }
      if (input.active === false) await client.query(`UPDATE identity.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [id]);
      await client.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,before_data,after_data)
         VALUES($1,'user.updated','user',$2,$3::jsonb,$4::jsonb)`,
        [actor.sub, id,
          JSON.stringify({ email: existing.rows[0].email, name: existing.rows[0].name, roles: existing.rows[0].roles, departmentIds: existing.rows[0].department_ids, active: existing.rows[0].active }),
          JSON.stringify({ ...updated.rows[0], ...(memberships ? { memberships } : {}), outcome: 'SUCCESS' })]
      );
      return { ...updated.rows[0], ...(memberships ? { memberships } : {}) };
    });
  }

  @Get('department-memberships')
  async departmentMemberships(@Req() request: Request & { user?: AuthPrincipal }) {
    const actor = currentUser(request);
    requirePermission(actor, 'users.manage');
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    const result = await pool.query(
      `SELECT m.user_id,m.department_id,m.role,m.created_at,m.updated_at,
              u.name user_name,u.email,u.phone,u.active
         FROM identity.department_memberships m
         JOIN identity.users u ON u.id=m.user_id
        ORDER BY u.name,m.created_at`
    );
    return { items: result.rows };
  }

  @Post('department-memberships')
  async upsertDepartmentMembership(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const actor = currentUser(request);
    requirePermission(actor, 'users.manage');
    const input = departmentMembershipSchema.extend({ userId: z.uuid() }).parse(body);
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    return withTransaction(pool, async (client) => {
      const userResult = await client.query<{ roles: Role[] }>(`SELECT roles FROM identity.users WHERE id=$1 FOR UPDATE`, [input.userId]);
      if (!userResult.rows[0]) throw Object.assign(new Error('El usuario no existe.'), { status: 404 });
      const result = await client.query(
        `INSERT INTO identity.department_memberships(user_id,department_id,role,assigned_by)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(user_id,department_id) DO UPDATE SET role=EXCLUDED.role,assigned_by=EXCLUDED.assigned_by,updated_at=now()
         RETURNING user_id,department_id,role,created_at,updated_at`,
        [input.userId, input.departmentId, input.role, actor.sub]
      );
      const memberships = await client.query<{ department_id: string; role: z.infer<typeof departmentMembershipSchema>['role'] }>(
        `SELECT department_id,role FROM identity.department_memberships WHERE user_id=$1`, [input.userId]
      );
      const normalized = memberships.rows.map((membership) => ({ departmentId: membership.department_id, role: membership.role }));
      await client.query(
        `UPDATE identity.users SET department_ids=$2::uuid[],roles=$3::text[],updated_at=now() WHERE id=$1`,
        [input.userId, normalized.map((membership) => membership.departmentId), rolesWithDepartmentAccess(userResult.rows[0].roles, normalized)]
      );
      await client.query(
        `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
         VALUES($1,'department_membership.assigned','department_membership',$2,$3::jsonb)`,
        [actor.sub, `${input.userId}:${input.departmentId}`, JSON.stringify({ userId: input.userId, departmentId: input.departmentId, role: input.role, outcome: 'SUCCESS' })]
      );
      return result.rows[0];
    });
  }

  @Delete('department-memberships/:userId/:departmentId')
  async removeDepartmentMembership(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('userId') rawUserId: string,
    @Param('departmentId') rawDepartmentId: string
  ) {
    const actor = currentUser(request);
    requirePermission(actor, 'users.manage');
    const userId = z.uuid().parse(rawUserId);
    const departmentId = z.uuid().parse(rawDepartmentId);
    const { pool } = await tenantPoolFromId(actor.tenantId!);
    return withTransaction(pool, async (client) => {
    // Use the same user -> membership lock order as assignment/profile edits.
    await client.query('SELECT id FROM identity.users WHERE id=$1 FOR UPDATE', [userId]);
    const removed = await client.query(
      `DELETE FROM identity.department_memberships WHERE user_id=$1 AND department_id=$2 RETURNING user_id`,
      [userId, departmentId]
    );
    if (!removed.rowCount) throw Object.assign(new Error('La membresía no existe.'), { status: 404 });
    await client.query(
      `UPDATE identity.users SET department_ids=ARRAY(
         SELECT department_id FROM identity.department_memberships WHERE user_id=$1 ORDER BY created_at
       ),updated_at=now() WHERE id=$1`, [userId]
    );
    await client.query(
      `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
       VALUES($1,'department_membership.removed','department_membership',$2,$3::jsonb)`,
      [actor.sub, `${userId}:${departmentId}`, JSON.stringify({ userId, departmentId, outcome: 'SUCCESS' })]
    );
    return { removed: true };
    });
  }
}

@Module({
  controllers: [IdentityController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }]
})
class IdentityModule {}

await bootstrapNest(IdentityModule, 4011, 'identity-service');

let resetOutboxBusy = false;
async function retryPasswordResetNotifications(): Promise<void> {
  if (resetOutboxBusy) return;
  resetOutboxBusy = true;
  try {
    const tenants = await controlPool.query<{ id: string }>("SELECT id FROM control.tenants WHERE status='ACTIVE'");
    for (const tenant of tenants.rows) {
      try { const { pool } = await tenantPoolFromId(tenant.id); await dispatchPasswordResets(pool, tenant.id); }
      catch { console.warn(JSON.stringify({ service: 'identity-service', event: 'password_reset_outbox_tenant_unavailable' })); }
    }
  } catch { console.warn(JSON.stringify({ service: 'identity-service', event: 'password_reset_outbox_control_unavailable' })); }
  finally { resetOutboxBusy = false; }
}
const resetOutboxTimer = setInterval(() => void retryPasswordResetNotifications().catch(() => undefined), 10_000);
resetOutboxTimer.unref();
void retryPasswordResetNotifications().catch(() => undefined);
