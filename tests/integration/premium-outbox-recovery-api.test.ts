import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type FixtureUser, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_OUTBOX_RECOVERY_API_TESTS === '1' ? describe : describe.skip;
let fixture: SyntheticTenantFixture;
const request = (path: string, method = 'GET', body?: unknown, actor?: FixtureUser) => fetch(`http://127.0.0.1:4000/api/v1${path}`, { method, headers: { cookie: `gc_session=${(actor ?? fixture.users.admin).token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
const reason = { reason: 'Synthetic controlled recovery after local diagnosis' };
async function createEvent(attempts = 8, delivered = false) {
  return (await fixture.pool.query<{ id: string }>(`INSERT INTO calendar.outbox_events(event_type,aggregate_id,payload,attempts,delivered_at) VALUES('fixture.recovery',$1,$2::jsonb,$3,CASE WHEN $4 THEN now() ELSE NULL END) RETURNING id`, [randomUUID(), JSON.stringify({ internalOnly: 'synthetic payload must never appear in queue metadata' }), attempts, delivered])).rows[0]!.id;
}
async function failAudit(action: string) {
  await fixture.pool.query(`CREATE OR REPLACE FUNCTION audit.fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await fixture.pool.query('CREATE TRIGGER fixture_failure BEFORE INSERT ON audit.audit_events FOR EACH ROW EXECUTE FUNCTION audit.fixture_failure()');
}
async function stopFailure() { await fixture.pool.query('DROP TRIGGER IF EXISTS fixture_failure ON audit.audit_events'); }

live('manual publication recovery uses existing authority and atomic audit on owned tenant', () => {
  beforeAll(async () => {
    expect((await fetch('http://127.0.0.1:4000/health/ready', { signal: AbortSignal.timeout(5_000) })).ok).toBe(true);
    fixture = await createTenantFixture();
    // No recipients in fixture.recovery payload; all external channels are disabled.
    await fixture.pool.query('INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled) SELECT id,false,false FROM identity.users');
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);

  it('lists only exhausted metadata, never payload or message content', async () => {
    const exhausted = await createEvent(), delivered = await createEvent(8, true);
    const response = await request('/calendar/outbox/dead-letter'); expect(response.status).toBe(200);
    const items = (await response.json()).items;
    const item = items.find((candidate: { id: string }) => candidate.id === exhausted);
    expect(Object.keys(item).sort()).toEqual(['aggregateId', 'attempts', 'createdAt', 'eventType', 'id']);
    expect(item.attempts).toBe(8); expect(JSON.stringify(items)).not.toContain('synthetic payload');
    expect(items.some((candidate: { id: string }) => candidate.id === delivered)).toBe(false);
  });
  it('denies a non-administrator both queue and recovery without mutation', async () => {
    const id = await createEvent();
    expect((await request('/calendar/outbox/dead-letter', 'GET', undefined, fixture.users.leader)).status).toBe(403);
    expect((await request(`/calendar/outbox/${id}/retry`, 'POST', reason, fixture.users.leader)).status).toBe(403);
    expect((await fixture.pool.query('SELECT attempts FROM calendar.outbox_events WHERE id=$1', [id])).rows[0].attempts).toBe(8);
  });
  it('rejects already delivered or unexhausted events without changing their state', async () => {
    for (const id of [await createEvent(8, true), await createEvent(2)]) {
      const response = await request(`/calendar/outbox/${id}/retry`, 'POST', reason);
      expect(response.status).toBe(409); expect((await response.json()).code).toBe('OUTBOX_NOT_RETRYABLE');
      expect((await fixture.pool.query('SELECT count(*)::int count FROM audit.audit_events WHERE action=$1 AND resource_id=$2', ['calendar.outbox_retry_requested', id])).rows[0].count).toBe(0);
    }
  });
  it('requeues the same ID once, records the reason, and rejects repeat recovery', async () => {
    const id = await createEvent();
    const response = await request(`/calendar/outbox/${id}/retry`, 'POST', reason); expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id, retryScheduled: true });
    expect((await request(`/calendar/outbox/${id}/retry`, 'POST', reason)).status).toBe(409);
    const audit = (await fixture.pool.query('SELECT after_data FROM audit.audit_events WHERE action=$1 AND resource_id=$2', ['calendar.outbox_retry_requested', id])).rows;
    expect(audit).toHaveLength(1); expect(audit[0].after_data).toMatchObject({ reason: reason.reason, previousAttempts: 8 });
    expect((await fixture.pool.query('SELECT attempts FROM calendar.outbox_events WHERE id=$1', [id])).rows[0].attempts).toBe(0);
  });
  it('rolls back requeue when mandatory audit fails', async () => {
    const id = await createEvent(); await failAudit('calendar.outbox_retry_requested');
    try {
      expect((await request(`/calendar/outbox/${id}/retry`, 'POST', reason)).status).toBe(500);
      expect((await fixture.pool.query('SELECT attempts FROM calendar.outbox_events WHERE id=$1', [id])).rows[0].attempts).toBe(8);
    } finally { await stopFailure(); }
  });
  it('validates event ID and operational reason before mutating the queue', async () => {
    expect((await request('/calendar/outbox/not-a-uuid/retry', 'POST', reason)).status).toBe(400);
    const id = await createEvent(); expect((await request(`/calendar/outbox/${id}/retry`, 'POST', { reason: 'short' })).status).toBe(400);
    expect((await fixture.pool.query('SELECT attempts FROM calendar.outbox_events WHERE id=$1', [id])).rows[0].attempts).toBe(8);
  });
  it('rolls back the existing delivery retry when its audit fails', async () => {
    const notificationId = (await fixture.pool.query<{ id: string }>("INSERT INTO notifications.notifications(event_id,event_type,user_id,title,body) VALUES($1,'fixture.recovery',$2,'Synthetic','Synthetic') RETURNING id", [randomUUID(), fixture.users.admin.id])).rows[0]!.id;
    // IN_APP cannot invoke any external delivery provider even after recovery.
    const id = (await fixture.pool.query<{ id: string }>("INSERT INTO notifications.deliveries(notification_id,channel,status,attempts,error) VALUES($1,'IN_APP','DEAD_LETTER',5,'Synthetic failure') RETURNING id", [notificationId])).rows[0]!.id;
    await failAudit('notification.delivery_retry_requested');
    try {
      expect((await request(`/notifications/deliveries/${id}/retry`, 'POST')).status).toBe(500);
      expect((await fixture.pool.query('SELECT status,attempts,error FROM notifications.deliveries WHERE id=$1', [id])).rows[0]).toEqual({ status: 'DEAD_LETTER', attempts: 5, error: 'Synthetic failure' });
    } finally { await stopFailure(); }
    expect((await request(`/notifications/deliveries/${id}/retry`, 'POST')).status).toBe(201);
    expect((await fixture.pool.query('SELECT status,attempts FROM notifications.deliveries WHERE id=$1', [id])).rows[0]).toEqual({ status: 'FAILED', attempts: 0 });
    expect((await fixture.pool.query('SELECT count(*)::int count FROM audit.audit_events WHERE action=$1 AND resource_id=$2', ['notification.delivery_retry_requested', id])).rows[0].count).toBe(1);
    expect((await fixture.pool.query("SELECT count(*)::int count FROM notifications.deliveries WHERE channel IN ('EMAIL','WHATSAPP')")).rows[0].count).toBe(0);
  });
});
