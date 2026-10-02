import { createHmac, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_RELIABILITY_API_TESTS === '1' ? describe : describe.skip;
let fixture: SyntheticTenantFixture;
const base = 'http://127.0.0.1:4000/api/v1';
async function api(path: string, body: unknown, key?: string) {
  return fetch(`${base}${path}`, {
    method: 'POST', headers: { cookie: `gc_session=${fixture.users.admin.token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
}
async function failAudit(action: string) {
  await fixture.pool.query(`CREATE OR REPLACE FUNCTION audit.fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await fixture.pool.query('CREATE TRIGGER fixture_failure BEFORE INSERT ON audit.audit_events FOR EACH ROW EXECUTE FUNCTION audit.fixture_failure()');
}
async function stopFailure() { await fixture.pool.query('DROP TRIGGER IF EXISTS fixture_failure ON audit.audit_events'); }

live('premium persistence reliability with owned synthetic tenant', () => {
  let registrationId: string;
  beforeAll(async () => {
    const health = await fetch('http://127.0.0.1:4000/health/ready', { signal: AbortSignal.timeout(5_000) });
    expect(health.ok, 'Gateway/services must be ready before provisioning').toBe(true);
    fixture = await createTenantFixture();
    await fixture.pool.query('INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled) SELECT id,false,false FROM identity.users');
    const woman = await fixture.pool.query<{ id: string }>("INSERT INTO womens_ministry.women(name,created_by) VALUES('Synthetic payment participant',$1) RETURNING id", [fixture.users.admin.id]);
    const retreat = await fixture.pool.query<{ id: string }>("INSERT INTO womens_ministry.retreats(title,year,resort,starts_on,ends_on,capacity,cost_per_person,total_budget,created_by) VALUES('Synthetic reliability retreat',2030,'Fixture venue','2030-01-01','2030-01-02',10,100,1000,$1) RETURNING id", [fixture.users.admin.id]);
    registrationId = (await fixture.pool.query<{ id: string }>('INSERT INTO womens_ministry.retreat_registrations(retreat_id,woman_id,amount_due,registered_by) VALUES($1,$2,100,$3) RETURNING id', [retreat.rows[0]!.id, woman.rows[0]!.id, fixture.users.admin.id])).rows[0]!.id;
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);

  it('replays a payment without counting the money twice and rejects changed content', async () => {
    const key = `payment-${randomUUID()}`;
    const payload = { amount: 10, paidOn: '2030-01-01', method: 'CASH', reference: 'Synthetic receipt' };
    const first = await api(`/womens-ministry/retreat-registrations/${registrationId}/payments`, payload, key);
    const firstBody = await first.json(); expect(first.status).toBe(201);
    const second = await api(`/womens-ministry/retreat-registrations/${registrationId}/payments`, payload, key);
    expect(second.status).toBe(201); expect((await second.json()).id).toBe(firstBody.id);
    const changed = await api(`/womens-ministry/retreat-registrations/${registrationId}/payments`, { ...payload, amount: 11 }, key);
    expect(changed.status).toBe(409);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM womens_ministry.retreat_payments WHERE registration_id=$1 AND reference=$2', [registrationId, payload.reference])).rows[0].count).toBe(1);
  });

  it('rolls back a payment when its required audit fails', async () => {
    const marker = `rollback-${randomUUID()}`;
    await failAudit('womens_ministry.retreat_payment.created');
    try {
      const response = await api(`/womens-ministry/retreat-registrations/${registrationId}/payments`, { amount: 5, paidOn: '2030-01-01', method: 'CASH', reference: marker }, `payment-${randomUUID()}`);
      expect(response.status).toBe(500);
      expect((await fixture.pool.query('SELECT count(*)::int count FROM womens_ministry.retreat_payments WHERE reference=$1', [marker])).rows[0].count).toBe(0);
    } finally { await stopFailure(); }
  });

  it('rolls back PM assignment, notification and initiative together on audit failure', async () => {
    const marker = `Atomic fixture ${randomUUID()}`;
    await failAudit('personal_ministries.initiative.created');
    try {
      const response = await api('/personal-ministries/initiatives', { title: marker, startsOn: '2030-01-01', endsOn: '2030-01-02', assigneeId: fixture.users.leader.id, responsibility: 'Synthetic assignment' });
      expect(response.status).toBe(500);
      expect((await fixture.pool.query('SELECT count(*)::int count FROM personal_ministries.initiatives WHERE title=$1', [marker])).rows[0].count).toBe(0);
      expect((await fixture.pool.query('SELECT count(*)::int count FROM notifications.notifications WHERE body LIKE $1', [`${marker}%`])).rows[0].count).toBe(0);
    } finally { await stopFailure(); }
  });

  it('retries an inbox event after failure without losing or duplicating its alert', async () => {
    const marker = `Inbox fixture ${randomUUID()}`;
    const event = { id: randomUUID(), type: 'activity.submitted', aggregateId: randomUUID(), payload: { title: marker, userId: fixture.users.admin.id } };
    const post = () => fetch('http://127.0.0.1:4015/events', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant-id': fixture.id, 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret' }, body: JSON.stringify(event), signal: AbortSignal.timeout(20_000) });
    await fixture.pool.query("CREATE FUNCTION notifications.fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic alert failure'; END $$");
    await fixture.pool.query('CREATE TRIGGER fixture_failure BEFORE INSERT ON notifications.notifications FOR EACH ROW EXECUTE FUNCTION notifications.fixture_failure()');
    try { expect((await post()).status).toBe(500); }
    finally { await fixture.pool.query('DROP TRIGGER fixture_failure ON notifications.notifications'); }
    expect((await post()).status).toBe(201);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM notifications.notifications WHERE event_id=$1', [event.id])).rows[0].count).toBe(1);
    expect((await fixture.pool.query('SELECT processed_at FROM notifications.inbox_events WHERE event_id=$1', [event.id])).rows[0].processed_at).not.toBeNull();
    expect((await post()).status).toBe(201);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM notifications.notifications WHERE event_id=$1', [event.id])).rows[0].count).toBe(1);
  });

  it('ignores signed Meta replays and does not regress a READ delivery on a late SENT event', async () => {
    const secret = `synthetic-${randomUUID()}-${randomUUID()}`;
    const settings = await fetch(`${base}/notifications/channels/settings`, { method: 'PATCH', headers: { cookie: `gc_session=${fixture.users.admin.token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify({ smtpHost: '127.0.0.1', smtpPort: 58025, smtpSecure: false, smtpRequireTls: false, smtpUser: null, smtpFromName: 'Synthetic fixture', smtpFromEmail: 'fixture@premium.example', whatsappMode: 'simulated', whatsappPhoneNumberId: null, whatsappAppSecret: secret, whatsappTemplateName: null, whatsappTemplateLanguage: 'es', metaGraphVersion: 'v23.0' }) });
    expect(settings.status).toBe(200);
    const providerId = `synthetic-provider-${randomUUID()}`;
    const notification = await fixture.pool.query<{ id: string }>("INSERT INTO notifications.notifications(event_id,user_id,title,body,event_type) VALUES($1,$2,'Synthetic webhook','Synthetic webhook','fixture') RETURNING id", [randomUUID(), fixture.users.admin.id]);
    await fixture.pool.query("INSERT INTO notifications.deliveries(notification_id,channel,status,provider_message_id) VALUES($1,'WHATSAPP','SENT',$2)", [notification.rows[0]!.id, providerId]);
    const send = async (eventId: string, status: string) => {
      const body = JSON.stringify({ id: eventId, entry: [{ changes: [{ value: { statuses: [{ id: providerId, status }] } }] }] });
      return fetch(`${base}/webhooks/meta?tenantId=${fixture.id}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` }, body });
    };
    const sentId = randomUUID(); expect((await send(sentId, 'sent')).status).toBe(201);
    expect((await send(randomUUID(), 'read')).status).toBe(201);
    expect((await send(sentId, 'sent')).status).toBe(201);
    expect((await send(randomUUID(), 'sent')).status).toBe(201);
    expect((await fixture.pool.query('SELECT status FROM notifications.deliveries WHERE provider_message_id=$1', [providerId])).rows[0].status).toBe('READ');
  });

  const uploadDocument = (title: string) => {
    const form = new FormData();
    form.append('file', new Blob(['Synthetic reliability document'], { type: 'text/plain' }), 'synthetic.txt');
    for (const [key, value] of Object.entries({ departmentId: fixture.departments.youth, title, documentType: 'PROGRAM', ministryYear: '2030', alignmentBasis: 'ANNUAL_CHURCH_PLAN', alignmentReference: 'Synthetic reference', alignmentConfirmed: 'true', visibility: 'DEPARTMENT' })) form.append(key, value);
    return fetch(`${base}/files/department-documents`, { method: 'POST', headers: { cookie: `gc_session=${fixture.users.admin.token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' }, body: form, signal: AbortSignal.timeout(20_000) });
  };

  it('assigns unique sequential versions to simultaneous same-title documents', async () => {
    const title = `Concurrent document ${randomUUID()}`;
    const responses = await Promise.all(Array.from({ length: 4 }, () => uploadDocument(title)));
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201]);
    const documents = await Promise.all(responses.map((response) => response.json()));
    expect(documents.map((document) => document.version).sort()).toEqual([1, 2, 3, 4]);
    expect(new Set(documents.map((document) => document.id)).size).toBe(4);
    const published = await fixture.pool.query("SELECT f.version,f.status FROM files.file_objects f JOIN files.department_documents d ON d.file_id=f.id WHERE d.title=$1 ORDER BY f.version", [title]);
    expect(published.rows.map((row) => row.status)).toEqual(['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE']);
  });

  it('does not publish a file or leave its object behind when document audit fails', async () => {
    const title = `Rollback document ${randomUUID()}`, directory = resolve(process.env.UPLOAD_ROOT ?? '.local/uploads', fixture.id);
    const before = await readdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
    await failAudit('department_document.uploaded');
    try {
      expect((await uploadDocument(title)).status).toBe(500);
      expect((await fixture.pool.query('SELECT 1 FROM files.department_documents WHERE title=$1', [title])).rowCount).toBe(0);
      expect((await readdir(directory)).sort()).toEqual(before.sort());
    } finally { await stopFailure(); }
  });

  async function coreActivity(departmentId = fixture.departments.youth) {
    const response = await api('/activities', { title: `Synthetic attachment ${randomUUID()}`, description: 'Synthetic reliable fixture', departmentId, responsibleName: 'Synthetic responsible', options: [{ label: 'Fixture time', preference: 1, sessions: [{ startsAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T13:00:00Z' }] }] }, `fixture-${randomUUID()}`);
    expect(response.status).toBe(201); return (await response.json()).id as string;
  }
  const uploadAttachment = (activityId: string, key: string, contents = 'Synthetic retry attachment') => {
    const form = new FormData(); form.append('file', new Blob([contents], { type: 'text/plain' }), 'synthetic-retry.txt');
    return fetch(`${base}/files/activity/${activityId}`, { method: 'POST', headers: { cookie: `gc_session=${fixture.users.admin.token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'idempotency-key': key }, body: form, signal: AbortSignal.timeout(20_000) });
  };
  it('replays simultaneous uploads without duplicating files or silently accepting changed content', async () => {
    const id = await coreActivity(), key = `upload-${randomUUID()}`;
    const responses = await Promise.all(Array.from({ length: 4 }, () => uploadAttachment(id, key)));
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201]);
    const files = await Promise.all(responses.map((response) => response.json()));
    expect(new Set(files.map((file) => file.id)).size).toBe(1);
    expect((await fixture.pool.query("SELECT count(*)::int count FROM files.file_objects WHERE activity_id=$1 AND status='AVAILABLE'", [id])).rows[0].count).toBe(1);
    expect((await uploadAttachment(id, key, 'Different synthetic contents')).status).toBe(409);
  });
  it('rolls back attachment publication on audit failure and allows the same command to retry', async () => {
    const id = await coreActivity(), key = `upload-${randomUUID()}`;
    await failAudit('file.uploaded');
    try {
      expect((await uploadAttachment(id, key)).status).toBe(500);
      expect((await fixture.pool.query("SELECT 1 FROM files.file_objects WHERE activity_id=$1 AND status='AVAILABLE'", [id])).rowCount).toBe(0);
    } finally { await stopFailure(); }
    expect((await uploadAttachment(id, key)).status).toBe(201);
  });
  it('does not recreate an already deleted idempotent attachment', async () => {
    const id = await coreActivity(), key = `upload-${randomUUID()}`;
    const response = await uploadAttachment(id, key); expect(response.status).toBe(201);
    const fileId = (await response.json()).id;
    await fixture.pool.query('UPDATE files.file_objects SET deleted_at=now() WHERE id=$1', [fileId]);
    const retry = await uploadAttachment(id, key); expect(retry.status).toBe(409);
    expect((await retry.json()).code).toBe('IDEMPOTENT_FILE_UNAVAILABLE');
    expect((await fixture.pool.query('SELECT count(*)::int count FROM files.file_objects WHERE activity_id=$1', [id])).rows[0].count).toBe(1);
  });

  async function womanPayload() {
    return { calendarActivityId: await coreActivity(fixture.departments.woman), title: `Synthetic woman activity ${randomUUID()}`, activityType: 'SPIRITUAL', objective: 'Synthetic ministry chain', startsAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T13:00:00Z', plannedBudget: 0, currency: 'DOP' };
  }
  it('replays the modular Women link after an uncertain acknowledgement without overwriting different content', async () => {
    const payload = await womanPayload();
    const responses = await Promise.all(Array.from({ length: 3 }, () => api('/womens-ministry/activities', payload)));
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json())); expect(new Set(bodies.map((body) => body.id)).size).toBe(1);
    const conflict = await api('/womens-ministry/activities', { ...payload, title: 'Different synthetic content' }); expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('WOMEN_ACTIVITY_ALREADY_LINKED');
    expect((await fixture.pool.query('SELECT count(*)::int count FROM womens_ministry.activities WHERE calendar_activity_id=$1', [payload.calendarActivityId])).rows[0].count).toBe(1);
  });
  it('rolls back the Women link when audit fails and safely retries it', async () => {
    const payload = await womanPayload(); await failAudit('womens_ministry.activity.created');
    try {
      expect((await api('/womens-ministry/activities', payload)).status).toBe(500);
      expect((await fixture.pool.query('SELECT 1 FROM womens_ministry.activities WHERE calendar_activity_id=$1', [payload.calendarActivityId])).rowCount).toBe(0);
    } finally { await stopFailure(); }
    expect((await api('/womens-ministry/activities', payload)).status).toBe(201);
  });
});
