import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type FixtureUser, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_CALENDAR_API_TESTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:4000/api/v1';
let fixture: SyntheticTenantFixture;
const call = (path: string, method: string, body?: unknown, key?: string, actor?: FixtureUser) => fetch(`${base}${path}`, {
  method,
  headers: { cookie: `gc_session=${(actor ?? fixture.users.admin).token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  signal: AbortSignal.timeout(20_000),
});
const activity = (title: string) => ({ title, description: 'Synthetic calendar reliability fixture', departmentId: fixture.departments.youth, responsibleName: 'Synthetic responsible', timezone: 'America/La_Paz', options: [{ label: 'Primary fixture option', preference: 1, sessions: [{ startsAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T13:00:00Z', setupMinutes: 0, teardownMinutes: 0 }] }] });

live('premium calendar concurrency and bounded expanded schedules', () => {
  beforeAll(async () => {
    expect((await fetch('http://127.0.0.1:4000/health/ready', { signal: AbortSignal.timeout(5_000) })).ok).toBe(true);
    fixture = await createTenantFixture();
    await fixture.pool.query('INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled) SELECT id,false,false FROM identity.users');
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);

  it('serializes concurrent retries into one created activity', async () => {
    const key = `calendar-${randomUUID()}`, payload = activity(`Concurrent fixture ${randomUUID()}`);
    // Hold inserts briefly so the unsafe select-then-insert baseline races
    // reliably. The delay exists only in this owned temporary database.
    await fixture.pool.query("CREATE FUNCTION calendar.fixture_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title LIKE 'Concurrent fixture %' THEN PERFORM pg_sleep(0.1); END IF; RETURN NEW; END $$");
    await fixture.pool.query('CREATE TRIGGER fixture_pause BEFORE INSERT ON calendar.activities FOR EACH ROW EXECUTE FUNCTION calendar.fixture_pause()');
    let responses: Response[];
    try { responses = await Promise.all(Array.from({ length: 4 }, () => call('/activities', 'POST', payload, key))); }
    finally { await fixture.pool.query('DROP TRIGGER fixture_pause ON calendar.activities'); }
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(new Set(bodies.map((body) => body.id)).size).toBe(1);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM calendar.activities WHERE title=$1', [payload.title])).rows[0].count).toBe(1);
    expect((await call('/activities', 'POST', { ...payload, description: 'Different normalized content' }, key)).status).toBe(409);
  });

  it('scopes the same client key to its actor instead of failing another authorized actor', async () => {
    const key = `calendar-${randomUUID()}`, payload = activity(`Actor scope fixture ${randomUUID()}`);
    const first = await call('/activities', 'POST', payload, key), second = await call('/activities', 'POST', payload, key, fixture.users.leader);
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect((await first.json()).id).not.toBe((await second.json()).id);
  });

  it('allows a fresh command after its own key expires and still replays unexpired legacy records', async () => {
    const key = `calendar-${randomUUID()}`, payload = activity(`Expired key fixture ${randomUUID()}`);
    const first = await call('/activities', 'POST', payload, key); expect(first.status).toBe(201);
    const firstId = (await first.json()).id;
    await fixture.pool.query('UPDATE calendar.idempotency_keys SET expires_at=now()-interval \'1 second\' WHERE user_id=$1', [fixture.users.admin.id]);
    const renewed = await call('/activities', 'POST', payload, key); expect(renewed.status).toBe(201);
    const renewedId = (await renewed.json()).id; expect(renewedId).not.toBe(firstId);
    const legacyKey = `legacy-${randomUUID()}`;
    await fixture.pool.query('UPDATE calendar.idempotency_keys SET idempotency_key=$1 WHERE response_body->>\'id\'=$2', [legacyKey, renewedId]);
    const replay = await call('/activities', 'POST', payload, legacyKey); expect(replay.status).toBe(201);
    expect((await replay.json()).id).toBe(renewedId);
  });

  it('preserves all 30 expanded occurrences when editing a recurring activity', async () => {
    const payload = { ...activity(`Recurrence fixture ${randomUUID()}`), recurrence: { frequency: 'DAILY', interval: 1, count: 30 } };
    const created = await call('/activities', 'POST', payload, `calendar-${randomUUID()}`); expect(created.status).toBe(201);
    const id = (await created.json()).id;
    const existing = await call(`/activities/${id}`, 'GET'); expect(existing.status).toBe(200);
    const detail = await existing.json();
    const options = detail.options.filter((option: { status: string }) => option.status !== 'RELEASED').map((option: { label: string; preference: number; sessions: Array<{ startsAt: string; endsAt: string; setupMinutes: number; teardownMinutes: number }> }) => ({
      label: option.label, preference: option.preference, sessions: option.sessions.map((session) => ({ startsAt: new Date(session.startsAt).toISOString(), endsAt: new Date(session.endsAt).toISOString(), setupMinutes: session.setupMinutes, teardownMinutes: session.teardownMinutes })),
    }));
    expect(options[0].sessions).toHaveLength(30);
    const edited = await call(`/activities/${id}`, 'PATCH', { description: 'Edited without losing expanded occurrences', options, expectedVersion: detail.version, changeReason: 'Synthetic preservation test' });
    expect(edited.status).toBe(200);
    const schedule = await fixture.pool.query('SELECT s.starts_at,s.ends_at FROM calendar.schedule_sessions s JOIN calendar.schedule_options o ON o.id=s.option_id WHERE o.activity_id=$1 AND o.status<>\'RELEASED\' ORDER BY s.starts_at', [id]);
    expect(schedule.rows).toHaveLength(30);
    expect(schedule.rows.map((row) => [row.starts_at.toISOString(), row.ends_at.toISOString()])).toEqual(options[0].sessions.map((session: { startsAt: string; endsAt: string }) => [session.startsAt, session.endsAt]));
    // Very large bodies may correctly hit the transport's existing 413 cap
    // before the schema's 400 cap; neither may mutate the persisted version.
    expect([400, 413]).toContain((await call(`/activities/${id}`, 'PATCH', { options: [{ ...options[0], sessions: Array.from({ length: 2001 }, () => options[0].sessions[0]) }], expectedVersion: 2, changeReason: 'Synthetic upper bound' })).status);
    expect((await fixture.pool.query('SELECT version FROM calendar.activities WHERE id=$1', [id])).rows[0].version).toBe(2);
  });

  it('adds the current tenant timezone to me without inserting it into the principal JWT', async () => {
    const response = await call('/me', 'GET'); expect(response.status).toBe(200);
    const result = await response.json(); expect(result.user.tenantTimezone).toBe('America/La_Paz');
    expect(fixture.users.admin.principal).not.toHaveProperty('tenantTimezone');
    expect(result.user.roles).toEqual(fixture.users.admin.principal.roles);
  });

  it('a title-only edit preserves omitted metadata, resources, collaborators and status', async () => {
    const resourceId = (await fixture.pool.query("INSERT INTO calendar.resources(name,exclusive) VALUES('Synthetic preserved resource',true) RETURNING id")).rows[0].id;
    const payload = { ...activity(`Omitted fields ${randomUUID()}`), objective: 'Synthetic retained objective', audience: 'Synthetic audience',
      estimatedAttendance: 37, category: 'Synthetic category', tags: ['Synthetic tag'], priority: 4, internalNotes: 'Synthetic retained notes',
      modality: 'HYBRID', visibility: 'LEADERSHIP', timezone: 'America/Santo_Domingo', resourceIds: [resourceId],
      secondaryResponsibles: [{ name: 'Synthetic helper' }], collaboratorDepartmentIds: [fixture.departments.music] };
    const created = await call('/activities', 'POST', payload); expect(created.status).toBe(201); const id = (await created.json()).id;
    // Non-draft makes an accidental schedule edit observable without opening a
    // conflict or creating a real notification in this isolated fixture.
    await fixture.pool.query("UPDATE calendar.activities SET status='SUBMITTED' WHERE id=$1", [id]);
    const before = (await fixture.pool.query('SELECT to_jsonb(a) value FROM calendar.activities a WHERE id=$1', [id])).rows[0].value;
    expect((await call(`/activities/${id}`, 'PATCH', { title: 'Synthetic changed title only', expectedVersion: 1, changeReason: 'Synthetic partial edit' })).status).toBe(200);
    const after = (await fixture.pool.query('SELECT to_jsonb(a) value FROM calendar.activities a WHERE id=$1', [id])).rows[0].value;
    for (const field of ['objective','audience','estimated_attendance','category','tags','priority','internal_notes','modality','visibility','timezone','secondary_responsibles','status','custom_data']) expect(after[field]).toEqual(before[field]);
    expect((await fixture.pool.query('SELECT resource_id FROM calendar.activity_resources WHERE activity_id=$1', [id])).rows.map(r => r.resource_id)).toEqual([resourceId]);
    expect((await fixture.pool.query('SELECT department_id FROM calendar.activity_collaborators WHERE activity_id=$1', [id])).rows.map(r => r.department_id)).toEqual([fixture.departments.music]);
    expect(after.version).toBe(2);
  });

  it('edits custom values against the saved template, not a later publication', async () => {
    const response = await call('/activity-form/template', 'GET'); expect(response.status).toBe(200); const initial = await response.json();
    const custom = { id: 'synthetic_decision', kind: 'custom', type: 'select', label: 'Synthetic decision', required: true, visible: true, width: 'full', options: ['Original','Updated'] };
    const template = { ...initial.published, fields: [...initial.published.fields, { id: 'synthetic_hidden', kind: 'custom', type: 'text', label: 'Synthetic hidden field', visible: false }, custom] };
    expect((await call('/activity-form/template/draft', 'PATCH', { expectedVersion: initial.draftVersion, template })).status).toBe(200);
    expect((await call('/activity-form/template/publish', 'POST', { expectedDraftVersion: initial.draftVersion + 1 })).status).toBe(201);
    const created = await call('/activities', 'POST', { ...activity(`Custom edit ${randomUUID()}`), customData: { synthetic_decision: 'Original' } });
    expect(created.status).toBe(201); const id = (await created.json()).id;
    await fixture.pool.query("UPDATE calendar.activities SET custom_data=custom_data||'{\"synthetic_hidden\":\"Preserved hidden value\",\"historical_note\":\"Preserved historical value\"}'::jsonb WHERE id=$1", [id]);
    const later = { ...template, fields: template.fields.map((field: { id: string; [key: string]: unknown }) => field.id === custom.id ? { ...field, options: ['Later only','Later second'] } : field) };
    expect((await call('/activity-form/template/draft', 'PATCH', { expectedVersion: initial.draftVersion + 1, template: later })).status).toBe(200);
    expect((await call('/activity-form/template/publish', 'POST', { expectedDraftVersion: initial.draftVersion + 2 })).status).toBe(201);
    expect((await call(`/activities/${id}`, 'PATCH', { expectedVersion: 1, changeReason: 'Synthetic custom edit', customData: { synthetic_decision: 'Updated' } })).status).toBe(200);
    const detail = await (await call(`/activities/${id}`, 'GET')).json();
    const expectedData = { synthetic_decision: 'Updated', synthetic_hidden: 'Preserved hidden value', historical_note: 'Preserved historical value' };
    expect(detail.custom_data).toEqual(expectedData); expect(detail.form_schema_snapshot.fields.at(-1).options).toEqual(['Original','Updated']);
    for (const customData of [{}, { synthetic_decision: 12 }, { synthetic_decision: 'Later only' }, { synthetic_decision: 'Original', unknown_field: 'No' }, { ...expectedData, synthetic_hidden: 'Forbidden hidden edit' }, { ...expectedData, historical_note: 'Forbidden historical edit' }]) {
      expect((await call(`/activities/${id}`, 'PATCH', { expectedVersion: 2, changeReason: 'Synthetic invalid edit', customData })).status).toBe(400);
    }
    expect((await fixture.pool.query('SELECT version,custom_data FROM calendar.activities WHERE id=$1', [id])).rows[0]).toEqual({ version: 2, custom_data: expectedData });
    // Restore only this fixture's own published template for later tests.
    await fixture.pool.query('UPDATE calendar.activity_form_templates SET published_schema=$1::jsonb,draft_schema=$1::jsonb WHERE singleton', [JSON.stringify(initial.published)]);
  });

  it('keeps an approved custom change pending until the existing authority applies it', async () => {
    const template = (await (await call('/activity-form/template', 'GET')).json()).published;
    template.fields.push({ id: 'synthetic_note', kind: 'custom', type: 'text', label: 'Synthetic note', required: false, visible: true, width: 'full', options: [] });
    // Set a stored historical snapshot only in the owned fixture; publishing was
    // already exercised above, this case targets the two-authority change path.
    const created = await call('/activities', 'POST', { ...activity(`Approved custom edit ${randomUUID()}`), options: [{ label: 'Free', preference: 1, sessions: [{ startsAt: '2036-02-05T12:00:00Z', endsAt: '2036-02-05T13:00:00Z' }] }] }, undefined, fixture.users.leader);
    expect(created.status).toBe(201); const id = (await created.json()).id;
    await fixture.pool.query("UPDATE calendar.activities SET form_schema_snapshot=$2::jsonb,custom_data='{\"synthetic_note\":\"Original\"}'::jsonb WHERE id=$1", [id, JSON.stringify(template)]);
    expect((await call(`/activities/${id}/submit`, 'POST', {}, undefined, fixture.users.leader)).status).toBe(201);
    expect((await call(`/activities/${id}/approve`, 'POST', {}, undefined, fixture.users.secretary)).status).toBe(201);
    const original = await (await call(`/activities/${id}`, 'GET')).json();
    const changes = { customData: { synthetic_note: 'Authorized updated value' }, expectedVersion: original.version, changeReason: 'Synthetic change request' };
    expect((await call(`/activities/${id}`, 'PATCH', changes, undefined, fixture.users.leader)).status).toBe(409);
    const requested = await call(`/activities/${id}/change-requests`, 'POST', { reason: 'Synthetic request for approval', changes }, undefined, fixture.users.leader);
    expect(requested.status).toBe(201); const requestId = (await requested.json()).id;
    expect((await fixture.pool.query('SELECT custom_data FROM calendar.activities WHERE id=$1', [id])).rows[0].custom_data).toEqual({ synthetic_note: 'Original' });
    expect((await call(`/activity-change-requests/${requestId}/decision`, 'POST', { decision: 'APPROVE', notes: 'Synthetic existing authority approval' }, undefined, fixture.users.secretary)).status).toBe(201);
    const final = await (await call(`/activities/${id}`, 'GET')).json();
    expect(final.status).toBe('APPROVED'); expect(final.custom_data).toEqual(changes.customData);
    expect((await fixture.pool.query("SELECT count(*)::int count FROM calendar.reservations WHERE activity_id=$1 AND status='CONFIRMED'", [id])).rows[0].count).toBe(1);
  });

  it('updating a department color preserves its description', async () => {
    await fixture.pool.query("UPDATE calendar.departments SET description='Synthetic department description' WHERE id=$1", [fixture.departments.youth]);
    expect((await call(`/departments/${fixture.departments.youth}`, 'PATCH', { color: '#126966' })).status).toBe(200);
    expect((await fixture.pool.query('SELECT description FROM calendar.departments WHERE id=$1', [fixture.departments.youth])).rows[0].description).toBe('Synthetic department description');
  });
});
