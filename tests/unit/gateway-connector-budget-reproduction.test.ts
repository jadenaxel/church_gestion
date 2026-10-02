import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalRateCounter } from '../../packages/platform/src/security.js';
import { authenticatedNominationsConnectorOperation, consumeNominationsConnectorBudget, parseNominationsConnectorBudget } from '../../services/api-gateway/src/nominations-connector-budget.js';

type GuardResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): GuardResponse;
  type(value: string): GuardResponse;
  send(body: { status: number; code: string; detail: string }): void;
};
type Guard = (request: {
  method: string; path: string; ip: string; socket: { remoteAddress: string };
  headers: Record<string, string | string[] | undefined>; rawHeaders: readonly string[]; originalUrl: string;
}, response: GuardResponse, next: () => void) => Promise<void>;

/** Execute the actual gateway middleware, not a rewritten quota implementation.
 * Only TypeScript annotations are removed; startup/DB/proxy side effects are not
 * imported. HTTP requests below use our ephemeral loopback server exclusively. */
function isolatedCurrentGatewayGuard(env: Readonly<Record<string, string | undefined>> = {}): Guard {
  const source = readFileSync(new URL('../../services/api-gateway/src/main.ts', import.meta.url), 'utf8');
  const begin = source.indexOf("server.use('/api/v1', async (request: Request, response: Response, next: () => void) => {");
  const end = source.indexOf("server.get('/health/live'", begin);
  expect(begin).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(begin);
  const guardSource = source.slice(begin, end)
    .replace('async (request: Request, response: Response, next: () => void) =>', 'async (request, response, next) =>')
    .replace('let sessionKey: string | undefined;', 'let sessionKey;')
    .replace('let count: number;', 'let count;');
  let captured: Guard | undefined;
  runInNewContext(guardSource, {
    server: { use: (path: string, guard: Guard) => { expect(path).toBe('/api/v1'); captured = guard; } },
    process: { env }, Date, createHash,
    redis: null, localRates: new LocalRateCounter(),
    connectorLocalRates: new LocalRateCounter(16), nominationsConnectorBudget: parseNominationsConnectorBudget(env),
    authenticatedNominationsConnectorOperation, consumeNominationsConnectorBudget,
    // Exercise quota selection with synthetic invalid bearer/cookie values.
    // CSRF and application authorization are deliberately outside this isolated
    // middleware test; valid connector credentials never grant user authority.
    bearerFromRequest: (request: { headers: Record<string, string | string[] | undefined> }) => {
      const authorization = request.headers.authorization;
      if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) return authorization.slice(7);
      return request.headers.cookie ? 'synthetic-invalid-cookie' : null;
    },
    verifyAccessToken: () => { throw new Error('Unexpected browser bearer lookup'); },
  }, { timeout: 1000 });
  if (!captured) throw new Error('Actual gateway guard was not captured');
  return captured;
}

afterEach(() => vi.restoreAllMocks());

