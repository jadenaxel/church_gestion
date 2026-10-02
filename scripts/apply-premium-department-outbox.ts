import { Client } from 'pg';
import { closePools, controlPool, databaseNameForTenant } from '../packages/database/src/index.js';
import { departmentNotificationOutboxSchemaSql } from '../packages/database/src/department-notification-outbox.js';

// Reviewed domain-owned additive DDL only. No seeds, synchronization, messages,
// data backfill, credentials, membership changes or cross-domain grants.
const apply = process.argv.includes('--apply');
const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const endpoint = new URL(adminUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.port !== '55432' || process.env.NODE_ENV === 'production') {
  throw new Error('Scoped outbox schema maintenance requires the approved local cluster.');
}
let appliedDatabases = 0;
try {
  const registered = await controlPool.query<{ id: string; slug: string; database_name: string; status: string }>('SELECT id,slug,database_name,status FROM control.tenants ORDER BY id');
  if (registered.rowCount !== 2 || registered.rows.some((tenant) => !['central', 'ozama'].includes(tenant.slug)
    || !['ACTIVE', 'SUSPENDED'].includes(tenant.status) || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(tenant.id)
    || tenant.database_name !== databaseNameForTenant(tenant.id))) {
    throw new Error('Original registered targets are not exactly verified; maintenance refused.');
  }
  for (const tenant of registered.rows) {
    const url = new URL(adminUrl); url.pathname = `/${tenant.database_name}`;
    const client = new Client({ connectionString: url.href });
    await client.connect();
    try {
      const schema = await client.query("SELECT to_regnamespace('department_operations') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gc_department_operations_service') valid");
      if (schema.rows[0]?.valid !== true) throw new Error('Existing domain schema/role missing; maintenance refused.');
      if (!apply) continue;
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      await client.query(departmentNotificationOutboxSchemaSql);
      await client.query('SET LOCAL ROLE gc_department_operations_service');
      const access = (await client.query("SELECT bool_and(has_table_privilege(current_user,'department_operations.notification_outbox',privilege)) allowed FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p(privilege)")).rows[0];
      if (access.allowed !== true) throw new Error('Existing domain default privileges did not apply; maintenance refused.');
      await client.query('RESET ROLE');
      const definition = await client.query("SELECT 1 FROM pg_indexes WHERE schemaname='department_operations' AND indexname='department_notification_outbox_pending_idx' AND indexdef LIKE '%WHERE (delivered_at IS NULL)%'");
      if (definition.rowCount !== 1) throw new Error('Expected pending index was not verified.');
      await client.query('COMMIT');
      appliedDatabases++;
    } catch (error) { if (apply) await client.query('ROLLBACK'); throw error; }
    finally { await client.end(); }
  }
  console.log(JSON.stringify({ event: 'premium.department_outbox_schema.verified', mode: apply ? 'additive_apply' : 'read_only_preflight', registeredDatabases: registered.rowCount, appliedDatabases, tablesPerDatabase: 1, indexesPerDatabase: 1, dataMutations: 0, grants: 0, messagesSent: 0, seeds: 0, synchronizationRuns: 0 }));
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  console.error(JSON.stringify({ event: 'premium.department_outbox_schema.failed', appliedDatabases, code: typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'PREFLIGHT_OR_PRIVILEGE_FAILURE' }));
  process.exitCode = 1;
} finally { await closePools(); }
