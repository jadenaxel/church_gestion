import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';
import { Client, Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { provisionTenantDatabase } from '../../packages/database/src/migrations.js';

const run = promisify(execFile);
const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const postgresBin = process.env.POSTGRES_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
let databaseName = '';
let temporaryDirectory = '';

async function dropTestDatabase(): Promise<void> {
  if (!/^gc_tenant_[a-f0-9_]+$/.test(databaseName)) return;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, [databaseName]);
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
    if (exists.rowCount) await admin.query(`DROP DATABASE ${databaseName}`);
  } finally { await admin.end(); }
}

afterAll(async () => {
  await dropTestDatabase();
  const root = resolve('.local');
  if (temporaryDirectory && resolve(temporaryDirectory).startsWith(`${root}\\`)) await rm(temporaryDirectory, { recursive: true, force: true });
});

describe('backup y restauración PostgreSQL', () => {
  it('restaura un tenant real y conserva sus datos', async () => {
    databaseName = await provisionTenantDatabase(adminUrl, randomUUID());
    const tenantUrl = new URL(adminUrl); tenantUrl.pathname = `/${databaseName}`;
    const tenant = new Pool({ connectionString: tenantUrl.toString() });
    const marker = `Restore ${randomUUID()}`;
    await tenant.query(`INSERT INTO calendar.departments(name,color) VALUES($1,'#123456')`, [marker]);
    await tenant.end();

    await mkdir(resolve('.local'), { recursive: true });
    temporaryDirectory = await mkdtemp(resolve('.local', 'restore-test-'));
    const dump = join(temporaryDirectory, 'tenant.dump');
    await run(join(postgresBin, 'pg_dump.exe'), ['--format=custom', '--no-owner', '--no-privileges', '--file', dump, tenantUrl.toString()]);
    await run(join(postgresBin, 'pg_restore.exe'), ['--list', dump]);
    await dropTestDatabase();

    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${databaseName}`);
    await admin.end();
    await run(join(postgresBin, 'pg_restore.exe'), ['--no-owner', '--no-privileges', '--dbname', tenantUrl.toString(), dump]);

    const restored = new Pool({ connectionString: tenantUrl.toString() });
    const found = await restored.query(`SELECT 1 FROM calendar.departments WHERE name=$1`, [marker]);
    await restored.end();
    expect(found.rowCount).toBe(1);
  });
});
