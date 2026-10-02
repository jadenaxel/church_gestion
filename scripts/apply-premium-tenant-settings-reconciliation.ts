import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { tenantSettingsReconciliationSchemaSql } from '../packages/database/src/tenant-settings-reconciliation.js';

// Default and --check are read-only. --apply installs just the reviewed new
// control table/indexes; no legacy migration, settings update, seed or grants.
const args = process.argv.slice(2);
const apply = args.length === 1 && args[0] === '--apply';
let client: Client | undefined, stage = 'arguments';
try {
  if (!(args.length === 0 || (args.length === 1 && ['--check', '--apply'].includes(args[0]!)))) throw new Error('Invalid maintenance mode.');
  stage = 'local-endpoint';
  const target = new URL(process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control');
  if (process.env.NODE_ENV === 'production' || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1'
    || target.port !== '55432' || target.pathname !== '/gestionchurch_control' || decodeURIComponent(target.username) !== 'postgres'
    || target.search || target.hash) throw new Error('Refusing an unapproved maintenance target.');
  client = new Client({ connectionString: target.href, connectionTimeoutMillis: 3000,
    options: `-c default_transaction_read_only=${apply ? 'off' : 'on'} -c statement_timeout=10000 -c lock_timeout=2000` });
  client.on('error', () => undefined); await client.connect();
  stage = 'original-registry';
  const registered = await client.query('SELECT id,slug,database_name FROM control.tenants ORDER BY id');
  if (registered.rowCount !== 2 || JSON.stringify(registered.rows.map((row) => row.slug).sort()) !== JSON.stringify(['central', 'ozama'])
    || registered.rows.some((row) => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.id)
      || row.database_name !== `gc_tenant_${row.id.replaceAll('-', '_')}`)) throw new Error('Original registry is not exact; maintenance refused.');
  const present = (await client.query("SELECT to_regclass('control.tenant_settings_updates') IS NOT NULL AS present")).rows[0].present as boolean;
  if (apply) {
    stage = 'additive-ddl';
    await client.query('BEGIN');
    try {
      await client.query('LOCK TABLE control.tenants IN SHARE MODE');
      const before = await protectedInventory(client);
      await client.query(tenantSettingsReconciliationSchemaSql);
      if (await protectedInventory(client) !== before) throw new Error('Control settings or audit inventory changed.');
      await verifySchema(client);
      await client.query('COMMIT');
    } catch (error) { try { await client.query('ROLLBACK'); } catch { /* No success is reported. */ } throw error; }
  } else if (present) await verifySchema(client);
  console.log(JSON.stringify({ pass: true, event: 'tenant.settings_reconciliation.schema_verified',
    mode: apply ? 'additive_control_ddl' : 'read_only', originalRegisteredTenants: 2,
    schemaPresent: apply || present, dataMutations: 0, seedRuns: 0, syncRuns: 0, credentialsChanged: 0 }));
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  console.error(JSON.stringify({ pass: false, event: 'tenant.settings_reconciliation.schema_failed', stage,
    code: typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'GUARD_OR_SCHEMA_FAILURE' }));
  process.exitCode = 1;
} finally { if (client) await client.end(); }

async function protectedInventory(connection: Client): Promise<string> {
  const tenants = await connection.query('SELECT * FROM control.tenants ORDER BY id');
  const audit = await connection.query('SELECT count(*)::text AS count FROM control.audit_log');
  return createHash('sha256').update(JSON.stringify([tenants.rows, audit.rows])).digest('hex');
}
async function verifySchema(connection: Client) {
  const columns = await connection.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position', ['control', 'tenant_settings_updates']);
  const expected = ['id', 'tenant_id', 'version', 'actor_id', 'request_hash', 'database_name', 'before_name', 'before_timezone',
    'source_tenant_timezone', 'desired_name', 'desired_timezone', 'changes_timezone', 'correlation_id', 'state', 'attempts',
    'lease_token', 'lease_until', 'next_attempt_at', 'last_error_code', 'created_at', 'updated_at', 'completed_at'];
  if (JSON.stringify(columns.rows.map((row) => row.column_name)) !== JSON.stringify(expected)) throw new Error('Schema columns mismatch.');
  const publicGrants = await connection.query(`SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl
    WHERE c.oid='control.tenant_settings_updates'::regclass AND acl.grantee=0`);
  if (publicGrants.rowCount) throw new Error('Public table privileges are not allowed.');
  const indexes = await connection.query("SELECT indexname FROM pg_indexes WHERE schemaname='control' AND tablename='tenant_settings_updates' AND indexname=ANY($1::text[])", [['tenant_settings_updates_one_open_idx', 'tenant_settings_updates_due_idx']]);
  if (indexes.rowCount !== 2) throw new Error('Reconciliation indexes missing.');
}
