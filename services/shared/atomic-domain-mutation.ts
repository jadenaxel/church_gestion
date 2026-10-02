import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '@gc/database';

const scope = new AsyncLocalStorage<{ tenantId: string; client: PoolClient }>();
export function activeDomainClient(tenantId: string): PoolClient | undefined {
  const current = scope.getStore();
  return current?.tenantId === tenantId ? current.client : undefined;
}
export async function domainTransaction<T>(pool: Pool | PoolClient, work: (client: PoolClient) => Promise<T>): Promise<T> {
  return 'release' in pool ? work(pool) : withTransaction(pool, work);
}

/** Apply below the route decorator so Nest attaches its metadata to the wrapped handler. */
export function atomicDomainMutation<RequestType>(resolve: (request: RequestType) => Promise<{ pool: Pool | PoolClient; tenantId: string }>): MethodDecorator {
  return (_target, _key, descriptor: PropertyDescriptor) => {
    const handler = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    descriptor.value = async function (request: RequestType, ...args: unknown[]) {
      const { pool, tenantId } = await resolve(request);
      return domainTransaction(pool, (client) => scope.run({ tenantId, client }, () => handler.apply(this, [request, ...args])));
    };
  };
}
