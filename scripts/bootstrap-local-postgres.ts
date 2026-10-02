import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve('.local/postgres');
const data = join(root, 'data');
const log = join(root, 'postgres.log');
const bin = process.env.POSTGRES_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
const initdb = join(bin, process.platform === 'win32' ? 'initdb.exe' : 'initdb');
const pgCtl = join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
const port = process.env.TENANT_DATABASE_PORT ?? '55432';

mkdirSync(root, { recursive: true });

if (!existsSync(join(data, 'PG_VERSION'))) {
  const initialized = spawnSync(initdb, ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8'], {
    stdio: 'inherit'
  });
  if (initialized.status !== 0) process.exit(initialized.status ?? 1);
  appendFileSync(join(data, 'postgresql.conf'), `\nport = ${port}\nlisten_addresses = '127.0.0.1'\n`);
}

const status = spawnSync(pgCtl, ['status', '-D', data], { stdio: 'ignore' });
if (status.status !== 0) {
  const started = spawnSync(pgCtl, ['start', '-D', data, '-l', log, '-w'], { stdio: 'inherit' });
  if (started.status !== 0) process.exit(started.status ?? 1);
}

console.log(`PostgreSQL local de GestionChurch disponible en 127.0.0.1:${port}`);
