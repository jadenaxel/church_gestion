import { Pool } from 'pg';
import { controlPool, databaseNameForTenant, closePools } from '../../packages/database/src/index.js';
import { dispatchPasswordResets } from '../../services/identity-service/src/password-reset-outbox.js';

// Private synthetic subprocess only: credentials arrive in environment, never argv/output.
const id = process.env.GC_RESET_FIXTURE_TENANT_ID ?? '', connection = process.env.GC_RESET_FIXTURE_DATABASE_URL ?? '';
const url = new URL(connection), endpoint = new URL(process.env.NOTIFICATION_SERVICE_URL ?? '');
if (process.env.NODE_ENV === 'production' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)
  || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== '55432' || url.pathname !== `/${databaseNameForTenant(id)}`
  || endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Synthetic reset worker refuses an unowned destination.');
let pool: Pool | undefined;
try {
  const owned = await controlPool.query<{ slug: string; database_name: string; status: string }>('SELECT slug,database_name,status FROM control.tenants WHERE id=$1', [id]);
  const registered = owned.rows[0];
  if (!registered || !/^premium-[a-f0-9]{16}$/.test(registered.slug) || registered.database_name !== databaseNameForTenant(id) || registered.status !== 'SUSPENDED') throw new Error('Synthetic reset worker ownership is not verified.');
  pool = new Pool({ connectionString: connection, options: '-c role=gc_identity_service', max: 1 });
  pool.on('error', () => console.error('SYNTHETIC_RESET_WORKER_CONNECTION_ERROR'));
  console.log(JSON.stringify(await dispatchPasswordResets(pool, id)));
} catch { console.error('SYNTHETIC_RESET_WORKER_FAILED'); process.exitCode = 1; }
finally { await pool?.end(); await closePools(); }
