import { describe, expect, it, vi } from 'vitest';
import { newLinkedActivityProgress, newWriteIntent, resumableWrite, resumeLinkedActivity } from '../../apps/web/components/resumable-write.js';

describe('uncertain financial and linked writes', () => {
  it('replays an uncertain payment with the same body/key and rejects a changed amount', async () => {
    const intent = newWriteIntent(); const key = vi.fn(() => 'synthetic-payment-key');
    const write = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 'synthetic-receipt' });
    await expect(resumableWrite(intent, '{"amount":5}', key, write)).rejects.toThrow('timeout');
    await expect(resumableWrite(intent, '{"amount":6}', key, write)).rejects.toThrow('mismos datos');
    await expect(resumableWrite(intent, '{"amount":5}', key, write)).resolves.toEqual({ result: { id: 'synthetic-receipt' } });
    expect(write.mock.calls[0]).toEqual(write.mock.calls[1]); expect(key).toHaveBeenCalledOnce();
    expect(intent.body).toBeNull();
  });
  it('allows correction after a definitive validation rejection, not after an uncertain server error', async () => {
    const intent = newWriteIntent();
    await expect(resumableWrite(intent, 'bad', () => 'synthetic-one', async () => { throw { status: 422 }; })).rejects.toEqual({ status: 422 });
    await expect(resumableWrite(intent, 'corrected', () => 'synthetic-two', async (_body, key) => key)).resolves.toEqual({ result: 'synthetic-two' });
  });
  it('keeps the acknowledged calendar id and skips a successful submit on linking retry', async () => {
    const progress = newLinkedActivityProgress();
    const operations = { createKey: () => 'synthetic-key', create: vi.fn(async () => ({ id: 'synthetic-calendar' })), read: vi.fn(async () => ({ status: 'SUBMITTED' })), submit: vi.fn(async () => ({ status: 'SUBMITTED' })), link: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'synthetic-linked' }) };
    await expect(resumeLinkedActivity(progress, '{"title":"synthetic"}', '{"title":"synthetic"}', operations)).rejects.toThrow('offline');
    await expect(resumeLinkedActivity(progress, 'changed', 'changed', operations)).resolves.toEqual({ id: 'synthetic-linked' });
    expect(operations.create).toHaveBeenCalledOnce(); expect(operations.submit).toHaveBeenCalledOnce();
    expect(operations.link.mock.calls[0]).toEqual(operations.link.mock.calls[1]);
    expect(JSON.parse(operations.link.mock.calls[1]?.[0])).toMatchObject({ calendarActivityId: 'synthetic-calendar', title: 'synthetic' });
  });
  it('reconciles an uncertain submit from server status without submitting it twice', async () => {
    const progress = newLinkedActivityProgress();
    const operations = { createKey: () => 'synthetic-key', create: vi.fn(async () => ({ id: 'synthetic-calendar' })), read: vi.fn(async () => ({ status: 'SUBMITTED' })), submit: vi.fn(async () => { throw new Error('unknown result'); }), link: vi.fn(async () => ({ id: 'synthetic-linked' })) };
    await expect(resumeLinkedActivity(progress, '{}', '{}', operations)).rejects.toThrow('unknown result');
    await resumeLinkedActivity(progress, '{}', '{}', operations);
    expect(operations.submit).toHaveBeenCalledOnce(); expect(operations.read).toHaveBeenCalledOnce();
  });
  it('never marks a conflicted or cancelled activity as a successfully planned ministry activity', async () => {
    const progress = newLinkedActivityProgress(); const link = vi.fn(async () => undefined);
    await expect(resumeLinkedActivity(progress, '{}', '{}', { createKey: () => 'synthetic-key', create: async () => ({ id: 'synthetic-calendar' }), read: async () => ({ status: 'CANCELLED' }), submit: async () => ({ status: 'CONFLICTED' }), link })).rejects.toThrow('coordinación');
    expect(link).not.toHaveBeenCalled(); expect(progress.calendarId).toBe('synthetic-calendar');
  });
});
