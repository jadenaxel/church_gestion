import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createTenantFixture } from '../tests/helpers/tenant-fixture.js';

try { process.loadEnvFile?.('.env'); } catch { /* fixture validates target */ }
const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';
const endpoint = new URL(apiUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.port !== '4000') {
  throw new Error('Performance smoke refuses a non-local gateway.');
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

const fixture = await createTenantFixture();
try {
const login = await fetch(`${apiUrl}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
  body: JSON.stringify({ tenant: fixture.slug, email: fixture.users.admin.email, password: fixture.users.admin.password })
});
if (!login.ok) throw new Error(`Login de rendimiento falló: ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('No se recibió cookie de sesión.');
const headers = { cookie, 'content-type': 'application/json', origin: 'http://localhost:3000' };
const departments = await fetch(`${apiUrl}/departments`, { headers }).then((response) => response.json()) as { items: Array<{ id: string }> };
const departmentId = departments.items[0]?.id;
if (!departmentId) throw new Error('El fixture no contiene departamentos.');

const reads: number[] = [];
for (let index = 0; index < 80; index++) {
  const start = performance.now();
  const response = await fetch(`${apiUrl}${index % 2 ? '/dashboard' : '/activities?limit=50'}`, { headers });
  if (!response.ok) throw new Error(`Lectura falló: ${response.status}`);
  await response.arrayBuffer();
  reads.push(performance.now() - start);
}

const startsAt = new Date(Date.now() + 330 * 86_400_000);
const endsAt = new Date(startsAt.getTime() + 3_600_000);
const payload = JSON.stringify({
  title: `Rendimiento ${Date.now()}`, description: 'Medición local reproducible de comandos idempotentes.',
  departmentId, responsibleName: 'Suite de rendimiento', venueId: null,
  options: [{ label: 'Principal', preference: 1, sessions: [{ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
});
const idempotencyKey = `performance-${randomUUID()}`;
const commands: number[] = [];
let activityId = '';
for (let index = 0; index < 25; index++) {
  const start = performance.now();
  const response = await fetch(`${apiUrl}/activities`, { method: 'POST', headers: { ...headers, 'idempotency-key': idempotencyKey }, body: payload });
  const result = await response.json() as { id?: string };
  if (!response.ok || !result.id) throw new Error(`Comando falló: ${response.status}`);
  if (activityId && activityId !== result.id) throw new Error('Repeated command created a second activity.');
  activityId = result.id;
  commands.push(performance.now() - start);
}
const cancelled = await fetch(`${apiUrl}/activities/${activityId}/cancel`, { method: 'POST', headers });
if (!cancelled.ok) throw new Error(`Cancellation failed: ${cancelled.status}`);

const report = {
  measuredAt: new Date().toISOString(),
  webBuildId: (await readFile(resolve('apps/web/.next/BUILD_ID'), 'utf8')).trim(),
  environment: 'local Windows, PostgreSQL 18, synthetic tenant, loopback gateway; laboratory smoke, not production load or field Web Vitals',
  workload: { concurrency: 1, churchData: 'synthetic fresh database', network: 'loopback, unthrottled', writes: '25 retries of one idempotent activity' },
  samples: { reads: reads.length, commands: commands.length },
  p95Ms: { reads: Number(percentile(reads, 0.95).toFixed(2)), commands: Number(percentile(commands, 0.95).toFixed(2)) },
  developmentRegressionGuardMs: { reads: 300, commands: 600, userApprovedSlo: false },
};
const evidenceFolder = resolve('docs/premium-evidence/2026-10-01');
await mkdir(evidenceFolder, { recursive: true });
await writeFile(resolve(evidenceFolder, 'performance-final.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
if (report.p95Ms.reads >= 300 || report.p95Ms.commands >= 600) process.exitCode = 1;
} finally { await fixture.destroy(); }
