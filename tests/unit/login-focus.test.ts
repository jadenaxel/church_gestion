import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('acceso sin credenciales precargadas ni pérdida al enfocar', () => {
  it.each(['apps/web/app/login/page.tsx', 'apps/web/app/global/login/page.tsx'])('%s conserva el valor al volver al campo', (path) => {
    const source = readFileSync(path, 'utf8');
    const focusHandler = source.match(/function unlock\([\s\S]*?(?=async function submit)/)?.[0];
    expect(focusHandler).toBeDefined();
    expect(focusHandler).not.toContain('setForm(');
    expect(source).toContain("email: '', password: ''");
    expect(source).toContain('autoComplete="new-password"');
    expect(source).toContain('readOnly={!unlocked.');
  });
});
