import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { requestPasswordReset } from '../../services/identity-service/src/password-reset-outbox.js';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_PASSWORD_RESET_API_TESTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:4000/api/v1', path = '/auth/password/outbox';
let church: SyntheticTenantFixture, other: SyntheticTenantFixture;
// Deliberately different from runtime config: these metadata/retry fixtures can
// never decrypt in the real worker or contact a provider. Positive delivery is
// tested separately against the owned local receiver in the DB suite.
const env = { NODE_ENV: 'test', CONFIG_ENCRYPTION_KEY: randomBytes(48).toString('base64url') };
const reason = { reason: 'Synthetic operator verifies the test service is restored' };
async function request(suffix: string, method = 'GET', body?: unknown, admin = true) {
  return fetch(`${base}${suffix}`, {
    method, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', authorization: `Bearer ${admin ? church.users.admin.token : church.users.member.token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25_000),
  });
}
async function intent(fixture = church) {
  const queued = await requestPasswordReset(fixture.pool, fixture, fixture.users.admin.email, env);
  if (!queued) throw new Error('Synthetic intent missing');
  await fixture.pool.query('UPDATE identity.password_reset_outbox SET attempts=8 WHERE id=$1', [queued.eventId]);
  return queued.eventId;
}
async function failAudit(action: 'auth.password_reset.requested' | 'auth.password_reset.notification_retried') {
  await church.pool.query(`CREATE OR REPLACE FUNCTION audit.fixture_reset_api_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'Synthetic reset audit rejection'; END IF; RETURN NEW; END $$`);
  await church.pool.query('CREATE TRIGGER fixture_reset_api_failure BEFORE INSERT ON audit.audit_events FOR EACH ROW EXECUTE FUNCTION audit.fixture_reset_api_failure()');
}

