import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { PoolConfig } from 'pg';

const serviceRoles = /^gc_(identity|tenant|calendar|file|notification|reports|elders|personal_ministries|womens_ministry|department_operations)_service$/;
export function isTenantDatabaseServiceRole(role: string): boolean { return serviceRoles.test(role); }
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
type Entry = { tenantId: string; databaseName: string; serviceRole: string; username: string; password: string; host: string; port: number; caFile: string };
type Credentials = { version: 1; tenants: Entry[] };
type ResolvedConnection = { config: PoolConfig; cacheIdentity: string };

function invalid(): never {
  // Deliberately omit the secret value, file content, parser details and cause.
  throw new Error('TENANT_RUNTIME_CREDENTIALS_INVALID: configure a verified per-tenant, per-service credential file and TLS certificate authority.');
}
function readCredentials(path: string): Credentials {
  try {
    if (!path || statSync(path).size > 2 * 1024 * 1024) return invalid();
    const value = JSON.parse(readFileSync(path, 'utf8')) as Credentials;
    if (value.version !== 1 || !Array.isArray(value.tenants) || !value.tenants.length) return invalid();
    const pairs = new Set<string>(), logins = new Set<string>();
    for (const entry of value.tenants) {
      if (!entry || !uuid.test(entry.tenantId) || entry.databaseName !== `gc_tenant_${entry.tenantId.replaceAll('-', '_')}`
        || !serviceRoles.test(entry.serviceRole) || entry.username !== `gcr_${entry.tenantId.replaceAll('-', '')}_${entry.serviceRole.slice(3, -8)}`
        || typeof entry.password !== 'string' || entry.password.length < 32 || typeof entry.host !== 'string' || !entry.host || /[\s/]/.test(entry.host)
        || !Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535 || typeof entry.caFile !== 'string' || !entry.caFile) return invalid();
      const pair = `${entry.tenantId}:${entry.serviceRole}`;
      if (pairs.has(pair) || logins.has(entry.username)) return invalid();
      pairs.add(pair); logins.add(entry.username);
    }
    return value;
  } catch { return invalid(); }
}

/** Files are an injected secret-store interface, not a new database or authority. */
export function resolveTenantRuntimeConnection(tenant: { id: string; database_name: string }, serviceRole: string | undefined, env: NodeJS.ProcessEnv = process.env): ResolvedConnection {
  if (!uuid.test(tenant.id) || tenant.database_name !== `gc_tenant_${tenant.id.replaceAll('-', '_')}`) return invalid();
  const path = env.GC_TENANT_CREDENTIALS_FILE;
  if (!path) {
    if (env.NODE_ENV === 'production') return invalid();
    const host = env.TENANT_DATABASE_HOST ?? '127.0.0.1', port = env.TENANT_DATABASE_PORT ?? '55432';
    const user = encodeURIComponent(env.TENANT_DATABASE_USER ?? 'postgres');
    const password = env.TENANT_DATABASE_PASSWORD ? `:${encodeURIComponent(env.TENANT_DATABASE_PASSWORD)}` : '';
    return { config: { connectionString: `postgresql://${user}${password}@${host}:${port}/${tenant.database_name}` }, cacheIdentity: 'development-fallback' };
  }
  if (!serviceRole || !serviceRoles.test(serviceRole)) return invalid();
  const credentials = readCredentials(path);
  // A service never receives a file containing credentials for other domains.
  if (credentials.tenants.some((entry) => entry.serviceRole !== serviceRole)) return invalid();
  const entry = credentials.tenants.find((item) => item.tenantId === tenant.id && item.serviceRole === serviceRole);
  if (!entry || entry.databaseName !== tenant.database_name) return invalid();
  let ca: string;
  try {
    if (statSync(entry.caFile).size > 1024 * 1024) return invalid();
    ca = readFileSync(entry.caFile, 'utf8');
    if (!ca.includes('-----BEGIN CERTIFICATE-----')) return invalid();
  } catch { return invalid(); }
  return {
    config: { host: entry.host, port: entry.port, database: entry.databaseName, user: entry.username, password: entry.password, ssl: { ca, rejectUnauthorized: true } },
    // This identity stays in memory. Never use it in logs, URLs or a public API.
    cacheIdentity: createHash('sha256').update(JSON.stringify([entry, ca])).digest('hex'),
  };
}
