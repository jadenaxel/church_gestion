import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { deliverDepartmentNotification, dispatchDepartmentNotifications, enqueueDepartmentNotification, recoverDepartmentNotification } from '../../services/department-operations-service/src/notification-outbox.js';
import { departmentNotificationOutboxSchemaSql } from '../../packages/database/src/department-notification-outbox.js';

describe('department notification outbox', () => {
  it('only enqueues a durable intent on its supplied transaction client, without transport', async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) } as unknown as PoolClient;
    const id = await enqueueDepartmentNotification(client, 'department_operations.task', { userId: 'synthetic', title: 'Synthetic', body: 'Synthetic' });
    expect(id).toMatch(/^[a-f0-9-]{36}$/); expect(client.query).toHaveBeenCalledOnce();
    expect(vi.mocked(client.query).mock.calls[0]![0]).toContain('department_operations.notification_outbox');
    expect(departmentNotificationOutboxSchemaSql).not.toMatch(/\b(GRANT|INSERT|UPDATE|DELETE)\b/);
  });
  it('requires a successful transport acknowledgement and includes an abort signal', async () => {
    const http = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    try {
      await expect(deliverDepartmentNotification({ id: 'synthetic', tenantId: 'synthetic', aggregateId: 'synthetic', type: 'department_operations.task', payload: {} })).rejects.toThrow('TRANSPORT_REJECTED');
      expect(http.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    } finally { http.mockRestore(); }
  });
  it('keeps a failed transport pending and fences changes by the same claim token', async () => {
    const event = { id: 'synthetic-event', event_type: 'department_operations.task', aggregate_id: 'synthetic-aggregate', payload: {}, claim_token: 'synthetic-claim' };
    const query = vi.fn().mockResolvedValueOnce({ rows: [event] }).mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [] });
    const transport = vi.fn(async (_event: { id: string }) => { throw new Error('Synthetic network failure'); });
    expect(await dispatchDepartmentNotifications({ query } as unknown as Pool, 'synthetic-tenant', transport)).toEqual({ delivered: 0, deferred: 1 });
    expect(transport.mock.calls[0]![0]).toMatchObject({ id: event.id });
    expect(query.mock.calls[1]![0]).toContain('attempts=attempts+1'); expect(query.mock.calls[1]![1]).toEqual([event.id, event.claim_token]);
  });
  it('contains both initial DB rejection and rejection while deferring an in-flight event', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(await dispatchDepartmentNotifications({ query: vi.fn().mockRejectedValue({ code: '57P01' }) } as unknown as Pool, 'synthetic')).toEqual({ delivered: 0, deferred: 0 });
      expect(log.mock.calls[0]![0]).toContain('57P01');
      const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'synthetic', payload: {}, claim_token: 'synthetic' }] }).mockRejectedValue({ code: '57P01' });
      await expect(dispatchDepartmentNotifications({ query } as unknown as Pool, 'synthetic', async () => { throw new Error('Synthetic offline'); })).resolves.toEqual({ delivered: 0, deferred: 0 });
    } finally { log.mockRestore(); }
  });
  it('recovers only the original exhausted ID and invokes its mandatory audit on the same client', async () => {
    const event = { id: 'synthetic-event', event_type: 'synthetic', aggregate_id: 'synthetic-aggregate', attempts: 8, delivered_at: null };
    const client = { release: vi.fn(), query: vi.fn().mockResolvedValueOnce({ rows: [event] }).mockResolvedValue({ rows: [] }) } as unknown as PoolClient;
    const audit = vi.fn(async (active: PoolClient) => { expect(active).toBe(client); });
    expect(await recoverDepartmentNotification(client, event.id, audit)).toEqual({ id: event.id, retryScheduled: true });
    expect(vi.mocked(client.query).mock.calls[0]![0]).toContain('FOR UPDATE');
    expect(vi.mocked(client.query).mock.calls[1]![0]).toContain('next_attempt_at=now()');
    expect(audit).toHaveBeenCalledOnce(); expect(client.release).not.toHaveBeenCalled();
  });
  it('refuses delivered and unexhausted rows before mutation or audit', async () => {
    for (const event of [{ attempts: 8, delivered_at: '2030-01-01' }, { attempts: 2, delivered_at: null }]) {
      const client = { release: vi.fn(), query: vi.fn().mockResolvedValue({ rows: [event] }) } as unknown as PoolClient;
      const audit = vi.fn(); await expect(recoverDepartmentNotification(client, 'synthetic', audit)).rejects.toMatchObject({ status: 409, code: 'OUTBOX_NOT_RETRYABLE' });
      expect(client.query).toHaveBeenCalledOnce(); expect(audit).not.toHaveBeenCalled();
    }
  });
});
