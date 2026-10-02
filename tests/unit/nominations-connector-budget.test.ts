import { describe, expect, it, vi } from 'vitest';
import { LocalRateCounter } from '../../packages/platform/src/security.js';
import { authenticatedNominationsConnectorOperation, consumeNominationsConnectorBudget, parseNominationsConnectorBudget } from '../../services/api-gateway/src/nominations-connector-budget.js';

const fixtureSecret = 'synthetic-connector-budget-fixture-' + 'A'.repeat(32);
const now = Date.UTC(2026, 9, 2, 16, 0, 0) + 1;
const validRequest = {
  method: 'POST', path: '/integrations/nominations/authorize',
  originalUrl: '/api/v1/integrations/nominations/authorize',
  secretHeader: fixtureSecret, rawHeaders: ['X-Integration-Secret', fixtureSecret],
};

describe('bounded nominations connector configuration', () => {
  it('reserves defaults within the fixed aggregate and does not mutate environment', () => {
    const env = {};
    const parsed = parseNominationsConnectorBudget(env);
    expect(parsed).toEqual({ aggregate: 2400, operations: { authorize: 2160, redeem: 120, organization: 120 } });
    expect(Object.values(parsed.operations).reduce((sum, limit) => sum + limit, 0)).toBe(parsed.aggregate);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.operations)).toBe(true);
    expect(env).toEqual({});
  });
  it('accepts only bounded positive integers with operation totals fitting the aggregate', () => {
    expect(parseNominationsConnectorBudget({ NOMINATIONS_SERVICE_RATE_LIMIT_PER_MINUTE: '3',
      NOMINATIONS_AUTHORIZE_RATE_LIMIT_PER_MINUTE: '1', NOMINATIONS_REDEEM_RATE_LIMIT_PER_MINUTE: '1',
      NOMINATIONS_ORGANIZATION_RATE_LIMIT_PER_MINUTE: '1' })).toEqual({ aggregate: 3, operations: { authorize: 1, redeem: 1, organization: 1 } });
  });
  it.each(['NaN', 'Infinity', '0', '-1', '3.5', '60001', '2400x', ' 2400', '1', '2', '99999999999999999'])('fails closed for invalid aggregate %s', (raw) => {
    expect(() => parseNominationsConnectorBudget({ NOMINATIONS_SERVICE_RATE_LIMIT_PER_MINUTE: raw })).toThrow(/bounded connector/);
  });
  it.each(['NaN', 'Infinity', '0', '-1', '60001', '1.5', ' 120'])('fails closed for invalid operation %s', (raw) => {
    expect(() => parseNominationsConnectorBudget({ NOMINATIONS_REDEEM_RATE_LIMIT_PER_MINUTE: raw })).toThrow(/bounded connector/);
  });
  it('rejects an operation beyond the aggregate or combined caps exceeding the aggregate', () => {
    expect(() => parseNominationsConnectorBudget({ NOMINATIONS_AUTHORIZE_RATE_LIMIT_PER_MINUTE: '2401' })).toThrow(/fit within/);
    expect(() => parseNominationsConnectorBudget({ NOMINATIONS_AUTHORIZE_RATE_LIMIT_PER_MINUTE: '2200' })).toThrow(/fit within/);
  });
});

describe('authenticated fixed connector classification', () => {
  it.each(['authorize', 'redeem', 'organization'] as const)('accepts authenticated POST only at exact %s route', (operation) => {
    expect(authenticatedNominationsConnectorOperation({ ...validRequest,
      path: `/integrations/nominations/${operation}`, originalUrl: `/api/v1/integrations/nominations/${operation}` }, fixtureSecret)).toBe(operation);
  });
  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'post'])('does not classify method %s as machine traffic', (method) => {
    expect(authenticatedNominationsConnectorOperation({ ...validRequest, method }, fixtureSecret)).toBeNull();
  });
  it.each(['/integrations/nominations/launch', '/integrations/nominations/authorize/',
    '/integrations/nominations/authorize-extra', '/api/v1/integrations/nominations/authorize',
    '/other/integrations/nominations/authorize', '/integrations/nominations/authorize?tenant=arbitrary',
    '/integrations/nominations/authorize#fragment', '/integrations/nominations/Authorize', '__proto__', 'constructor'])('does not classify non-exact route %s', (path) => {
    expect(authenticatedNominationsConnectorOperation({ ...validRequest, path }, fixtureSecret)).toBeNull();
  });
  it.each([undefined, '', 'incorrect', [fixtureSecret], [fixtureSecret, fixtureSecret], `${fixtureSecret}, ${fixtureSecret}`])('rejects missing, forged or multiple secret headers', (secretHeader) => {
    expect(authenticatedNominationsConnectorOperation({ ...validRequest, secretHeader }, fixtureSecret)).toBeNull();
  });
  it('rejects unconfigured/short connector credentials, duplicates and any query without parsing user data', () => {
    expect(authenticatedNominationsConnectorOperation(validRequest, undefined)).toBeNull();
    expect(authenticatedNominationsConnectorOperation({ ...validRequest, secretHeader: 'short' }, 'short')).toBeNull();
    expect(authenticatedNominationsConnectorOperation({ ...validRequest, rawHeaders: [] }, fixtureSecret)).toBeNull();
    expect(authenticatedNominationsConnectorOperation({ ...validRequest,
      rawHeaders: [...validRequest.rawHeaders, 'x-integration-secret', fixtureSecret] }, fixtureSecret)).toBeNull();
    expect(authenticatedNominationsConnectorOperation({ ...validRequest,
      originalUrl: `${validRequest.originalUrl}?anything=1` }, fixtureSecret)).toBeNull();
  });
});