live('identity password reset outbox protected HTTP, owned synthetic tenants only', () => {
  beforeAll(async () => {
    expect((await fetch('http://127.0.0.1:4000/health/ready')).ok).toBe(true);
    church = await createTenantFixture(); other = await createTenantFixture({ backgroundWork: false });
    await church.pool.query('INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled) SELECT id,false,false FROM identity.users');
  }, 120_000);
  beforeEach(async () => { await church.pool.query('DELETE FROM identity.password_reset_tokens'); });
  afterEach(async () => { await church.pool.query('DROP TRIGGER IF EXISTS fixture_reset_api_failure ON audit.audit_events'); });
  afterAll(async () => { await other?.destroy(); await church?.destroy(); }, 120_000);

  it('refuses metadata and retry to nonadministrators under the existing permission', async () => {
    const id = await intent();
    expect((await request(`${path}/dead-letter`, 'GET', undefined, false)).status).toBe(403);
    expect((await request(`${path}/${id}/retry`, 'POST', reason, false)).status).toBe(403);
    expect((await church.pool.query('SELECT attempts FROM identity.password_reset_outbox WHERE id=$1', [id])).rows[0].attempts).toBe(8);
  });
  it('returns a closed metadata shape without recipient, link, token or ciphertext', async () => {
    const id = await intent(); const response = await request(`${path}/dead-letter`); expect(response.status).toBe(200);
    const item = (await response.json() as { items: Array<Record<string, unknown>> }).items.find((row) => row.id === id)!;
    expect(Object.keys(item).sort()).toEqual(['aggregateId', 'attempts', 'createdAt', 'eventType', 'expiresAt', 'id', 'lastError', 'retryable'].sort());
    expect(item.retryable).toBe(true); expect(item.lastError).toBeNull();
    expect(JSON.stringify(item).includes(church.users.admin.email)).toBe(false);
  });
  it('does not list or recover another owned tenant intent', async () => {
    const id = await intent(other); expect((await request(`${path}/${id}/retry`, 'POST', reason)).status).toBe(404);
    const response = await request(`${path}/dead-letter`); const data = await response.json() as { items: Array<{ id: string }> };
    expect(data.items.some((row) => row.id === id)).toBe(false);
    expect((await other.pool.query('SELECT attempts FROM identity.password_reset_outbox WHERE id=$1', [id])).rows[0].attempts).toBe(8);
  });
  it('shows current expiration before the next worker pass and rejects its resend', async () => {
    const id = await intent(); await church.pool.query("UPDATE identity.password_reset_tokens SET expires_at=now()-interval '1 second'");
    const item = (await (await request(`${path}/dead-letter`)).json() as { items: Array<{ id: string; retryable: boolean; lastError: string }> }).items.find((row) => row.id === id)!;
    expect(item.retryable).toBe(false); expect(item.lastError).toBe('TOKEN_EXPIRED');
    expect((await request(`${path}/${id}/retry`, 'POST', reason)).status).toBe(409);
  });
  it('rejects used, accepted and still-automatically-retryable intents', async () => {
    const id = await intent(); await church.pool.query('UPDATE identity.password_reset_tokens SET used_at=now()');
    expect((await request(`${path}/${id}/retry`, 'POST', reason)).status).toBe(409);
    await church.pool.query('UPDATE identity.password_reset_tokens SET used_at=NULL');
    await church.pool.query('UPDATE identity.password_reset_outbox SET accepted_at=now(),payload_ciphertext=NULL WHERE id=$1', [id]);
    expect((await request(`${path}/${id}/retry`, 'POST', reason)).status).toBe(409);
    await church.pool.query('DELETE FROM identity.password_reset_tokens'); const next = await intent();
    await church.pool.query('UPDATE identity.password_reset_outbox SET attempts=1 WHERE id=$1', [next]);
    expect((await request(`${path}/${next}/retry`, 'POST', reason)).status).toBe(409);
  });
  it('audit failure rolls back retry; subsequent concurrent retry succeeds once using the same ID', async () => {
    const id = await intent(); await failAudit('auth.password_reset.notification_retried');
    expect((await request(`${path}/${id}/retry`, 'POST', reason)).status).toBe(500);
    expect((await church.pool.query('SELECT attempts FROM identity.password_reset_outbox WHERE id=$1', [id])).rows[0].attempts).toBe(8);
    await church.pool.query('DROP TRIGGER fixture_reset_api_failure ON audit.audit_events');
    const responses = await Promise.all([request(`${path}/${id}/retry`, 'POST', reason), request(`${path}/${id}/retry`, 'POST', reason)]);
    expect(responses.map((value) => value.status).sort()).toEqual([201, 409]);
    const success = await responses.find((value) => value.status === 201)!.json() as { id: string; retryScheduled: boolean };
    expect(success.id).toBe(id); expect(success.retryScheduled).toBe(true);
    expect((await church.pool.query("SELECT count(*)::int count FROM audit.audit_events WHERE action='auth.password_reset.notification_retried' AND resource_id=$1", [id])).rows[0].count).toBe(1);
  });
  it('validates UUID/reason/extra fields and keeps missing IDs opaque', async () => {
    const id = await intent();
    expect((await request(`${path}/not-a-uuid/retry`, 'POST', reason)).status).toBe(400);
    expect((await request(`${path}/${id}/retry`, 'POST', { reason: 'short' })).status).toBe(400);
    expect((await request(`${path}/${id}/retry`, 'POST', { ...reason, force: true })).status).toBe(400);
    expect((await request(`${path}/${randomUUID()}/retry`, 'POST', reason)).status).toBe(404);
  });
  it('preserves generic forgot response when account is missing or audit refuses the durable request', async () => {
    const missing = await request('/auth/password/forgot', 'POST', { tenant: church.slug, email: 'missing@premium.example' }); expect(missing.status).toBe(201);
    const absent = await missing.json() as Record<string, unknown>; expect(absent.accepted).toBe(true); expect(Boolean(absent.developmentToken)).toBe(false);
    await failAudit('auth.password_reset.requested');
    const rejected = await request('/auth/password/forgot', 'POST', { tenant: church.slug, email: church.users.admin.email }); expect(rejected.status).toBe(201);
    const suppressed = await rejected.json() as Record<string, unknown>; expect(suppressed.accepted).toBe(true); expect(Boolean(suppressed.developmentToken)).toBe(false); expect(suppressed.message).toBe(absent.message);
    expect((await church.pool.query('SELECT count(*)::int count FROM identity.password_reset_tokens')).rows[0].count).toBe(0);
    expect((await church.pool.query('SELECT count(*)::int count FROM identity.password_reset_outbox')).rows[0].count).toBe(0);
  });
});
