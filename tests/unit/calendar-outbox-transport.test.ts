import { describe, expect, it, vi } from 'vitest';
import { sendOutboxEvent } from '../../services/calendar-service/src/outbox-transport.js';

describe('bounded calendar outbox HTTP transport', () => {
  it('requires successful persistence and supplies a 15-second deadline', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const send = vi.fn(async () => new Response('{}', { status: 201 })) as unknown as typeof fetch;
    try {
      await expect(sendOutboxEvent('http://127.0.0.1/events', 'synthetic-tenant', 'synthetic-secret', { id: 'synthetic' }, send)).resolves.toBeUndefined();
      expect(timeout).toHaveBeenCalledWith(15_000);
      expect(vi.mocked(send).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    } finally { timeout.mockRestore(); }
  });
  it('does not credit a failed downstream response as delivered', async () => {
    const send = vi.fn(async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    await expect(sendOutboxEvent('http://127.0.0.1/events', 'synthetic-tenant', 'synthetic-secret', {}, send)).rejects.toThrow('Notification service 503');
  });
  it('rejects a stalled response when the deadline expires so the caller retains its pending event', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const send = vi.fn((_url: unknown, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      controller.abort(new DOMException('Synthetic deadline', 'TimeoutError'));
    })) as unknown as typeof fetch;
    try { await expect(sendOutboxEvent('http://127.0.0.1/events', 'synthetic-tenant', 'synthetic-secret', {}, send)).rejects.toThrow('Synthetic deadline'); }
    finally { timeout.mockRestore(); }
  });
});
