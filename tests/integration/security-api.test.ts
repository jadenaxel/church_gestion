import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import argon2 from 'argon2';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { permissionsFor, type AuthPrincipal, type Role } from '../../packages/contracts/src/index.js';
import { provisionTenantDatabase } from '../../packages/database/src/migrations.js';
import { assertRuntimeDatabaseSecurity } from '../../packages/database/src/index.js';
import { signAccessToken } from '../../packages/platform/src/index.js';

// Opt-in: never use real church accounts or write to their databases.
const live = process.env.RUN_SECURITY_API_TESTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:4000/api/v1';
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const control = new Pool({ connectionString: process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control' });
type Fixture = { id: string; slug: string; database: string; pool: Pool; director: AuthPrincipal; admin: AuthPrincipal; directorToken: string; adminToken: string; department: string; activity: string; password: string };
const fixtures: Fixture[] = [];
const owned = new Map<string, string>();

async function request(path: string, token?: string, method = 'GET', body?: unknown, requestOrigin: string | null = origin) {
  const headers: Record<string, string> = { ...(token ? { cookie: `gc_session=${token}` } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}) };
  let payload: string | FormData | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  return fetch(`${base}${path}`, { method, headers, ...(payload !== undefined ? { body: payload } : {}), signal: AbortSignal.timeout(20_000) });
}
function upload(name = 'programme.txt', text = 'Programme de la iglesia') {
  const form = new FormData(); form.append('file', new Blob([text], { type: 'text/plain' }), name); return form;
}
async function internal(path: string, body: unknown) {
  return fetch(`${base}/integrations/nominations/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-integration-secret': process.env.NOMINATIONS_INTEGRATION_SECRET ?? '' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
}
async function fixture(): Promise<Fixture> {
  const id = randomUUID();
  const slug = `security-${randomBytes(8).toString('hex')}`;
  const expected = `gc_tenant_${id.replaceAll('-', '_')}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try { if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [expected])).rowCount) throw new Error('Temporary database name already exists'); }
  finally { await admin.end(); }
  owned.set(id, expected);
  const database = await provisionTenantDatabase(adminUrl, id);
  await control.query('INSERT INTO control.tenants(id,slug,name,database_name) VALUES($1,$2,$3,$4)', [id, slug, 'Temporary security validation', database]);
  const url = new URL(adminUrl); url.pathname = `/${database}`;
  const pool = new Pool({ connectionString: url.toString() });
  const password = randomBytes(32).toString('base64url');
  const hash = await argon2.hash(password);
  async function person(roles: Role[]): Promise<AuthPrincipal> {
    const sub = randomUUID(), sessionId = randomUUID(), email = `${sub}@security.example`;
    await pool.query('INSERT INTO identity.users(id,email,name,password_hash,roles) VALUES($1,$2,$3,$4,$5)', [sub, email, 'Temporary security user', hash, roles]);
    await pool.query('INSERT INTO identity.credentials(user_id,password_hash) VALUES($1,$2)', [sub, hash]);
    await pool.query("INSERT INTO identity.sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sessionId, sub]);
    return { sub, email, name: 'Temporary security user', roles, permissions: permissionsFor(roles), tenantId: id, tenantSlug: slug, scope: 'tenant', sessionId };
  }
  const director = await person(['DEPARTMENT_LEADER']);
  const tenantAdmin = await person(['TENANT_ADMIN']);
  const department = randomUUID(), activity = randomUUID();
  await pool.query("INSERT INTO calendar.departments(id,name) VALUES($1,'Security department')", [department]);
  await pool.query("INSERT INTO identity.department_memberships(user_id,department_id,role) VALUES($1,$2,'DIRECTOR')", [director.sub, department]);
  await pool.query("INSERT INTO calendar.activities(id,title,description,department_id,responsible_name,responsible_user_id,created_by) VALUES($1,'Security fixture activity','Synthetic test data',$2,'Security user',$3,$3)", [activity, department, director.sub]);
  const item = { id, slug, database, pool, director, admin: tenantAdmin, directorToken: await signAccessToken(director), adminToken: await signAccessToken(tenantAdmin), department, activity, password };
  fixtures.push(item); return item;
}

