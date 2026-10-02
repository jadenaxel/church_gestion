const marker = '__gcUnsavedEntry';

export function historyEntryIndex(state: unknown): number | null {
  if (!state || typeof state !== 'object' || !(marker in state)) return null;
  const index = state[marker];
  return typeof index === 'number' && Number.isSafeInteger(index) ? index : null;
}

/** Add only our index; Next's own router/tree state remains unchanged. Never store draft values. */
export function markHistoryEntry(state: unknown, index: number): Record<string, unknown> {
  return { ...(state && typeof state === 'object' ? state : {}), [marker]: index };
}

export function historyRestoreDelta(currentIndex: number, targetState: unknown): number | null {
  const target = historyEntryIndex(targetState);
  return target === null || target === currentIndex ? null : currentIndex - target;
}
