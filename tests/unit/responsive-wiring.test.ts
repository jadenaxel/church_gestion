import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'apps/web');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const css = read('app/responsive.css');
function pages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? pages(path) : entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('responsive and accessible UI regression guards', () => {
  it('keeps the mobile operational score out of the summary text', () => {
    expect(css).toMatch(/@container workspace \(max-width: 600px\)[\s\S]*?\.control-hero \{ display: grid;/);
    expect(css).toContain('.control-score { position: relative; inset: auto; justify-self: end; }');
    expect(css).toContain('.control-hero h2, .hero-quick-links { max-width: none; }');
  });
  it('fits dashboard summaries and the form designer to available workspace width', () => {
    expect(css).toMatch(/@container workspace \(max-width: 1100px\)[\s\S]*?\.control-stat-grid \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
    expect(css).toContain('.form-builder-layout { grid-template-columns: 220px minmax(0,1fr); }');
    expect(css).toContain('.builder-inspector { position: static; grid-column: 1/-1; }');
    expect(css).toContain('.command-grid, .performance-grid { grid-template-columns: minmax(0,.9fr) minmax(0,1.1fr); }');
    expect(css).toContain('.command-grid, .performance-grid { grid-template-columns: minmax(0,1fr); }');
  });
  it('fits roster search and filters to the space left by the sidebar on tablets', () => {
    expect(css).toContain('.roster-directory-tools { grid-template-columns: repeat(2,minmax(0,1fr)); }');
    expect(css).toContain('.roster-directory-tools > label { grid-column: 1/-1; }');
    expect(css).toContain('.roster-directory-tools, .roster-member-grid { grid-template-columns: minmax(0,1fr); }');
  });
  it('loads responsive overrides after the existing design system', () => {
    const layout = read('app/layout.tsx');
    expect(layout.indexOf("'./responsive.css'")).toBeGreaterThan(layout.indexOf("'./globals.css'"));
    expect(css).toContain('container-name: workspace');
    expect(css).toContain('minmax(0,1fr)');
    expect(css).toContain('.session-command-title { grid-column: 1/-1; }');
    expect(css).toContain('.session-search-bar, .review-queue-search { grid-template-columns: minmax(0,1fr); }');
    expect(css).toContain('.hub-header-actions { flex-wrap: wrap; justify-content: flex-end; }');
  });
  it('reflows mobile fields and retains labeled workspace tabs', () => {
    expect(css).toContain('font-size: max(16px,1rem)');
    expect(css).toMatch(/\.hub-tabs button span\s*\{\s*display: inline/);
    expect(css).toContain('.modal-card .form-grid, .modal-card .field-grid { grid-template-columns: minmax(0,1fr)');
  });
  it('uses dynamic viewport height, safe areas and local data scrolling', () => {
    expect(css).toContain('100dvh');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('repeat(5,minmax(max-content,1fr))');
    expect(css).toContain('overflow-x: auto');
    expect(css).not.toMatch(/(?:html|body)\s*\{[^}]*overflow-x:\s*hidden/);
  });
  it('centralizes all application overlays in the accessible modal', () => {
    for (const file of pages(join(root, 'app'))) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/<div\s+className="(?:modal-backdrop|success-overlay|document-viewer-backdrop|session-modal-overlay|form-preview-overlay)"/);
    }
    const modal = read('components/modal.tsx');
    for (const required of ['createPortal', 'aria-modal="true"', 'aria-label={label}', 'event.key === \'Escape\'', 'event.key === \'Tab\'', 'sibling.inert = true', 'opener.focus', 'dialogStack.at(-1)']) expect(modal).toContain(required);
  });
  it('keeps the mobile backdrop clickable and the closed drawer inert', () => {
    const shell = read('components/shell.tsx');
    expect(shell).toContain('inert={narrow && !menu}');
    expect(shell).toContain('data-dialog-backdrop="true"');
    expect(read('components/modal.tsx')).toContain("sibling.dataset.dialogBackdrop !== 'true'");
  });
  it('gives workspace tabs names, keyboard navigation and a connected panel', () => {
    const tabs = read('components/section-tabs.tsx');
    for (const required of ['aria-label={label}', 'aria-controls=', 'aria-selected=', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'tabIndex=']) expect(tabs).toContain(required);
    expect(read('app/ministry-hub/page.tsx')).toContain('role="tabpanel"');
  });
});
