import { describe, expect, it } from 'vitest';
import { createUnsavedChangesRegistry, draftControlValue, isLeavingPage } from '../../apps/web/components/unsaved-changes.js';

describe('unsaved changes protection', () => {
  it('keeps independent drafts protected when another draft saves or unmounts', () => {
    const registry = createUnsavedChangesRegistry();
    const first = Symbol(); const second = Symbol();
    registry.mark(first, true); registry.mark(second, true);
    registry.clear(first);
    expect(registry.hasChanges()).toBe(true);
    registry.mark(second, false);
    expect(registry.hasChanges()).toBe(false);
  });
  it('does not warn for anchors, downloads handled by callers or non-navigation protocols', () => {
    const page = 'https://synthetic.invalid/calendar?view=agenda';
    expect(isLeavingPage('#upcoming', page)).toBe(false);
    expect(isLeavingPage('mailto:synthetic@example.invalid', page)).toBe(false);
    expect(isLeavingPage('/calendar?view=month', page)).toBe(true);
    expect(isLeavingPage('/reviews', page)).toBe(true);
    expect(isLeavingPage('https://other.invalid', page)).toBe(true);
  });
  it('detects changed text, checked state and files without reading file contents', () => {
    expect(draftControlValue({ type: 'text', value: 'draft' })).toBe('draft');
    expect(draftControlValue({ type: 'checkbox', value: 'on', checked: false })).toBe('false');
    expect(draftControlValue({ type: 'checkbox', value: 'on', checked: true })).toBe('true');
    const initial = draftControlValue({ type: 'file', value: '', files: [] });
    const selected = draftControlValue({ type: 'file', value: '', files: [{ name: 'synthetic.pdf', size: 3, lastModified: 1 }] });
    expect(selected).not.toBe(initial);
    expect(draftControlValue({ type: 'file', value: '', files: [{ name: 'synthetic.pdf', size: 4, lastModified: 1 }] })).not.toBe(selected);
  });
});
