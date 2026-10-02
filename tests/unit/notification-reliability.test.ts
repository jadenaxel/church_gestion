import { describe, expect, it, vi } from 'vitest';
import { notificationEventHash, sendReminderEvent } from '../../services/notification-service/src/reliability.js';

describe('notification reliability protocol', () => {
  it('canonicalizes object keys while preserving array order', () => {
    expect(notificationEventHash({ id: 'event', payload: { b: 2, a: 1 } })).toBe(notificationEventHash({ payload: { a: 1, b: 2 }, id: 'event' }));
    expect(notificationEventHash({ values: [1, 2] })).not.toBe(notificationEventHash({ values: [2, 1] }));
  });
  it.each([400, 401, 403, 409, 429, 500, 503])('does not credit an HTTP %i as a delivered reminder', async (status) => {
    const send = vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;
    await expect(sendReminderEvent('http://127.0.0.1/events', 'synthetic-tenant', 'synthetic-secret', {}, send)).rejects.toThrow(`respondió ${status}`);
  });
  it('accepts successful event persistence and supplies a bounded abort signal', async () => {
    const send = vi.fn(async () => new Response('{}', { status: 201 })) as unknown as typeof fetch;
    await expect(sendReminderEvent('http://127.0.0.1/events', 'synthetic-tenant', 'synthetic-secret', { id: 'synthetic' }, send)).resolves.toBeUndefined();
    expect(vi.mocked(send).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it('propagates a lost response rather than claiming success', async () => {
    const send = vi.fn(async () => { throw new Error('Synthetic network failure'); }) as unknown as typeof fetch;
    await expect(sendReminderEvent('http://127.0.0.1/events', 'synthetic-tenant', 'synthetic-secret', {}, send)).rejects.toThrow('Synthetic network failure');
  });
});
