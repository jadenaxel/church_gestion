import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type FixtureUser, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';
const live = process.env.RUN_PREMIUM_DOMAIN_ATOMICITY_API_TESTS === '1' ? describe : describe.skip;
let fixture: SyntheticTenantFixture;
const ids: Record<string, string> = {};
type Mutation = { name: string; action: string; method: 'POST' | 'PATCH'; path: () => string; body: () => unknown };
const pm = (name: string, action: string, method: 'POST' | 'PATCH', path: () => string, body: () => unknown): Mutation => ({ name: `PM ${name}`, action: `personal_ministries.${action}`, method, path: () => `/personal-ministries${path()}`, body });
const women = (name: string, action: string, method: 'POST' | 'PATCH', path: () => string, body: () => unknown): Mutation => ({ name: `Women ${name}`, action: `womens_ministry.${action}`, method, path: () => `/womens-ministry${path()}`, body });
const cases: Mutation[] = [
  pm('create plan', 'plan.created', 'POST', () => '/strategic-plans', () => ({ title: 'Synthetic atomic plan', periodStart: '2030-01-01', periodEnd: '2030-01-02', ownerId: fixture.users.leader.id })),
  pm('create initiative + assignment/notice', 'initiative.created', 'POST', () => '/initiatives', () => ({ title: 'Synthetic atomic initiative', startsOn: '2030-01-01', endsOn: '2030-01-02', assigneeId: fixture.users.leader.id, responsibility: 'Synthetic responsibility' })),
  pm('update initiative', 'initiative.updated', 'PATCH', () => `/initiatives/${ids.pmInitiative}`, () => ({ progress: 50 })),
  pm('create budget entry', 'budget_entry.created', 'POST', () => `/initiatives/${ids.pmInitiative}/budget-entries`, () => ({ entryType: 'EXPENSE', category: 'Synthetic', description: 'Synthetic budget', amount: 1, occurredOn: '2030-01-01' })),
  pm('update budget entry', 'budget_entry.updated', 'PATCH', () => `/budget-entries/${ids.pmBudget}`, () => ({ status: 'PAID' })),
  pm('save assignment + notice', 'assignment.saved', 'POST', () => `/initiatives/${ids.pmInitiative}/assignments`, () => ({ userId: fixture.users.leader.id, responsibility: 'Synthetic atomic assignment', workloadPercent: 10 })),
  pm('create contact', 'contact.created', 'POST', () => '/contacts', () => ({ name: 'Synthetic atomic contact', assignedTo: fixture.users.leader.id })),
  pm('update contact', 'contact.updated', 'PATCH', () => `/contacts/${ids.pmContact}`, () => ({ stage: 'BAPTISM_CANDIDATE' })),
  pm('create study + update contact', 'study.created', 'POST', () => '/bible-studies', () => ({ contactId: ids.pmContact, instructorId: fixture.users.leader.id, studiedAt: '2030-01-01T12:00:00Z', lesson: 'Synthetic atomic lesson', nextStudyAt: '2030-01-02T12:00:00Z' })),
  pm('update study', 'study.updated', 'PATCH', () => `/bible-studies/${ids.pmStudy}`, () => ({ status: 'COMPLETED' })),
  pm('create group', 'group.created', 'POST', () => '/small-groups', () => ({ name: 'Synthetic atomic group', leaderId: fixture.users.leader.id, meetingDay: 0, meetingTime: '12:00' })),
  pm('update group', 'group.updated', 'PATCH', () => `/small-groups/${ids.pmGroup}`, () => ({ status: 'PAUSED' })),
  pm('create minute + notice', 'minute.created', 'POST', () => '/missionary-minutes', () => ({ title: 'Synthetic atomic minute', scheduledAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T12:15:00Z', presenterId: fixture.users.leader.id })),
  pm('update minute', 'minute.updated', 'PATCH', () => `/missionary-minutes/${ids.pmMinute}`, () => ({ status: 'COMPLETED' })),
  pm('create campaign', 'campaign.created', 'POST', () => '/campaigns', () => ({ title: 'Synthetic atomic campaign', startsOn: '2030-01-01', endsOn: '2030-01-02' })),
  pm('update campaign', 'campaign.updated', 'PATCH', () => `/campaigns/${ids.pmCampaign}`, () => ({ status: 'COMPLETED' })),
  women('save person', 'woman.saved', 'POST', () => '/women', () => ({ name: 'Synthetic atomic woman', preferredContact: 'NONE' })),
  women('create modular activity', 'activity.created', 'POST', () => '/activities', () => ({ calendarActivityId: ids.womenNewCore, title: 'Synthetic atomic activity', activityType: 'SERVICE', objective: 'Synthetic objective', startsAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T13:00:00Z', plannedBudget: 100 })),
  women('update modular activity', 'activity.updated', 'PATCH', () => `/activities/${ids.womenActivity}`, () => ({ status: 'COMPLETED', outcome: 'Synthetic atomic outcome' })),
  women('create budget entry', 'budget_entry.created', 'POST', () => `/activities/${ids.womenActivity}/budget`, () => ({ entryType: 'EXPENSE', category: 'Synthetic', amount: 1, occurredOn: '2030-01-01' })),
  women('save participation', 'participation.saved', 'POST', () => `/activities/${ids.womenActivity}/participation`, () => ({ womanId: ids.woman, status: 'ATTENDED' })),
  women('create retreat', 'retreat.created', 'POST', () => '/retreats', () => ({ title: 'Synthetic atomic retreat', year: 2030, resort: 'Synthetic venue', startsOn: '2030-01-01', endsOn: '2030-01-02', capacity: 10, costPerPerson: 10, totalBudget: 100 })),
  women('save registration', 'retreat_registration.saved', 'POST', () => `/retreats/${ids.retreat}/registrations`, () => ({ womanId: ids.woman2, amountDue: 10 })),
  women('update registration', 'retreat_registration.updated', 'PATCH', () => `/retreat-registrations/${ids.registration}`, () => ({ amountDue: 20 })),
  women('record payment', 'retreat_payment.created', 'POST', () => `/retreat-registrations/${ids.registration}/payments`, () => ({ amount: 1, paidOn: '2030-01-01', method: 'CASH', reference: 'Synthetic atomic payment' })),
  women('create follow-up + notice', 'follow_up.created', 'POST', () => '/follow-ups', () => ({ womanId: ids.woman, reason: 'Synthetic atomic follow-up', dueOn: '2030-01-01', assignedTo: fixture.users.leader.id })),
  women('update follow-up', 'follow_up.updated', 'PATCH', () => `/follow-ups/${ids.followUp}`, () => ({ status: 'COMPLETED', notes: 'Synthetic atomic update' })),
];
const request = (path: string, method: string, body?: unknown, actor?: FixtureUser) => fetch(`http://127.0.0.1:4000/api/v1${path}`, { method, headers: { cookie: `gc_session=${(actor ?? fixture.users.admin).token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
const snapshotTables = ['personal_ministries.strategic_plans', 'personal_ministries.initiatives', 'personal_ministries.initiative_assignments', 'personal_ministries.budget_entries', 'personal_ministries.contacts', 'personal_ministries.bible_studies', 'personal_ministries.small_groups', 'personal_ministries.missionary_minutes', 'personal_ministries.campaigns', 'womens_ministry.women', 'womens_ministry.activities', 'womens_ministry.activity_budget_entries', 'womens_ministry.activity_participation', 'womens_ministry.retreats', 'womens_ministry.retreat_registrations', 'womens_ministry.retreat_payments', 'womens_ministry.follow_ups', 'womens_ministry.birthday_alerts', 'notifications.notifications'] as const;
async function snapshot() {
  const entries = snapshotTables.map((table) => `'${table}',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ${table} t)`);
  // The separate HTTP-attempt ledger is expected to record failed requests.
  entries.push("'domainAudit',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM audit.audit_events t WHERE action NOT LIKE 'api.%')");
  return (await fixture.pool.query(`SELECT jsonb_build_object(${entries.join(',')}) state`)).rows[0].state;
}
async function failAudit(action: string) {
  await fixture.pool.query(`CREATE OR REPLACE FUNCTION audit.fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await fixture.pool.query('CREATE TRIGGER fixture_failure BEFORE INSERT ON audit.audit_events FOR EACH ROW EXECUTE FUNCTION audit.fixture_failure()');
}
async function stopFailure() { await fixture.pool.query('DROP TRIGGER IF EXISTS fixture_failure ON audit.audit_events'); }
async function seedId(key: string, sql: string, values: unknown[]) { ids[key] = (await fixture.pool.query<{ id: string }>(sql, values)).rows[0]!.id; }

live('all declared PM/Women mutations roll back business, notices and domain audit together', () => {
  beforeAll(async () => {
    expect((await fetch('http://127.0.0.1:4000/health/ready', { signal: AbortSignal.timeout(5_000) })).ok).toBe(true);
    fixture = await createTenantFixture();
    await fixture.pool.query('INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled) SELECT id,false,false FROM identity.users');
    const admin = fixture.users.admin.id, leader = fixture.users.leader.id;
    await seedId('pmInitiative', "INSERT INTO personal_ministries.initiatives(title,starts_on,ends_on,created_by) VALUES('Synthetic fixture initiative','2030-01-01','2030-01-02',$1) RETURNING id", [admin]);
    await seedId('pmBudget', "INSERT INTO personal_ministries.budget_entries(initiative_id,entry_type,category,description,amount,occurred_on,created_by) VALUES($1,'EXPENSE','Synthetic','Synthetic',1,'2030-01-01',$2) RETURNING id", [ids.pmInitiative, admin]);
    await seedId('pmContact', "INSERT INTO personal_ministries.contacts(name,created_by) VALUES('Synthetic fixture contact',$1) RETURNING id", [admin]);
    await seedId('pmStudy', "INSERT INTO personal_ministries.bible_studies(contact_id,instructor_id,studied_at,lesson,created_by) VALUES($1,$2,'2030-01-01T12:00:00Z','Synthetic',$3) RETURNING id", [ids.pmContact, leader, admin]);
    await seedId('pmGroup', "INSERT INTO personal_ministries.small_groups(name,leader_id,meeting_day,meeting_time,created_by) VALUES('Synthetic fixture group',$1,0,'12:00',$2) RETURNING id", [leader, admin]);
    await seedId('pmMinute', "INSERT INTO personal_ministries.missionary_minutes(title,scheduled_at,ends_at,presenter_id,created_by) VALUES('Synthetic fixture minute','2030-01-01T12:00:00Z','2030-01-01T12:15:00Z',$1,$2) RETURNING id", [leader, admin]);
    await seedId('pmCampaign', "INSERT INTO personal_ministries.campaigns(title,starts_on,ends_on,created_by) VALUES('Synthetic fixture campaign','2030-01-01','2030-01-02',$1) RETURNING id", [admin]);
    for (const key of ['woman', 'woman2']) await seedId(key, 'INSERT INTO womens_ministry.women(name,preferred_contact,created_by) VALUES($1,\'NONE\',$2) RETURNING id', [`Synthetic fixture ${key}`, admin]);
    for (const key of ['womenCore', 'womenNewCore']) await seedId(key, "INSERT INTO calendar.activities(title,description,department_id,responsible_name,responsible_user_id,created_by) VALUES($1,'Synthetic',$2,'Synthetic',$3,$3) RETURNING id", [`Synthetic fixture ${key}`, fixture.departments.woman, admin]);
    await seedId('womenActivity', "INSERT INTO womens_ministry.activities(calendar_activity_id,title,activity_type,objective,starts_at,ends_at,created_by) VALUES($1,'Synthetic fixture activity','SERVICE','Synthetic','2030-01-01T12:00:00Z','2030-01-01T13:00:00Z',$2) RETURNING id", [ids.womenCore, admin]);
    await seedId('retreat', "INSERT INTO womens_ministry.retreats(title,year,resort,starts_on,ends_on,capacity,created_by) VALUES('Synthetic fixture retreat',2030,'Synthetic','2030-01-01','2030-01-02',10,$1) RETURNING id", [admin]);
    await seedId('registration', 'INSERT INTO womens_ministry.retreat_registrations(retreat_id,woman_id,amount_due,registered_by) VALUES($1,$2,10,$3) RETURNING id', [ids.retreat, ids.woman, admin]);
    await seedId('followUp', "INSERT INTO womens_ministry.follow_ups(woman_id,reason,due_on,created_by) VALUES($1,'Synthetic fixture follow-up','2030-01-01',$2) RETURNING id", [ids.woman, admin]);
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);
  it.each(cases)('$name: failed audit changes nothing and the same valid payload can succeed afterward', async (mutation) => {
    const before = await snapshot(); await failAudit(mutation.action);
    try {
      const response = await request(mutation.path(), mutation.method, mutation.body()); expect(response.status).toBe(500);
      expect(await snapshot()).toEqual(before);
    } finally { await stopFailure(); }
    const retry = await request(mutation.path(), mutation.method, mutation.body()); expect(retry.status).toBe(mutation.method === 'POST' ? 201 : 200);
  });
  it('birthday dedup reservation, notice and audit also roll back on their GET-triggered generation', async () => {
    const today = (await fixture.pool.query('SELECT current_date::text today')).rows[0].today;
    await fixture.pool.query("INSERT INTO womens_ministry.women(name,date_of_birth,preferred_contact,created_by) VALUES('Synthetic birthday',('2000-'||$1::text)::date,'NONE',$2)", [today.slice(5), fixture.users.admin.id]);
    const before = await snapshot(); await failAudit('womens_ministry.birthday_alert.generated');
    try { expect((await request('/womens-ministry/context', 'GET')).status).toBe(500); expect(await snapshot()).toEqual(before); }
    finally { await stopFailure(); }
    expect((await request('/womens-ministry/context', 'GET')).status).toBe(200);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM womens_ministry.birthday_alerts')).rows[0].count).toBeGreaterThan(0);
  });
  it('retains existing authority and never creates any external delivery channel', async () => {
    const before = await snapshot();
    expect((await request('/personal-ministries/strategic-plans', 'POST', cases[0]!.body(), fixture.users.viewer)).status).toBe(403);
    expect((await request('/womens-ministry/women', 'POST', { name: 'Synthetic forbidden' }, fixture.users.viewer)).status).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect((await fixture.pool.query("SELECT count(*)::int count FROM notifications.deliveries WHERE channel IN ('EMAIL','WHATSAPP')")).rows[0].count).toBe(0);
  });
  it('groups Women budgets by currency without changing legacy fields or converting amounts', async () => {
    await seedId('usdCore', "INSERT INTO calendar.activities(title,description,department_id,responsible_name,responsible_user_id,created_by) VALUES('Synthetic currency core','Synthetic',$1,'Synthetic',$2,$2) RETURNING id", [fixture.departments.woman, fixture.users.admin.id]);
    await seedId('usdActivity', "INSERT INTO womens_ministry.activities(calendar_activity_id,title,activity_type,objective,starts_at,ends_at,planned_budget,currency,created_by) VALUES($1,'Synthetic USD activity','SERVICE','Synthetic','2030-01-01T12:00:00Z','2030-01-01T13:00:00Z',20,'USD',$2) RETURNING id", [ids.usdCore, fixture.users.admin.id]);
    await fixture.pool.query("INSERT INTO womens_ministry.activity_budget_entries(activity_id,entry_type,category,amount,occurred_on,created_by) VALUES($1,'EXPENSE','Synthetic',5,'2030-01-01',$2)", [ids.usdActivity, fixture.users.admin.id]);
    const response = await request('/womens-ministry/context', 'GET'); expect(response.status).toBe(200); const context = await response.json();
    expect(context.metrics.budgetAggregationComparable).toBe(false);
    expect(context.metrics.budgetsByCurrency.find((group: { currency: string }) => group.currency === 'USD')).toEqual({ currency: 'USD', plannedBudget: 20, spentBudget: 5, income: 0, availableBudget: 15 });
    expect(context.metrics.plannedBudget).toBe(context.activities.reduce((sum: number, activity: { plannedBudget: number }) => sum + activity.plannedBudget, 0));
  });

  it('a partial registration amount edit preserves confirmed attendance, room, transport and notes', async () => {
    await fixture.pool.query("UPDATE womens_ministry.retreat_registrations SET attendance_status='CONFIRMED',room_assignment='Synthetic room',transport_required=true,dietary_notes='Synthetic dietary note',notes='Synthetic registration note' WHERE id=$1", [ids.registration]);
    const before = (await fixture.pool.query('SELECT attendance_status,room_assignment,transport_required,dietary_notes,notes FROM womens_ministry.retreat_registrations WHERE id=$1', [ids.registration])).rows[0];
    expect((await request(`/womens-ministry/retreat-registrations/${ids.registration}`, 'PATCH', { amountDue: 25 })).status).toBe(200);
    expect((await fixture.pool.query('SELECT attendance_status,room_assignment,transport_required,dietary_notes,notes FROM womens_ministry.retreat_registrations WHERE id=$1', [ids.registration])).rows[0]).toEqual(before);
  });
});
