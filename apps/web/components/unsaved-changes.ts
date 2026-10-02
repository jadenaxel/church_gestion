export function createUnsavedChangesRegistry() {
  const dirty = new Set<symbol>();
  return {
    mark(owner: symbol, changed: boolean) { if (changed) dirty.add(owner); else dirty.delete(owner); },
    clear(owner: symbol) { dirty.delete(owner); },
    hasChanges: () => dirty.size > 0
  };
}

export type DraftControl = { type: string; value: string; checked?: boolean; files?: ArrayLike<{ name: string; size: number; lastModified: number }> | null };

/** Comparison remains in memory; file contents and sensitive drafts are never persisted. */
export function draftControlValue(control: DraftControl): string {
  if (control.type === 'checkbox' || control.type === 'radio') return String(control.checked === true);
  if (control.type === 'file') return JSON.stringify(Array.from(control.files ?? [], ({ name, size, lastModified }) => [name, size, lastModified]));
  return control.value;
}

export function isLeavingPage(href: string, currentUrl: string): boolean {
  try {
    const target = new URL(href, currentUrl);
    const current = new URL(currentUrl);
    return ['http:', 'https:'].includes(target.protocol)
      && (target.origin !== current.origin || target.pathname !== current.pathname || target.search !== current.search);
  } catch { return false; }
}
