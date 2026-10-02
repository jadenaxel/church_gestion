import { describe, expect, it } from 'vitest';
import { historyEntryIndex, historyRestoreDelta, markHistoryEntry } from '../../apps/web/components/history-guard.js';

describe('dirty history traversal indices', () => {
  it('preserves Next router state and never records draft content', () => {
    const tree = { route: 'new' };
    const state = markHistoryEntry({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: tree }, 4);
    expect(state.__NA).toBe(true); expect(state.__PRIVATE_NEXTJS_INTERNALS_TREE).toBe(tree);
    expect(historyEntryIndex(state)).toBe(4); expect(Object.keys(state)).toHaveLength(3);
  });
  it('restores back, forward and multi-entry traversals with exactly the opposite delta', () => {
    expect(historyRestoreDelta(4, markHistoryEntry({}, 3))).toBe(1);
    expect(historyRestoreDelta(4, markHistoryEntry({}, 7))).toBe(-3);
    expect(historyRestoreDelta(4, markHistoryEntry({}, 0))).toBe(4);
    expect(historyRestoreDelta(4, markHistoryEntry({}, 4))).toBeNull();
  });
  it('does not guess a direction for untracked or invalid entries', () => {
    expect(historyRestoreDelta(4, null)).toBeNull();
    expect(historyEntryIndex({ __gcUnsavedEntry: '4' })).toBeNull();
  });
});
