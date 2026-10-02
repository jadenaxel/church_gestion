import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { isTenantDatabaseServiceRole, resolveTenantRuntimeConnection } from './runtime-credentials.js';

try {
  process.loadEnvFile?.('.env');
} catch {
  // Environment variables supplied by the process are sufficient.
}

const controlUrl = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';

export const controlPool = new Pool({
  connectionString: controlUrl,
  max: 8,
  application_name: 'gestionchurch-control'
});

function observePoolErrors(pool: Pool, poolKind: 'control' | 'tenant'): void {
  // pg removes failed idle clients itself; an unhandled Pool error would kill the service.
  // Never log the Error/Client object: it can contain connection credentials and query data.
  pool.on('error', (error: Error & { code?: string }) => {
    console.error(JSON.stringify({
      level: 'error', event: 'database.idle_connection_error', poolKind,
      code: typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'UNKNOWN'
    }));
  });
}

observePoolErrors(controlPool, 'control');

type TenantRecord = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  database_name: string;
  status: string;
};

const tenantPools = new Map<string, Pool>();
const runtimeSecurityChecks = new WeakMap<Pool, Promise<void>>();

/** Administrative credentials belong to migration/provisioning tools, not runtime pools. */
export async function assertRuntimeDatabaseSecurity(pool: Pool, env: NodeJS.ProcessEnv = process.env, expectedServiceRole?: string): Promise<void> {
  if (env.NODE_ENV !== 'production') return;
  let pending = runtimeSecurityChecks.get(pool);
  if (!pending) {
    pending = (async () => {
      const result = await pool.query<{ superuser: boolean; create_database: boolean; create_role: boolean; bypass_rls: boolean; tls: boolean; service_roles: string[] }>(
        `SELECT r.rolsuper superuser,r.rolcreatedb create_database,r.rolcreaterole create_role,r.rolbypassrls bypass_rls,
                COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) tls,
                ARRAY(SELECT s.rolname::text FROM pg_roles s WHERE s.rolname ~ '^gc_.+_service$' AND pg_has_role(session_user,s.oid,'MEMBER')) service_roles
           FROM pg_roles r WHERE r.rolname=session_user`
      );
      const login = result.rows[0];
      if (!login || login.superuser || login.create_database || login.create_role || login.bypass_rls || !login.tls
        || (expectedServiceRole && (login.service_roles.length !== 1 || login.service_roles[0] !== expectedServiceRole))) {
        throw new Error('Production runtime requires TLS and a non-administrative database login restricted to its service role.');
      }
    })();
    runtimeSecurityChecks.set(pool, pending);
    pending.catch(() => { runtimeSecurityChecks.delete(pool); });
  }
  await pending;
}

export async function getTenantRecord(slugOrId: string): Promise<TenantRecord | null> {
  const result = await controlPool.query<TenantRecord>(
    `SELECT id, slug, name, timezone, database_name, status
       FROM control.tenants
      WHERE (slug = $1 OR id::text = $1) AND status = 'ACTIVE'`,
    [slugOrId]
  );
  return result.rows[0] ?? null;
}

export function getTenantPool(tenant: TenantRecord): Pool {
  const role = process.env.DATABASE_SERVICE_ROLE;
  if (role && !isTenantDatabaseServiceRole(role)) throw new Error('Rol de servicio PostgreSQL no válido.');
  const connection = resolveTenantRuntimeConnection(tenant, role);
  const poolKey = `${tenant.id}:${role ?? 'owner'}:${connection.cacheIdentity}`;
  const existing = tenantPools.get(poolKey);
  if (existing) return existing;
  if (tenantPools.size >= 30) {
    const oldest = tenantPools.entries().next().value as [string, Pool] | undefined;
    if (oldest) {
      void oldest[1].end().catch(() => {
        console.error(JSON.stringify({ level: 'error', event: 'database.pool_close_failed', poolKind: 'tenant' }));
      });
      tenantPools.delete(oldest[0]);
    }
  }
  const pool = new Pool({
    ...connection.config,
    max: 8,
    idleTimeoutMillis: 30_000,
    application_name: `gestionchurch-${tenant.slug}-${role ?? 'owner'}`,
    ...(role ? { options: `-c role=${role}` } : {})
  });
  observePoolErrors(pool, 'tenant');
  tenantPools.set(poolKey, pool);
  return pool;
}

export async function tenantPoolFromSlug(slug: string): Promise<{ tenant: TenantRecord; pool: Pool }> {
  await assertRuntimeDatabaseSecurity(controlPool);
  const tenant = await getTenantRecord(slug);
  if (!tenant) throw new Error('TENANT_NOT_FOUND');
  const pool = getTenantPool(tenant);
  await assertRuntimeDatabaseSecurity(pool, process.env, process.env.DATABASE_SERVICE_ROLE);
  return { tenant, pool };
}

export async function tenantPoolFromId(id: string): Promise<{ tenant: TenantRecord; pool: Pool }> {
  return tenantPoolFromSlug(id);
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  let discard = false;
  let connectionFailure: Error | undefined;
  let phase: 'acquire' | 'begin' | 'work' | 'commit' | 'rollback' | 'release' = 'acquire';
  const observeConnectionError = (error: Error & { code?: string }) => {
    connectionFailure ??= error;
    discard = true;
    console.error(JSON.stringify({
      level: 'error', event: 'database.leased_connection_error', phase,
      code: typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'UNKNOWN'
    }));
  };
  // pg-pool removes its idle error listener when handing out a client. Attach
  // ours in the acquisition callback, before the Promise hands it to work.
  const client = await new Promise<PoolClient>((resolve, reject) => {
    pool.connect((error, acquired) => {
      if (error) { reject(error); return; }
      if (!acquired) { reject(new Error('Database client acquisition failed.')); return; }
      acquired.on('error', observeConnectionError);
      resolve(acquired);
    });
  });
  const assertConnected = () => { if (connectionFailure) throw connectionFailure; };
  try {
    assertConnected();
    phase = 'begin';
    await client.query('BEGIN');
    assertConnected();
    phase = 'work';
    const result = await work(client);
    assertConnected();
    phase = 'commit';
    await client.query('COMMIT');
    assertConnected();
    return result;
  } catch (error) {
    // A lost COMMIT response is uncertain: never credit success, retry work,
    // or replace the original failure with a secondary rollback failure.
    if (!connectionFailure) {
      phase = 'rollback';
      try { await client.query('ROLLBACK'); } catch { discard = true; }
    }
    throw error;
  } finally {
    phase = 'release';
    // release first: pg-pool reinstalls its idle listener synchronously. There
    // must not be an unobserved window before ownership returns to the pool.
    try { client.release(connectionFailure ?? discard); }
    finally { client.removeListener('error', observeConnectionError); }
  }
}

export async function queryOne<T extends QueryResultRow>(
  client: Pool | PoolClient,
  text: string,
  values: unknown[] = []
): Promise<T | null> {
  const result: QueryResult<T> = await client.query<T>(text, values);
  return result.rows[0] ?? null;
}

export function databaseNameForTenant(id: string): string {
  return `gc_tenant_${id.replaceAll('-', '_').toLowerCase()}`;
}

export async function closePools(): Promise<void> {
  await Promise.all([controlPool.end(), ...[...tenantPools.values()].map((pool) => pool.end())]);
  tenantPools.clear();
}
