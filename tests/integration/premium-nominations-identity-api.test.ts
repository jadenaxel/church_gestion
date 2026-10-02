import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type FixtureUser, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_NOMINATIONS_IDENTITY_API_TESTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:4000/api/v1';
let fixture: SyntheticTenantFixture;
const request = (path: string, method = 'GET', body?: unknown, actor?: FixtureUser) => fetch(`${base}${path}`, { method, headers: { cookie: `gc_session=${(actor ?? fixture.users.admin).token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
const authorize = (actor: FixtureUser) => fetch(`${base}/integrations/nominations/authorize`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-integration-secret': process.env.NOMINATIONS_INTEGRATION_SECRET! }, body: JSON.stringify({ tenantId: fixture.id, subjectScope: 'tenant', subjectId: actor.id, sourceSessionId: actor.principal.sessionId }), signal: AbortSignal.timeout(10_000) });
live('central explicit nominations roles, current authorization and revocation', () => {
  beforeAll(async () => {
    expect(process.env.NOMINATIONS_INTEGRATION_SECRET?.length, 'Configured integration secret is required but must not be printed').toBeGreaterThanOrEqual(32);
    expect((await fetch('http://127.0.0.1:4000/health/ready', { signal: AbortSignal.timeout(5_000) })).ok).toBe(true);
    fixture = await createTenantFixture();
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);
  it('lists the two explicit assignable roles and does not silently grant them to an administrator', async () => {
    const roles = await request('/roles'); expect(roles.status).toBe(200);
    expect((await roles.json()).items.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining(['NOMINATIONS_COMMISSION_MEMBER', 'NOMINATIONS_BALLOT_CUSTODIAN']));
    const current = await authorize(fixture.users.admin); expect(current.status).toBe(201);
    const body = await current.json(); expect(body.authorized).toBe(true);
    expect(body.roles).not.toContain('NOMINATIONS_COMMISSION_MEMBER'); expect(body.roles).not.toContain('NOMINATIONS_BALLOT_CUSTODIAN');
  });
  it('persists a synthetic commission assignment, updates the source fingerprint, and revokes operation after removal', async () => {
    const actor = await fixture.createUser(['VIEWER']);
    const previous = await authorize(actor); expect(previous.status).toBe(201); expect((await previous.json()).authorized).toBe(false);
    const assigned = await request(`/users/${actor.id}`, 'PATCH', { assignedRoles: ['VIEWER', 'NOMINATIONS_COMMISSION_MEMBER'] }); expect(assigned.status).toBe(200);
    const current = await authorize(actor); expect(current.status).toBe(201); const withAssignment = await current.json();
    expect(withAssignment.authorized).toBe(true); expect(withAssignment.roles).toContain('NOMINATIONS_COMMISSION_MEMBER'); expect(withAssignment.roleFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const me = await request('/me', 'GET', undefined, actor); expect(me.status).toBe(200); expect((await me.json()).user.roles).toContain('NOMINATIONS_COMMISSION_MEMBER');
    expect((await request(`/users/${actor.id}`, 'PATCH', { assignedRoles: ['VIEWER'] })).status).toBe(200);
    const revoked = await authorize(actor); expect((await revoked.json()).authorized).toBe(false);
    expect((await fixture.pool.query("SELECT count(*)::int count FROM audit.audit_events WHERE action='user.updated' AND resource_id=$1", [actor.id])).rows[0].count).toBe(2);
  });
  it('redeems a launch with the explicit custodian role and stops authorizing a revoked source session', async () => {
    const actor = await fixture.createUser(['NOMINATIONS_BALLOT_CUSTODIAN']);
    const launch = await request('/integrations/nominations/launch', 'POST', {}, actor); expect(launch.status).toBe(201);
    const code = new URL((await launch.json()).launchUrl).searchParams.get('code'); expect(code).toBeTruthy();
    const redeemed = await fetch(`${base}/integrations/nominations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-integration-secret': process.env.NOMINATIONS_INTEGRATION_SECRET! }, body: JSON.stringify({ code }) }); expect(redeemed.status).toBe(201);
    const exchange = await redeemed.json(); expect(exchange.subject.roles).toEqual(['NOMINATIONS_BALLOT_CUSTODIAN']); expect(exchange.subject.sourceSessionId).toBe(actor.principal.sessionId);
    await fixture.pool.query('UPDATE identity.sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2', [actor.principal.sessionId, actor.id]);
    const current = await authorize(actor); expect(current.status).toBe(201); expect((await current.json()).authorized).toBe(false);
  });
  it('rejects a second administrator stale assignment before changing roles, profile or audit', async () => {
    const first = fixture.users.admin, second = await fixture.createUser(['TENANT_ADMIN']), subject = await fixture.createUser(['VIEWER']);
    const snapshot = ['VIEWER'];
    const updated = await request(`/users/${subject.id}`, 'PATCH', { expectedRoles: snapshot, assignedRoles: ['VIEWER', 'NOMINATIONS_COMMISSION_MEMBER'] }, first); expect(updated.status).toBe(200);
    const stale = await request(`/users/${subject.id}`, 'PATCH', { expectedRoles: snapshot, assignedRoles: ['VIEWER', 'NOMINATIONS_BALLOT_CUSTODIAN'], name: 'Must not overwrite profile' }, second);
    expect(stale.status).toBe(412); expect((await stale.json()).code).toBe('STALE_USER_ROLES');
    const saved = (await fixture.pool.query('SELECT roles,name FROM identity.users WHERE id=$1', [subject.id])).rows[0];
    expect(saved.roles).toEqual(['VIEWER', 'NOMINATIONS_COMMISSION_MEMBER']); expect(saved.name).toBe(subject.principal.name);
    expect((await fixture.pool.query("SELECT count(*)::int count FROM audit.audit_events WHERE action='user.updated' AND resource_id=$1", [subject.id])).rows[0].count).toBe(1);
  });
});
