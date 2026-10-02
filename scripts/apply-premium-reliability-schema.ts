import { Client } from 'pg';
import { closePools, controlPool, databaseNameForTenant } from '../packages/database/src/index.js';
import { premiumReliabilitySchemaSql } from '../packages/database/src/migrations.js';

// Explicit one-off schema maintenance. Never calls migrateControl/migrateTenant,
// seed, provision, synchronization, DELETE, UPDATE or tenant credential changes.
const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const target = new URL(adminUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.port !== '55432' || process.env.NODE_ENV === 'production') {
  throw new Error('This scoped schema maintenance tool is restricted to the approved local stack.');
}
let applied = 0;
try {
  const tenants = await controlPool.query<{ id: string; database_name: string }>('SELECT id,database_name FROM control.tenants ORDER BY id');
  for (const tenant of tenants.rows) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(tenant.id) || tenant.database_name !== databaseNameForTenant(tenant.id)) {
      throw new Error('Registered tenant database identity mismatch; schema maintenance stopped.');
    }
    const databaseUrl = new URL(adminUrl); databaseUrl.pathname = `/${tenant.database_name}`;
    const client = new Client({ connectionString: databaseUrl.toString() });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      await client.query(premiumReliabilitySchemaSql);
      const columns = await client.query<{ count: number }>(`SELECT count(*)::int count FROM information_schema.columns WHERE is_nullable='YES' AND
        (table_schema,table_name,column_name) IN (
          ('calendar','review_session_reminders','lease_until'),('calendar','review_session_reminders','claim_token'),
          ('notifications','deliveries','lease_until'),('notifications','deliveries','claim_token'),('notifications','deliveries','recipient_data'),
          ('notifications','inbox_events','request_hash'),('notifications','scheduled_reminders','lease_until'),('notifications','scheduled_reminders','claim_token'),
          ('womens_ministry','retreat_payments','idempotency_key'),('womens_ministry','retreat_payments','request_hash'))`);
      if (columns.rows[0]?.count !== 10) throw new Error('Expected nullable reliability columns were not verified.');
      const index = await client.query("SELECT 1 FROM pg_indexes WHERE schemaname='womens_ministry' AND indexname='womens_ministry_retreat_payment_idempotency_idx' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%WHERE (idempotency_key IS NOT NULL)%'");
      if (index.rowCount !== 1) throw new Error('Payment idempotency index was not verified.');
      await client.query('COMMIT');
      applied++;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { await client.end(); }
  }
  console.log(JSON.stringify({ event: 'premium.schema.verified', registeredDatabases: tenants.rowCount, appliedDatabases: applied, nullableColumnsPerDatabase: 10, indexesPerDatabase: 1, dataMutations: 0, seeds: 0, synchronizationRuns: 0 }));
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  console.error(JSON.stringify({ event: 'premium.schema.failed', appliedDatabases: applied, code: typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'VALIDATION_OR_CONNECTION_FAILURE' }));
  process.exitCode = 1;
} finally { await closePools(); }
