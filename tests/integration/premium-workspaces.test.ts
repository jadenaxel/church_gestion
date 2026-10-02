import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type SyntheticTenantFixture, type FixtureUser } from '../helpers/tenant-fixture.js';

const enabled = process.env.RUN_PREMIUM_WORKSPACE_TESTS === '1';
const expectedPacks = {
  youth: 'CHILDREN_YOUTH', children: 'CHILDREN_YOUTH', worship: 'WORSHIP_MUSIC', music: 'WORSHIP_MUSIC',
  stewardship: 'STEWARDSHIP_FINANCE', treasury: 'STEWARDSHIP_FINANCE', communications: 'COMMUNICATION',
  sabbathSchool: 'SABBATH_SCHOOL', deacons: 'DEACONRY', family: 'FAMILY', health: 'HEALTH',
  mission: 'PERSONAL_MINISTRIES', woman: 'WOMENS_MINISTRY', elders: 'ELDERS_OPERATIONS',
} as const;
type Context = {
  selected: { id: string; departmentId: string; pack: { key: string; recordTypes: Array<{ type: string; privacy?: string }> } };
  plans: Array<{ id: string; objectives: Array<{ id: string }> }>;
  initiatives: Array<{ id: string }>;
  tasks: Array<{ id: string; status: string }>;
  meetings: Array<{ id: string; status: string }>;
  records: Array<{ id: string; visibility: string; data: { marker?: string } }>;
};
let church: SyntheticTenantFixture;
let foreign: SyntheticTenantFixture;
async function request(path: string, user: FixtureUser, method = 'GET', body?: unknown) {
  return fetch(`http://localhost:4000/api/v1/department-operations${path}`, {
    method, headers: { authorization: `Bearer ${user.token}`, origin: 'http://localhost:3000', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
  });
}
async function json<T>(path: string, user: FixtureUser, method = 'GET', body?: unknown, status = 200): Promise<T> {
  const response = await request(path, user, method, body);
  expect(response.status, `${method} ${path}`).toBe(status);
  return response.json() as Promise<T>;
}

describe.skipIf(!enabled)('annual workspace operation for every department capability pack', () => {
  beforeAll(async () => {
    expect((await fetch('http://localhost:4000/health/ready')).ok).toBe(true);
    church = await createTenantFixture(); foreign = await createTenantFixture();
  }, 120_000);
  afterAll(async () => { if (church) await church.destroy(); if (foreign) await foreign.destroy(); });

  it.each(Object.entries(expectedPacks) as Array<[keyof typeof expectedPacks, string]>)('%s: plan, objective, program, task, meeting and all specialized record types persist with scoped permissions', async (key, expectedPack) => {
    const departmentId = church.departments[key];
    const director = await church.createUser(['DEPARTMENT_LEADER'], [{ departmentId, role: 'DIRECTOR' }]);
    const viewer = await church.createUser(['VIEWER'], [{ departmentId, role: 'VIEWER' }]);
    const initial = await json<Context>(`/context?departmentId=${departmentId}`, director);
    expect(initial.selected.pack.key).toBe(expectedPack);
    const workspaceId = initial.selected.id;
    const plan = await json<{ id: string }>('/plans', director, 'POST', { workspaceId, title: 'Synthetic annual operation', year: 2027, ownerId: director.id }, 201);
    const objective = await json<{ id: string }>('/objectives', director, 'POST', { planId: plan.id, title: 'Synthetic measurable objective', targetValue: 10, unit: 'services', ownerId: director.id }, 201);
    const initiative = await json<{ id: string }>('/initiatives', director, 'POST', { workspaceId, planId: plan.id, initiativeType: 'PROGRAM', title: 'Synthetic departmental program', objective: 'Test persisted scoped operations', startsOn: '2027-02-01', endsOn: '2027-02-02', ownerId: director.id }, 201);
    const task = await json<{ id: string }>('/tasks', director, 'POST', { workspaceId, initiativeId: initiative.id, title: 'Synthetic preparation task', assignedTo: director.id }, 201);
    await json(`/tasks/${task.id}`, director, 'PATCH', { status: 'COMPLETED' });
    const meeting = await json<{ id: string }>('/meetings', director, 'POST', { workspaceId, title: 'Synthetic planning meeting', scheduledAt: '2027-01-20T16:00:00.000Z', endsAt: '2027-01-20T17:00:00.000Z', agenda: 'Review the synthetic departmental program', participantIds: [director.id] }, 201);
    await json(`/meetings/${meeting.id}`, director, 'PATCH', { status: 'CLOSED', minutes: 'Synthetic agreement and follow-up recorded.' });
    const records = [];
    for (const definition of initial.selected.pack.recordTypes) {
      const record = await json<{ id: string }>('/records', director, 'POST', { workspaceId, recordType: definition.type, title: `Synthetic ${definition.type}`, recordDate: '2027-02-01', visibility: 'TEAM', data: { marker: `${key}-${definition.type}` }, ownerId: director.id }, 201);
      records.push({ id: record.id, privacy: definition.privacy ?? 'TEAM' });
    }
    const reloaded = await json<Context>(`/context?departmentId=${departmentId}`, director);
    expect(reloaded.plans.find(({ id }) => id === plan.id)?.objectives.some(({ id }) => id === objective.id)).toBe(true);
    expect(reloaded.initiatives.some(({ id }) => id === initiative.id)).toBe(true);
    expect(reloaded.tasks.find(({ id }) => id === task.id)?.status).toBe('COMPLETED');
    expect(reloaded.meetings.find(({ id }) => id === meeting.id)?.status).toBe('CLOSED');
    for (const record of records) expect(reloaded.records.find(({ id }) => id === record.id)?.visibility).toBe(record.privacy);
    const readonly = await json<Context>(`/context?departmentId=${departmentId}`, viewer);
    for (const record of records) expect(readonly.records.some(({ id }) => id === record.id)).toBe(record.privacy === 'TEAM');
    expect((await request('/tasks', viewer, 'POST', { workspaceId, title: 'Synthetic forbidden mutation' })).status).toBe(403);
    expect((await request('/tasks', foreign.users.admin, 'POST', { workspaceId, title: 'Synthetic cross-tenant mutation' })).status).toBe(404);
    expect((await church.pool.query("SELECT 1 FROM audit.audit_events WHERE action='department_operations.record.created' AND resource_id=$1", [records[0]!.id])).rowCount).toBe(1);
  }, 60_000);
});
