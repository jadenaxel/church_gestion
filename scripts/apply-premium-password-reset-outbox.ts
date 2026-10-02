import { Client } from 'pg';
import { closePools, controlPool, databaseNameForTenant } from '../packages/database/src/index.js';
import { passwordResetOutboxSchemaSql } from '../packages/database/src/password-reset-outbox.js';

// Root review/explicit --apply required. Default is schema-only read-only preflight.
// No seed/full migration/sync, business DML, credentials or cross-domain GRANT.
const args = process.argv.slice(2);
if (args.length > 1 || args.some((value) => value !== '--check' && value !== '--apply')) throw new Error('Scoped reset schema maintenance accepts only no arguments, --check or --apply.');
const apply = args[0] === '--apply';
const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const controlUrl = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';
function localEndpoint(connection: string, control = false): URL {
  let target: URL;
  try { target = new URL(connection); } catch { throw new Error('Scoped reset schema maintenance database configuration is invalid.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.port !== '55432'
    || (control && target.pathname !== '/gestionchurch_control') || process.env.NODE_ENV === 'production') throw new Error('Scoped reset schema maintenance requires the approved local control/cluster.');
  return target;
}
localEndpoint(adminUrl); localEndpoint(controlUrl, true);
let appliedDatabases = 0;
try {
  const registered = await controlPool.query<{ id: string; slug: string; database_name: string; status: string }>('SELECT id,slug,database_name,status FROM control.tenants ORDER BY id');
  if (registered.rowCount !== 2 || registered.rows.some((tenant) => !['central', 'ozama'].includes(tenant.slug)
    || !['ACTIVE', 'SUSPENDED'].includes(tenant.status) || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(tenant.id)
    || tenant.database_name !== databaseNameForTenant(tenant.id))) throw new Error('Original registered targets are not exactly verified; maintenance refused.');
  for (const tenant of registered.rows) {
    const url = new URL(adminUrl); url.pathname = `/${tenant.database_name}`;
    const client = new Client({ connectionString: url.href, ...(!apply ? { options: '-c default_transaction_read_only=on' } : {}) });
    await client.connect();
    try {
      const schema = await client.query("SELECT to_regnamespace('identity') IS NOT NULL AND to_regclass('identity.password_reset_tokens') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gc_identity_service') valid");
      if (schema.rows[0]?.valid !== true) throw new Error('Existing identity schema/role missing; maintenance refused.');
      if (!apply) continue;
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'"); await client.query("SET LOCAL statement_timeout='30s'");
      await client.query(passwordResetOutboxSchemaSql);
      await client.query('SET LOCAL ROLE gc_identity_service');
      const access = (await client.query("SELECT bool_and(has_table_privilege(current_user,'identity.password_reset_outbox',privilege)) allowed FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p(privilege)")).rows[0];
      if (access.allowed !== true) throw new Error('Existing identity default privileges did not apply; maintenance refused.');
      await client.query('RESET ROLE');
      const definition = await client.query("SELECT 1 FROM pg_indexes WHERE schemaname='identity' AND indexname='password_reset_outbox_pending_idx' AND indexdef LIKE '%accepted_at IS NULL%' AND indexdef LIKE '%retired_at IS NULL%'");
      if (definition.rowCount !== 1) throw new Error('Expected pending index was not verified.');
      await client.query('COMMIT'); appliedDatabases++;
    } catch (error) { if (apply) await client.query('ROLLBACK'); throw error; }
    finally { await client.end(); }
  }
  console.log(JSON.stringify({ event: 'premium.password_reset_outbox_schema.verified', mode: apply ? 'additive_apply' : 'read_only_preflight', registeredDatabases: registered.rowCount, appliedDatabases, tablesPerDatabase: 1, indexesPerDatabase: 1, dataMutations: 0, grants: 0, messagesSent: 0, seeds: 0, synchronizationRuns: 0 }));
} catch {
  console.error(JSON.stringify({ event: 'premium.password_reset_outbox_schema.failed', appliedDatabases, code: 'PREFLIGHT_OR_PRIVILEGE_FAILURE' })); process.exitCode = 1;
} finally { await closePools(); }
