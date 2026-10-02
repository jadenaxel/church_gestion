import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../apps/web/${path}`, import.meta.url), 'utf8');

describe('notification and reporting failure/permission wiring', () => {
  it('does not display notification consent as saved before the server accepts it', () => {
    const source = read('app/notifications/page.tsx');
    const start = source.indexOf('async function savePreferences');
    const save = source.slice(start, source.indexOf('async function retry(', start));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(save.indexOf("await api('/notifications/preferences'")).toBeGreaterThanOrEqual(0);
    expect(save.indexOf("await api('/notifications/preferences'")).toBeLessThan(save.indexOf('setPreferences(next)'));
    expect(save).toContain('catch (reason)');
    expect(save).toContain('finally { setBusy(false); }');
    expect(source).toContain('disabled={busy} checked={preferences.whatsappEnabled}');
  });
  it('replaces a failed notification load with an actionable retry, not an endless spinner', () => {
    const source = read('app/notifications/page.tsx');
    expect(source).toContain('onClick={reload}');
    expect(source).toContain('{!items ? error ? null : <Spinner />');
    expect(source).toMatch(/aria-label=(?:"Marcar como leída"|\{tr\(["']Marcar como leída["']\)\})/);
  });
  it('checks the real session capability before displaying or issuing report exports', () => {
    const source = read('app/reports/page.tsx');
    expect(source).toContain("('/me')");
    expect(source).toContain("user.permissions.includes('reports.export')");
    expect(source).toContain('actions={canExport ?');
    expect(source).toContain('if (!canExport || downloading) return;');
    expect(source).toContain('signal: controller.signal');
  });
  it('offers a recovery route when reset has no one-use token', () => {
    const source = read('app/reset-password/page.tsx');
    expect(source).toContain('!form.token ?');
    expect(source).toContain('href="/forgot-password"');
    expect(source).toContain('Solicitar enlace de recuperación');
  });
});
