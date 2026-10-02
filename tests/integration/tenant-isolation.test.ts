import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { provisionTenantDatabase } from '../../packages/database/src/migrations.js';

const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const controlUrl = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';
let temporaryDatabase = '';

afterAll(async () => {
  if (!/^gc_tenant_[a-f0-9_]+$/.test(temporaryDatabase)) return;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, [temporaryDatabase]);
    await admin.query(`DROP DATABASE ${temporaryDatabase}`);
  } finally { await admin.end(); }
});

describe('aislamiento físico multi-tenant', () => {
  it('mantiene datos de dos iglesias en bases PostgreSQL diferentes', async () => {
    const control = new Pool({ connectionString: controlUrl });
    const central = await control.query<{ database_name: string }>(`SELECT database_name FROM control.tenants WHERE slug='central'`);
    await control.end();
    expect(central.rows[0]?.database_name).toMatch(/^gc_tenant_/);

    temporaryDatabase = await provisionTenantDatabase(adminUrl, randomUUID());
    const centralUrl = new URL(adminUrl); centralUrl.pathname = `/${central.rows[0]!.database_name}`;
    const temporaryUrl = new URL(adminUrl); temporaryUrl.pathname = `/${temporaryDatabase}`;
    const centralPool = new Pool({ connectionString: centralUrl.toString() });
    const temporaryPool = new Pool({ connectionString: temporaryUrl.toString() });
    try {
      const marker = `Aislado ${randomUUID()}`;
      await temporaryPool.query(`INSERT INTO calendar.departments(name,color) VALUES($1,'#123456')`, [marker]);
      const [databases, centralLeak, temporaryOwn] = await Promise.all([
        Promise.all([centralPool.query<{ name: string }>('SELECT current_database() name'), temporaryPool.query<{ name: string }>('SELECT current_database() name')]),
        centralPool.query(`SELECT 1 FROM calendar.departments WHERE name=$1`, [marker]),
        temporaryPool.query(`SELECT 1 FROM calendar.departments WHERE name=$1`, [marker])
      ]);
      expect(databases[0].rows[0]!.name).not.toBe(databases[1].rows[0]!.name);
      expect(centralLeak.rowCount).toBe(0);
      expect(temporaryOwn.rowCount).toBe(1);

      const schemas = await temporaryPool.query<{ schema_name: string }>(
        `SELECT schema_name FROM information_schema.schemata
         WHERE schema_name=ANY(ARRAY['identity','calendar','files','notifications','audit'])`
      );
      expect(schemas.rows.map((row) => row.schema_name).sort()).toEqual(['audit', 'calendar', 'files', 'identity', 'notifications']);
      const gist = await temporaryPool.query(
        `SELECT 1 FROM pg_indexes WHERE schemaname='calendar' AND indexname IN ('schedule_sessions_range_gist','reservations_range_gist')`
      );
      expect(gist.rowCount).toBe(2);
      const constraints = await temporaryPool.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) definition FROM pg_constraint
         WHERE conrelid IN ('calendar.schedule_sessions'::regclass,'calendar.reservations'::regclass,'calendar.activities'::regclass)`
      );
      expect(constraints.rows.some((row) => row.definition.includes('ends_at > starts_at'))).toBe(true);

      const aggregateId = randomUUID();
      const eventId = randomUUID();
      await temporaryPool.query(
        `INSERT INTO calendar.outbox_events(id,event_type,aggregate_id,payload) VALUES($1,'contract.test',$2,'{}')`,
        [eventId, aggregateId]
      );
      await temporaryPool.query(
        `INSERT INTO notifications.inbox_events(event_id,event_type) VALUES($1,'contract.test') ON CONFLICT DO NOTHING`, [eventId]
      );
      const duplicate = await temporaryPool.query(
        `INSERT INTO notifications.inbox_events(event_id,event_type) VALUES($1,'contract.test') ON CONFLICT DO NOTHING RETURNING event_id`, [eventId]
      );
      expect(duplicate.rowCount).toBe(0);

      const fileRolePool = new Pool({ connectionString: temporaryUrl.toString(), options: '-c role=gc_file_service' });
      const identityRolePool = new Pool({ connectionString: temporaryUrl.toString(), options: '-c role=gc_identity_service' });
      try {
        expect((await fileRolePool.query('SELECT count(*) FROM files.file_objects')).rowCount).toBe(1);
        expect((await fileRolePool.query('SELECT * FROM files.lock_activity_for_attachment($1::uuid)', [randomUUID()])).rowCount).toBe(0);
        await expect(fileRolePool.query(`UPDATE calendar.activities SET title=title WHERE false`)).rejects.toThrow(/permission denied/i);
        expect((await identityRolePool.query('SELECT count(*) FROM identity.users')).rowCount).toBe(1);
        expect((await identityRolePool.query('SELECT count(*) FROM identity.department_appointments')).rowCount).toBe(1);
        expect((await identityRolePool.query('SELECT count(*) FROM calendar.departments')).rowCount).toBe(1);
        const identityAudit = await identityRolePool.query<{ id: string }>(
          `INSERT INTO audit.audit_events(action,resource_type,reason)
           VALUES('integration.nominations.organization.read','organization','tenant-scoped projection')
           RETURNING id::text`
        );
        await expect(identityRolePool.query(
          `UPDATE audit.audit_events SET action='altered' WHERE id=$1`, [identityAudit.rows[0]!.id]
        )).rejects.toThrow(/permission denied|inmutables/i);
        await expect(identityRolePool.query('SELECT count(*) FROM files.file_objects')).rejects.toThrow(/permission denied/i);
      } finally {
        await Promise.all([fileRolePool.end(), identityRolePool.end()]);
      }

      const audit = await temporaryPool.query<{ id: string }>(
        `INSERT INTO audit.audit_events(action,resource_type) VALUES('contract.test','tenant') RETURNING id::text`
      );
      await expect(temporaryPool.query(`UPDATE audit.audit_events SET action='altered' WHERE id=$1`, [audit.rows[0]!.id]))
        .rejects.toThrow(/inmutables/);
    } finally {
      await Promise.all([centralPool.end(), temporaryPool.end()]);
    }
  });
});
