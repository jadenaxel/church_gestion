import { randomBytes, randomUUID } from 'node:crypto';
import { access, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import argon2 from 'argon2';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { permissionsFor, type AuthPrincipal, type Role } from '../../packages/contracts/src/index.js';
import { provisionTenantDatabase } from '../../packages/database/src/migrations.js';
import { signAccessToken } from '../../packages/platform/src/index.js';

// Explicit opt-in. Every write belongs to one of this run's new synthetic churches.
const live = process.env.RUN_DEPARTMENT_FLOW_API_TESTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:4000/api/v1';
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const control = new Pool({ connectionString: process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control' });
type Person = { principal: AuthPrincipal; token: string };
type Fixture = { id: string; slug: string; database: string; pool: Pool; admin: Person; secretary: Person; mission: Person; woman: Person; elder: Person; viewer: Person; teamViewer: Person; planner: Person; departments: Record<'mission' | 'woman' | 'general', string> };
const owned = new Map<string, { database: string; slug: string }>();
const pools: Pool[] = [];
let church: Fixture;
let foreign: Fixture;

async function request(path: string, token = church.admin.token, method = 'GET', body?: unknown, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { cookie: `gc_session=${token}`, origin, ...extraHeaders };
  let payload: string | FormData | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  return fetch(`${base}${path}`, { method, headers, ...(payload === undefined ? {} : { body: payload }), signal: AbortSignal.timeout(20_000) });
}

async function json(path: string, status = 200, token = church.admin.token, method = 'GET', body?: unknown) {
  const response = await request(path, token, method, body);
  const value = await response.json();
  expect(response.status, `${method} ${path}: ${JSON.stringify(value)}`).toBe(status);
  return value;
}

function textUpload(fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob(['Synthetic departmental plan'], { type: 'text/plain' }), 'synthetic-plan.txt');
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

async function fixture(): Promise<Fixture> {
  const id = randomUUID(), slug = `flows-${randomBytes(8).toString('hex')}`;
  const database = `gc_tenant_${id.replaceAll('-', '_')}`;
  const admin = new Client({ connectionString: adminUrl }); await admin.connect();
  try { if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) throw new Error('Temporary database already exists'); }
  finally { await admin.end(); }
  owned.set(id, { database, slug });
  expect(await provisionTenantDatabase(adminUrl, id)).toBe(database);
  await control.query('INSERT INTO control.tenants(id,slug,name,database_name) VALUES($1,$2,$3,$4)', [id, slug, 'Synthetic module flow validation', database]);
  const url = new URL(adminUrl); url.pathname = `/${database}`;
  const pool = new Pool({ connectionString: url.toString() }); pools.push(pool);
  const hash = await argon2.hash(randomBytes(32).toString('base64url'));
  const departments = { mission: randomUUID(), woman: randomUUID(), general: randomUUID() };
  for (const [key, name] of [['mission', 'Ministerios Personales'], ['woman', 'Ministerio de la Mujer'], ['general', 'Synthetic department']] as const) {
    await pool.query('INSERT INTO calendar.departments(id,name) VALUES($1,$2)', [departments[key], name]);
  }
  async function person(roles: Role[], departmentId?: string, membershipRole = 'DIRECTOR'): Promise<Person> {
    const sub = randomUUID(), sessionId = randomUUID(), email = `${sub}@flows.example`;
    await pool.query('INSERT INTO identity.users(id,email,name,password_hash,roles) VALUES($1,$2,$3,$4,$5)', [sub, email, 'Synthetic module user', hash, roles]);
    await pool.query('INSERT INTO identity.credentials(user_id,password_hash) VALUES($1,$2)', [sub, hash]);
    await pool.query("INSERT INTO identity.sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sessionId, sub]);
    if (departmentId) await pool.query('INSERT INTO identity.department_memberships(user_id,department_id,role) VALUES($1,$2,$3)', [sub, departmentId, membershipRole]);
    const principal: AuthPrincipal = { sub, email, name: 'Synthetic module user', roles, permissions: permissionsFor(roles), tenantId: id, tenantSlug: slug, scope: 'tenant', sessionId };
    return { principal, token: await signAccessToken(principal) };
  }
  return { id, slug, database, pool, departments, admin: await person(['TENANT_ADMIN']), secretary: await person(['BOARD_SECRETARY']), mission: await person(['DEPARTMENT_LEADER'], departments.mission), woman: await person(['DEPARTMENT_LEADER'], departments.woman), elder: await person(['ELDER']), viewer: await person(['VIEWER']), teamViewer: await person(['VIEWER'], departments.mission, 'VIEWER'), planner: await person(['DEPARTMENT_PLANNER'], departments.mission, 'PLANNER') };
}

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
  for (const [id, { database, slug }] of owned) {
    if (!/^[a-f0-9-]{36}$/.test(id) || database !== `gc_tenant_${id.replaceAll('-', '_')}` || !/^flows-[a-f0-9]{16}$/.test(slug)) throw new Error('Refusing unsafe fixture cleanup');
    const tenant = await control.query('SELECT slug,database_name FROM control.tenants WHERE id=$1', [id]);
    if (tenant.rows[0] && (tenant.rows[0].slug !== slug || tenant.rows[0].database_name !== database)) throw new Error('Fixture ownership changed');
    await control.query('DELETE FROM control.module_launch_codes WHERE tenant_id=$1', [id]);
    await control.query('DELETE FROM control.tenants WHERE id=$1 AND slug=$2 AND database_name=$3', [id, slug, database]);
    expect((await control.query('SELECT id FROM control.tenants WHERE id=$1', [id])).rowCount).toBe(0);
    const admin = new Client({ connectionString: adminUrl }); await admin.connect();
    try {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
      await admin.query(`DROP DATABASE IF EXISTS ${database}`);
      expect((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount).toBe(0);
    } finally { await admin.end(); }
    const root = resolve(process.env.UPLOAD_ROOT ?? '.local/uploads'), target = resolve(root, id);
    if (dirname(target) !== root) throw new Error('Refusing unsafe fixture upload cleanup');
    await rm(target, { recursive: true, force: true });
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
  }
  await control.end();
});

live('recorrido API de módulos con iglesias temporales propias', () => {
  beforeAll(async () => { church = await fixture(); foreign = await fixture(); }, 120_000);

  it('deriva catálogo y permisos por departamento y rechaza otras iglesias', async () => {
    const me = await json('/me', 200, church.mission.token);
    expect(me.user.moduleAccess).toContain('personal-ministries');
    expect(me.user.moduleAccess).not.toContain('womens-ministry');
    await json('/personal-ministries/context', 200, church.mission.token);
    expect((await request('/womens-ministry/context', church.mission.token)).status).toBe(403);
    expect((await request('/personal-ministries/context', church.viewer.token)).status).toBe(403);
    expect((await request(`/department-operations/context?departmentId=${foreign.departments.general}`)).status).toBe(403);
  });

  it('conecta planes, tareas, finanzas, reunión, registro, comentarios y reportes', async () => {
    const context = await json(`/department-operations/context?departmentId=${church.departments.mission}`);
    const workspaceId = context.selected.id, ownerId = church.mission.principal.sub;
    const plan = await json('/department-operations/plans', 201, undefined, 'POST', { workspaceId, title: 'Synthetic annual plan', year: 2027, ownerId });
    await json(`/department-operations/plans/${plan.id}/approve`, 201, undefined, 'POST', {});
    await json('/department-operations/objectives', 201, undefined, 'POST', { planId: plan.id, title: 'Synthetic objective', targetValue: 100, unit: '%', ownerId });
    const initiative = await json('/department-operations/initiatives', 201, undefined, 'POST', { workspaceId, planId: plan.id, initiativeType: 'PROGRAM', title: 'Synthetic initiative', objective: 'Check connected operation', startsOn: '2027-02-01', endsOn: '2027-03-01', plannedBudget: 5000, ownerId });
    await json(`/department-operations/initiatives/${initiative.id}/assignments`, 201, undefined, 'POST', { userId: ownerId, responsibility: 'Synthetic coordination' });
    await json('/department-operations/budget', 201, undefined, 'POST', { workspaceId, initiativeId: initiative.id, entryType: 'EXPENSE', category: 'Synthetic materials', amount: 750, occurredOn: '2027-02-03', status: 'PAID' });
    const task = await json('/department-operations/tasks', 201, undefined, 'POST', { workspaceId, initiativeId: initiative.id, title: 'Synthetic task', assignedTo: ownerId });
    await json(`/department-operations/tasks/${task.id}`, 200, undefined, 'PATCH', { status: 'COMPLETED' });
    const meeting = await json('/department-operations/meetings', 201, undefined, 'POST', { workspaceId, title: 'Synthetic meeting', scheduledAt: '2027-02-05T16:00:00.000Z', endsAt: '2027-02-05T17:00:00.000Z', agenda: 'Validate synthetic plan', participantIds: [ownerId] });
    await json(`/department-operations/meetings/${meeting.id}`, 200, undefined, 'PATCH', { status: 'CLOSED', minutes: 'Synthetic decisions recorded.' });
    await json('/department-operations/decisions', 201, undefined, 'POST', { workspaceId, meetingId: meeting.id, initiativeId: initiative.id, title: 'Synthetic decision', decisionText: 'Continue synthetic operation', authorityType: 'DEPARTMENT', decidedOn: '2027-02-05' });
    await json('/department-operations/comments', 201, undefined, 'POST', { workspaceId, resourceType: 'INITIATIVE', resourceId: initiative.id, body: 'Synthetic progress', mentionUserIds: [ownerId] });
    await json('/department-operations/kpis', 201, undefined, 'POST', { workspaceId, name: 'Synthetic KPI', targetValue: 100, currentValue: 50, periodStart: '2027-01-01', periodEnd: '2027-12-31' });
    await json('/department-operations/records', 201, undefined, 'POST', { workspaceId, recordType: context.selected.pack.recordTypes[0].type, title: 'Synthetic evidence', recordDate: '2027-02-05', visibility: 'TEAM', data: { notes: 'Synthetic evidence' } });
    const final = await json(`/department-operations/context?departmentId=${church.departments.mission}`);
    expect(final.initiatives.find((item: { id: string }) => item.id === initiative.id)).toMatchObject({ spentBudget: 750 });
    expect(final.comments.some((item: { resourceId: string }) => item.resourceId === initiative.id)).toBe(true);
    const pdf = await request(`/department-operations/reports/executive.pdf?workspaceId=${workspaceId}`);
    expect(pdf.status).toBe(200); expect(pdf.headers.get('content-type')).toContain('application/pdf');
    expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    const csv = await request(`/department-operations/reports/executive.csv?workspaceId=${workspaceId}`);
    expect(csv.status).toBe(200); expect(await csv.text()).toContain('Synthetic initiative');
  });

  it('completa Ministerios Personales y calcula presupuesto con anulaciones', async () => {
    const token = church.mission.token, ownerId = church.mission.principal.sub;
    const plan = await json('/personal-ministries/strategic-plans', 201, token, 'POST', { title: 'Synthetic mission plan', periodStart: '2027-01-01', periodEnd: '2027-12-31', ownerId });
    const initiative = await json('/personal-ministries/initiatives', 201, token, 'POST', { strategicPlanId: plan.id, title: 'Synthetic mission initiative', startsOn: '2027-03-01', endsOn: '2027-03-31', plannedBudget: 5000, assigneeId: ownerId });
    const commitment = await json(`/personal-ministries/initiatives/${initiative.id}/budget-entries`, 201, token, 'POST', { entryType: 'COMMITMENT', category: 'Synthetic logistics', description: 'Synthetic transport', amount: 1200, occurredOn: '2027-03-01', status: 'APPROVED' });
    for (const [entryType, amount] of [['EXPENSE', 850], ['INCOME', 500]]) await json(`/personal-ministries/initiatives/${initiative.id}/budget-entries`, 201, token, 'POST', { entryType, category: 'Synthetic materials', description: 'Synthetic finance entry', amount, occurredOn: '2027-03-01', status: 'PAID' });
    let context = await json('/personal-ministries/context', 200, token);
    expect(context.initiatives.find((item: { id: string }) => item.id === initiative.id)).toMatchObject({ spentBudget: 850, committedBudget: 1200, incomeBudget: 500, forecastBudget: 2050, availableBudget: 3450 });
    await json(`/personal-ministries/budget-entries/${commitment.id}`, 200, token, 'PATCH', { status: 'VOID' });
    const contact = await json('/personal-ministries/contacts', 201, token, 'POST', { name: 'Synthetic interested person', assignedTo: ownerId, consent: true });
    const study = await json('/personal-ministries/bible-studies', 201, token, 'POST', { contactId: contact.id, instructorId: ownerId, studiedAt: '2027-03-02T16:00:00.000Z', lesson: 'Synthetic lesson', status: 'COMPLETED' });
    await json(`/personal-ministries/bible-studies/${study.id}`, 200, token, 'PATCH', { outcome: 'Synthetic outcome' });
    const group = await json('/personal-ministries/small-groups', 201, token, 'POST', { name: 'Synthetic group', leaderId: ownerId, meetingDay: 6, meetingTime: '15:00' });
    await json(`/personal-ministries/small-groups/${group.id}`, 200, token, 'PATCH', { currentMembers: 8 });
    const minute = await json('/personal-ministries/missionary-minutes', 201, token, 'POST', { title: 'Synthetic mission minute', scheduledAt: '2027-03-06T16:00:00.000Z', endsAt: '2027-03-06T16:10:00.000Z', presenterId: ownerId });
    await json(`/personal-ministries/missionary-minutes/${minute.id}`, 200, token, 'PATCH', { status: 'COMPLETED' });
    const campaign = await json('/personal-ministries/campaigns', 201, token, 'POST', { initiativeId: initiative.id, title: 'Synthetic campaign', startsOn: '2027-03-10', endsOn: '2027-03-12' });
    await json(`/personal-ministries/campaigns/${campaign.id}`, 200, token, 'PATCH', { status: 'COMPLETED', decisionCount: 4, baptismCount: 2 });
    context = await json('/personal-ministries/context', 200, token);
    expect(context.initiatives.find((item: { id: string }) => item.id === initiative.id)).toMatchObject({ committedBudget: 0, availableBudget: 4650 });
    expect(context.contacts.find((item: { id: string }) => item.id === contact.id)).toMatchObject({ stage: 'BIBLE_STUDY', studyCount: 1 });
    await json('/personal-ministries/calendar?from=2027-01-01T00:00:00.000Z&to=2028-01-01T00:00:00.000Z', 200, token);
    expect((await request('/personal-ministries/contacts', token, 'POST', { name: 'Synthetic invalid assignment', assignedTo: church.viewer.principal.sub })).status).toBe(400);
  });

  it('rechaza referencias cruzadas entre planes, iniciativas, finanzas, tareas y acuerdos departamentales', async () => {
    const own = await json(`/department-operations/context?departmentId=${church.departments.mission}`, 200, church.mission.token);
    const other = await json(`/department-operations/context?departmentId=${church.departments.woman}`);
    const workspaceId = own.selected.id, otherWorkspaceId = other.selected.id;
    const plan = await json('/department-operations/plans', 201, undefined, 'POST', { workspaceId: otherWorkspaceId, title: 'Synthetic other department plan', year: 2028 });
    const initiative = await json('/department-operations/initiatives', 201, undefined, 'POST', { workspaceId: otherWorkspaceId, planId: plan.id, initiativeType: 'PROGRAM', title: 'Synthetic private other department initiative', objective: 'Synthetic scoped data', startsOn: '2028-01-01', endsOn: '2028-02-01' });
    const meeting = await json('/department-operations/meetings', 201, undefined, 'POST', { workspaceId: otherWorkspaceId, title: 'Synthetic other meeting', scheduledAt: '2028-01-03T16:00:00.000Z', endsAt: '2028-01-03T17:00:00.000Z', agenda: 'Synthetic scoped agenda' });
    const results = await Promise.all([
      request('/department-operations/initiatives', church.mission.token, 'POST', { workspaceId, planId: plan.id, initiativeType: 'PROGRAM', title: 'Synthetic cross plan', objective: 'Synthetic invalid link', startsOn: '2028-01-01', endsOn: '2028-02-01' }),
      request('/department-operations/budget', church.mission.token, 'POST', { workspaceId, initiativeId: initiative.id, entryType: 'EXPENSE', category: 'Synthetic wrong charge', amount: 900, occurredOn: '2028-01-01', status: 'PAID' }),
      request('/department-operations/tasks', church.mission.token, 'POST', { workspaceId, initiativeId: initiative.id, title: 'Synthetic cross task' }),
      request('/department-operations/decisions', undefined, 'POST', { workspaceId, meetingId: meeting.id, title: 'Synthetic cross meeting', decisionText: 'Synthetic invalid link', authorityType: 'DEPARTMENT', decidedOn: '2028-01-03' }),
      request('/department-operations/decisions', undefined, 'POST', { workspaceId, initiativeId: initiative.id, title: 'Synthetic cross initiative', decisionText: 'Synthetic invalid link', authorityType: 'DEPARTMENT', decidedOn: '2028-01-03' }),
    ]);
    expect(results.map((response) => response.status)).toEqual([400, 400, 400, 400, 400]);
    const final = await json(`/department-operations/context?departmentId=${church.departments.woman}`);
    expect(final.initiatives.find((item: { id: string }) => item.id === initiative.id)).toMatchObject({ spentBudget: 0 });
    const ownFinal = await json(`/department-operations/context?departmentId=${church.departments.mission}`, 200, church.mission.token);
    expect(JSON.stringify(ownFinal)).not.toContain('Synthetic private other department initiative');
  });

  it('aplica la misma autoridad de aprobación financiera al crear y revisar partidas', async () => {
    const own = await json(`/department-operations/context?departmentId=${church.departments.mission}`, 200, church.mission.token);
    const input = { workspaceId: own.selected.id, entryType: 'EXPENSE', category: 'Synthetic approval authority', amount: 100, occurredOn: '2027-02-01', status: 'PLANNED' };
    const planned = await json('/department-operations/budget', 201, church.mission.token, 'POST', input);
    expect((await request(`/department-operations/budget/${planned.id}`, church.mission.token, 'PATCH', { status: 'APPROVED' })).status).toBe(403);
    const elevated = await Promise.all(['APPROVED', 'PAID'].map((status) => request('/department-operations/budget', church.mission.token, 'POST', { ...input, status })));
    expect(elevated.map((response) => response.status)).toEqual([403, 403]);
    await json(`/department-operations/budget/${planned.id}`, 200, church.secretary.token, 'PATCH', { status: 'APPROVED' });
    const direct = await json('/department-operations/budget', 201, undefined, 'POST', { ...input, status: 'PAID' });
    expect((await church.pool.query('SELECT approved_by,approved_at FROM department_operations.budget_entries WHERE id=$1', [direct.id])).rows[0]).toMatchObject({ approved_by: church.admin.principal.sub, approved_at: expect.any(Date) });
  });

  it('importa padrón sintético, sincroniza mujeres y protege fotografías', async () => {
    expect((await request('/roster/context', church.mission.token)).status).toBe(403);
    const csv = ['Código de miembro,Nombres,Segundo nombre,Apellidos,Sexo,Fecha de nacimiento,Correo electrónico,Teléfono,WhatsApp,Estado civil,Estado de membresía,Fecha de bautismo,Fecha de ingreso,Dirección,Contacto de emergencia,Notas', 'FLOW-WOMAN,Ana,,Sintética,Femenino,1989-04-17,synthetic@flows.example,,,Soltera,Miembro,,,,,Synthetic record', 'FLOW-MAN,Luis,,Sintético,Masculino,1977-11-09,,,,Soltero,Miembro,,,,,Synthetic record', 'FLOW-BAD,X,,Error,Inválido,invalid,,,,,Desconocido,,,,,,Invalid fixture'].join('\n');
    const form = new FormData(); form.append('file', new Blob([csv], { type: 'text/csv' }), 'synthetic-roster.csv');
    const preview = await json('/roster/imports/preview', 201, undefined, 'POST', form);
    expect(preview).toMatchObject({ totalRows: 3, validRows: 2, invalidRows: 1 });
    const committed = await json(`/roster/imports/${preview.id}/commit`, 201, undefined, 'POST', {});
    expect(committed).toMatchObject({ imported: 2, created: 2, skippedInvalid: 1, womenRosterSynchronized: true });
    const roster = await json('/roster/context');
    const member = roster.members.find((item: { memberCode: string }) => item.memberCode === 'FLOW-WOMAN');
    expect(member).toMatchObject({ displayName: 'Ana Sintética', hasPhoto: false });
    const women = await json('/womens-ministry/context');
    expect(women.women.find((item: { churchMemberId: string }) => item.churchMemberId === member.id)).toMatchObject({ name: 'Ana Sintética', dateOfBirth: '1989-04-17' });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const photoForm = new FormData(); photoForm.append('file', new Blob([png], { type: 'image/png' }), 'synthetic-photo.png');
    await json(`/files/member-photos/${member.id}`, 201, undefined, 'POST', photoForm);
    const photo = await request(`/files/member-photos/${member.id}`); expect(photo.status).toBe(200); expect((await photo.arrayBuffer()).byteLength).toBe(png.length);
    expect((await request(`/files/member-photos/${member.id}`, church.mission.token)).status).toBe(403);
    expect((await request(`/files/member-photos/${member.id}`, foreign.admin.token)).status).toBe(404);
    expect((await request(`/roster/imports/${preview.id}/commit`, undefined, 'POST', {})).status).toBe(409);
  });

  it('confirma calendario, publica adjuntos y libera reservas al cancelar', async () => {
    const input = { title: 'Synthetic calendar activity', description: 'Synthetic schedule', departmentId: church.departments.mission, responsibleName: 'Synthetic leader', options: [{ label: 'Preferred date', preference: 1, sessions: [{ startsAt: '2027-07-01T16:00:00.000Z', endsAt: '2027-07-01T17:00:00.000Z' }] }] };
    const activity = await json('/activities', 201, church.mission.token, 'POST', input);
    await json(`/activities/${activity.id}/submit`, 201, church.mission.token, 'POST', {});
    await json(`/activities/${activity.id}/approve`, 201, church.secretary.token, 'POST', {});
    const file = await json(`/files/activity/${activity.id}`, 201, undefined, 'POST', textUpload());
    expect((await request(`/files/${file.id}/download`, church.mission.token)).status).toBe(200);
    expect((await request(`/files/activity/${activity.id}`, church.mission.token, 'POST', textUpload())).status).toBe(403);
    expect((await request(`/activities/${activity.id}`, foreign.admin.token)).status).toBe(404);
    const availabilityPath = '/availability?start=2027-07-01T16%3A00%3A00.000Z&end=2027-07-01T17%3A00%3A00.000Z';
    expect((await json(availabilityPath)).available).toBe(false);
    await json(`/activities/${activity.id}/cancel`, 201, undefined, 'POST', {});
    expect((await json(availabilityPath)).available).toBe(true);
  });

  it('versiona documentos y controla visibilidad, alineación, preview y eliminación', async () => {
    const fields = { departmentId: church.departments.mission, title: 'Synthetic departmental plan', documentType: 'PROGRAM', ministryYear: '2027', alignmentBasis: 'ANNUAL_CHURCH_PLAN', alignmentReference: 'Synthetic annual plan reference', alignmentConfirmed: 'true', visibility: 'DEPARTMENT' };
    const first = await json('/files/department-documents', 201, church.mission.token, 'POST', textUpload(fields));
    const second = await json('/files/department-documents', 201, church.mission.token, 'POST', textUpload(fields));
    expect(first.version).toBe(1); expect(second.version).toBe(2);
    const preview = await request(`/files/department-documents/${first.id}/preview`, church.mission.token);
    expect(preview.status).toBe(200); expect(await preview.text()).toContain('Synthetic departmental plan');
    expect((await request(`/files/${first.fileId}/download`, church.woman.token)).status).toBe(403);
    expect((await request(`/files/department-documents/${first.id}/preview`, foreign.admin.token)).status).toBe(403);
    await json(`/files/department-documents/${first.id}/alignment`, 200, undefined, 'PATCH', { status: 'VERIFIED', notes: 'Synthetic alignment checked' });
    await json(`/files/department-documents/${first.id}`, 200, church.mission.token, 'DELETE');
    expect((await request(`/files/${first.fileId}/download`)).status).toBe(404);
    expect((await request(`/files/${second.fileId}/download`, church.mission.token)).status).toBe(200);
  });

  it('reintenta sin duplicar y confirma una fecha alternativa libre', async () => {
    const option = (startsAt: string, endsAt: string, preference = 1) => ({ label: `Synthetic option ${preference}`, preference, sessions: [{ startsAt, endsAt }] });
    const payload = { title: 'Synthetic idempotent activity', description: 'Synthetic safe retry', departmentId: church.departments.general, responsibleName: 'Synthetic scheduler', options: [option('2027-10-01T16:00:00.000Z', '2027-10-01T17:00:00.000Z')] };
    const headers = { 'idempotency-key': `flows-${randomUUID()}` };
    const first = await request('/activities', undefined, 'POST', payload, headers), replay = await request('/activities', undefined, 'POST', payload, headers);
    expect(first.status).toBe(201); expect(replay.status).toBe(201);
    const activity = await first.json(); expect(await replay.json()).toMatchObject({ id: activity.id, replayed: true });
    await json(`/activities/${activity.id}/submit`, 201, undefined, 'POST', {});
    const candidate = await json('/activities', 201, church.mission.token, 'POST', { ...payload, title: 'Synthetic alternative activity', departmentId: church.departments.mission, options: [...payload.options, option('2027-10-02T16:00:00.000Z', '2027-10-02T17:00:00.000Z', 2)] });
    const submitted = await json(`/activities/${candidate.id}/submit`, 201, church.mission.token, 'POST', {});
    expect(submitted.status).toBe('ALTERNATIVE_AVAILABLE');
    expect((await json(`/activities/${candidate.id}/options/${submitted.alternative.id}/confirm`, 201, church.mission.token, 'POST', {})).status).toBe('SUBMITTED');
    await json(`/activities/${activity.id}/cancel`, 201, undefined, 'POST', {});
    await json(`/activities/${candidate.id}/cancel`, 201, undefined, 'POST', {});
  });

  it('protege documentos de liderazgo sin retirar lectura de documentos de equipo', async () => {
    const fields = { departmentId: church.departments.mission, title: 'Synthetic leadership confidential document', documentType: 'PROGRAM', ministryYear: '2027', alignmentBasis: 'ANNUAL_CHURCH_PLAN', alignmentReference: 'Synthetic annual reference', alignmentConfirmed: 'true', visibility: 'LEADERSHIP' };
    const restricted = await json('/files/department-documents', 201, church.mission.token, 'POST', textUpload(fields));
    const common = await json('/files/department-documents', 201, church.mission.token, 'POST', textUpload({ ...fields, title: 'Synthetic team document', visibility: 'DEPARTMENT' }));
    const token = church.teamViewer.token;
    const list = await json('/files/department-documents', 200, token);
    expect(list.items.some((item: { id: string }) => item.id === restricted.id)).toBe(false);
    expect(list.items.some((item: { id: string }) => item.id === common.id)).toBe(true);
    expect((await request(`/files/department-documents/${restricted.id}/preview`, token)).status).toBe(403);
    expect((await request(`/files/${restricted.fileId}/download`, token)).status).toBe(403);
    expect((await request(`/files/${restricted.fileId}/access-token`, token, 'POST', {})).status).toBe(403);
    expect((await request(`/files/${common.fileId}/download`, token)).status).toBe(200);
    expect((await request(`/files/${restricted.fileId}/download`, church.mission.token)).status).toBe(200);
    expect((await request(`/files/${restricted.fileId}/download`, church.secretary.token)).status).toBe(200);
    expect((await request(`/files/${restricted.fileId}/download`, church.planner.token)).status).toBe(403);
    const authored = await json('/files/department-documents', 201, church.planner.token, 'POST', textUpload({ ...fields, title: 'Synthetic leadership document by planner' }));
    expect((await request(`/files/${authored.fileId}/download`, church.planner.token)).status).toBe(200);
    expect((await json('/files/department-documents', 200, church.planner.token)).items.some((item: { id: string }) => item.id === authored.id)).toBe(true);
  });

  it('serializa reservas concurrentes y resuelve revisión con alternativa autorizada', async () => {
    const input = { description: 'Synthetic concurrent reservation', responsibleName: 'Synthetic coordinator', options: [{ label: 'Preferred date', preference: 1, sessions: [{ startsAt: '2027-11-01T16:00:00.000Z', endsAt: '2027-11-01T17:00:00.000Z' }] }] };
    const [first, second] = await Promise.all([
      json('/activities', 201, undefined, 'POST', { ...input, title: 'Synthetic concurrent first', departmentId: church.departments.general }),
      json('/activities', 201, church.mission.token, 'POST', { ...input, title: 'Synthetic concurrent second', departmentId: church.departments.mission }),
    ]);
    const submissions = await Promise.all([json(`/activities/${first.id}/submit`, 201, undefined, 'POST', {}), json(`/activities/${second.id}/submit`, 201, church.mission.token, 'POST', {})]);
    expect(submissions.map((item) => item.status).sort()).toEqual(['CONFLICTED', 'SUBMITTED']);
    const conflicted = submissions[0].status === 'CONFLICTED' ? first : second;
    const token = conflicted.id === first.id ? church.admin.token : church.mission.token;
    const review = await json(`/activities/${conflicted.id}/request-review`, 201, token, 'POST', { reason: 'Synthetic scheduling review request', coexistencePlan: 'Synthetic separate resources and responsibilities' });
    const queue = await json('/review-requests', 200, church.secretary.token);
    expect(queue.items.some((item: { id: string }) => item.id === review.id)).toBe(true);
    const suggestions = await json(`/review-requests/${review.id}/alternative-suggestions?limit=3`);
    expect(suggestions.items.length).toBeGreaterThan(0);
    const alternate = await json(`/review-requests/${review.id}/alternatives`, 201, undefined, 'POST', { label: 'Synthetic managed alternative', ...suggestions.items[0] });
    await json(`/review-requests/${review.id}/recommendations`, 201, church.secretary.token, 'POST', { recommendation: 'APPROVE', notes: 'Synthetic review recommendation' });
    const decision = { decision: 'APPROVE_ALTERNATIVE', optionId: alternate.id, notes: 'Synthetic alternative approved with traceability' };
    expect((await request(`/review-requests/${review.id}/decision`, undefined, 'POST', decision)).status).toBe(403);
    await json(`/review-requests/${review.id}/decision`, 201, church.secretary.token, 'POST', decision);
    expect((await json(`/activities/${conflicted.id}`, 200, church.secretary.token)).status).toBe('APPROVED');
    await json(`/activities/${first.id}/cancel`, 201, undefined, 'POST', {});
    await json(`/activities/${second.id}/cancel`, 201, undefined, 'POST', {});
  });

  it('tramita cambios aprobados con versión vigente y conserva gobierno del calendario', async () => {
    const token = church.mission.token;
    const activity = await json('/activities', 201, token, 'POST', { title: 'Synthetic approved change', description: 'Synthetic change workflow', departmentId: church.departments.mission, responsibleName: 'Synthetic leader', options: [{ label: 'Preferred date', preference: 1, sessions: [{ startsAt: '2027-12-01T16:00:00.000Z', endsAt: '2027-12-01T17:00:00.000Z' }] }] });
    await json(`/activities/${activity.id}/submit`, 201, token, 'POST', {});
    await json(`/activities/${activity.id}/approve`, 201, church.secretary.token, 'POST', {});
    const detail = await json(`/activities/${activity.id}`, 200, token);
    const changes = { title: 'Synthetic changed title', expectedVersion: detail.version, changeReason: 'Synthetic requested correction' };
    expect((await request(`/activities/${activity.id}`, token, 'PATCH', changes)).status).toBe(409);
    const changeRequest = await json(`/activities/${activity.id}/change-requests`, 201, token, 'POST', { reason: 'Synthetic justified correction', changes });
    const queue = await json('/activity-change-requests?status=PENDING', 200, church.secretary.token);
    expect(queue.items.some((item: { id: string }) => item.id === changeRequest.id)).toBe(true);
    await json(`/activity-change-requests/${changeRequest.id}/decision`, 201, church.secretary.token, 'POST', { decision: 'APPROVE', notes: 'Synthetic correction approved' });
    const updated = await json(`/activities/${activity.id}`, 200, token);
    expect(updated.title).toBe(changes.title); expect(updated.version).toBeGreaterThan(detail.version);
    expect((await request(`/activities/${activity.id}/change-requests`, token, 'POST', { reason: 'Synthetic stale version rejected', changes })).status).toBe(412);
    await json(`/activities/${activity.id}/cancel`, 201, undefined, 'POST', {});
  });

  it('convoca junta, confirma asistencia, enlaza agenda y cierra acta', async () => {
    const eligible = await json('/review-sessions/eligible-participants');
    expect(eligible.items.some((item: { id: string }) => item.id === church.mission.principal.sub)).toBe(true);
    const participantIds = [church.admin.principal.sub, church.secretary.principal.sub, church.mission.principal.sub];
    const session = await json('/review-sessions', 201, undefined, 'POST', { title: 'Synthetic review meeting', scheduledAt: '2027-06-01T16:00:00.000Z', endsAt: '2027-06-01T17:00:00.000Z', agenda: 'Synthetic plans and review agenda', participantIds, reminderMinutes: [60], reviewRequestIds: [] });
    const agenda = await json('/review-sessions/my-agenda?from=2027-06-01T00:00:00.000Z&to=2027-06-02T00:00:00.000Z', 200, church.mission.token);
    expect(agenda.items.some((item: { id: string }) => item.id === session.id)).toBe(true);
    const listed = await json('/review-sessions', 200, church.mission.token);
    expect(listed.capabilities.canManageSessions).toBe(false);
    expect((await json(`/review-sessions/${session.id}/response`, 200, church.mission.token, 'PATCH', { response: 'CONFIRMED' })).invitationStatus).toBe('CONFIRMED');
    expect((await request(`/review-sessions/${session.id}`, church.mission.token, 'PATCH', { status: 'CLOSED' })).status).toBe(403);
    expect((await json(`/review-sessions/${session.id}`, 200, undefined, 'PATCH', { status: 'CLOSED', minutes: 'Synthetic minutes retained', attendedParticipantIds: participantIds })).status).toBe('CLOSED');
    expect((await request(`/review-sessions/${session.id}/response`, foreign.admin.token, 'PATCH', { response: 'CONFIRMED' })).status).toBe(409);
  });

  it('conecta mujeres, actividad, participación, retiro, pagos y seguimiento', async () => {
    const token = church.woman.token;
    const woman = await json('/womens-ministry/women', 201, token, 'POST', { name: 'Synthetic woman', preferredContact: 'NONE' });
    const calendar = await json('/activities', 201, token, 'POST', { title: 'Synthetic women calendar', description: 'Synthetic calendar link', departmentId: church.departments.woman, responsibleName: 'Synthetic leader', options: [{ label: 'Preferred date', preference: 1, sessions: [{ startsAt: '2027-08-01T16:00:00.000Z', endsAt: '2027-08-01T17:00:00.000Z' }] }] });
    const activity = await json('/womens-ministry/activities', 201, token, 'POST', { calendarActivityId: calendar.id, title: 'Synthetic women activity', activityType: 'SPIRITUAL', objective: 'Synthetic engagement', startsAt: '2027-08-01T16:00:00.000Z', endsAt: '2027-08-01T17:00:00.000Z', plannedBudget: 1000, responsibleId: church.woman.principal.sub });
    await json(`/womens-ministry/activities/${activity.id}/budget`, 201, token, 'POST', { entryType: 'EXPENSE', category: 'Synthetic materials', amount: 250, occurredOn: '2027-08-01' });
    await json(`/womens-ministry/activities/${activity.id}/participation`, 201, token, 'POST', { womanId: woman.id, status: 'ATTENDED' });
    await json(`/womens-ministry/activities/${activity.id}`, 200, token, 'PATCH', { status: 'COMPLETED', outcome: 'Synthetic completed event' });
    const retreat = await json('/womens-ministry/retreats', 201, token, 'POST', { title: 'Synthetic retreat', year: 2027, resort: 'Synthetic location', startsOn: '2027-09-01', endsOn: '2027-09-02', capacity: 10, costPerPerson: 100, totalBudget: 1000 });
    const registration = await json(`/womens-ministry/retreats/${retreat.id}/registrations`, 201, token, 'POST', { womanId: woman.id, amountDue: 100, attendanceStatus: 'CONFIRMED' });
    await json(`/womens-ministry/retreat-registrations/${registration.id}/payments`, 201, token, 'POST', { amount: 40, paidOn: '2027-08-02', method: 'CASH' });
    await json(`/womens-ministry/retreat-registrations/${registration.id}/payments`, 201, token, 'POST', { amount: 60, paidOn: '2027-08-03', method: 'TRANSFER' });
    const followUp = await json('/womens-ministry/follow-ups', 201, token, 'POST', { womanId: woman.id, activityId: activity.id, reason: 'Synthetic follow up', dueOn: '2027-08-04', assignedTo: church.woman.principal.sub });
    await json(`/womens-ministry/follow-ups/${followUp.id}`, 200, token, 'PATCH', { status: 'COMPLETED' });
    const context = await json('/womens-ministry/context', 200, token);
    expect(context.activities.find((item: { id: string }) => item.id === activity.id)).toMatchObject({ spentBudget: 250, attendedCount: 1 });
    const resultingRetreat = context.retreats.find((item: { id: string }) => item.id === retreat.id);
    expect(resultingRetreat).toMatchObject({ confirmed: 1, collected: 100 });
    expect(resultingRetreat.registrations[0]).toMatchObject({ amountPaid: 100, paymentStatus: 'PAID' });
  });

  it('bloquea seguimientos confidenciales y responsables ajenos al equipo de mujeres', async () => {
    const token = church.woman.token;
    const woman = await json('/womens-ministry/women', 201, token, 'POST', { name: 'Synthetic privacy fixture', preferredContact: 'NONE' });
    const before = await church.pool.query('SELECT count(*)::int total FROM womens_ministry.follow_ups');
    const rejected = await request('/womens-ministry/follow-ups', token, 'POST', { womanId: woman.id, reason: 'Synthetic restricted care reason', dueOn: '2027-08-05', assignedTo: church.viewer.principal.sub });
    expect(rejected.status).toBe(400);
    expect((await church.pool.query('SELECT count(*)::int total FROM womens_ministry.follow_ups')).rows[0].total).toBe(before.rows[0].total);
    expect((await request(`/notifications`, church.viewer.token)).status).toBe(200);
    expect(await (await request('/notifications', church.viewer.token)).text()).not.toContain('Synthetic restricted care reason');
    const allowed = await json('/womens-ministry/follow-ups', 201, token, 'POST', { womanId: woman.id, reason: 'Synthetic scoped follow up', dueOn: '2027-08-05', assignedTo: church.woman.principal.sub });
    expect((await request(`/womens-ministry/follow-ups/${allowed.id}`, token, 'PATCH', { assignedTo: church.viewer.principal.sub })).status).toBe(400);
    expect((await church.pool.query('SELECT assigned_to FROM womens_ministry.follow_ups WHERE id=$1', [allowed.id])).rows[0].assigned_to).toBe(church.woman.principal.sub);
    const calendar = await json('/activities', 201, token, 'POST', { title: 'Synthetic invalid responsible fixture', description: 'Synthetic assignment validation', departmentId: church.departments.woman, responsibleName: 'Synthetic leader', options: [{ label: 'Preferred date', preference: 1, sessions: [{ startsAt: '2028-08-01T16:00:00.000Z', endsAt: '2028-08-01T17:00:00.000Z' }] }] });
    expect((await request('/womens-ministry/activities', token, 'POST', { calendarActivityId: calendar.id, title: 'Synthetic invalid responsible', activityType: 'SPIRITUAL', objective: 'Synthetic invalid assignment', startsAt: '2028-08-01T16:00:00.000Z', endsAt: '2028-08-01T17:00:00.000Z', plannedBudget: 100, responsibleId: church.viewer.principal.sub })).status).toBe(400);
    await church.pool.query('UPDATE identity.users SET active=false WHERE id=$1', [church.woman.principal.sub]);
    try {
      expect((await request('/womens-ministry/follow-ups', undefined, 'POST', { womanId: woman.id, reason: 'Synthetic inactive assignment', dueOn: '2027-08-05', assignedTo: church.woman.principal.sub })).status).toBe(400);
    } finally { await church.pool.query('UPDATE identity.users SET active=true WHERE id=$1', [church.woman.principal.sub]); }
  });

  it('administra ancianos, rotaciones, programas y plataformas sin reservar calendario', async () => {
    const elderId = church.elder.principal.sub;
    const rotation = await json('/elders/rotations', 201, undefined, 'POST', { title: 'Synthetic elder rotation', startsOn: '2027-04-01', endsOn: '2027-04-07', elderIds: [elderId] });
    const program = await json('/elders/programs', 201, church.elder.token, 'POST', { rotationId: rotation.id, elderId, serviceAt: '2027-04-03T16:00:00.000Z', endsAt: '2027-04-03T17:00:00.000Z', serviceType: 'SABBATH', title: 'Synthetic elder program' });
    const templates = await json('/elders/platform/templates');
    expect(templates.items.length).toBeGreaterThan(0);
    const shortTemplate = await json('/elders/platform/templates', 201, undefined, 'POST', { name: 'Synthetic brief template', serviceType: 'SABBATH', items: [{ title: 'Synthetic prayer', participationType: 'PRAYER', durationMinutes: 10 }] });
    await json(`/elders/programs/${program.id}/platform/apply-template`, 201, undefined, 'POST', { templateId: shortTemplate.id });
    const platform = await json(`/elders/programs/${program.id}/platform`);
    expect(platform.items.length).toBeGreaterThan(0);
    await json(`/elders/programs/${program.id}/platform`, 200, church.elder.token, 'PATCH', { platformMembers: [{ userId: elderId, displayName: 'Synthetic elder', roleLabel: 'Synthetic platform', isLead: true }], items: [{ title: 'Synthetic prayer', participationType: 'PRAYER', startsAt: '2027-04-03T16:00:00.000Z', durationMinutes: 10, assigneeUserId: elderId }] });
    await json(`/elders/programs/${program.id}`, 200, church.elder.token, 'PATCH', { status: 'PUBLISHED' });
    expect((await json('/availability?start=2027-04-03T16%3A00%3A00.000Z&end=2027-04-03T17%3A00%3A00.000Z')).available).toBe(true);
    expect((await request(`/elders/programs/${program.id}`, church.mission.token, 'PATCH', { status: 'COMPLETED' })).status).toBe(403);
    expect((await request(`/elders/programs/${program.id}`, foreign.admin.token, 'PATCH', { status: 'COMPLETED' })).status).toBe(404);
  });

  it('revalida perfiles activos de ancianos al editar rotaciones y programas', async () => {
    const elderId = church.elder.principal.sub;
    const rotation = await json('/elders/rotations', 201, undefined, 'POST', { title: 'Synthetic role validation', startsOn: '2027-05-01', endsOn: '2027-05-07', elderIds: [elderId] });
    expect((await request(`/elders/rotations/${rotation.id}`, undefined, 'PATCH', { elderIds: [church.viewer.principal.sub] })).status).toBe(400);
    expect((await church.pool.query('SELECT elder_id FROM elders.rotation_members WHERE rotation_id=$1', [rotation.id])).rows.map((item) => item.elder_id)).toEqual([elderId]);
    expect((await request(`/elders/rotations/${rotation.id}`, undefined, 'PATCH', { elderIds: [elderId, elderId] })).status).toBe(400);
    expect((await request(`/elders/rotations/${rotation.id}`, undefined, 'PATCH', { endsOn: '2027-04-01' })).status).toBe(400);
    const program = await json('/elders/programs', 201, undefined, 'POST', { elderId, serviceAt: '2027-05-03T16:00:00.000Z', endsAt: '2027-05-03T17:00:00.000Z', serviceType: 'SABBATH', title: 'Synthetic profile check' });
    expect((await request(`/elders/programs/${program.id}`, undefined, 'PATCH', { elderId: church.viewer.principal.sub })).status).toBe(400);
    expect((await church.pool.query('SELECT elder_id FROM elders.programs WHERE id=$1', [program.id])).rows[0].elder_id).toBe(elderId);
    expect((await request(`/elders/programs/${program.id}`, undefined, 'PATCH', { endsAt: '2027-05-03T15:00:00.000Z' })).status).toBe(400);
    await church.pool.query('UPDATE identity.users SET active=false WHERE id=$1', [elderId]);
    try {
      expect((await request(`/elders/rotations/${rotation.id}`, undefined, 'PATCH', { elderIds: [elderId] })).status).toBe(400);
      expect((await request(`/elders/programs/${program.id}`, undefined, 'PATCH', { elderId })).status).toBe(400);
    } finally { await church.pool.query('UPDATE identity.users SET active=true WHERE id=$1', [elderId]); }
  });
});
