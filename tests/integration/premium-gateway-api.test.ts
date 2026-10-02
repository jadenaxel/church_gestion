import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_GATEWAY_API_TESTS === '1' ? describe : describe.skip;
let fixture: SyntheticTenantFixture;
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const probe = (token: string) => fetch('http://127.0.0.1:4000/api/v1/synthetic-rate-limit-probe', { headers: { origin, cookie: `gc_session=${token}` }, signal: AbortSignal.timeout(5_000) });
live('gateway bounded rate-limit failure remains browser-readable', () => {
  beforeAll(async () => {
    expect((await fetch('http://127.0.0.1:4000/health/ready', { signal: AbortSignal.timeout(5_000) })).ok).toBe(true);
    fixture = await createTenantFixture({ backgroundWork: false });
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);
  it('keeps 240/session protection, decorates 429 with CORS, and leaves another session usable', async () => {
    let first = await probe(fixture.users.admin.token);
    const reset = Number(first.headers.get('ratelimit-reset'));
    // Avoid a boundary race without changing the configured security limit.
    if (reset <= 6) {
      await new Promise((resolve) => setTimeout(resolve, (reset + 1) * 1000));
      first = await probe(fixture.users.admin.token);
    }
    expect(first.status).toBe(404); expect(Number(first.headers.get('ratelimit-limit'))).toBe(240);
    const remaining = Number(first.headers.get('ratelimit-remaining'));
    expect(remaining).toBeGreaterThan(0); expect(remaining).toBeLessThanOrEqual(239);
    const responses: Response[] = [];
    for (let sent = 0; sent <= remaining; sent += 16) responses.push(...await Promise.all(Array.from({ length: Math.min(16, remaining + 1 - sent) }, () => probe(fixture.users.admin.token))));
    const rejected = responses.find((response) => response.status === 429);
    expect(rejected, 'The owned session must hit the unchanged 240 request cap').toBeDefined();
    expect(rejected!.headers.get('access-control-allow-origin')).toBe(origin);
    expect(rejected!.headers.get('access-control-allow-credentials')).toBe('true');
    expect(rejected!.headers.get('access-control-expose-headers')).toContain('retry-after');
    expect(rejected!.headers.get('content-type')).toContain('application/problem+json');
    expect(Number(rejected!.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(Number(rejected!.headers.get('retry-after'))).toBeLessThanOrEqual(60);
    expect((await rejected!.json()).code).toBe('RATE_LIMITED');
    expect((await probe(fixture.users.leader.token)).status).toBe(404);
  }, 30_000);
});
