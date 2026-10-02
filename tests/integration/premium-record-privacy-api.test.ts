import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type FixtureUser, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';
const live = process.env.RUN_PREMIUM_RECORD_PRIVACY_API_TESTS === '1' ? describe : describe.skip;
let fixture: SyntheticTenantFixture, director: FixtureUser, viewer: FixtureUser;
const request = (path: string, actor: FixtureUser, method = 'GET', body?: unknown) => fetch(`http://127.0.0.1:4000/api/v1/department-operations${path}`, { method, headers: { cookie: `gc_session=${actor.token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
live('historical record privacy enforced without rewriting stored data', () => {
  beforeAll(async () => {
    expect((await fetch('http://127.0.0.1:4000/health/ready', { signal: AbortSignal.timeout(5_000) })).ok).toBe(true);
    fixture = await createTenantFixture();
    const departments = [fixture.departments.mission, fixture.departments.family];
    director = await fixture.createUser(['DEPARTMENT_LEADER'], departments.map((departmentId) => ({ departmentId, role: 'DIRECTOR' })));
    viewer = await fixture.createUser(['VIEWER'], departments.map((departmentId) => ({ departmentId, role: 'VIEWER' })));
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);
  it.each(['mission', 'family'] as const)('%s: hides legacy TEAM data/comments/counts at the declared floor and preserves Director access', async (department) => {
    const departmentId = fixture.departments[department], minimum = department === 'mission' ? 'LEADERSHIP' : 'RESTRICTED';
    const context = await request(`/context?departmentId=${departmentId}`, director); expect(context.status).toBe(200); const initial = await context.json();
    const workspaceId = initial.selected.id, recordType = initial.selected.pack.recordTypes.find((definition: { privacy: string }) => definition.privacy === minimum).type;
    const marker = `Synthetic legacy ${randomUUID()}`;
    const recordId = (await fixture.pool.query<{ id: string }>("INSERT INTO department_operations.ministry_records(workspace_id,record_type,title,record_date,visibility,data,created_by) VALUES($1,$2,$3,'2030-01-01','TEAM',$4::jsonb,$5) RETURNING id", [workspaceId, recordType, marker, JSON.stringify({ marker }), director.id])).rows[0]!.id;
    await fixture.pool.query("INSERT INTO department_operations.comments(workspace_id,resource_type,resource_id,body,created_by) VALUES($1,'RECORD',$2,$3,$4)", [workspaceId, recordId, marker, director.id]);
    const allowed = await request(`/context?departmentId=${departmentId}`, director); expect(allowed.status).toBe(200); const visible = await allowed.json();
    expect(visible.records.find((record: { id: string }) => record.id === recordId).visibility).toBe(minimum);
    const readonly = await request(`/context?departmentId=${departmentId}`, viewer); expect(readonly.status).toBe(200); const hidden = await readonly.json();
    expect(hidden.records.some((record: { id: string }) => record.id === recordId)).toBe(false); expect(hidden.comments.some((comment: { body: string }) => comment.body.includes(marker))).toBe(false);
    // There is no standalone detail route; the actual read surface is context.
    expect((await request(`/records/${recordId}`, viewer)).status).toBe(404);
    const comment = { workspaceId, resourceType: 'RECORD', resourceId: recordId, body: 'Synthetic forbidden comment', mentionUserIds: [] };
    expect((await request('/comments', viewer, 'POST', comment)).status).toBe(403);
    expect((await request('/comments', director, 'POST', { ...comment, body: 'Synthetic authorized comment' })).status).toBe(201);
    expect((await request('/comments', director, 'POST', { ...comment, mentionUserIds: [viewer.id] })).status).toBe(403);
    const csv = await request(`/reports/executive.csv?workspaceId=${workspaceId}`, viewer); expect(csv.status).toBe(200);
    const recordCount = (await csv.text()).split('\r\n').find((line) => line.replaceAll('"', '').startsWith('Registros,'));
    expect(recordCount?.replaceAll('"', '')).toBe('Registros,0');
    expect((await fixture.pool.query('SELECT visibility FROM department_operations.ministry_records WHERE id=$1', [recordId])).rows[0].visibility).toBe('TEAM');
  });
});
