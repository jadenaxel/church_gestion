import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const temporaryParent = resolve(tmpdir());

describe('backup manifest preflight', () => {
  it.each(['../outside.gcbak', 'C:\\outside.gcbak', 'nested/file.gcbak'])('rejects unsafe control filename %s before any database command', async (control) => {
    const folder = await mkdtemp(join(temporaryParent, 'gc-restore-guard-'));
    try {
      await writeFile(join(folder, 'manifest.json'), JSON.stringify({ version: 2, encryption: { format: 'GCBAK1' }, control, tenants: [] }));
      await expect(run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('scripts/restore.ps1'), '-BackupDirectory', folder, '-VerifyOnly'], {
        env: { ...process.env, GC_BACKUP_PASSPHRASE: 'Synthetic-only-restore-guard-phrase' },
      })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('ruta de archivo no permitida') });
    } finally {
      expect(dirname(folder)).toBe(temporaryParent);
      expect(folder.startsWith(join(temporaryParent, 'gc-restore-guard-'))).toBe(true);
      if (dirname(folder) === temporaryParent && folder.startsWith(join(temporaryParent, 'gc-restore-guard-'))) await rm(folder, { recursive: true, force: true });
    }
  });
});
