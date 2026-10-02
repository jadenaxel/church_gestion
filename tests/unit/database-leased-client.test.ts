import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTransaction } from '../../packages/database/src/index.js';

function leaseHarness(afterAcquire?: (client: EventEmitter) => void) {
  const idleError = vi.fn();
  const query = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
  const release = vi.fn((_discard?: boolean | Error) => { client.on('error', idleError); });
  const client = Object.assign(new EventEmitter(), { query, release });
  const connect = vi.fn((callback: (error: Error | undefined, acquired: PoolClient) => void) => {
    callback(undefined, client as unknown as PoolClient);
    afterAcquire?.(client);
  });
  return { client, pool: { connect } as unknown as Pool, connect, query, release, idleError };
}

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); });

describe('leased PostgreSQL client failures remain observed and rejected', () => {
  it('commits successful work once, then returns error-listener ownership to the pool', async () => {
    const lease = leaseHarness();
    const work = vi.fn(async (client: PoolClient) => {
      expect(lease.client.listenerCount('error')).toBe(1);
      await client.query('SELECT synthetic_work'); return { persisted: true };
    });
    await expect(withTransaction(lease.pool, work)).resolves.toEqual({ persisted: true });
    expect(lease.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'SELECT synthetic_work', 'COMMIT']);
    expect(work).toHaveBeenCalledTimes(1); expect(lease.release).toHaveBeenCalledExactlyOnceWith(false);
    expect(lease.client.listeners('error')).toEqual([lease.idleError]);
    const later = new Error('synthetic idle disconnect');
    expect(() => lease.client.emit('error', later)).not.toThrow();
    expect(lease.idleError).toHaveBeenCalledExactlyOnceWith(later);
  });

  it('observes a disconnect immediately after acquisition, before the awaiting caller resumes', async () => {
    const failure = Object.assign(new Error('synthetic sensitive connection detail'), { code: '57P01' });
    const lease = leaseHarness((client) => { expect(() => client.emit('error', failure)).not.toThrow(); });
    const work = vi.fn();
    await expect(withTransaction(lease.pool, work)).rejects.toBe(failure);
    expect(work).not.toHaveBeenCalled(); expect(lease.query).not.toHaveBeenCalled();
    expect(lease.release).toHaveBeenCalledExactlyOnceWith(failure);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(failure.message);
    expect(JSON.parse(vi.mocked(console.error).mock.calls[0]![0] as string)).toEqual({
      level: 'error', event: 'database.leased_connection_error', phase: 'acquire', code: '57P01'
    });
  });

  it('rejects an idle borrowed-client disconnect even if work later returns success', async () => {
    const lease = leaseHarness(), failure = new Error('synthetic borrowed-client disconnect');
    const work = vi.fn(async () => {
      expect(() => lease.client.emit('error', failure)).not.toThrow();
      await Promise.resolve(); return { accepted: true };
    });
    await expect(withTransaction(lease.pool, work)).rejects.toBe(failure);
    expect(lease.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN']);
    expect(work).toHaveBeenCalledTimes(1); expect(lease.release).toHaveBeenCalledExactlyOnceWith(failure);
    expect(lease.client.listeners('error')).toEqual([lease.idleError]);
  });

  it('retains the first connection failure, handles further events, and never retries', async () => {
    const lease = leaseHarness(), first = new Error('synthetic first disconnect');
    const work = vi.fn(async () => {
      lease.client.emit('error', first); lease.client.emit('error', new Error('synthetic second disconnect'));
    });
    await expect(withTransaction(lease.pool, work)).rejects.toBe(first);
    expect(work).toHaveBeenCalledTimes(1); expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('preserves an ordinary query/work error and rolls back with a healthy client', async () => {
    const lease = leaseHarness(), failure = new Error('synthetic business failure');
    await expect(withTransaction(lease.pool, async () => { throw failure; })).rejects.toBe(failure);
    expect(lease.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(lease.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('discards a failed rollback without replacing the original query failure', async () => {
    const lease = leaseHarness(), failure = new Error('synthetic original query failure');
    lease.query.mockImplementation(async (sql) => { if (sql === 'ROLLBACK') throw new Error('synthetic rollback disconnect'); return { rows: [], rowCount: 0 }; });
    await expect(withTransaction(lease.pool, async () => { throw failure; })).rejects.toBe(failure);
    expect(lease.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('propagates an uncertain COMMIT and discards its connection without acknowledging or retrying work', async () => {
    const lease = leaseHarness(), failure = new Error('synthetic COMMIT response lost');
    const work = vi.fn(async () => ({ accepted: true }));
    lease.query.mockImplementation(async (sql) => {
      if (sql === 'COMMIT') { lease.client.emit('error', failure); throw failure; }
      return { rows: [], rowCount: 0 };
    });
    await expect(withTransaction(lease.pool, work)).rejects.toBe(failure);
    expect(lease.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(work).toHaveBeenCalledTimes(1); expect(lease.release).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('does not turn a resolved COMMIT query plus observed connection failure into success', async () => {
    const lease = leaseHarness(), failure = new Error('synthetic uncertain response');
    lease.query.mockImplementation(async (sql) => {
      if (sql === 'COMMIT') lease.client.emit('error', failure);
      return { rows: [], rowCount: 0 };
    });
    await expect(withTransaction(lease.pool, async () => 'success')).rejects.toBe(failure);
    expect(lease.release).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('keeps its listener during release and removes only its own listener afterward', async () => {
    const lease = leaseHarness(), existing = vi.fn(); lease.client.on('error', existing);
    lease.release.mockImplementation(() => {
      expect(lease.client.listenerCount('error')).toBe(2);
      lease.client.on('error', lease.idleError);
    });
    await withTransaction(lease.pool, async () => undefined);
    expect(lease.client.listeners('error')).toEqual([existing, lease.idleError]);
  });

  it('propagates acquisition failure without running work or claiming a transaction', async () => {
    const failure = new Error('synthetic connection rejected'), work = vi.fn();
    const pool = { connect: vi.fn((callback: (error: Error) => void) => callback(failure)) } as unknown as Pool;
    await expect(withTransaction(pool, work)).rejects.toBe(failure); expect(work).not.toHaveBeenCalled();
  });

  it('routes notification channel updates through the guarded transaction helper', () => {
    const source = readFileSync(new URL('../../services/notification-service/src/main.ts', import.meta.url), 'utf8');
    const method = source.slice(source.indexOf("@Patch('notifications/channels/settings')"), source.indexOf("@Post('notifications/channels/verify/email')"));
    expect(method).toContain('await withTransaction(pool, async (client) => {');
    expect(method).toContain('notification.channels_updated');
    expect(source).not.toMatch(/pool\.connect\(|client\.release\(/);
  });
});
