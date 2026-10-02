import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Pool, type PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notificationEventHash, processInbox } from '../../services/notification-service/src/reliability.js';
import { dispatchPasswordResets, listPasswordResetDeadLetters, requestPasswordReset, retryPasswordReset, type ResetEvent } from '../../services/identity-service/src/password-reset-outbox.js';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_PASSWORD_RESET_DB_TESTS === '1' ? describe : describe.skip;
const runFile = promisify(execFile);
let fixture: SyntheticTenantFixture, identityPool: Pool;
const configKey = randomBytes(48).toString('base64url');
const env = { NODE_ENV: 'test', CONFIG_ENCRYPTION_KEY: configKey, WEB_ORIGIN: 'http://localhost:3000' };
const reason = 'Synthetic operator confirms service recovery';
let receiver: Server | undefined;
let databaseUrl: string;

async function reset() { const value = await requestPasswordReset(identityPool, fixture, fixture.users.admin.email, env); if (!value) throw new Error('Synthetic reset not created'); return value; }
async function failAudit(action: string) {
  if (!/^[a-z_.]+$/.test(action)) throw new Error('Invalid synthetic action');
  await fixture.pool.query(`CREATE OR REPLACE FUNCTION audit.fixture_reset_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'Synthetic audit rejection'; END IF; RETURN NEW; END $$`);
  await fixture.pool.query('CREATE TRIGGER fixture_reset_failure BEFORE INSERT ON audit.audit_events FOR EACH ROW EXECUTE FUNCTION audit.fixture_reset_failure()');
}
async function due(id: string) { await fixture.pool.query('UPDATE identity.password_reset_outbox SET next_attempt_at=now() WHERE id=$1', [id]); }
async function exhaust(id: string) { await fixture.pool.query('UPDATE identity.password_reset_outbox SET attempts=8 WHERE id=$1', [id]); }
async function worker(endpoint: string) {
  const { stdout } = await runFile(process.execPath, ['--import', 'tsx', resolve('tests/helpers/password-reset-worker-fixture.ts')], {
    cwd: resolve('.'), windowsHide: true, timeout: 30_000, maxBuffer: 4096,
    env: { ...process.env, ...env, GC_RESET_FIXTURE_TENANT_ID: fixture.id, GC_RESET_FIXTURE_DATABASE_URL: databaseUrl, NOTIFICATION_SERVICE_URL: endpoint },
  });
  return JSON.parse(stdout.trim()) as { accepted: number; deferred: number; retired: number };
}
async function listen(work: (event: ResetEvent, serverResponse: import('node:http').ServerResponse) => Promise<void>) {
  receiver = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      await work(JSON.parse(Buffer.concat(chunks).toString('utf8')) as ResetEvent, response);
    } catch { if (!response.destroyed) { response.writeHead(503); response.end('{}'); } }
  });
  await new Promise<void>((done) => receiver!.listen(0, '127.0.0.1', done));
  const address = receiver.address(); if (!address || typeof address === 'string') throw new Error('Synthetic receiver unavailable');
  return `http://127.0.0.1:${address.port}`;
}