describe('operation-first bounded machine admission', () => {
  it('rejects an authorize flood without consuming the 120 redeem and organization reservations', async () => {
    const budget = parseNominationsConnectorBudget({});
    const localRates = new LocalRateCounter(16);
    const increment = vi.spyOn(localRates, 'increment');
    for (let index = 0; index < 2200; index += 1) {
      const result = await consumeNominationsConnectorBudget({ operation: 'authorize', budget, localRates, redis: null, now });
      expect(result.allowed).toBe(index < 2160);
    }
    expect(increment.mock.calls.filter(([key]) => key.includes(':aggregate:'))).toHaveLength(2160);
    for (const operation of ['redeem', 'organization'] as const) {
      for (let index = 0; index < 120; index += 1) {
        expect((await consumeNominationsConnectorBudget({ operation, budget, localRates, redis: null, now })).allowed).toBe(true);
      }
      expect((await consumeNominationsConnectorBudget({ operation, budget, localRates, redis: null, now })).allowed).toBe(false);
    }
    expect(increment.mock.calls.filter(([key]) => key.includes(':aggregate:'))).toHaveLength(2400);
    const keys = new Set(increment.mock.calls.map(([key]) => key));
    expect(keys.size).toBe(4);
    for (const key of keys) expect(key).toMatch(/^gc:rate:connector:nominations:(?:aggregate|operation:(?:authorize|redeem|organization)):\d+$/u);
    expect([...keys].join('')).not.toContain(fixtureSecret);
  });
  it('rejects a exhausted distributed aggregate even with a freshly available operation budget', async () => {
    const budget = parseNominationsConnectorBudget({});
    const redis = { isReady: true, incr: vi.fn(async (key: string) => key.includes(':aggregate:') ? 2401 : 1), expire: vi.fn().mockResolvedValue(1) };
    for (const operation of ['authorize', 'redeem', 'organization'] as const) {
      const result = await consumeNominationsConnectorBudget({ operation, budget, localRates: new LocalRateCounter(16), redis, now });
      expect(result).toMatchObject({ allowed: false, scope: 'aggregate', limit: 2400, remaining: 0 });
    }
  });
  it('retains local counts through a healthy Redis to offline and failed-increment transition', async () => {
    const budget = parseNominationsConnectorBudget({ NOMINATIONS_SERVICE_RATE_LIMIT_PER_MINUTE: '4',
      NOMINATIONS_AUTHORIZE_RATE_LIMIT_PER_MINUTE: '2', NOMINATIONS_REDEEM_RATE_LIMIT_PER_MINUTE: '1',
      NOMINATIONS_ORGANIZATION_RATE_LIMIT_PER_MINUTE: '1' });
    const counts = new Map<string, number>();
    const redis = { isReady: true, incr: vi.fn(async (key: string) => { const value = (counts.get(key) ?? 0) + 1; counts.set(key, value); return value; }), expire: vi.fn().mockResolvedValue(1) };
    const localRates = new LocalRateCounter(16);
    const consume = () => consumeNominationsConnectorBudget({ operation: 'authorize', budget, localRates, redis, now });
    expect((await consume()).allowed).toBe(true);
    expect(redis.expire).toHaveBeenCalledTimes(2);
    expect(redis.expire.mock.calls.every(([, ttl]) => ttl === 61)).toBe(true);
    redis.isReady = false;
    expect((await consume()).allowed).toBe(true);
    expect((await consume()).allowed).toBe(false);
    redis.isReady = true;
    redis.incr.mockRejectedValue(new Error('synthetic distributed failure'));
    expect((await consume()).allowed).toBe(false);
    expect([...counts.keys()].every((key) => !key.includes('ip:') && !key.includes(fixtureSecret))).toBe(true);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0])('uses bounded local admission for invalid distributed count %s', async (value) => {
    const budget = parseNominationsConnectorBudget({ NOMINATIONS_SERVICE_RATE_LIMIT_PER_MINUTE: '3',
      NOMINATIONS_AUTHORIZE_RATE_LIMIT_PER_MINUTE: '1', NOMINATIONS_REDEEM_RATE_LIMIT_PER_MINUTE: '1',
      NOMINATIONS_ORGANIZATION_RATE_LIMIT_PER_MINUTE: '1' });
    const redis = { isReady: true, incr: vi.fn().mockResolvedValue(value), expire: vi.fn().mockResolvedValue(1) };
    const localRates = new LocalRateCounter(16);
    expect((await consumeNominationsConnectorBudget({ operation: 'authorize', budget, localRates, redis, now })).allowed).toBe(true);
    expect((await consumeNominationsConnectorBudget({ operation: 'authorize', budget, localRates, redis, now })).allowed).toBe(false);
  });
  it('keeps admission bounded when expiry fails and renews only at a real server window boundary', async () => {
    const budget = parseNominationsConnectorBudget({ NOMINATIONS_SERVICE_RATE_LIMIT_PER_MINUTE: '3',
      NOMINATIONS_AUTHORIZE_RATE_LIMIT_PER_MINUTE: '1', NOMINATIONS_REDEEM_RATE_LIMIT_PER_MINUTE: '1',
      NOMINATIONS_ORGANIZATION_RATE_LIMIT_PER_MINUTE: '1' });
    const redis = { isReady: true, incr: vi.fn().mockResolvedValue(1), expire: vi.fn().mockRejectedValue(new Error('synthetic expiry failure')) };
    const localRates = new LocalRateCounter(16);
    const consume = (at: number) => consumeNominationsConnectorBudget({ operation: 'redeem', budget, localRates, redis, now: at });
    expect((await consume(now)).allowed).toBe(true);
    expect((await consume(now)).allowed).toBe(false);
    expect((await consume(now + 60_000)).allowed).toBe(true);
  });
});
