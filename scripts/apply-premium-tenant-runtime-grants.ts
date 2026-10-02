import { Client } from 'pg';
import { closePools, controlPool, databaseNameForTenant } from '../packages/database/src/index.js';
import { tenantServiceRuntimeGrantsSql } from '../packages/database/src/migrations.js';

// One-off additive ACL maintenance, never a migration, seed or credential tool.
// Default is read-only preflight. Explicit --apply accepts only the two original
// registered churches and refuses any synthetic/concurrent provisioning target.
const apply = process.argv.includes('--apply');
const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const endpoint = new URL(adminUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.port !== '55432' || process.env.NODE_ENV === 'production') {
  throw new Error('Scoped ACL maintenance requires the approved existing local cluster.');
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
      const schema = await client.query("SELECT to_regclass('identity.users') IS NOT NULL AND to_regclass('identity.sessions') IS NOT NULL AND to_regclass('calendar.tenant_calendar_settings') IS NOT NULL AND to_regclass('audit.audit_events') IS NOT NULL AND to_regclass('audit.audit_events_id_seq') IS NOT NULL valid");
      if (schema.rows[0]?.valid !== true) throw new Error('Expected runtime schema missing; maintenance refused.');
      if (!apply) continue;
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      await client.query(tenantServiceRuntimeGrantsSql);
      await client.query('SET LOCAL ROLE gc_tenant_service');
      const privileges = (await client.query(`SELECT
        has_column_privilege(current_user,'identity.users','id','SELECT') allowed_identity,
        has_column_privilege(current_user,'calendar.tenant_calendar_settings','timezone','UPDATE') allowed_timezone,
        has_table_privilege(current_user,'audit.audit_events','INSERT') allowed_audit,
        has_table_privilege(current_user,'identity.credentials','SELECT') denied_credentials,
        has_column_privilege(current_user,'identity.users','password_hash','SELECT') denied_password,
        has_table_privilege(current_user,'identity.users','UPDATE') denied_users_write,
        has_table_privilege(current_user,'calendar.activities','INSERT') denied_activities_write,
        has_table_privilege(current_user,'audit.audit_events','DELETE') denied_audit_delete`)).rows[0];
      if (!privileges.allowed_identity || !privileges.allowed_timezone || !privileges.allowed_audit
        || privileges.denied_credentials || privileges.denied_password || privileges.denied_users_write
        || privileges.denied_activities_write || privileges.denied_audit_delete) throw new Error('Runtime least-privilege verification failed.');
      await client.query('RESET ROLE');
      await client.query('COMMIT');
      appliedDatabases++;
    } catch (error) { if (apply) await client.query('ROLLBACK'); throw error; }
    finally { await client.end(); }
  }
  console.log(JSON.stringify({ event: 'premium.tenant_runtime_acl.verified', mode: apply ? 'additive_apply' : 'read_only_preflight', registeredDatabases: registered.rowCount, appliedDatabases, dataMutations: 0, credentialsChanged: 0, seeds: 0, synchronizationRuns: 0 }));
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  console.error(JSON.stringify({ event: 'premium.tenant_runtime_acl.failed', appliedDatabases, code: typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'PREFLIGHT_OR_PRIVILEGE_FAILURE' }));
  process.exitCode = 1;
} finally { await closePools(); }
