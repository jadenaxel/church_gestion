import { randomBytes, randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { permissionsFor, type AuthPrincipal } from '../../packages/contracts/src/index.js';
import { signAccessToken } from '../../packages/platform/src/index.js';

const live = process.env.RUN_PREMIUM_TENANT_PROVISION_API_TESTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:4000/api/v1';
const operatorId = randomUUID(), sessionId = randomUUID();
const slug = `premium-${randomBytes(8).toString('hex')}`;
const name = 'Synthetic premium API provisioning';
const settingsName = 'Synthetic reconciled API settings';
const email = `${operatorId}@premium.example`, adminEmail = `${randomUUID()}@premium.example`;
const password = `${randomBytes(24).toString('base64url')}!9aA`;
let control: Pool, tenant: Pool, tenantId: string | undefined, database: string, token: string, adminToken: string;
async function request(path: string, method = 'GET', body?: unknown, bearer = token) {
  return fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${bearer}`, origin: 'http://localhost:3000', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
}

live('real API provisioning and administrative settings on a fresh owned tenant', () => {
  beforeAll(async () => {
    expect((await fetch('http://127.0.0.1:4000/health/ready')).ok).toBe(true);
    const url = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';
    const target = new URL(url);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '55432' || process.env.NODE_ENV === 'production') throw new Error('Local synthetic provisioning only.');
    control = new Pool({ connectionString: url });
    expect((await control.query('SELECT 1 FROM control.global_users WHERE id=$1 OR email=$2', [operatorId, email])).rowCount).toBe(0);
    expect((await control.query('SELECT 1 FROM control.tenants WHERE slug=$1', [slug])).rowCount).toBe(0);
    await control.query("INSERT INTO control.global_users(id,email,name,password_hash,roles) VALUES($1,$2,'Synthetic premium operator',$3,ARRAY['GLOBAL_ADMIN'])", [operatorId, email, await argon2.hash(password)]);
    await control.query("INSERT INTO control.global_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sessionId, operatorId]);
    const principal: AuthPrincipal = { sub: operatorId, email, name: 'Synthetic premium operator', roles: ['GLOBAL_ADMIN'], permissions: permissionsFor(['GLOBAL_ADMIN']), scope: 'global', sessionId };
    token = await signAccessToken(principal);
  });
  afterAll(async () => {
    if (!control) return;
    // Recover only a partial API creation with our exact preverified nonce slug.
    const owned = await control.query('SELECT id,database_name,name FROM control.tenants WHERE slug=$1', [slug]);
    if (owned.rowCount) {
      const row = owned.rows[0];
      expect([name, settingsName]).toContain(row.name);
      expect(row.database_name).toBe(`gc_tenant_${row.id.replaceAll('-', '_')}`);
      if (tenantId) expect(row.id).toBe(tenantId);
      await tenant?.end();
      await control.query('DELETE FROM control.module_launch_codes WHERE tenant_id=$1', [row.id]);
      await control.query('DELETE FROM control.tenants WHERE id=$1 AND slug=$2 AND name=$3', [row.id, slug, row.name]);
      const clusterUrl = new URL(process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres');
      if (clusterUrl.hostname !== '127.0.0.1' || clusterUrl.port !== '55432') throw new Error('Unsafe cleanup target.');
      const cluster = new Client({ connectionString: clusterUrl.href });
      await cluster.connect();
      try {
        await cluster.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [row.database_name]);
        await cluster.query(`DROP DATABASE ${row.database_name}`);
        expect((await cluster.query('SELECT 1 FROM pg_database WHERE datname=$1', [row.database_name])).rowCount).toBe(0);
      } finally { await cluster.end(); }
    }
    await control.query('DELETE FROM control.global_users WHERE id=$1 AND email=$2', [operatorId, email]);
    expect((await control.query('SELECT 1 FROM control.tenants WHERE slug=$1', [slug])).rowCount).toBe(0);
    // Immutable control audit of these QA actions is deliberately retained.
    await control.end();
  });

  it('creates a canonical independent database and exactly one real administrator via the gateway', async () => {
    const response = await request('/global/tenants', 'POST', { slug, name, timezone: 'America/La_Paz', adminEmail, adminName: 'Synthetic tenant administrator', adminPassword: password });
    expect(response.status).toBe(201);
    const created = await response.json() as { id: string; status: string };
    tenantId = created.id; database = `gc_tenant_${tenantId.replaceAll('-', '_')}`;
    expect(created.status).toBe('ACTIVE');
    const registered = (await control.query('SELECT status,database_name FROM control.tenants WHERE id=$1', [tenantId])).rows[0];
    expect(registered).toEqual({ status: 'ACTIVE', database_name: database });
    expect((await control.query('SELECT status FROM control.tenant_provisioning_jobs WHERE tenant_id=$1', [tenantId])).rows[0].status).toBe('COMPLETED');
    const url = new URL(process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres'); url.pathname = `/${database}`;
    tenant = new Pool({ connectionString: url.href });
    expect((await tenant.query('SELECT email,roles FROM identity.users')).rows).toEqual([{ email: adminEmail, roles: ['TENANT_ADMIN'] }]);
    const login = await request('/auth/login', 'POST', { tenant: slug, email: adminEmail, password }, '');
    expect(login.ok).toBe(true);
    const cookie = login.headers.get('set-cookie');
    expect(cookie).not.toBeNull();
    adminToken = decodeURIComponent(cookie!.match(/gc_session=([^;]+)/)![1]!);
    expect((await request('/me', 'GET', undefined, adminToken)).ok).toBe(true);
    expect((await request('/global/tenants', 'GET', undefined, adminToken)).status).toBe(403);
  });

  it('returns a pending receipt without visible mutation after audit failure, then reconciles the same intent exactly once', async () => {
    const idempotencyKey = randomUUID();
    const input = { name: settingsName, timezone: 'Europe/Paris', idempotencyKey };
    await tenant.query("CREATE FUNCTION audit.fixture_settings_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='tenant.settings.updated' THEN RAISE EXCEPTION 'Synthetic mandatory audit failure'; END IF; RETURN NEW; END $$");
    await tenant.query('CREATE TRIGGER fixture_settings_failure BEFORE INSERT ON audit.audit_events FOR EACH ROW EXECUTE FUNCTION audit.fixture_settings_failure()');
    try {
      const response = await request('/tenant/settings', 'PATCH', input, adminToken);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'TENANT_SETTINGS_RECONCILIATION_PENDING', operationId: idempotencyKey, settingsVersion: 1, outcome: 'PENDING' });
      expect((await control.query('SELECT name,timezone FROM control.tenants WHERE id=$1', [tenantId])).rows[0]).toEqual({ name, timezone: 'America/La_Paz' });
      expect((await tenant.query('SELECT timezone FROM calendar.tenant_calendar_settings WHERE singleton')).rows[0].timezone).toBe('America/La_Paz');
      expect((await control.query('SELECT state FROM control.tenant_settings_updates WHERE id=$1 AND tenant_id=$2', [idempotencyKey, tenantId])).rows[0].state).toBe('PENDING');
      const state = await request('/tenant/settings', 'GET', undefined, adminToken);
      expect(state.status).toBe(200);
      expect(await state.json()).toMatchObject({ name, timezone: 'America/La_Paz', settingsCoherent: false, reconciliationStatus: 'PENDING', settingsUpdate: { id: idempotencyKey, state: 'PENDING' } });
    } finally { await tenant.query('DROP TRIGGER fixture_settings_failure ON audit.audit_events'); }
    const retry = await request('/tenant/settings', 'PATCH', input, adminToken);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ name: settingsName, timezone: 'Europe/Paris', settingsCoherent: true, settingsVersion: 1, settingsUpdate: { id: idempotencyKey, state: 'COMPLETED' } });
    expect((await control.query("SELECT count(*)::int count FROM control.audit_log WHERE action='tenant.settings.updated' AND resource_id=$1 AND metadata->>'settingsUpdateId'=$2", [tenantId, idempotencyKey])).rows[0].count).toBe(1);
    expect((await tenant.query("SELECT count(*)::int count FROM audit.audit_events WHERE action='tenant.settings.updated' AND resource_id=$1 AND after_data->>'settingsUpdateId'=$2", [tenantId, idempotencyKey])).rows[0].count).toBe(1);
  });

  it('suspension denies the tenant session and reactivation restores only its original access', async () => {
    expect((await request(`/global/tenants/${tenantId}/status`, 'PATCH', { status: 'SUSPENDED' })).ok).toBe(true);
    expect((await request('/me', 'GET', undefined, adminToken)).status).toBe(401);
    expect((await request(`/global/tenants/${tenantId}/status`, 'PATCH', { status: 'ACTIVE' })).ok).toBe(true);
    expect((await request('/me', 'GET', undefined, adminToken)).ok).toBe(true);
    expect((await control.query("SELECT count(*)::int count FROM control.audit_log WHERE action='tenant.status_changed' AND resource_id=$1", [tenantId])).rows[0].count).toBe(2);
  });
});
