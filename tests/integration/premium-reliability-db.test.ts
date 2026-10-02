import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimDelivery, claimReminder, finishDelivery, finishReminder, notificationEventHash, processInbox, recordWebhook } from '../../services/notification-service/src/reliability.js';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_RELIABILITY_DB_TESTS === '1' ? describe : describe.skip;
let fixture: SyntheticTenantFixture;
live('reliability transactions and leases in an owned synthetic database', () => {
  let activityId: string;
  beforeAll(async () => {
    // The real background worker cannot race this controlled fault/concurrency exercise.
    fixture = await createTenantFixture({ backgroundWork: false });
    activityId = randomUUID();
    await fixture.pool.query("INSERT INTO calendar.activities(id,title,description,department_id,responsible_name,responsible_user_id,created_by,status) VALUES($1,'Synthetic lease activity','Synthetic',$2,'Synthetic',$3,$3,'APPROVED')", [activityId, fixture.departments.youth, fixture.users.admin.id]);
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);

  it('rolls back inbox reservation with a failed handler, then persists exactly once under concurrency', async () => {
    const event = { id: randomUUID(), type: 'fixture.event' }, hash = notificationEventHash(event);
    await expect(processInbox(fixture.pool, event, hash, async () => { throw new Error('Synthetic failure'); })).rejects.toThrow('Synthetic failure');
    expect((await fixture.pool.query('SELECT 1 FROM notifications.inbox_events WHERE event_id=$1', [event.id])).rowCount).toBe(0);
    const work = async (client: import('pg').PoolClient) => {
      const inserted = await client.query("INSERT INTO notifications.notifications(event_id,title,body,event_type) VALUES($1,'Synthetic','Synthetic','fixture') RETURNING id", [event.id]);
      return { notificationId: inserted.rows[0].id };
    };
    const results = await Promise.all([processInbox(fixture.pool, event, hash, work), processInbox(fixture.pool, event, hash, work)]);
    expect(results.filter((result) => 'duplicate' in result)).toHaveLength(1);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM notifications.notifications WHERE event_id=$1', [event.id])).rows[0].count).toBe(1);
    await expect(processInbox(fixture.pool, event, 'different-content', work)).rejects.toMatchObject({ status: 409 });
  });

  it('resumes an incomplete inbox left by the previous implementation', async () => {
    const event = { id: randomUUID(), type: 'fixture.legacy' };
    await fixture.pool.query('INSERT INTO notifications.inbox_events(event_id,event_type) VALUES($1,$2)', [event.id, event.type]);
    await processInbox(fixture.pool, event, notificationEventHash(event), async () => ({ resumed: true }));
    expect((await fixture.pool.query('SELECT processed_at FROM notifications.inbox_events WHERE event_id=$1', [event.id])).rows[0].processed_at).not.toBeNull();
  });

  it('claims an activity reminder once across workers and recovers only expired leases', async () => {
    const id = randomUUID();
    await fixture.pool.query("INSERT INTO notifications.scheduled_reminders(id,activity_id,user_id,remind_at,kind) VALUES($1,$2,$3,now()-interval '1 minute','CUSTOM')", [id, activityId, fixture.users.admin.id]);
    const results = await Promise.all([claimReminder(fixture.pool, 'activity'), claimReminder(fixture.pool, 'activity')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const first = results.find(Boolean)!;
    expect(await claimReminder(fixture.pool, 'activity')).toBeNull();
    await fixture.pool.query("UPDATE notifications.scheduled_reminders SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
    const replacement = (await claimReminder(fixture.pool, 'activity'))!;
    expect(replacement.attempts).toBe(2); expect(replacement.claim_token).not.toBe(first.claim_token);
    expect(await finishReminder(fixture.pool, 'activity', first, true, 0)).toBe(0);
    expect(await finishReminder(fixture.pool, 'activity', replacement, false, 1000)).toBe(1);
    expect((await fixture.pool.query('SELECT status FROM notifications.scheduled_reminders WHERE id=$1', [id])).rows[0].status).toBe('PENDING');
    await fixture.pool.query("UPDATE notifications.scheduled_reminders SET status='CANCELLED' WHERE id=$1", [id]);
  });

  it('recovers legacy PROCESSING reminders and dead-letters exhausted claims without sending', async () => {
    const id = randomUUID();
    await fixture.pool.query("INSERT INTO notifications.scheduled_reminders(id,activity_id,user_id,remind_at,kind,status,attempts) VALUES($1,$2,$3,now()-interval '2 minutes','CUSTOM','PROCESSING',5)", [id, activityId, fixture.users.admin.id]);
    expect(await claimReminder(fixture.pool, 'activity')).toBeNull();
    expect((await fixture.pool.query('SELECT status FROM notifications.scheduled_reminders WHERE id=$1', [id])).rows[0].status).toBe('FAILED');
  });

  it('uses the same exclusive lease and stale-owner protection for review reminders', async () => {
    const sessionId = randomUUID(), reminderId = randomUUID();
    await fixture.pool.query("INSERT INTO calendar.review_sessions(id,title,scheduled_at,ends_at,status,created_by) VALUES($1,'Synthetic session',now()+interval '1 hour',now()+interval '2 hours','SCHEDULED',$2)", [sessionId, fixture.users.secretary.id]);
    await fixture.pool.query("INSERT INTO calendar.review_session_reminders(id,review_session_id,user_id,remind_at,kind) VALUES($1,$2,$3,now()-interval '1 minute','1_HOUR')", [reminderId, sessionId, fixture.users.secretary.id]);
    const results = await Promise.all([claimReminder(fixture.pool, 'review'), claimReminder(fixture.pool, 'review')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await finishReminder(fixture.pool, 'review', results.find(Boolean)!, true, 0)).toBe(1);
    expect((await fixture.pool.query('SELECT status FROM calendar.review_session_reminders WHERE id=$1', [reminderId])).rows[0].status).toBe('SENT');
  });

  it('does not issue reminders for cancelled activities', async () => {
    const id = randomUUID();
    await fixture.pool.query("UPDATE calendar.activities SET status='CANCELLED' WHERE id=$1", [activityId]);
    await fixture.pool.query("INSERT INTO notifications.scheduled_reminders(id,activity_id,user_id,remind_at,kind) VALUES($1,$2,$3,now()-interval '3 minutes','CUSTOM')", [id, activityId, fixture.users.admin.id]);
    expect(await claimReminder(fixture.pool, 'activity')).toBeNull();
    await fixture.pool.query("UPDATE notifications.scheduled_reminders SET status='CANCELLED' WHERE id=$1", [id]);
  });

  it('claims durable deliveries once and protects a later provider READ from an older worker SENT', async () => {
    const eventId = randomUUID(), providerId = `synthetic-${randomUUID()}`;
    const notification = await fixture.pool.query<{ id: string }>("INSERT INTO notifications.notifications(event_id,user_id,title,body,event_type) VALUES($1,$2,'Synthetic delivery','Synthetic','fixture') RETURNING id", [eventId, fixture.users.admin.id]);
    await fixture.pool.query("INSERT INTO notifications.deliveries(notification_id,channel,status,provider_message_id,recipient_data) VALUES($1,'EMAIL','PENDING',$2,$3::jsonb)", [notification.rows[0]!.id, providerId, JSON.stringify({ emails: ['fixture@premium.example'] })]);
    const claims = await Promise.all([claimDelivery(fixture.pool), claimDelivery(fixture.pool)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims.find(Boolean)!;
    expect(first.recipient_data?.emails).toEqual(['fixture@premium.example']);
    await fixture.pool.query("UPDATE notifications.deliveries SET lease_until=now()-interval '1 second' WHERE id=$1", [first.id]);
    const next = (await claimDelivery(fixture.pool))!;
    expect(await finishDelivery(fixture.pool, first, { status: 'SENT' }, 0)).toBe(0);
    await fixture.pool.query("UPDATE notifications.deliveries SET status='READ' WHERE id=$1", [next.id]);
    expect(await finishDelivery(fixture.pool, next, { status: 'SENT' }, 0)).toBe(1);
    expect((await fixture.pool.query('SELECT status FROM notifications.deliveries WHERE id=$1', [next.id])).rows[0].status).toBe('READ');
  });

  it('rolls back webhook deduplication when updating delivery fails, then processes its retry', async () => {
    const providerId = `synthetic-${randomUUID()}`, eventId = randomUUID();
    const notification = await fixture.pool.query<{ id: string }>("INSERT INTO notifications.notifications(event_id,title,body,event_type) VALUES($1,'Synthetic','Synthetic','fixture') RETURNING id", [randomUUID()]);
    await fixture.pool.query("INSERT INTO notifications.deliveries(notification_id,channel,status,provider_message_id) VALUES($1,'WHATSAPP','SENT',$2)", [notification.rows[0]!.id, providerId]);
    await fixture.pool.query("CREATE FUNCTION notifications.fixture_webhook_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic callback failure'; END $$");
    await fixture.pool.query('CREATE TRIGGER fixture_webhook_failure BEFORE UPDATE ON notifications.deliveries FOR EACH ROW EXECUTE FUNCTION notifications.fixture_webhook_failure()');
    const statuses = [{ providerMessageId: providerId, status: 'READ' as const }];
    try { await expect(recordWebhook(fixture.pool, eventId, {}, statuses)).rejects.toThrow('Synthetic callback failure'); }
    finally { await fixture.pool.query('DROP TRIGGER fixture_webhook_failure ON notifications.deliveries'); }
    expect((await fixture.pool.query('SELECT 1 FROM notifications.provider_webhook_events WHERE provider_event_id=$1', [eventId])).rowCount).toBe(0);
    expect((await recordWebhook(fixture.pool, eventId, {}, statuses)).statusesUpdated).toBe(1);
    expect(await recordWebhook(fixture.pool, eventId, {}, statuses)).toMatchObject({ duplicate: true, statusesUpdated: 0 });
  });
});
