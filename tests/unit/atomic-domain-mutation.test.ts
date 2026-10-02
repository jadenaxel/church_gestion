import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Post } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { activeDomainClient, atomicDomainMutation, domainTransaction } from '../../services/shared/atomic-domain-mutation.js';

function fakePool() {
  const client = Object.assign(new EventEmitter(), { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() }) as unknown as PoolClient;
  const pool = { connect: vi.fn((callback: (error: Error | undefined, acquired: PoolClient) => void) => callback(undefined, client)) } as unknown as Pool;
  return { pool, client };
}
describe('tenant-scoped atomic domain mutation wrappers', () => {
  it('commits once, binds only the matching tenant and retains Nest route metadata', async () => {
    const { pool, client } = fakePool();
    const Atomic = atomicDomainMutation(async (request: { tenantId: string }) => ({ pool, tenantId: request.tenantId }));
    class Controller {
      @Post('synthetic')
      @Atomic
      async write(request: { tenantId: string }) {
        expect(activeDomainClient(request.tenantId)).toBe(client); expect(activeDomainClient('other-tenant')).toBeUndefined();
        return 'saved';
      }
    }
    expect(await new Controller().write({ tenantId: 'synthetic-tenant' })).toBe('saved');
    expect(Reflect.getMetadata('path', Controller.prototype.write)).toBe('synthetic');
    expect(vi.mocked(client.query).mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledOnce(); expect(activeDomainClient('synthetic-tenant')).toBeUndefined();
  });
  it('rolls back a failed audit and releases the client without leaking scope', async () => {
    const { pool, client } = fakePool();
    const Atomic = atomicDomainMutation(async () => ({ pool, tenantId: 'synthetic' }));
    class Controller { @Atomic async write() { throw new Error('Synthetic audit failure'); } }
    await expect(new Controller().write()).rejects.toThrow('Synthetic audit failure');
    expect(vi.mocked(client.query).mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledOnce(); expect(activeDomainClient('synthetic')).toBeUndefined();
  });
  it('joins an existing client instead of issuing nested BEGIN or COMMIT', async () => {
    const { client } = fakePool();
    await expect(domainTransaction(client, async (current) => { expect(current).toBe(client); return 'joined'; })).resolves.toBe('joined');
    expect(client.query).not.toHaveBeenCalled(); expect(client.release).not.toHaveBeenCalled();
  });
  it.each(['personal-ministries-service', 'womens-ministry-service', 'department-operations-service'])('%s covers every declared write route', async (service) => {
    const source = await readFile(new URL(`../../services/${service}/src/main.ts`, import.meta.url), 'utf8');
    const mutations = source.match(/@(Post|Patch|Delete)\([^\n]+\)\r?\n/g) ?? [];
    const atomic = source.match(/@(Post|Patch|Delete)\([^\n]+\)\r?\n\s+@AtomicWrite/g) ?? [];
    expect(mutations.length).toBe(service === 'womens-ministry-service' ? 11 : service === 'department-operations-service' ? 17 : 16);
    expect(atomic.length).toBe(mutations.length);
  });
});
