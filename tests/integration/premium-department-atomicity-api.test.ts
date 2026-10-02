import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type FixtureUser, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';
const live = process.env.RUN_PREMIUM_DEPARTMENT_ATOMICITY_API_TESTS === '1' ? describe : describe.skip;
let fixture: SyntheticTenantFixture;
const ids: Record<string, string> = {};
type Mutation = { name: string; action: string; method: 'POST' | 'PATCH'; path: () => string; body: () => unknown };
const mutations: Mutation[] = [
  { name: 'create plan', action: 'plan.created', method: 'POST', path: () => '/plans', body: () => ({ workspaceId: ids.workspace, title: 'Synthetic atomic plan', year: 2030, ownerId: fixture.users.leader.id }) },
  { name: 'approve plan', action: 'plan.approved', method: 'POST', path: () => `/plans/${ids.plan}/approve`, body: () => ({}) },
  { name: 'create objective', action: 'objective.created', method: 'POST', path: () => '/objectives', body: () => ({ planId: ids.plan, title: 'Synthetic atomic objective', targetValue: 10, ownerId: fixture.users.leader.id }) },
  { name: 'create initiative + notice intent', action: 'initiative.created', method: 'POST', path: () => '/initiatives', body: () => ({ workspaceId: ids.workspace, planId: ids.plan, initiativeType: 'SERVICE', title: 'Synthetic atomic initiative', objective: 'Synthetic objective', startsOn: '2030-01-01', endsOn: '2030-01-02', plannedBudget: 10, ownerId: fixture.users.leader.id }) },
  { name: 'update initiative', action: 'initiative.updated', method: 'PATCH', path: () => `/initiatives/${ids.initiative}`, body: () => ({ progress: 50 }) },
  { name: 'save assignment + notice intent', action: 'assignment.saved', method: 'POST', path: () => `/initiatives/${ids.initiative}/assignments`, body: () => ({ userId: fixture.users.leader.id, responsibility: 'Synthetic responsibility' }) },
  { name: 'create budget', action: 'budget.created', method: 'POST', path: () => '/budget', body: () => ({ workspaceId: ids.workspace, initiativeId: ids.initiative, entryType: 'EXPENSE', category: 'Synthetic', amount: 1, occurredOn: '2030-01-01' }) },
  { name: 'approve budget', action: 'budget.reviewed', method: 'PATCH', path: () => `/budget/${ids.budget}`, body: () => ({ status: 'APPROVED' }) },
  { name: 'create task + notice intent', action: 'task.created', method: 'POST', path: () => '/tasks', body: () => ({ workspaceId: ids.workspace, initiativeId: ids.initiative, title: 'Synthetic atomic task', assignedTo: fixture.users.leader.id }) },
  { name: 'update task', action: 'task.updated', method: 'PATCH', path: () => `/tasks/${ids.task}`, body: () => ({ status: 'COMPLETED' }) },
  { name: 'create meeting + notice intents', action: 'meeting.created', method: 'POST', path: () => '/meetings', body: () => ({ workspaceId: ids.workspace, title: 'Synthetic atomic meeting', scheduledAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T13:00:00Z', agenda: 'Synthetic agenda', participantIds: [fixture.users.leader.id] }) },
  { name: 'close meeting', action: 'meeting.updated', method: 'PATCH', path: () => `/meetings/${ids.meeting}`, body: () => ({ status: 'CLOSED', minutes: 'Synthetic minutes' }) },
  { name: 'create decision', action: 'decision.recorded', method: 'POST', path: () => '/decisions', body: () => ({ workspaceId: ids.workspace, meetingId: ids.meeting, initiativeId: ids.initiative, title: 'Synthetic atomic decision', decisionText: 'Synthetic recorded decision only', authorityType: 'DEPARTMENT', decidedOn: '2030-01-01' }) },
  { name: 'create comment + mention intent', action: 'comment.created', method: 'POST', path: () => '/comments', body: () => ({ workspaceId: ids.workspace, resourceType: 'INITIATIVE', resourceId: ids.initiative, body: 'Synthetic mention', mentionUserIds: [fixture.users.leader.id] }) },
  { name: 'create KPI', action: 'kpi.created', method: 'POST', path: () => '/kpis', body: () => ({ workspaceId: ids.workspace, name: 'Synthetic metric', targetValue: 10, periodStart: '2030-01-01', periodEnd: '2030-01-02' }) },
  { name: 'create record', action: 'record.created', method: 'POST', path: () => '/records', body: () => ({ workspaceId: ids.workspace, recordType: 'BIBLE_STUDY_SUMMARY', title: 'Synthetic atomic record', recordDate: '2030-01-01', visibility: 'TEAM', data: { synthetic: true } }) },
];
const request = (path: string, method = 'GET', body?: unknown, actor?: FixtureUser) => fetch(`http://127.0.0.1:4000/api/v1/department-operations${path}`, { method, headers: { cookie: `gc_session=${(actor ?? fixture.users.admin).token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
const reason = { reason: 'Synthetic controlled domain queue recovery' };
async function snapshot() {
  const tables = ['workspaces', 'annual_plans', 'objectives', 'initiatives', 'initiative_assignments', 'budget_entries', 'tasks', 'meetings', 'decisions', 'comments', 'kpis', 'ministry_records', 'notification_outbox'];
  const entries = tables.map((table) => `'${table}',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM department_operations.${table} t)`);
  entries.push("'notices',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM notifications.notifications t)", "'deliveries',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM notifications.deliveries t)", "'domainAudit',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM audit.audit_events t WHERE action NOT LIKE 'api.%')");
  return (await fixture.pool.query(`SELECT jsonb_build_object(${entries.join(',')}) state`)).rows[0].state;
}
async function failAudit(action: string) {
  await fixture.pool.query(`CREATE OR REPLACE FUNCTION audit.fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='department_operations.${action}' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await fixture.pool.query('CREATE TRIGGER fixture_failure BEFORE INSERT ON audit.audit_events FOR EACH ROW EXECUTE FUNCTION audit.fixture_failure()');
}
async function stopFailure() { await fixture.pool.query('DROP TRIGGER IF EXISTS fixture_failure ON audit.audit_events'); }
async function seed(key: string, sql: string, values: unknown[]) { ids[key] = (await fixture.pool.query<{ id: string }>(sql, values)).rows[0]!.id; }
async function event(attempts = 8, delivered = false) { return (await fixture.pool.query<{ id: string }>("INSERT INTO department_operations.notification_outbox(event_type,aggregate_id,payload,attempts,delivered_at) VALUES('fixture.recovery',$1,$2::jsonb,$3,CASE WHEN $4 THEN now() ELSE NULL END) RETURNING id", [randomUUID(), JSON.stringify({ privateContent: 'Synthetic must not appear in metadata' }), attempts, delivered])).rows[0]!.id; }

live('all departmental write routes roll back domain, audit and durable intents on their real HTTP route', () => {
  beforeAll(async () => {
    fixture = await createTenantFixture();
    await fixture.pool.query('INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled) SELECT id,false,false FROM identity.users');
    // Suppress automatic transport only on this owned fixture to keep rollback snapshots deterministic.
    await fixture.pool.query("CREATE FUNCTION department_operations.fixture_hold_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.next_attempt_at=now()+interval '1 day'; RETURN NEW; END $$");
    await fixture.pool.query('CREATE TRIGGER fixture_hold_intent BEFORE INSERT ON department_operations.notification_outbox FOR EACH ROW EXECUTE FUNCTION department_operations.fixture_hold_intent()');
    const context = await request(`/context?departmentId=${fixture.departments.mission}`); expect(context.status).toBe(200);
    ids.workspace = (await context.json()).selected.id;
    const admin = fixture.users.admin.id;
    await seed('plan', "INSERT INTO department_operations.annual_plans(workspace_id,title,year,created_by) VALUES($1,'Synthetic fixture plan',2030,$2) RETURNING id", [ids.workspace, admin]);
    await seed('initiative', "INSERT INTO department_operations.initiatives(workspace_id,initiative_type,title,objective,starts_on,ends_on,created_by) VALUES($1,'SERVICE','Synthetic fixture initiative','Synthetic objective','2030-01-01','2030-01-02',$2) RETURNING id", [ids.workspace, admin]);
    await seed('budget', "INSERT INTO department_operations.budget_entries(workspace_id,initiative_id,entry_type,category,description,amount,occurred_on,created_by) VALUES($1,$2,'EXPENSE','Synthetic','Synthetic',1,'2030-01-01',$3) RETURNING id", [ids.workspace, ids.initiative, admin]);
    await seed('task', "INSERT INTO department_operations.tasks(workspace_id,title,assigned_to,created_by) VALUES($1,'Synthetic fixture task',$2,$3) RETURNING id", [ids.workspace, fixture.users.leader.id, admin]);
    await seed('meeting', "INSERT INTO department_operations.meetings(workspace_id,title,scheduled_at,ends_at,agenda,created_by) VALUES($1,'Synthetic fixture meeting','2030-01-01T12:00:00Z','2030-01-01T13:00:00Z','Synthetic agenda',$2) RETURNING id", [ids.workspace, admin]);
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);
  it.each(mutations)('$name: failed audit changes nothing and positive retry succeeds', async (mutation) => {
    const before = await snapshot(); await failAudit(mutation.action);
    try { expect((await request(mutation.path(), mutation.method, mutation.body())).status).toBe(500); expect(await snapshot()).toEqual(before); }
    finally { await stopFailure(); }
    expect((await request(mutation.path(), mutation.method, mutation.body())).status).toBe(mutation.method === 'POST' ? 201 : 200);
  });
  it('retains existing viewer authority and does not create external delivery channels', async () => {
    const before = await snapshot();
    expect((await request('/plans', 'POST', mutations[0]!.body(), fixture.users.viewer)).status).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect((await fixture.pool.query("SELECT count(*)::int count FROM notifications.deliveries WHERE channel IN ('EMAIL','WHATSAPP')")).rows[0].count).toBe(0);
  });
  it('lists only five exhausted metadata fields, never payload or delivered records', async () => {
    const id = await event(), delivered = await event(8, true); const response = await request('/outbox/dead-letter'); expect(response.status).toBe(200);
    const items = (await response.json()).items; const item = items.find((candidate: { id: string }) => candidate.id === id);
    expect(Object.keys(item).sort()).toEqual(['aggregateId', 'attempts', 'createdAt', 'eventType', 'id']);
    expect(JSON.stringify(items)).not.toContain('privateContent'); expect(items.some((candidate: { id: string }) => candidate.id === delivered)).toBe(false);
  });
  it('denies non-admin queue and recovery with no changes', async () => {
    const id = await event(); expect((await request('/outbox/dead-letter', 'GET', undefined, fixture.users.leader)).status).toBe(403);
    expect((await request(`/outbox/${id}/retry`, 'POST', reason, fixture.users.leader)).status).toBe(403);
    expect((await fixture.pool.query('SELECT attempts FROM department_operations.notification_outbox WHERE id=$1', [id])).rows[0].attempts).toBe(8);
  });
  it('rejects delivered and still-automatic events', async () => {
    for (const id of [await event(8, true), await event(2)]) expect((await request(`/outbox/${id}/retry`, 'POST', reason)).status).toBe(409);
  });
  it('recovers the same ID once under concurrent requests and records the reason', async () => {
    const id = await event(); const responses = await Promise.all([request(`/outbox/${id}/retry`, 'POST', reason), request(`/outbox/${id}/retry`, 'POST', reason)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await responses.find((response) => response.status === 201)!.json()).toEqual({ id, retryScheduled: true });
    const rows = (await fixture.pool.query("SELECT after_data FROM audit.audit_events WHERE action='department_operations.outbox_retry_requested' AND resource_id=$1", [id])).rows;
    expect(rows).toHaveLength(1); expect(rows[0].after_data).toMatchObject({ reason: reason.reason, previousAttempts: 8 });
  });
  it('rolls back exhausted-state reset when its audit fails, then accepts a positive retry', async () => {
    const id = await event(); await failAudit('outbox_retry_requested');
    try { expect((await request(`/outbox/${id}/retry`, 'POST', reason)).status).toBe(500); expect((await fixture.pool.query('SELECT attempts FROM department_operations.notification_outbox WHERE id=$1', [id])).rows[0].attempts).toBe(8); }
    finally { await stopFailure(); }
    expect((await request(`/outbox/${id}/retry`, 'POST', reason)).status).toBe(201);
  });
  it('rejects malformed IDs, short reasons and missing IDs before queue mutation', async () => {
    expect((await request('/outbox/not-a-uuid/retry', 'POST', reason)).status).toBe(400);
    const id = await event(); expect((await request(`/outbox/${id}/retry`, 'POST', { reason: 'short' })).status).toBe(400);
    expect((await request(`/outbox/${randomUUID()}/retry`, 'POST', reason)).status).toBe(404);
    expect((await fixture.pool.query('SELECT attempts FROM department_operations.notification_outbox WHERE id=$1', [id])).rows[0].attempts).toBe(8);
  });
});