describe('isolated current gateway machine and public admission', () => {
  it('preserves the public 240/minute budget for unauthenticated connector headers and unrelated public traffic', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Math.floor(Date.now() / 60_000) * 60_000 + 1);
    const guard = isolatedCurrentGatewayGuard();
    const upstreamAccepted: string[] = [];
    const server = createServer((incoming, outgoing) => {
      const mountedPath = (incoming.url ?? '').replace(/^\/api\/v1/u, '');
      const request = {
        method: incoming.method ?? 'GET', path: mountedPath, ip: '127.0.0.1', originalUrl: incoming.url ?? '', rawHeaders: incoming.rawHeaders,
        socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-integration-secret': 'isolated-synthetic-connector-only' },
      };
      const response: GuardResponse = {
        setHeader: (name, value) => outgoing.setHeader(name, value),
        status: (code) => { outgoing.statusCode = code; return response; },
        type: (value) => { outgoing.setHeader('content-type', value); return response; },
        send: (body) => outgoing.end(JSON.stringify(body)),
      };
      void guard(request, response, () => {
        upstreamAccepted.push(mountedPath);
        outgoing.writeHead(200, { 'content-type': 'application/json' });
        outgoing.end('{"accepted":true}');
      }).catch(() => { outgoing.statusCode = 500; outgoing.end(); });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      for (let index = 0; index < 240; index += 1) {
        const path = index < 200 ? '/integrations/nominations/authorize' : '/unrelated-public';
        const response = await fetch(`${origin}/api/v1${path}`, { method: 'POST' });
        expect(response.status).toBe(200);
        await response.arrayBuffer();
      }
      const rejected = await fetch(`${origin}/api/v1/integrations/nominations/redeem`, { method: 'POST' });
      expect(rejected.status).toBe(429);
      expect(await rejected.json()).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
      expect(rejected.headers.get('retry-after')).toBeTruthy();
      expect(rejected.headers.get('ratelimit-limit')).toBe('240');
      expect(upstreamAccepted).toHaveLength(240);
      expect(upstreamAccepted).not.toContain('/integrations/nominations/redeem');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
  it('admits authenticated fixed connector traffic after the public IP budget is exhausted, preserving redeem through an authorize flood', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Math.floor(Date.now() / 60_000) * 60_000 + 1);
    const fixtureSecret = 'isolated-connector-only-' + 'A'.repeat(32);
    const guard = isolatedCurrentGatewayGuard({ NOMINATIONS_INTEGRATION_SECRET: fixtureSecret,
      NOMINATIONS_SERVICE_RATE_LIMIT_PER_MINUTE: '5', NOMINATIONS_AUTHORIZE_RATE_LIMIT_PER_MINUTE: '3',
      NOMINATIONS_REDEEM_RATE_LIMIT_PER_MINUTE: '1', NOMINATIONS_ORGANIZATION_RATE_LIMIT_PER_MINUTE: '1' });
    const server = createServer((incoming, outgoing) => {
      const request = {
        method: incoming.method ?? 'GET', path: new URL(incoming.url ?? '/', 'http://localhost').pathname.replace(/^\/api\/v1/u, ''),
        ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, originalUrl: incoming.url ?? '', rawHeaders: incoming.rawHeaders,
        headers: incoming.headers,
      };
      const response: GuardResponse = {
        setHeader: (name, value) => outgoing.setHeader(name, value),
        status: (code) => { outgoing.statusCode = code; return response; },
        type: (value) => { outgoing.setHeader('content-type', value); return response; },
        send: (body) => outgoing.end(JSON.stringify(body)),
      };
      void guard(request, response, () => { outgoing.statusCode = 200; outgoing.end('{"accepted":true}'); })
        .catch(() => { outgoing.statusCode = 500; outgoing.end(); });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = async (path: string, headers: Record<string, string> = {}) => {
      const response = await fetch(`${origin}/api/v1${path}`, { method: 'POST', headers });
      await response.arrayBuffer();
      return response;
    };
    try {
      for (let index = 0; index < 240; index += 1) expect((await post('/unrelated-public')).status).toBe(200);
      expect((await post('/unrelated-public')).status).toBe(429);
      const trustedHeaders = { 'x-integration-secret': fixtureSecret, authorization: 'Bearer invalid-browser-session', cookie: 'gc_session=invalid-browser-cookie' };
      for (let index = 0; index < 10; index += 1) {
        const response = await post('/integrations/nominations/authorize', trustedHeaders);
        expect(response.status).toBe(index < 3 ? 200 : 429);
        expect(response.headers.get('ratelimit-limit')).toBe('3');
      }
      expect((await post('/integrations/nominations/redeem', trustedHeaders)).status).toBe(200);
      expect((await post('/integrations/nominations/organization', trustedHeaders)).status).toBe(200);
      expect((await post('/integrations/nominations/redeem', trustedHeaders)).status).toBe(429);
      for (const path of ['/integrations/nominations/launch', '/integrations/nominations/authorize/',
        '/integrations/nominations/authorize?tenant=arbitrary']) expect((await post(path, trustedHeaders)).status).toBe(429);
      expect((await post('/integrations/nominations/redeem', { 'x-integration-secret': 'wrong' })).status).toBe(429);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