live('password reset durable intent: own suspended tenant, no SMTP/Meta or runtime restart', () => {
  beforeAll(async () => {
    fixture = await createTenantFixture({ backgroundWork: false });
    const url = new URL(process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres'); url.pathname = `/${fixture.database}`; databaseUrl = url.href;
    identityPool = new Pool({ connectionString: databaseUrl, options: '-c role=gc_identity_service', max: 2 });
    identityPool.on('error', () => undefined);
  }, 120_000);
  beforeEach(async () => {
    await fixture.pool.query('DELETE FROM identity.password_reset_tokens');
    await fixture.pool.query('DELETE FROM notifications.notifications');
    await fixture.pool.query('DELETE FROM notifications.inbox_events');
  });
  afterEach(async () => {
    if (receiver) { receiver.closeAllConnections(); await new Promise<void>((done) => receiver!.close(() => done())); receiver = undefined; }
    await fixture.pool.query('DROP TRIGGER IF EXISTS fixture_reset_failure ON audit.audit_events');
    await fixture.pool.query('DROP TRIGGER IF EXISTS fixture_reset_enqueue_failure ON identity.password_reset_outbox');
    await fixture.pool.query('UPDATE identity.users SET active=true WHERE id=$1', [fixture.users.admin.id]);
  });
  afterAll(async () => { await identityPool?.end(); await fixture?.destroy(); }, 120_000);

  it('commits token hash, mandatory audit and encrypted intent under the identity role only', async () => {
    const requested = await reset();
    const row = (await fixture.pool.query('SELECT o.id,o.payload_ciphertext,t.token_hash,t.expires_at=o.expires_at same_expiry FROM identity.password_reset_outbox o JOIN identity.password_reset_tokens t ON t.id=o.reset_token_id')).rows[0];
    expect(row.id).toBe(requested.eventId); expect(row.same_expiry).toBe(true);
    expect(row.token_hash === createHash('sha256').update(requested.token).digest('hex')).toBe(true);
    expect(row.payload_ciphertext.includes(requested.token) || row.payload_ciphertext.includes(fixture.users.admin.email)).toBe(false);
    expect((await fixture.pool.query("SELECT 1 FROM audit.audit_events WHERE action='auth.password_reset.requested' AND after_data->>'notificationIntentId'=$1", [requested.eventId])).rowCount).toBe(1);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM notifications.notifications')).rows[0].count).toBe(0);
  });
  it('leaves unknown and inactive accounts without a token or intent', async () => {
    expect(await requestPasswordReset(identityPool, fixture, 'missing@premium.example', env)).toBeNull();
    await fixture.pool.query('UPDATE identity.users SET active=false WHERE id=$1', [fixture.users.admin.id]);
    expect(await requestPasswordReset(identityPool, fixture, fixture.users.admin.email, env)).toBeNull();
    expect((await fixture.pool.query('SELECT count(*)::int count FROM identity.password_reset_outbox')).rows[0].count).toBe(0);
  });
  it('audit failure rolls back token and intent without any transport', async () => {
    await failAudit('auth.password_reset.requested');
    await expect(reset()).rejects.toThrow('Synthetic audit rejection');
    expect((await fixture.pool.query('SELECT count(*)::int count FROM identity.password_reset_tokens')).rows[0].count).toBe(0);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM identity.password_reset_outbox')).rows[0].count).toBe(0);
  });
  it('enqueue failure also rolls back the token and has no success audit', async () => {
    const before = (await fixture.pool.query("SELECT count(*)::int count FROM audit.audit_events WHERE action='auth.password_reset.requested'")).rows[0].count;
    await fixture.pool.query("CREATE FUNCTION identity.fixture_reset_enqueue_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic enqueue rejection'; END $$");
    await fixture.pool.query('CREATE TRIGGER fixture_reset_enqueue_failure BEFORE INSERT ON identity.password_reset_outbox FOR EACH ROW EXECUTE FUNCTION identity.fixture_reset_enqueue_failure()');
    await expect(reset()).rejects.toThrow('Synthetic enqueue rejection');
    expect((await fixture.pool.query('SELECT count(*)::int count FROM identity.password_reset_tokens')).rows[0].count).toBe(0);
    expect((await fixture.pool.query("SELECT count(*)::int count FROM audit.audit_events WHERE action='auth.password_reset.requested'")).rows[0].count).toBe(before);
  });
  it('keeps committed token and intent recoverable when the COMMIT acknowledgement is lost', async () => {
    const uncertainPool = { connect: (callback: (error: Error | undefined, client?: PoolClient) => void) => {
      identityPool.connect((error, acquired) => {
        if (error || !acquired) { callback(error ?? new Error('Synthetic acquisition failed')); return; }
        // Do not mutate the actual pooled client; all ownership/error listeners
        // and release calls still bind to it, with one COMMIT ACK intercepted.
        const proxy = new Proxy(acquired, { get(target, property) {
          if (property === 'query') return async (sql: string, values?: unknown[]) => { const result = await target.query(sql, values); if (sql === 'COMMIT') throw new Error('Synthetic lost COMMIT acknowledgement'); return result; };
          const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
        } });
        callback(undefined, proxy);
      });
    } } as unknown as Pool;
    await expect(requestPasswordReset(uncertainPool, fixture, fixture.users.admin.email, env)).rejects.toThrow('Synthetic lost COMMIT acknowledgement');
    expect((await fixture.pool.query('SELECT count(*)::int count FROM identity.password_reset_tokens')).rows[0].count).toBe(1);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM identity.password_reset_outbox')).rows[0].count).toBe(1);
    expect((await dispatchPasswordResets(identityPool, fixture.id, async () => undefined, env)).accepted).toBe(1);
  });
  it('survives a no-provider HTTP503 and a real worker subprocess restart using the persisted ID', async () => {
    const requested = await reset(); let accepting = false; const ids: string[] = [];
    const endpoint = await listen(async (event, response) => { ids.push(event.id); response.writeHead(accepting ? 201 : 503); response.end('{}'); });
    expect(await worker(endpoint)).toEqual({ accepted: 0, deferred: 1, retired: 0 });
    expect((await fixture.pool.query('SELECT attempts,accepted_at,payload_ciphertext IS NOT NULL retained FROM identity.password_reset_outbox WHERE id=$1', [requested.eventId])).rows[0]).toEqual({ attempts: 1, accepted_at: null, retained: true });
    await due(requested.eventId); accepting = true;
    expect(await worker(endpoint)).toEqual({ accepted: 1, deferred: 0, retired: 0 });
    expect(ids).toEqual([requested.eventId, requested.eventId]);
    expect((await fixture.pool.query('SELECT payload_ciphertext IS NULL scrubbed FROM identity.password_reset_outbox WHERE id=$1', [requested.eventId])).rows[0].scrubbed).toBe(true);
  }, 60_000);
  it('replays lost acknowledgement after inbox COMMIT without a second notification', async () => {
    const requested = await reset(); let loseAck = true;
    const endpoint = await listen(async (event, response) => {
      await processInbox(fixture.pool, event, notificationEventHash(event), async (client) => {
        await client.query("INSERT INTO notifications.notifications(event_id,user_id,title,body,event_type) VALUES($1,$2,'Synthetic reset','Synthetic receipt',$3)", [event.id, event.aggregateId, event.type]); return { accepted: true };
      });
      if (loseAck) response.destroy(); else { response.writeHead(201); response.end('{}'); }
    });
    expect(await worker(endpoint)).toEqual({ accepted: 0, deferred: 1, retired: 0 });
    await due(requested.eventId); loseAck = false;
    expect(await worker(endpoint)).toEqual({ accepted: 1, deferred: 0, retired: 0 });
    expect((await fixture.pool.query('SELECT count(*)::int count FROM notifications.notifications WHERE event_id=$1', [requested.eventId])).rows[0].count).toBe(1);
  }, 60_000);
  it('claims concurrent dispatchers once', async () => {
    await reset(); let sends = 0;
    await Promise.all([dispatchPasswordResets(identityPool, fixture.id, async () => { sends++; }, env), dispatchPasswordResets(identityPool, fixture.id, async () => { sends++; }, env)]);
    expect(sends).toBe(1);
  });
  it('recovers a crashed lease and fences the older acknowledgement', async () => {
    const requested = await reset(); let start!: () => void, release!: () => void;
    const started = new Promise<void>((done) => { start = done; }), held = new Promise<void>((done) => { release = done; });
    const first = dispatchPasswordResets(identityPool, fixture.id, async () => { start(); await held; }, env);
    await started;
    await fixture.pool.query("UPDATE identity.password_reset_outbox SET lease_until=now()-interval '1 second' WHERE id=$1", [requested.eventId]);
    expect((await dispatchPasswordResets(identityPool, fixture.id, async () => undefined, env)).accepted).toBe(1);
    release(); expect((await first).accepted).toBe(0);
    expect((await fixture.pool.query('SELECT attempts FROM identity.password_reset_outbox WHERE id=$1', [requested.eventId])).rows[0].attempts).toBe(2);
  });
  it('bounds automatic attempts at eight and exposes only safe exhausted metadata', async () => {
    const requested = await reset(); let sends = 0;
    for (let count = 0; count < 9; count++) { await due(requested.eventId); await dispatchPasswordResets(identityPool, fixture.id, async () => { sends++; throw new Error('offline'); }, env); }
    expect(sends).toBe(8);
    const item = (await listPasswordResetDeadLetters(identityPool)).items[0];
    expect(Object.keys(item).sort()).toEqual(['aggregateId', 'attempts', 'createdAt', 'eventType', 'expiresAt', 'id', 'lastError', 'retryable'].sort());
    expect(item.attempts).toBe(8); expect(item.retryable).toBe(true);
    expect(JSON.stringify(item).includes(requested.token) || JSON.stringify(item).includes(fixture.users.admin.email)).toBe(false);
  });
  it.each(['TOKEN_EXPIRED', 'TOKEN_USED', 'ACCOUNT_INACTIVE'])('retires and scrubs %s without sending; recovery remains unavailable', async (mode) => {
    const requested = await reset(); await exhaust(requested.eventId);
    if (mode === 'TOKEN_EXPIRED') await fixture.pool.query("UPDATE identity.password_reset_tokens SET expires_at=now()-interval '1 second'");
    if (mode === 'TOKEN_USED') await fixture.pool.query('UPDATE identity.password_reset_tokens SET used_at=now()');
    if (mode === 'ACCOUNT_INACTIVE') await fixture.pool.query('UPDATE identity.users SET active=false WHERE id=$1', [fixture.users.admin.id]);
    const beforeWorker = (await listPasswordResetDeadLetters(identityPool)).items[0]; expect(beforeWorker.retryable).toBe(false); expect(beforeWorker.lastError).toBe(mode);
    if (mode === 'TOKEN_EXPIRED') expect(new Date(beforeWorker.expiresAt).getTime() < Date.now()).toBe(true);
    await expect(retryPasswordReset(identityPool, requested.eventId, fixture.users.admin.id, reason)).rejects.toMatchObject({ status: 409 });
    let sends = 0; expect((await dispatchPasswordResets(identityPool, fixture.id, async () => { sends++; }, env)).retired).toBe(1); expect(sends).toBe(0);
    const item = (await listPasswordResetDeadLetters(identityPool)).items[0]; expect(item.retryable).toBe(false); expect(item.lastError).toBe(mode);
    expect((await fixture.pool.query('SELECT payload_ciphertext IS NULL scrubbed FROM identity.password_reset_outbox')).rows[0].scrubbed).toBe(true);
    await expect(retryPasswordReset(identityPool, requested.eventId, fixture.users.admin.id, reason)).rejects.toMatchObject({ status: 409 });
  });
  it('retry audit failure preserves exhausted intent, then recovery retains the same ID', async () => {
    const requested = await reset(); await exhaust(requested.eventId); await failAudit('auth.password_reset.notification_retried');
    await expect(retryPasswordReset(identityPool, requested.eventId, fixture.users.admin.id, reason)).rejects.toThrow('Synthetic audit rejection');
    expect((await fixture.pool.query('SELECT attempts FROM identity.password_reset_outbox')).rows[0].attempts).toBe(8);
    await fixture.pool.query('DROP TRIGGER fixture_reset_failure ON audit.audit_events');
    expect(await retryPasswordReset(identityPool, requested.eventId, fixture.users.admin.id, reason)).toEqual({ id: requested.eventId, retryScheduled: true });
    expect((await fixture.pool.query("SELECT 1 FROM audit.audit_events WHERE action='auth.password_reset.notification_retried' AND resource_id=$1 AND after_data->>'reason'=$2", [requested.eventId, reason])).rowCount).toBe(1);
  });
  it('concurrent manual retries schedule exactly once, while active claims cannot be reset', async () => {
    const requested = await reset(); await exhaust(requested.eventId);
    await fixture.pool.query("UPDATE identity.password_reset_outbox SET lease_until=now()+interval '30 seconds' WHERE id=$1", [requested.eventId]);
    await expect(retryPasswordReset(identityPool, requested.eventId, fixture.users.admin.id, reason)).rejects.toMatchObject({ status: 409 });
    await fixture.pool.query('UPDATE identity.password_reset_outbox SET lease_until=NULL WHERE id=$1', [requested.eventId]);
    const outcomes = await Promise.allSettled([retryPasswordReset(identityPool, requested.eventId, fixture.users.admin.id, reason), retryPasswordReset(identityPool, requested.eventId, fixture.users.admin.id, reason)]);
    expect(outcomes.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((value) => value.status === 'rejected')).toHaveLength(1);
  });
  it('retains an intent if its encryption context is unavailable, without leaking or crediting acceptance', async () => {
    const requested = await reset(); let sends = 0;
    expect((await dispatchPasswordResets(identityPool, fixture.id, async () => { sends++; }, { ...env, CONFIG_ENCRYPTION_KEY: randomBytes(48).toString('base64url') })).deferred).toBe(1);
    expect(sends).toBe(0); expect((await fixture.pool.query('SELECT accepted_at,payload_ciphertext IS NOT NULL retained FROM identity.password_reset_outbox WHERE id=$1', [requested.eventId])).rows[0]).toEqual({ accepted_at: null, retained: true });
  });
  it('requires only the existing identity schema ACL and forbids direct delivery writes', async () => {
    const oid = (await fixture.pool.query("SELECT 'notifications.deliveries'::regclass::oid oid")).rows[0].oid;
    const access = (await identityPool.query("SELECT has_table_privilege(current_user,'identity.password_reset_outbox','INSERT') own_insert,has_table_privilege(current_user,$1::oid,'INSERT') cross_insert,has_schema_privilege(current_user,'notifications','USAGE') cross_usage", [oid])).rows[0];
    expect(access).toEqual({ own_insert: true, cross_insert: false, cross_usage: false });
  });
});
