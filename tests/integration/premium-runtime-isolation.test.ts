import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const enabled = process.env.RUN_PREMIUM_RUNTIME_ISOLATION_TESTS === '1';
let first: SyntheticTenantFixture, second: SyntheticTenantFixture;
let admin: Client;
const ownedRoles: string[] = [];
const connections: Client[] = [];
function roleName(fixture: SyntheticTenantFixture) { return `gcr_${fixture.id.replaceAll('-', '')}_calendar`; }
async function runtime(fixture: SyntheticTenantFixture, database = fixture.database) {
  const url = new URL(process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres');
  url.username = roleName(fixture); url.password = ''; url.pathname = `/${database}`;
  const client = new Client({ connectionString: url.toString(), options: '-c role=gc_calendar_service', connectionTimeoutMillis: 3000 });
  connections.push(client); await client.connect(); return client;
}

describe.skipIf(!enabled)('physical database connection ACLs with distinct synthetic runtime logins', () => {
  beforeAll(async () => {
    first = await createTenantFixture({ backgroundWork: false }); second = await createTenantFixture({ backgroundWork: false });
    admin = new Client({ connectionString: process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres' }); await admin.connect();
    for (const fixture of [first, second]) {
      const role = roleName(fixture);
      if (!/^gcr_[a-f0-9]{32}_calendar$/.test(role)) throw new Error('Unsafe synthetic login identity.');
      expect((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount).toBe(0);
      // Random credentials are deliberately never returned or logged. The local
      // cluster uses trust authentication, so this exercises authorization ACLs,
      // not production password/TLS authentication.
      const password = randomBytes(32).toString('hex');
      await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`);
      ownedRoles.push(role);
      await admin.query(`GRANT gc_calendar_service TO ${role}`);
      await admin.query(`REVOKE CONNECT ON DATABASE ${fixture.database} FROM PUBLIC`);
      await admin.query(`GRANT CONNECT ON DATABASE ${fixture.database} TO ${role}`);
    }
  }, 120_000);
  afterAll(async () => {
    await Promise.all(connections.map((client) => client.end().catch(() => undefined)));
    if (first) await first.destroy(); if (second) await second.destroy();
    for (const role of ownedRoles) {
      if (!/^gcr_[a-f0-9]{32}_calendar$/.test(role) || ![first && roleName(first), second && roleName(second)].includes(role)) throw new Error('Synthetic role ownership changed.');
      await admin.query(`DROP ROLE ${role}`);
      expect((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount).toBe(0);
    }
    if (admin) await admin.end();
  }, 120_000);
  it('A and B each operate their own calendar without access to identity secrets', async () => {
    for (const fixture of [first, second]) {
      const client = await runtime(fixture);
      expect((await client.query('SELECT current_database() name')).rows[0].name).toBe(fixture.database);
      expect((await client.query('SELECT count(*)::int n FROM calendar.departments')).rows[0].n).toBe(14);
      await expect(client.query('SELECT password_hash FROM identity.credentials')).rejects.toMatchObject({ code: '42501' });
      const attributes = await client.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=session_user');
      expect(attributes.rows[0]).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
    }
  });
  it('the A login cannot even connect to B, and B cannot connect to A', async () => {
    await expect(runtime(first, second.database)).rejects.toMatchObject({ code: '42501' });
    await expect(runtime(second, first.database)).rejects.toMatchObject({ code: '42501' });
  });
});
