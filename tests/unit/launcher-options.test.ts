import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const launcher = resolve('start-gestionchurch.ps1');

describe('launcher rejects unsafe preparation combinations before starting services', () => {
  it('rejects seed and skip together without stopping the existing stack', async () => {
    await expect(exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcher, '-SkipDataSetup', '-SeedDemo'])).rejects.toMatchObject({ code: 1 });
  });

  it('does not silently treat Native-only options as Docker options', async () => {
    await expect(exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcher, '-Mode', 'Docker', '-SkipDataSetup'])).rejects.toMatchObject({ code: 1 });
  });
});
