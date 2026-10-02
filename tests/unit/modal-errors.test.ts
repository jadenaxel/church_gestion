import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = join(process.cwd(), 'apps/web');
const source = (path: string) => readFileSync(join(webRoot, path), 'utf8');

function submittedForm(contents: string, handler: string): string {
  const start = contents.indexOf(`onSubmit={${handler}}`);
  const end = contents.indexOf('</form>', start);
  expect(start, `Missing form handler ${handler}`).toBeGreaterThanOrEqual(0);
  expect(end, `Missing form boundary ${handler}`).toBeGreaterThan(start);
  return contents.slice(start, end);
}

function expectVisibleError(contents: string): void {
  expect(contents).toMatch(/\{error\s*&&\s*\(?\s*<Notice\s+tone="danger"\s+title=(?:"No fue posible completar la acción"|\{tr\(["']No fue posible completar la acción["']\)\})\s*>\s*\{error\}\s*<\/Notice>\s*\)?\}/);
}

describe('save errors remain visible inside the active form dialog', () => {
  it('shows an error in both direct Women forms and forwards it to every shared modal', () => {
    const contents = source('app/womens-ministry/page.tsx');
    for (const handler of ['saveWoman', 'saveActivity']) expectVisibleError(submittedForm(contents, handler));
    const calls = contents.match(/<SimpleModal\s+[^>]*>/g) ?? [];
    expect(calls).toHaveLength(6);
    for (const call of calls) expect(call).toContain('error={error}');
    const helper = contents.slice(contents.indexOf('function SimpleModal('));
    expect(helper).toMatch(/error:\s*string;/);
    expectVisibleError(submittedForm(helper, 'onSubmit'));
    expect(contents).toMatch(/catch\s*\(reason\)\s*\{\s*setError\([\s\S]*?\}\s*finally\s*\{\s*setBusy\(false\)/);
  });

  it('shares the Personal Ministries error across all forms without replacing their fields', () => {
    const contents = source('app/personal-ministries/page.tsx');
    expectVisibleError(submittedForm(contents, 'submit'));
    const failureBlocks = contents.match(/catch \(reason\) \{[\s\S]*?\n\t\t\} finally/g) ?? [];
    expect(failureBlocks.length).toBeGreaterThan(0);
    for (const failure of failureBlocks) {
      expect(failure).toContain('setError(');
      expect(failure).not.toContain('setModal(');
    }
  });

  it('shows errors inside every Elder form, including the program and photo uploads', () => {
    const contents = source('app/elders/page.tsx');
    for (const handler of ['saveRotation', 'saveAnnualPlan', 'saveAssignment', 'saveProgram']) expectVisibleError(submittedForm(contents, handler));
    const failureBlocks = contents.match(/catch \(reason\) \{ setError\([^\n]*/g) ?? [];
    expect(failureBlocks.length).toBeGreaterThanOrEqual(4);
    for (const failure of failureBlocks) expect(failure).not.toMatch(/set(?:Rotation|AnnualPlan|Assignment|Program)Open\(false\)/);
  });

  it('forwards the department Hub error into its shared form and uses an announced danger notice', () => {
    const contents = source('app/ministry-hub/page.tsx');
    expect(contents).toMatch(/<HubModal\s+title=\{modalTitle\(modal\)\}\s+error=\{error\}/);
    const helper = contents.slice(contents.indexOf('function HubModal('), contents.indexOf('function departmentRoleLabel('));
    expect(helper).toContain('error: string;');
    expectVisibleError(submittedForm(helper, 'onSubmit'));
    expect(source('components/ui.tsx')).toContain("role={tone === 'danger' ? 'alert' : 'status'}");
  });
});
