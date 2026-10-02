import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_IDENTITY_AUDIT_API_TESTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:4000/api/v1';
let church: SyntheticTenantFixture;
async function request(path: string, method = 'POST', body?: unknown, authenticated = true) {
  return fetch(`${base}${path}`, {
    method, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...(authenticated ? { authorization: `Bearer ${church.users.admin.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25_000),
  });
}
async function failAudit(action: string) {
  if (!/^[a-z_.]+$/.test(action)) throw new Error('Invalid synthetic trigger action.');
  await church.pool.query(`CREATE OR REPLACE FUNCTION audit.fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'Synthetic mandatory audit failure'; END IF; RETURN NEW; END $$`);
  await church.pool.query('CREATE TRIGGER fixture_failure BEFORE INSERT ON audit.audit_events FOR EACH ROW EXECUTE FUNCTION audit.fixture_failure()');
}
async function removeFailure() { await church.pool.query('DROP TRIGGER IF EXISTS fixture_failure ON audit.audit_events'); }

live('identity and calendar configuration commit with their mandatory domain audit', () => {
  beforeAll(async () => {
    expect((await fetch('http://127.0.0.1:4000/health/ready')).ok).toBe(true);
    church = await createTenantFixture();
    await church.pool.query('INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled) SELECT id,false,false FROM identity.users');
    await church.pool.query('INSERT INTO identity.credentials(user_id,password_hash) SELECT id,password_hash FROM identity.users ON CONFLICT(user_id) DO NOTHING');
  });
  afterEach(async () => { if (church) await removeFailure(); });
  afterAll(async () => { if (church) await church.destroy(); });

  it('rolls back failed login session and counter reset when successful-login audit fails', async () => {
    await church.pool.query('UPDATE identity.credentials SET failed_attempts=2 WHERE user_id=$1', [church.users.admin.id]);
    const before = (await church.pool.query('SELECT count(*)::int count FROM identity.sessions WHERE user_id=$1', [church.users.admin.id])).rows[0].count;
    await failAudit('auth.login.succeeded');
    const response = await request('/auth/login', 'POST', { tenant: church.slug, email: church.users.admin.email, password: church.users.admin.password }, false);
    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await church.pool.query('SELECT count(*)::int count FROM identity.sessions WHERE user_id=$1', [church.users.admin.id])).rows[0].count).toBe(before);
    expect((await church.pool.query('SELECT failed_attempts FROM identity.credentials WHERE user_id=$1', [church.users.admin.id])).rows[0].failed_attempts).toBe(2);
  });

  it('keeps failed-attempt counters unchanged when the rejection audit cannot commit', async () => {
    const before = (await church.pool.query('SELECT failed_attempts FROM identity.credentials WHERE user_id=$1', [church.users.admin.id])).rows[0].failed_attempts;
    await failAudit('auth.login.rejected');
    expect((await request('/auth/login', 'POST', { tenant: church.slug, email: church.users.admin.email, password: randomBytes(24).toString('base64url') }, false)).status).toBe(500);
    expect((await church.pool.query('SELECT failed_attempts FROM identity.credentials WHERE user_id=$1', [church.users.admin.id])).rows[0].failed_attempts).toBe(before);
  });

  it.each([['/auth/logout', 'auth.logout'], ['/auth/sessions/revoke-all', 'auth.sessions.revoked']])('does not revoke or clear the session after failed mandatory audit for %s', async (path, action) => {
    await failAudit(action);
    const response = await request(path!);
    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await church.pool.query('SELECT revoked_at FROM identity.sessions WHERE id=$1', [church.users.admin.principal.sessionId])).rows[0].revoked_at).toBeNull();
    expect((await request('/me', 'GET')).ok).toBe(true);
  });

  it('rolls back password, credentials and other-session revocations on audit failure', async () => {
    await failAudit('auth.password.changed');
    const response = await request('/auth/password', 'PATCH', { currentPassword: church.users.admin.password, newPassword: `${randomBytes(24).toString('base64url')}!9aA` });
    expect(response.status).toBe(500);
    const stored = (await church.pool.query('SELECT u.password_hash,c.password_hash credential_hash FROM identity.users u JOIN identity.credentials c ON c.user_id=u.id WHERE u.id=$1', [church.users.admin.id])).rows[0];
    expect(await argon2.verify(stored.password_hash, church.users.admin.password)).toBe(true);
    expect(await argon2.verify(stored.credential_hash, church.users.admin.password)).toBe(true);
    expect((await church.pool.query('SELECT count(*)::int count FROM identity.sessions WHERE user_id=$1 AND revoked_at IS NOT NULL', [church.users.admin.id])).rows[0].count).toBe(0);
  });

  it('does not persist a reset token or expose an account when its request audit fails', async () => {
    await failAudit('auth.password_reset.requested');
    const before = (await church.pool.query('SELECT count(*)::int count FROM identity.password_reset_tokens')).rows[0].count;
    const response = await request('/auth/password/forgot', 'POST', { tenant: church.slug, email: church.users.admin.email }, false);
    expect(response.ok).toBe(true);
    expect(await response.json()).toMatchObject({ accepted: true });
    expect((await church.pool.query('SELECT count(*)::int count FROM identity.password_reset_tokens')).rows[0].count).toBe(before);
  });

  it('resets a valid synthetic token once, revokes prior sessions and rejects replay or expired tokens', async () => {
    const subject = await church.createUser(['VIEWER']);
    const token = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(token).digest('hex');
    await church.pool.query("INSERT INTO identity.password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')", [subject.id, digest]);
    const password = `${randomBytes(24).toString('base64url')}!9aA`;
    const body = { tenant: church.slug, token, newPassword: password };
    expect((await request('/auth/password/reset', 'POST', body, false)).ok).toBe(true);
    expect((await request('/auth/password/reset', 'POST', body, false)).status).toBe(400);
    expect((await church.pool.query('SELECT revoked_at FROM identity.sessions WHERE id=$1', [subject.principal.sessionId])).rows[0].revoked_at).toBeInstanceOf(Date);
    const login = await request('/auth/login', 'POST', { tenant: church.slug, email: subject.email, password }, false);
    expect(login.ok).toBe(true);
    const expired = randomBytes(32).toString('base64url');
    await church.pool.query("INSERT INTO identity.password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()-interval '1 second')", [subject.id, createHash('sha256').update(expired).digest('hex')]);
    expect((await request('/auth/password/reset', 'POST', { ...body, token: expired }, false)).status).toBe(400);
  });

  it('membership removal and denormalized department IDs both roll back with their audit', async () => {
    await church.pool.query('UPDATE identity.users SET department_ids=ARRAY[$2::uuid] WHERE id=$1', [church.users.member.id, church.departments.youth]);
    await failAudit('department_membership.removed');
    expect((await request(`/department-memberships/${church.users.member.id}/${church.departments.youth}`, 'DELETE')).status).toBe(500);
    expect((await church.pool.query('SELECT 1 FROM identity.department_memberships WHERE user_id=$1 AND department_id=$2', [church.users.member.id, church.departments.youth])).rowCount).toBe(1);
    expect((await church.pool.query('SELECT department_ids FROM identity.users WHERE id=$1', [church.users.member.id])).rows[0].department_ids).toEqual([church.departments.youth]);
  });

  it.each([
    ['/departments', 'department.created', 'calendar.departments', { name: 'Synthetic department audit', description: '', color: '#08776a' }],
    ['/venues', 'venue.created', 'calendar.venues', { name: 'Synthetic venue audit', capacity: 100, color: '#08776a' }],
    ['/resources', 'resource.created', 'calendar.resources', { name: 'Synthetic resource audit', exclusive: true }],
  ] as const)('rolls back %s creation when its audit fails, then commits exactly one audited record', async (path, action, table, body) => {
    await failAudit(action);
    expect((await request(path, 'POST', body)).status).toBe(500);
    expect((await church.pool.query(`SELECT 1 FROM ${table} WHERE name=$1`, [body.name])).rowCount).toBe(0);
    await removeFailure();
    const response = await request(path, 'POST', body);
    expect(response.status).toBe(201);
    const created = await response.json() as { id: string };
    expect((await church.pool.query('SELECT 1 FROM audit.audit_events WHERE action=$1 AND resource_id=$2', [action, created.id])).rowCount).toBe(1);
  });

  it('department edit and calendar settings cannot succeed without their mandatory audit', async () => {
    const original = (await church.pool.query('SELECT name FROM calendar.departments WHERE id=$1', [church.departments.youth])).rows[0].name;
    await failAudit('department.updated');
    expect((await request(`/departments/${church.departments.youth}`, 'PATCH', { name: 'Synthetic uncommitted name' })).status).toBe(500);
    expect((await church.pool.query('SELECT name FROM calendar.departments WHERE id=$1', [church.departments.youth])).rows[0].name).toBe(original);
    await removeFailure();
    const settings = (await request('/calendar/settings', 'GET'));
    const before = await settings.json();
    await failAudit('calendar.settings.updated');
    expect((await request('/calendar/settings', 'PATCH', { timezone: 'Europe/Paris', businessDayStart: '08:00', businessDayEnd: '20:00', maxOptions: 5, suggestionHorizonDays: 30, provisionalHoldHours: 24 })).status).toBe(500);
    expect(await (await request('/calendar/settings', 'GET')).json()).toEqual(before);
  });
});
