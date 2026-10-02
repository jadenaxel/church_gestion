import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { createTenantFixture } from '../helpers/tenant-fixture.js';

const run = promisify(execFile);
const enabled = process.env.RUN_PREMIUM_RESTORE_TESTS === '1';

describe.skipIf(!enabled)('encrypted tenant restoration, isolated databases and local objects', () => {
  it('restores the original records, objects and encrypted configuration; rejects tampered manifests before writes', async () => {
    const fixture = await createTenantFixture({ backgroundWork: false });
    const folder = await mkdtemp(join(tmpdir(), 'gc-premium-restore-'));
    const controlName = `gc_premium_restore_${randomBytes(12).toString('hex')}`;
    const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
    const adminTarget = new URL(adminUrl);
    if (!['localhost', '127.0.0.1'].includes(adminTarget.hostname) || adminTarget.port !== '55432') throw new Error('Restore QA requires local isolated database targets.');
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    let ownedControl = false;
    const controlTarget = new URL(adminUrl); controlTarget.pathname = `/${controlName}`;
    const control = new Client({ connectionString: controlTarget.toString() });
    try {
      expect((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [controlName])).rowCount).toBe(0);
      await admin.query(`CREATE DATABASE ${controlName}`);
      ownedControl = true;
      await control.connect();
      await control.query('CREATE SCHEMA control; CREATE TABLE control.tenants(id uuid PRIMARY KEY,slug text,name text,database_name text,status text)');
      await control.query('INSERT INTO control.tenants VALUES($1,$2,$3,$4,$5)', [fixture.id, fixture.slug, 'Synthetic recovery', fixture.database, 'SUSPENDED']);
      const uploads = join(folder, 'uploads');
      const objectFolder = join(uploads, fixture.id);
      const objectName = `${randomUUID()}.txt`;
      await mkdir(objectFolder, { recursive: true });
      await writeFile(join(objectFolder, objectName), 'Original synthetic program');
      const configSource = join(folder, 'synthetic.env');
      const configDestination = join(folder, 'recovered.env');
      await writeFile(configSource, 'SYNTHETIC_RECOVERY_MARKER=original\n');
      const backup = join(folder, 'backup');
      const commandEnv = {
        ...process.env,
        CONTROL_DATABASE_URL: controlTarget.toString(), POSTGRES_ADMIN_URL: adminUrl,
        TENANT_DATABASE_HOST: '127.0.0.1', TENANT_DATABASE_PORT: '55432', TENANT_DATABASE_USER: adminTarget.username,
        UPLOAD_ROOT: uploads, OBJECT_STORAGE_PROVIDER: 'local', GC_BACKUP_PASSPHRASE: randomBytes(32).toString('hex'),
      };
      await run('pwsh', ['-NoProfile', '-File', resolve('scripts/backup.ps1'), '-OutputDirectory', backup, '-TenantSlug', fixture.slug, '-IncludeConfiguration', '-ConfigurationFile', configSource], { env: commandEnv });
      const originalManifest = await readFile(join(backup, 'manifest.json'), 'utf8');
      const manifest = JSON.parse(originalManifest) as { tenants: Array<{ file: string }> };
      await run('pwsh', ['-NoProfile', '-File', resolve('scripts/restore.ps1'), '-BackupDirectory', backup, '-VerifyOnly'], { env: commandEnv });
      await fixture.pool.query('UPDATE identity.users SET name=$1 WHERE id=$2', ['Changed synthetic name', fixture.users.admin.id]);
      await writeFile(join(objectFolder, objectName), 'Changed synthetic program');
      await writeFile(join(backup, 'manifest.json'), originalManifest.replace('OPERATOR_QUIESCED', 'TAMPERED_QUIESCED'));
      await expect(run('pwsh', ['-NoProfile', '-File', resolve('scripts/restore.ps1'), '-BackupDirectory', backup, '-ConfirmRestore'], { env: commandEnv }))
        .rejects.toMatchObject({ stderr: expect.stringContaining('copia autenticada') });
      expect((await fixture.pool.query('SELECT name FROM identity.users WHERE id=$1', [fixture.users.admin.id])).rows[0].name).toBe('Changed synthetic name');
      await writeFile(join(backup, 'manifest.json'), originalManifest);
      const tenantDumpPath = join(backup, manifest.tenants[0]!.file);
      const originalDump = await readFile(tenantDumpPath);
      const corruptDump = Buffer.from(originalDump); corruptDump[corruptDump.length - 1]! ^= 1;
      await writeFile(tenantDumpPath, corruptDump);
      await expect(run('pwsh', ['-NoProfile', '-File', resolve('scripts/restore.ps1'), '-BackupDirectory', backup, '-ConfirmRestore'], { env: commandEnv })).rejects.toMatchObject({ code: 1 });
      expect((await fixture.pool.query('SELECT name FROM identity.users WHERE id=$1', [fixture.users.admin.id])).rows[0].name).toBe('Changed synthetic name');
      await writeFile(tenantDumpPath, originalDump);
      await run('pwsh', ['-NoProfile', '-File', resolve('scripts/restore.ps1'), '-BackupDirectory', backup, '-ConfirmRestore', '-ConfigurationDestination', configDestination], { env: commandEnv });
      expect((await fixture.pool.query('SELECT name FROM identity.users WHERE id=$1', [fixture.users.admin.id])).rows[0].name).not.toBe('Changed synthetic name');
      expect(await readFile(join(objectFolder, objectName), 'utf8')).toBe('Original synthetic program');
      expect(await readFile(configDestination, 'utf8')).toBe('SYNTHETIC_RECOVERY_MARKER=original\n');
      expect((await control.query('SELECT id FROM control.tenants')).rows).toEqual([{ id: fixture.id }]);
    } finally {
      await control.end().catch(() => undefined);
      if (ownedControl && /^gc_premium_restore_[a-f0-9]{24}$/.test(controlName)) {
        await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [controlName]);
        await admin.query(`DROP DATABASE ${controlName}`);
      }
      await admin.end();
      await fixture.destroy();
      expect(dirname(folder)).toBe(resolve(tmpdir()));
      expect(folder.startsWith(join(resolve(tmpdir()), 'gc-premium-restore-'))).toBe(true);
      if (dirname(folder) === resolve(tmpdir()) && folder.startsWith(join(resolve(tmpdir()), 'gc-premium-restore-'))) await rm(folder, { recursive: true, force: true });
    }
  }, 120_000);
});
