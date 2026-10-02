import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type FixtureUser, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const enabled = process.env.RUN_PREMIUM_GOVERNANCE_TESTS === '1';
let church: SyntheticTenantFixture;
let foreign: SyntheticTenantFixture;
async function request(path: string, user: FixtureUser, method = 'GET', body?: unknown) {
  return fetch(`http://localhost:4000/api/v1${path}`, {
    method, headers: { authorization: `Bearer ${user.token}`, origin: 'http://localhost:3000', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
  });
}
async function json(path: string, user = church.users.admin, method = 'GET', body?: unknown, status = 200) {
  const response = await request(path, user, method, body);
  expect(response.status, `${method} ${path}`).toBe(status);
  return response.json();
}
const sessions = (day: number) => [{ startsAt: `2030-02-${String(day).padStart(2, '0')}T16:00:00.000Z`, endsAt: `2030-02-${String(day).padStart(2, '0')}T18:00:00.000Z`, setupMinutes: 10, teardownMinutes: 10 }];
async function create(title: string, day: number, user = church.users.leader, alternateDay?: number) {
  return json('/activities', user, 'POST', {
    title, description: 'Synthetic governance test, no church data', departmentId: church.departments.youth, responsibleName: 'Synthetic coordinator',
    options: [{ label: 'Preferred synthetic date', preference: 1, sessions: sessions(day) }, ...(alternateDay ? [{ label: 'Synthetic alternate date', preference: 2, sessions: sessions(alternateDay) }] : [])],
  }, 201);
}
async function conflictPair(day: number) {
  const first = await create(`Synthetic priority ${randomUUID()}`, day);
  const second = await create(`Synthetic later request ${randomUUID()}`, day);
  const submissions = await Promise.all([json(`/activities/${first.id}/submit`, church.users.leader, 'POST', {}, 201), json(`/activities/${second.id}/submit`, church.users.leader, 'POST', {}, 201)]);
  expect(submissions.map((item) => item.status).sort()).toEqual(['CONFLICTED', 'SUBMITTED']);
  const loser = submissions.findIndex((item) => item.status === 'CONFLICTED');
  const candidate = loser === 0 ? first : second;
  const preferred = loser === 0 ? second : first;
  expect(submissions[loser].conflict.details[0]).toMatchObject({ activity_id: preferred.id });
  const review = await json(`/activities/${candidate.id}/request-review`, church.users.leader, 'POST', {
    reason: 'Synthetic request for formal review of overlapping activities.', coexistencePlan: 'Separate synthetic resources and responsible teams.', impact: 'Synthetic scheduling impact.', resourcePlan: 'No shared resources.',
  }, 201);
  return { candidate, preferred, review };
}

describe.skipIf(!enabled)('calendar governance with isolated churches and persisted decisions', () => {
  beforeAll(async () => {
    expect((await fetch('http://localhost:4000/health/ready')).ok).toBe(true);
    church = await createTenantFixture(); foreign = await createTenantFixture();
    // No outbound delivery to external recipients in a governance test.
    await church.pool.query('INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled) SELECT id,false,false FROM identity.users');
  }, 120_000);
  afterAll(async () => { if (church) await church.destroy(); if (foreign) await foreign.destroy(); }, 120_000);

  it('reserves concurrently, identifies priority and approves a managed free alternative with the existing secretary authority', async () => {
    const { candidate, preferred, review } = await conflictPair(1);
    const queue = await json('/review-requests', church.users.secretary);
    expect(queue.items.find((item: { id: string }) => item.id === review.id).details[0]).toMatchObject({ activity_id: preferred.id, has_priority: true, department: 'Jóvenes' });
    const availability = await json(`/availability?start=${encodeURIComponent(sessions(1)[0]!.startsAt)}&end=${encodeURIComponent(sessions(1)[0]!.endsAt)}&departmentId=${church.departments.youth}`);
    expect(availability.available).toBe(false);
    expect(availability.conflicts[0]).toMatchObject({ activity_id: preferred.id });
    const alternative = await json(`/review-requests/${review.id}/alternatives`, church.users.admin, 'POST', { label: 'Synthetic authorized alternative', ...sessions(2)[0] }, 201);
    const decision = { decision: 'APPROVE_ALTERNATIVE', optionId: alternative.id, notes: 'Synthetic formal decision with the existing authority.' };
    expect((await request(`/review-requests/${review.id}/decision`, church.users.admin, 'POST', decision)).status).toBe(403);
    expect((await request(`/review-requests/${review.id}/decision`, foreign.users.secretary, 'POST', decision)).status).toBe(409);
    await json(`/review-requests/${review.id}/decision`, church.users.secretary, 'POST', decision, 201);
    const detail = await json(`/activities/${candidate.id}`, church.users.leader);
    expect(detail.status).toBe('APPROVED');
    expect(detail.options.find((option: { is_selected: boolean }) => option.is_selected)?.sessions[0].startsAt).toContain('2030-02-02');
    expect((await church.pool.query("SELECT actor_id,after_data FROM audit.audit_events WHERE resource_id=$1 AND action='review.decided'", [review.id])).rows).toEqual([
      expect.objectContaining({ actor_id: church.users.secretary.id, after_data: expect.objectContaining({ decision: 'APPROVE_ALTERNATIVE', notes: decision.notes }) }),
    ]);
  });

  it('permits coexistence only through the existing secretary decision and preserves both reservations', async () => {
    const { candidate, preferred, review } = await conflictPair(13);
    const decision = { decision: 'APPROVE_COEXISTENCE', notes: 'Synthetic coexistence approved with separate teams and resources.' };
    expect((await request(`/review-requests/${review.id}/decision`, church.users.leader, 'POST', decision)).status).toBe(403);
    await json(`/review-requests/${review.id}/decision`, church.users.secretary, 'POST', decision, 201);
    expect((await json(`/activities/${candidate.id}`)).status).toBe('APPROVED');
    const reservations = await church.pool.query('SELECT activity_id,waiver_id FROM calendar.reservations WHERE activity_id=ANY($1::uuid[]) AND status<>\'RELEASED\'', [[candidate.id, preferred.id]]);
    expect(reservations.rows).toHaveLength(2);
    expect(reservations.rows.find((row) => row.activity_id === candidate.id)?.waiver_id).toBeTruthy();
    expect(reservations.rows.find((row) => row.activity_id === preferred.id)?.waiver_id).toBeNull();
  });

  it('revalidates an alternative occupied after proposal and does not apply a stale approval', async () => {
    const { candidate, review } = await conflictPair(4);
    const alternative = await json(`/review-requests/${review.id}/alternatives`, church.users.admin, 'POST', { label: 'Synthetic date later occupied', ...sessions(5)[0] }, 201);
    const blocker = await create('Synthetic later reservation', 5);
    await json(`/activities/${blocker.id}/submit`, church.users.leader, 'POST', {}, 201);
    expect((await request(`/review-requests/${review.id}/decision`, church.users.secretary, 'POST', { decision: 'APPROVE_ALTERNATIVE', optionId: alternative.id, notes: 'Synthetic stale approval must be refused.' })).status).toBe(409);
    expect((await json(`/activities/${candidate.id}`)).status).not.toBe('APPROVED');
  });

  it('offers an existing alternative to its submitter and persists confirmation', async () => {
    const preferred = await create('Synthetic reserved primary', 7);
    await json(`/activities/${preferred.id}/submit`, church.users.leader, 'POST', {}, 201);
    const candidate = await create('Synthetic owner alternate', 7, church.users.leader, 8);
    const submitted = await json(`/activities/${candidate.id}/submit`, church.users.leader, 'POST', {}, 201);
    expect(submitted.status).toBe('ALTERNATIVE_AVAILABLE');
    await json(`/activities/${candidate.id}/options/${submitted.alternative.id}/confirm`, church.users.leader, 'POST', {}, 201);
    expect((await json(`/activities/${candidate.id}`, church.users.leader)).status).toBe('SUBMITTED');
  });

  it('protects approved activities; changes require secretary approval and reject stale versions', async () => {
    const activity = await create('Synthetic protected activity', 10);
    await json(`/activities/${activity.id}/submit`, church.users.leader, 'POST', {}, 201);
    await json(`/activities/${activity.id}/approve`, church.users.secretary, 'POST', {}, 201);
    const approved = await json(`/activities/${activity.id}`, church.users.leader);
    expect(approved.capabilities).toMatchObject({ canEdit: false, canCancel: false, canRequestChange: true });
    const changes = { title: 'Synthetic authorized changed title', expectedVersion: approved.version, changeReason: 'Synthetic change with an auditable reason.' };
    expect((await request(`/activities/${activity.id}`, church.users.leader, 'PATCH', changes)).status).toBe(409);
    expect((await request(`/activities/${activity.id}/cancel`, church.users.leader, 'POST', {})).status).toBe(409);
    const change = await json(`/activities/${activity.id}/change-requests`, church.users.leader, 'POST', { reason: 'Synthetic request submitted by the department director.', changes }, 201);
    expect((await request(`/activity-change-requests/${change.id}/decision`, church.users.leader, 'POST', { decision: 'APPROVE', notes: 'Synthetic unauthorized self-approval.' })).status).toBe(403);
    await json(`/activity-change-requests/${change.id}/decision`, church.users.secretary, 'POST', { decision: 'APPROVE', notes: 'Synthetic change approved by the existing authority.' }, 201);
    const final = await json(`/activities/${activity.id}`, church.users.leader);
    expect(final).toMatchObject({ title: changes.title, status: 'APPROVED' });
    expect(final.version).toBeGreaterThan(approved.version);
    expect((await request(`/activities/${activity.id}`, church.users.admin, 'PATCH', { ...changes, title: 'Synthetic stale version' })).status).toBe(412);
  });

  it('creates a board session, adds personal calendars, records RSVP and minutes, and denies unrelated participants', async () => {
    const input = { title: 'Synthetic coordinated review session', scheduledAt: '2030-03-01T16:00:00.000Z', endsAt: '2030-03-01T17:00:00.000Z', location: 'Synthetic meeting room', agenda: 'Synthetic review agenda and formal follow-up.', participantIds: [church.users.admin.id, church.users.secretary.id, church.users.leader.id], reviewRequestIds: [], reminderMinutes: [60] };
    expect((await request('/review-sessions', church.users.leader, 'POST', input)).status).toBe(403);
    expect((await request('/review-sessions', church.users.admin, 'POST', { ...input, participantIds: [foreign.users.admin.id] })).status).toBe(409);
    const session = await json('/review-sessions', church.users.secretary, 'POST', input, 201);
    for (const user of [church.users.admin, church.users.secretary, church.users.leader]) {
      const agenda = await json('/review-sessions/my-agenda?from=2030-03-01T00:00:00.000Z&to=2030-03-02T00:00:00.000Z', user);
      expect(agenda.items.some((item: { id: string }) => item.id === session.id)).toBe(true);
    }
    expect((await request(`/review-sessions/${session.id}/response`, church.users.member, 'PATCH', { response: 'CONFIRMED' })).status).toBe(403);
    await json(`/review-sessions/${session.id}/response`, church.users.leader, 'PATCH', { response: 'CONFIRMED' });
    const listed = await json('/review-sessions');
    expect(listed.items.find((item: { id: string }) => item.id === session.id).participants).toContainEqual(expect.objectContaining({ userId: church.users.leader.id, invitationStatus: 'CONFIRMED' }));
    await json(`/review-sessions/${session.id}`, church.users.secretary, 'PATCH', { status: 'CLOSED', minutes: 'Synthetic formal minutes with decisions and follow-up.', attendedParticipantIds: input.participantIds });
    expect((await church.pool.query('SELECT status,minutes FROM calendar.review_sessions WHERE id=$1', [session.id])).rows[0]).toMatchObject({ status: 'CLOSED', minutes: 'Synthetic formal minutes with decisions and follow-up.' });
  });

  it('closes an ended approved activity and updates the completed/overdue dashboard after reload', async () => {
    const ended = [{ startsAt: '2020-01-01T16:00:00.000Z', endsAt: '2020-01-01T17:00:00.000Z', setupMinutes: 0, teardownMinutes: 0 }];
    const activity = await json('/activities', church.users.leader, 'POST', { title: 'Synthetic overdue activity', description: 'Synthetic past activity for closure validation.', departmentId: church.departments.youth, responsibleName: 'Synthetic coordinator', options: [{ label: 'Synthetic past date', preference: 1, sessions: ended }] }, 201);
    await json(`/activities/${activity.id}/submit`, church.users.leader, 'POST', {}, 201);
    await json(`/activities/${activity.id}/approve`, church.users.secretary, 'POST', {}, 201);
    const before = await json('/dashboard');
    expect((await request(`/activities/${activity.id}/complete`, church.users.member, 'POST', {})).status).toBe(403);
    await json(`/activities/${activity.id}/complete`, church.users.leader, 'POST', {}, 201);
    const after = await json('/dashboard');
    expect(after.stats.completed).toBe(before.stats.completed + 1);
    expect(after.stats.overdue).toBe(before.stats.overdue - 1);
    expect((await json(`/activities/${activity.id}`, church.users.leader)).status).toBe('COMPLETED');
  });
});
