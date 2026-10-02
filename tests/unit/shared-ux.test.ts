import { describe, expect, it, vi } from 'vitest';
import { auditDateRangeError, auditQueryString, type AuditFilters } from '../../apps/web/components/audit-filters.js';
import { createMutationQueue } from '../../apps/web/components/experience-mutations.js';

const emptyFilters: AuditFilters = { search: '', outcome: '', action: '', resourceType: '', tenantId: '', from: '', to: '' };

function frameHarness() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let next = 0;
  const schedule = vi.fn((callback: FrameRequestCallback) => {
    const id = next++;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => { callbacks.delete(id); });
  return {
    schedule,
    cancel,
    flush() {
      const pending = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of pending) callback(0);
    }
  };
}

describe('translation mutation scheduling', () => {
  it('retains every React mutation batch until the next frame', () => {
    const frame = frameHarness();
    const translate = vi.fn();
    const queue = createMutationQueue(translate, frame.schedule, frame.cancel);
    const first = { type: 'childList' } as MutationRecord;
    const second = { type: 'characterData' } as MutationRecord;
    const third = { type: 'attributes' } as MutationRecord;
    queue.enqueue([first]);
    queue.enqueue([second, third]);
    expect(frame.schedule).toHaveBeenCalledTimes(1);
    frame.flush();
    expect(translate).toHaveBeenCalledExactlyOnceWith([first, second, third]);
  });

  it('schedules mutations produced while translation itself runs in the following frame', () => {
    const frame = frameHarness();
    const first = { type: 'childList' } as MutationRecord;
    const second = { type: 'characterData' } as MutationRecord;
    const batches: MutationRecord[][] = [];
    const queue = createMutationQueue((batch) => {
      batches.push(batch);
      if (batch.includes(first)) queue.enqueue([second]);
    }, frame.schedule, frame.cancel);
    queue.enqueue([first]);
    frame.flush();
    expect(batches).toEqual([[first]]);
    frame.flush();
    expect(batches).toEqual([[first], [second]]);
  });

  it('cancels pending translations and ignores future batches after locale change or unmount', () => {
    const frame = frameHarness();
    const translate = vi.fn();
    const queue = createMutationQueue(translate, frame.schedule, frame.cancel);
    queue.enqueue([{ type: 'childList' } as MutationRecord]);
    queue.stop();
    queue.enqueue([{ type: 'attributes' } as MutationRecord]);
    frame.flush();
    expect(frame.cancel).toHaveBeenCalledExactlyOnceWith(0);
    expect(translate).not.toHaveBeenCalled();
    expect(frame.schedule).toHaveBeenCalledTimes(1);
  });
});

describe('audit date ranges and export filters', () => {
  it('keeps all filters URL encoded for list and CSV requests', () => {
    const filters = { ...emptyFilters, search: 'actor & action', outcome: 'EXCEPTIONS', action: 'activity.created', resourceType: 'activity', tenantId: 'tenant-id' };
    const params = new URLSearchParams(auditQueryString(filters, 3));
    expect(Object.fromEntries(params)).toEqual({ page: '3', pageSize: '30', search: 'actor & action', outcome: 'EXCEPTIONS', action: 'activity.created', resourceType: 'activity', tenantId: 'tenant-id' });
  });

  it('uses inclusive local dates with an exclusive next-midnight end', () => {
    const filters = { ...emptyFilters, from: '2026-10-01', to: '2026-10-01' };
    const params = new URLSearchParams(auditQueryString(filters, 1));
    expect(params.get('from')).toBe(new Date('2026-10-01T00:00:00').toISOString());
    expect(params.get('to')).toBe(new Date('2026-10-02T00:00:00').toISOString());
    expect(auditDateRangeError(filters)).toBe('');
  });

  it.each(['2026-02-30', 'invalid', '2026-13-01', '2026-00-01', '2026-01-00'])('rejects malformed or impossible date %s without throwing while rendering', (from) => {
    expect(auditDateRangeError({ from, to: '' })).not.toBe('');
    expect(() => auditQueryString({ ...emptyFilters, from }, 1)).not.toThrow();
    expect(new URLSearchParams(auditQueryString({ ...emptyFilters, from }, 1)).has('from')).toBe(false);
  });

  it('accepts leap dates and rejects an inverted range', () => {
    expect(auditDateRangeError({ from: '2028-02-29', to: '2028-03-01' })).toBe('');
    expect(auditDateRangeError({ from: '2026-10-02', to: '2026-10-01' })).toBe('La fecha final debe ser igual o posterior a la fecha inicial.');
  });
});
