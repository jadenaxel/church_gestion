import { matchesSecret } from '../../../packages/platform/src/security.js';

export type NominationsConnectorOperation = 'authorize' | 'redeem' | 'organization';

const operationPaths: Readonly<Record<string, NominationsConnectorOperation>> = Object.freeze({
  '/integrations/nominations/authorize': 'authorize',
  '/integrations/nominations/redeem': 'redeem',
  '/integrations/nominations/organization': 'organization',
});

export interface NominationsConnectorBudget {
  readonly aggregate: number;
  readonly operations: Readonly<Record<NominationsConnectorOperation, number>>;
}

const defaults: NominationsConnectorBudget = Object.freeze({
  aggregate: 2400,
  operations: Object.freeze({ authorize: 2160, redeem: 120, organization: 120 }),
});

/** These are deployment limits, not client-supplied fields or capacity promises. */
export function parseNominationsConnectorBudget(
  env: Readonly<Record<string, string | undefined>>,
): NominationsConnectorBudget {
  const parse = (name: string, fallback: number, minimum: number) => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    if (!/^[1-9]\d*$/u.test(raw)) throw new Error(`Invalid bounded connector rate configuration: ${name}`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > 60_000) {
      throw new Error(`Invalid bounded connector rate configuration: ${name}`);
    }
    return value;
  };
  const aggregate = parse('NOMINATIONS_SERVICE_RATE_LIMIT_PER_MINUTE', defaults.aggregate, 3);
  const operations = {
    authorize: parse('NOMINATIONS_AUTHORIZE_RATE_LIMIT_PER_MINUTE', defaults.operations.authorize, 1),
    redeem: parse('NOMINATIONS_REDEEM_RATE_LIMIT_PER_MINUTE', defaults.operations.redeem, 1),
    organization: parse('NOMINATIONS_ORGANIZATION_RATE_LIMIT_PER_MINUTE', defaults.operations.organization, 1),
  };
  if (Object.values(operations).some((limit) => limit > aggregate)
    || Object.values(operations).reduce((sum, limit) => sum + limit, 0) > aggregate) {
    throw new Error('Connector operation limits must fit within the aggregate budget');
  }
  return Object.freeze({ aggregate, operations: Object.freeze(operations) });
}

export function authenticatedNominationsConnectorOperation(
  request: {
    readonly method: string;
    readonly path: string;
    readonly originalUrl?: string;
    readonly secretHeader: unknown;
    readonly rawHeaders?: readonly string[];
  },
  configuredSecret: string | undefined,
): NominationsConnectorOperation | null {
  if (request.method !== 'POST' || !configuredSecret || configuredSecret.length < 32
    || typeof request.secretHeader !== 'string'
    || request.path.includes('?') || request.path.includes('#')
    || request.originalUrl?.includes('?') || request.originalUrl?.includes('#')) return null;
  const operation = Object.hasOwn(operationPaths, request.path) ? operationPaths[request.path] : undefined;
  if (!operation) return null;
  if (request.rawHeaders) {
    let matchingHeaders = 0;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (request.rawHeaders[index]?.toLowerCase() === 'x-integration-secret') matchingHeaders += 1;
    }
    if (matchingHeaders !== 1) return null;
  }
  return matchesSecret(request.secretHeader, configuredSecret) ? operation : null;
}

interface LocalRateStore {
  increment(key: string, expiresAt: number, now?: number): number;
}
interface RedisRateStore {
  readonly isReady: boolean;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}
export interface ConnectorAdmission {
  readonly allowed: boolean;
  readonly scope: 'operation' | 'aggregate';
  readonly limit: number;
  readonly remaining: number;
  readonly resetSeconds: number;
}

/** Fixed namespaces only; authorization/source state is never cached here. */
export async function consumeNominationsConnectorBudget(input: {
  readonly operation: NominationsConnectorOperation;
  readonly budget: NominationsConnectorBudget;
  readonly localRates: LocalRateStore;
  readonly redis: RedisRateStore | null;
  readonly now?: number;
}): Promise<ConnectorAdmission> {
  const now = input.now ?? Date.now();
  const window = Math.floor(now / 60_000);
  const expiresAt = (window + 1) * 60_000;
  const resetSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  const count = async (suffix: string): Promise<number> => {
    const key = `gc:rate:connector:nominations:${suffix}:${window}`;
    // Local consumption happens even with healthy Redis. An outage cannot reset
    // this process's admitted traffic or expose an unlimited fallback.
    const localCount = input.localRates.increment(key, expiresAt, now);
    try {
      if (input.redis?.isReady) {
        const distributedCount = await input.redis.incr(key);
        if (!Number.isSafeInteger(distributedCount) || distributedCount < 1) throw new Error('Invalid distributed rate count');
        if (distributedCount === 1) await input.redis.expire(key, 61);
        return Math.max(localCount, distributedCount);
      }
    } catch { /* Retain the locally counted budget during distributed failure. */ }
    return localCount;
  };
  const operationLimit = input.budget.operations[input.operation];
  const operationCount = await count(`operation:${input.operation}`);
  if (operationCount > operationLimit) {
    // Do not let an over-limit introspection flood consume the reserved redeem
    // budget: operation admission precedes aggregate consumption.
    return { allowed: false, scope: 'operation', limit: operationLimit, remaining: 0, resetSeconds };
  }
  const aggregateCount = await count('aggregate');
  if (aggregateCount > input.budget.aggregate) {
    return { allowed: false, scope: 'aggregate', limit: input.budget.aggregate, remaining: 0, resetSeconds };
  }
  const operationRemaining = operationLimit - operationCount;
  const aggregateRemaining = input.budget.aggregate - aggregateCount;
  return operationRemaining <= aggregateRemaining
    ? { allowed: true, scope: 'operation', limit: operationLimit, remaining: operationRemaining, resetSeconds }
    : { allowed: true, scope: 'aggregate', limit: input.budget.aggregate, remaining: aggregateRemaining, resetSeconds };
}
