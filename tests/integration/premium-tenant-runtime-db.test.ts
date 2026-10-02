import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantServiceRuntimeGrantsSql, provisionTenantDatabase } from '../../packages/database/src/migrations.js';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_TENANT_RUNTIME_DB_TESTS === '1' ? describe.sequential : describe.skip;
let fixture: SyntheticTenantFixture;
let admin: Client, runtime: Client;
let login: string;
let loginOwned = false;

live('minimal tenant service ACLs in a new owned PostgreSQL fixture (not production TLS)', () => {
  beforeAll(async () => {
    fixture = await createTenantFixture({ backgroundWork: false });
    await fixture.pool.query(tenantServiceRuntimeGrantsSql);
    const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
    admin = new Client({ connectionString: adminUrl }); await admin.connect();
    login = `gcr_${fixture.id.replaceAll('-', '')}_tenant`;
    if (!/^gcr_[a-f0-9]{32}_tenant$/.test(login)) throw new Error('Unsafe owned login name.');
    if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [login])).rowCount !== 0) throw new Error('Owned login was not absent.');
    const password = randomBytes(32).toString('hex');
    await admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`);
    loginOwned = true;
    await admin.query(`GRANT gc_tenant_service TO ${login}`);
    const target = new URL(adminUrl); target.username = login; target.password = ''; target.pathname = `/${fixture.database}`;
    runtime = new Client({ connectionString: target.toString(), options: '-c role=gc_tenant_service' }); await runtime.connect();
  }, 120_000);
  afterAll(async () => {
    await runtime?.end();
    await fixture?.destroy();
    if (loginOwned) {
      if (login !== `gcr_${fixture.id.replaceAll('-', '')}_tenant`) throw new Error('Owned login identity changed.');
      await admin.query(`DROP ROLE ${login}`);
    }
    await admin?.end();
  }, 120_000);
  it('supports JWT validation and actor labels while denying password material and user mutation', async () => {
    expect((await runtime.query(
      `SELECT u.roles FROM identity.sessions s JOIN identity.users u ON u.id=s.user_id
       WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active`,
      [fixture.users.admin.principal.sessionId, fixture.users.admin.id],
    )).rowCount).toBe(1);
    expect((await runtime.query('SELECT id,name,email FROM identity.users WHERE id=$1', [fixture.users.admin.id])).rowCount).toBe(1);
    await expect(runtime.query('SELECT password_hash FROM identity.users')).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query('SELECT password_hash FROM identity.credentials')).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query("UPDATE identity.users SET name='Synthetic forbidden' WHERE id=$1", [fixture.users.admin.id])).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query('UPDATE identity.sessions SET revoked_at=now()')).rejects.toMatchObject({ code: '42501' });
  });
  it('updates only timezone and appends audit, without calendar or history mutation privileges', async () => {
    await runtime.query("UPDATE calendar.tenant_calendar_settings SET timezone='America/La_Paz',updated_at=now() WHERE singleton");
    await runtime.query("INSERT INTO audit.audit_events(actor_id,action,resource_type) VALUES($1,'tenant.runtime.synthetic','tenant')", [fixture.users.admin.id]);
    expect((await runtime.query("SELECT 1 FROM audit.audit_events WHERE action='tenant.runtime.synthetic'")).rowCount).toBe(1);
    await expect(runtime.query('UPDATE calendar.tenant_calendar_settings SET max_options=99 WHERE singleton')).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query('SELECT * FROM calendar.activities')).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query('DELETE FROM audit.audit_events')).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query("UPDATE audit.audit_events SET action='Synthetic forbidden'")).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query('SET ROLE gc_identity_service')).rejects.toMatchObject({ code: '42501' });
    const membership = await runtime.query("SELECT ARRAY(SELECT rolname::text FROM pg_roles WHERE rolname ~ '^gc_.+_service$' AND pg_has_role(session_user,oid,'MEMBER')) roles");
    expect(membership.rows[0].roles).toEqual(['gc_tenant_service']);
  });
  it('never adopts an existing database when fresh provisioning is required', async () => {
    const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
    await expect(provisionTenantDatabase(adminUrl, fixture.id, { requireNew: true })).rejects.toThrow('already exists');
    expect((await fixture.pool.query('SELECT count(*)::int count FROM identity.users')).rows[0].count).toBe(9);
  });
});