afterAll(async () => {
  await Promise.all(fixtures.map((item) => item.pool.end()));
  for (const [id, database] of owned) {
    if (database !== `gc_tenant_${id.replaceAll('-', '_')}` || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Refusing unsafe cleanup target');
    await control.query('DELETE FROM control.module_launch_codes WHERE tenant_id=$1', [id]);
    await control.query('DELETE FROM control.tenants WHERE id=$1 AND slug LIKE \'security-%\'', [id]);
    const admin = new Client({ connectionString: adminUrl }); await admin.connect();
    try {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
      await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    } finally { await admin.end(); }
    const root = resolve(process.env.UPLOAD_ROOT ?? '.local/uploads');
    const target = resolve(root, id);
    if (dirname(target) !== root) throw new Error('Refusing unsafe upload cleanup target');
    await rm(target, { recursive: true, force: true });
  }
  await control.end();
});

live('controles de seguridad reales en iglesias temporales', () => {
  beforeAll(async () => { await fixture(); await fixture(); }, 120_000);
  it('mantiene el login operativo y la sesión sin exponer contraseña', async () => {
    const item = fixtures[0]!;
    const result = await request('/auth/login', undefined, 'POST', { tenant: item.slug, email: item.director.email, password: item.password });
    expect(result.status).toBe(201);
    expect(result.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    const body = await result.json(); expect(body.user.tenantId).toBe(item.id); expect(JSON.stringify(body)).not.toContain(item.password);
  });
  it('rechaza usar la conexión administrativa de fixtures como runtime productivo', async () => {
    await expect(assertRuntimeDatabaseSecurity(fixtures[0]!.pool, { NODE_ENV: 'production' }, 'gc_file_service')).rejects.toThrow(/Production runtime/);
  });
  it('bloquea sesiones ausentes/falsificadas y CSRF con cookies', async () => {
    const item = fixtures[0]!;
    expect((await request('/users')).status).toBe(401);
    expect((await request('/users', `${item.adminToken}forged`)).status).toBe(401);
    expect((await request('/auth/logout', item.directorToken, 'POST', {}, null)).status).toBe(403);
    expect((await request('/auth/logout', item.directorToken, 'POST', {}, 'https://attacker.example')).status).toBe(403);
  });
  it('aisla actividades y accesos a Nombramientos entre dos bases', async () => {
    const [first, second] = fixtures as [Fixture, Fixture];
    expect((await request(`/activities/${second.activity}`, first.adminToken)).status).toBe(404);
    expect((await request('/integrations/nominations/launch', first.adminToken, 'POST', { tenantId: second.id })).status).toBe(403);
  });
  it('respeta el retiro de roles inmediatamente, sin esperar al vencimiento del JWT', async () => {
    const item = fixtures[0]!;
    await item.pool.query("UPDATE identity.users SET roles=ARRAY['VIEWER'] WHERE id=$1", [item.admin.sub]);
    expect((await request('/users', item.adminToken)).status).toBe(403);
    await item.pool.query("UPDATE identity.users SET roles=ARRAY['TENANT_ADMIN'] WHERE id=$1", [item.admin.sub]);
    expect((await request('/users', item.adminToken)).status).toBe(200);
  });
  it('conecta el indicador de excepciones con fallos y rechazos, incluyendo su exportación', async () => {
    const item = fixtures[0]!;
    const marker = `audit-filter-${randomUUID()}`;
    for (const outcome of ['SUCCESS', 'REJECTED', 'FAILED']) {
      await item.pool.query("INSERT INTO audit.audit_events(actor_id,action,resource_type,after_data) VALUES($1,$2,'test',$3::jsonb)", [item.admin.sub, `${marker}.${outcome}`, JSON.stringify({ outcome })]);
    }
    const query = `outcome=EXCEPTIONS&search=${marker}`;
    const result = await request(`/audit/events?${query}`, item.adminToken);
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.items).toHaveLength(2);
    expect(body.items.map((event: { outcome: string }) => event.outcome).sort()).toEqual(['FAILED', 'REJECTED']);
    expect(Number(body.summary.exceptions)).toBe(2);
    const csv = await request(`/audit/events.csv?${query}`, item.adminToken);
    expect(csv.status).toBe(200);
    const text = await csv.text();
    expect(text).toContain(`${marker}.FAILED`);
    expect(text).toContain(`${marker}.REJECTED`);
    expect(text).not.toContain(`${marker}.SUCCESS`);
    expect((await request(`/audit/events?${query}`, item.directorToken)).status).toBe(403);
  });
  it('carga archivos propios, impide adjuntos ajenos y protege actividades aprobadas', async () => {
    const item = fixtures[0]!;
    const foreignDepartment = randomUUID(), foreignActivity = randomUUID();
    await item.pool.query("INSERT INTO calendar.departments(id,name) VALUES($1,'Other department')", [foreignDepartment]);
    await item.pool.query("INSERT INTO calendar.activities(id,title,description,department_id,responsible_name,responsible_user_id,created_by) VALUES($1,'Other activity','Synthetic data',$2,'Other user',$3,$3)", [foreignActivity, foreignDepartment, item.admin.sub]);
    expect((await request(`/files/activity/${foreignActivity}`, item.directorToken, 'POST', upload())).status).toBe(403);
    const uploaded = await request(`/files/activity/${item.activity}`, item.directorToken, 'POST', upload());
    expect(uploaded.status).toBe(201);
    const file = await uploaded.json();
    expect((await request(`/files/${file.id}/download`, item.directorToken)).status).toBe(200);
    await item.pool.query("UPDATE calendar.activities SET status='APPROVED' WHERE id=$1", [item.activity]);
    expect((await request(`/files/activity/${item.activity}`, item.directorToken, 'POST', upload())).status).toBe(403);
    expect((await request(`/files/${file.id}`, item.directorToken, 'DELETE')).status).toBe(403);
    expect((await request(`/files/activity/${item.activity}`, item.adminToken, 'POST', upload())).status).toBe(201);
    await item.pool.query("UPDATE calendar.activities SET status='DRAFT' WHERE id=$1", [item.activity]);
  });
  it('acepta XLSX legítimo e ignora MIME HTML declarado por el cliente', async () => {
    const item = fixtures[0]!;
    const require = createRequire(new URL('../../services/file-service/package.json', import.meta.url));
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Programme').addRow(['Partie', 'Responsable']);
    const bytes = await workbook.xlsx.writeBuffer();
    const form = new FormData(); form.append('file', new Blob([bytes], { type: 'text/html' }), 'programme.xlsx');
    const uploaded = await request(`/files/activity/${item.activity}`, item.directorToken, 'POST', form);
    expect(uploaded.status).toBe(201);
    const file = await uploaded.json();
    const download = await request(`/files/${file.id}/download`, item.directorToken);
    expect(download.headers.get('content-type')).toMatch(/^application\/vnd.openxmlformats/);
  });
  it('no excede la cuota de archivos con cargas concurrentes', async () => {
    const item = fixtures[0]!;
    const quota = Number(process.env.TENANT_UPLOAD_QUOTA_BYTES ?? 1024 * 1024 * 1024);
    const used = Number((await item.pool.query("SELECT COALESCE(sum(size_bytes),0)::text total FROM files.file_objects WHERE status='AVAILABLE' AND deleted_at IS NULL")).rows[0]?.total ?? 0);
    const syntheticFile = randomUUID();
    await item.pool.query("INSERT INTO files.file_objects(id,activity_id,original_name,stored_name,media_type,size_bytes,sha256,status,version,uploaded_by) VALUES($1,$2,'quota-fixture.txt','synthetic-not-stored','text/plain',$3,$4,'AVAILABLE',1,$5)", [syntheticFile, item.activity, quota - used - 10, '0'.repeat(64), item.director.sub]);
    try {
      const results = await Promise.all([request(`/files/activity/${item.activity}`, item.directorToken, 'POST', upload('quota-a.txt', '12345678')), request(`/files/activity/${item.activity}`, item.directorToken, 'POST', upload('quota-b.txt', '12345678'))]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 413]);
      const total = Number((await item.pool.query("SELECT COALESCE(sum(size_bytes),0)::text total FROM files.file_objects WHERE status='AVAILABLE' AND deleted_at IS NULL")).rows[0]?.total);
      expect(total).toBeLessThanOrEqual(quota);
    } finally {
      await item.pool.query('DELETE FROM files.file_objects WHERE id=$1', [syntheticFile]);
    }
  });
  it('rechaza paquetes Office falsos antes de almacenarlos', async () => {
    expect((await request(`/files/activity/${fixtures[0]!.activity}`, fixtures[0]!.directorToken, 'POST', upload('malicious.xlsx', 'PK\x03\x04not-office'))).status).toBe(422);
  });
  it('no permite configuración ni otro ministerio a un director ajeno', async () => {
    const item = fixtures[0]!;
    expect((await request('/notifications/channels/settings', item.directorToken)).status).toBe(403);
    expect((await request('/womens-ministry/context', item.directorToken)).status).toBe(403);
    expect((await request('/personal-ministries/context', item.directorToken)).status).toBe(403);
  });
  it('protege comentarios y menciones de registros restringidos sin romper colaboración de equipo', async () => {
    const item = fixtures[0]!;
    const viewerId = randomUUID(), sessionId = randomUUID();
    await item.pool.query("INSERT INTO identity.users(id,email,name,password_hash,roles) SELECT $1,$2,'Temporary team viewer',password_hash,ARRAY['VIEWER'] FROM identity.users WHERE id=$3", [viewerId, `${viewerId}@security.example`, item.admin.sub]);
    await item.pool.query("INSERT INTO identity.sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sessionId, viewerId]);
    await item.pool.query("INSERT INTO identity.department_memberships(user_id,department_id,role) VALUES($1,$2,'VIEWER')", [viewerId, item.department]);
    const viewerToken = await signAccessToken({ ...item.director, sub: viewerId, sessionId, roles: ['VIEWER'], permissions: permissionsFor(['VIEWER']) });
    const contextPath = `/department-operations/context?departmentId=${item.department}`;
    const initial = await request(contextPath, item.adminToken);
    expect(initial.status).toBe(200);
    const workspaceId = (await initial.json()).selected.id;
    const recordId = randomUUID(), teamRecordId = randomUUID(), body = `Restricted comment fixture ${randomUUID()}`;
    for (const [id, visibility] of [[recordId, 'RESTRICTED'], [teamRecordId, 'TEAM']]) {
      await item.pool.query("INSERT INTO department_operations.ministry_records(id,workspace_id,record_type,title,record_date,visibility,data,created_by) VALUES($1,$2,'PROGRAM','Synthetic record',CURRENT_DATE,$3,'{}',$4)", [id, workspaceId, visibility, item.admin.sub]);
    }
    await item.pool.query("INSERT INTO department_operations.comments(workspace_id,resource_type,resource_id,body,created_by) VALUES($1,'RECORD',$2,$3,$4)", [workspaceId, recordId, body, item.admin.sub]);
    const adminContext = await request(contextPath, item.adminToken);
    expect(await adminContext.text()).toContain(body);
    const viewerContext = await request(contextPath, viewerToken);
    expect(viewerContext.status).toBe(200);
    const visible = await viewerContext.json();
    expect(JSON.stringify(visible)).not.toContain(body);
    expect(visible.records.map((record: { id: string }) => record.id)).toEqual([teamRecordId]);
    const comment = { workspaceId, resourceType: 'RECORD', resourceId: recordId, body, mentionUserIds: [] };
    const before = Number((await item.pool.query('SELECT count(*) total FROM department_operations.comments WHERE resource_id=$1', [recordId])).rows[0].total);
    expect((await request('/department-operations/comments', viewerToken, 'POST', comment)).status).toBe(403);
    expect((await request('/department-operations/comments', item.adminToken, 'POST', { ...comment, mentionUserIds: [viewerId] })).status).toBe(403);
    expect(Number((await item.pool.query('SELECT count(*) total FROM department_operations.comments WHERE resource_id=$1', [recordId])).rows[0].total)).toBe(before);
    expect((await request('/department-operations/comments', item.adminToken, 'POST', { ...comment, mentionUserIds: [item.director.sub] })).status).toBe(201);
    const notifications = await request('/notifications', item.directorToken);
    expect(notifications.status).toBe(200);
    expect(await notifications.text()).not.toContain(body);
    const commonBody = `Team comment fixture ${randomUUID()}`;
    expect((await request('/department-operations/comments', viewerToken, 'POST', { ...comment, resourceId: teamRecordId, body: commonBody, mentionUserIds: [item.director.sub] })).status).toBe(201);
    expect(await (await request(contextPath, viewerToken)).text()).toContain(commonBody);
    const report = await request(`/department-operations/reports/executive.csv?workspaceId=${workspaceId}`, viewerToken);
    expect(report.status).toBe(200);
    expect(await report.text()).toContain('"Registros","1"');
    expect((await request(contextPath, fixtures[1]!.adminToken)).status).toBe(403);
  });
  it('impide solicitar una revisión de actividades de otro departamento', async () => {
    const item = fixtures[0]!;
    const department = randomUUID(), activity = randomUUID();
    await item.pool.query("INSERT INTO calendar.departments(id,name) VALUES($1,'Review access fixture')", [department]);
    await item.pool.query("INSERT INTO calendar.activities(id,title,description,department_id,responsible_name,responsible_user_id,created_by) VALUES($1,'Review fixture','Synthetic data',$2,'Security admin',$3,$3)", [activity, department, item.admin.sub]);
    const result = await request(`/activities/${activity}/request-review`, item.directorToken, 'POST', { reason: 'Security review fixture', coexistencePlan: 'Synthetic coexistence plan' });
    expect(result.status).toBe(403);
    expect((await item.pool.query('SELECT status FROM calendar.activities WHERE id=$1', [activity])).rows[0]?.status).toBe('DRAFT');
  });
  it('protege actividades de liderazgo en búsquedas, dashboard, reportes, documentos y avisos sin romper las reservas', async () => {
    const item = fixtures[0]!;
    const sub = randomUUID(), sessionId = randomUUID();
    await item.pool.query("INSERT INTO identity.users(id,email,name,password_hash,roles) SELECT $1,$2,'Temporary planner',password_hash,ARRAY['DEPARTMENT_PLANNER'] FROM identity.users WHERE id=$3", [sub, `${sub}@security.example`, item.admin.sub]);
    await item.pool.query("INSERT INTO identity.sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sessionId, sub]);
    await item.pool.query("INSERT INTO identity.department_memberships(user_id,department_id,role) VALUES($1,$2,'PLANNER')", [sub, item.department]);
    const planner = { ...item.director, sub, sessionId, roles: ['DEPARTMENT_PLANNER'] as Role[], permissions: permissionsFor(['DEPARTMENT_PLANNER']) };
    const token = await signAccessToken(planner);
    const secretaryId = randomUUID(), secretarySession = randomUUID();
    await item.pool.query("INSERT INTO identity.users(id,email,name,password_hash,roles) SELECT $1,$2,'Temporary secretary',password_hash,ARRAY['BOARD_SECRETARY'] FROM identity.users WHERE id=$3", [secretaryId, `${secretaryId}@security.example`, item.admin.sub]);
    await item.pool.query("INSERT INTO identity.sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [secretarySession, secretaryId]);
    const secretaryToken = await signAccessToken({ ...item.admin, sub: secretaryId, sessionId: secretarySession, roles: ['BOARD_SECRETARY'], permissions: permissionsFor(['BOARD_SECRETARY']) });
    const title = `Confidential security fixture ${randomUUID()}`;
    const startsAt = new Date(Date.now() + 7 * 86_400_000).toISOString(), endsAt = new Date(Date.now() + 7 * 86_400_000 + 3_600_000).toISOString();
    const input = { title, description: 'Synthetic confidential information', departmentId: item.department, responsibleName: 'Private responsible fixture', visibility: 'LEADERSHIP', options: [{ label: 'Preferred date', preference: 1, sessions: [{ startsAt, endsAt }] }] };
    const created = await request('/activities', item.adminToken, 'POST', input);
    expect(created.status).toBe(201);
    const activity = (await created.json()).id;
    expect((await request(`/activities/${activity}/submit`, item.adminToken, 'POST', {})).status).toBe(201);
    expect((await request(`/activities/${activity}/approve`, secretaryToken, 'POST', {})).status).toBe(201);
    const fileResponse = await request(`/files/activity/${activity}`, item.adminToken, 'POST', upload('confidential.txt', title));
    expect(fileResponse.status).toBe(201); const file = await fileResponse.json();
    expect((await request(`/activities/${activity}`, token)).status).toBe(404);
    expect((await request(`/activities/${activity}`, item.adminToken)).status).toBe(200);
    expect((await request(`/files/activity/${activity}`, token)).status).toBe(404);
    expect((await request(`/files/${file.id}/download`, token)).status).toBe(404);
    expect((await request(`/files/${file.id}/access-token`, token, 'POST', {})).status).toBe(404);
    const notification = randomUUID();
    await item.pool.query("INSERT INTO notifications.notifications(id,event_id,title,body,link) VALUES($1,$2,$3,$3,$4)", [notification, randomUUID(), title, `/activities/${activity}`]);
    for (const path of ['/activities', '/dashboard', '/reports/overview', '/exports/calendar.csv', '/exports/calendar.ics', '/notifications']) {
      const response = await request(path, token); expect(response.status, path).toBe(200);
      expect(await response.text(), path).not.toContain(title);
    }
    const occupied = await request(`/availability?start=${encodeURIComponent(startsAt)}&end=${encodeURIComponent(endsAt)}`, token);
    expect(occupied.status).toBe(200); const availability = await occupied.json();
    expect(availability.available).toBe(false);
    expect(availability.conflicts[0]).toMatchObject({ title: 'Horario reservado', activity_id: '', responsible_name: '' });
    expect(JSON.stringify(availability)).not.toContain(title);
    // A legitimate departmental proposal still enters the existing conflict/review workflow.
    const proposed = await request('/activities', token, 'POST', { ...input, title: 'Planner conflict fixture', visibility: 'INTERNAL' });
    expect(proposed.status).toBe(201); const proposedId = (await proposed.json()).id;
    const submission = await request(`/activities/${proposedId}/submit`, token, 'POST', {});
    expect(submission.status).toBe(201); const conflict = await submission.json();
    expect(conflict.status).toBe('CONFLICTED');
    expect(JSON.stringify(conflict)).not.toContain(title);
    expect((await request(`/activities/${proposedId}/request-review`, token, 'POST', { reason: 'Synthetic valid review request', coexistencePlan: 'Synthetic coexistence proposal' })).status).toBe(201);
    expect((await request(`/activities/${proposedId}`, token)).status).toBe(200);
    // Private ownership remains usable by the person who created the activity.
    const own = await request('/activities', token, 'POST', { ...input, title: 'Own private fixture' });
    expect(own.status).toBe(201); const ownId = (await own.json()).id;
    expect((await request(`/activities/${ownId}`, token)).status).toBe(200);
  });
  it('rechaza una sesión revocada aunque la firma y vencimiento sean válidos', async () => {
    const item = fixtures[1]!;
    await item.pool.query('UPDATE identity.sessions SET revoked_at=now() WHERE id=$1', [item.director.sessionId]);
    expect((await request('/me', item.directorToken)).status).toBe(401);
  });
  it('vincula la autorización y el código de un uso a la sesión de origen', async () => {
    const item = fixtures[0]!;
    const launched = await request('/integrations/nominations/launch', item.adminToken, 'POST', {});
    expect(launched.status).toBe(201);
    const link = new URL((await launched.json()).launchUrl);
    const code = link.searchParams.get('code');
    const redeemed = await internal('redeem', { code });
    expect(redeemed.status).toBe(201);
    const assertion = await redeemed.json();
    expect(assertion.subject.sourceSessionId).toBe(item.admin.sessionId);
    expect((await internal('redeem', { code })).status).toBe(401);
    const input = { tenantId: item.id, subjectId: item.admin.sub, subjectScope: 'tenant', sourceSessionId: item.admin.sessionId };
    expect((await (await internal('authorize', input)).json()).authorized).toBe(true);
    await item.pool.query('UPDATE identity.sessions SET revoked_at=now() WHERE id=$1', [item.admin.sessionId]);
    expect((await (await internal('authorize', input)).json()).authorized).toBe(false);
  });
});
