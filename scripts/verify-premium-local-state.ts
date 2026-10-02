import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { resolvePremiumEvidenceDate } from './premium-evidence-date.js';

try { process.loadEnvFile?.('.env'); } catch { /* injected environment is sufficient */ }
if (process.env.NODE_ENV === 'production') throw new Error('Local evidence verifier refuses production.');
const evidenceDate = resolvePremiumEvidenceDate(process.argv.slice(2), process.env);
const controlUrl = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';
const clusterUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
for (const value of [controlUrl, clusterUrl]) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== '55432') {
    throw new Error('Local evidence verifier refuses an unverified database destination.');
  }
}
// This script cannot mutate databases or remove fixtures. A mismatch requires
// review of ownership, never a broad cleanup of unknown tenant data.
const control = new Client({ connectionString: controlUrl, options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 3000 });
const cluster = new Client({ connectionString: clusterUrl, options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 3000 });
try {
  await control.connect(); await cluster.connect();
  const registered = (await control.query<{ id: string; slug: string; database_name: string; status: string }>('SELECT id,slug,database_name,status FROM control.tenants ORDER BY slug')).rows;
  const originalsVerified = registered.length === 2 && registered.every((row) => ['central', 'ozama'].includes(row.slug)
    && ['ACTIVE', 'SUSPENDED'].includes(row.status) && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.id)
    && row.database_name === `gc_tenant_${row.id.replaceAll('-', '_')}`);
  const syntheticTenants = Number((await control.query("SELECT count(*)::int count FROM control.tenants WHERE slug ~ '^premium-[a-f0-9]{16}$'")).rows[0].count);
  const syntheticGlobalUsers = Number((await control.query("SELECT count(*)::int count FROM control.global_users WHERE email LIKE '%@premium.example'")).rows[0].count);
  const unregisteredTenantDatabases = Number((await cluster.query("SELECT count(*)::int count FROM pg_database WHERE datname ~ '^gc_tenant_[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}$' AND NOT(datname=ANY($1::text[]))", [registered.map((row) => row.database_name)])).rows[0].count);
  const temporaryControlDatabases = Number((await cluster.query("SELECT count(*)::int count FROM pg_database WHERE datname ~ '^gc_premium_restore_[a-f0-9]{24}$'")).rows[0].count);
  const unregisteredRuntimeLogins = Number((await cluster.query("SELECT count(*)::int count FROM pg_roles WHERE rolname ~ '^gcr_[a-f0-9]{32}_(calendar|tenant)$' AND NOT(split_part(rolname,'_',2)=ANY($1::text[]))", [registered.map((row) => row.id.replaceAll('-', ''))])).rows[0].count);
  const major = Math.floor(Number((await cluster.query("SELECT current_setting('server_version_num') version")).rows[0].version) / 10000);
  const endpoints = {
    web: 'http://127.0.0.1:3000/login', gateway: 'http://127.0.0.1:4000/health/ready',
    nominationsWeb: 'http://127.0.0.1:3300/healthz', nominationsApi: 'http://127.0.0.1:4100/healthz',
  };
  const services: Record<string, { up: boolean; status: number | null }> = Object.fromEntries(await Promise.all(Object.entries(endpoints).map(async ([name, url]) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      await response.arrayBuffer();
      return [name, { up: response.ok, status: response.status }];
    } catch { return [name, { up: false, status: null }]; }
  })));
  const clean = originalsVerified && [syntheticTenants, syntheticGlobalUsers, unregisteredTenantDatabases, temporaryControlDatabases, unregisteredRuntimeLogins].every((count) => count === 0);
  const report = {
    verifiedAt: new Date().toISOString(), mode: 'read-only local metadata; no schema, business, credential, membership or message writes',
    webBuildId: (await readFile(resolve('apps/web/.next/BUILD_ID'), 'utf8')).trim(),
    postgresqlExistingMajor: major, registeredChurches: registered.length, originalCanonicalTargetsVerified: originalsVerified,
    residuals: { syntheticTenants, syntheticGlobalUsers, unregisteredTenantDatabases, temporaryControlDatabases, unregisteredRuntimeLogins },
    residualScope: 'Unregistered UUID tenant databases have unknown ownership unless an exact owned receipt proves otherwise. A nonzero count is a review flag, not authorization for deletion or a claim that this run left fixtures.',
    services, servicesReady: Object.values(services).every((value) => value.up), metadataReviewClear: clean,
    pass: clean && Object.values(services).every((value) => value.up),
    limits: ['Own fixture cleanup verified separately in each test. This metadata count is not authorization to delete unknown resources.', 'Immutable synthetic control audit is deliberately retained.', 'Local readiness does not certify production infrastructure or providers.'],
  };
  const folder = resolve('docs/premium-evidence', evidenceDate);
  await mkdir(folder, { recursive: true });
  await writeFile(resolve(folder, 'final-local-state.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!report.pass) process.exitCode = 1;
} finally { await control.end().catch(() => undefined); await cluster.end().catch(() => undefined); }
