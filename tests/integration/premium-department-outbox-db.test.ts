import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../../packages/database/src/index.js';
import { dispatchDepartmentNotifications, enqueueDepartmentNotification } from '../../services/department-operations-service/src/notification-outbox.js';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_DEPARTMENT_OUTBOX_DB_TESTS === '1' ? describe : describe.skip;
let fixture: SyntheticTenantFixture;
live('owned domain outbox rollback and retry, without runtime or outbound traffic', () => {
  beforeAll(async () => { fixture = await createTenantFixture({ backgroundWork: false }); }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);
  it('rolls back its intent with a failed domain audit and sends no notice', async () => {
    await expect(withTransaction(fixture.pool, async (client) => {
      await enqueueDepartmentNotification(client, 'department_operations.task', { userId: fixture.users.leader.id, title: 'Synthetic task', body: 'Synthetic' });
      throw new Error('Synthetic audit rejection');
    })).rejects.toThrow('Synthetic audit rejection');
    expect((await fixture.pool.query('SELECT count(*)::int count FROM department_operations.notification_outbox')).rows[0].count).toBe(0);
    expect((await fixture.pool.query('SELECT count(*)::int count FROM notifications.notifications')).rows[0].count).toBe(0);
  });
  it('defers a transport failure and retries the same committed ID after recovery', async () => {
    const id = await withTransaction(fixture.pool, (client) => enqueueDepartmentNotification(client, 'department_operations.task', { userId: fixture.users.leader.id, title: 'Synthetic task', body: 'Synthetic' }));
    const received: string[] = [];
    expect(await dispatchDepartmentNotifications(fixture.pool, fixture.id, async (event) => { received.push(event.id); throw new Error('Synthetic transport offline'); })).toEqual({ delivered: 0, deferred: 1 });
    const pending = (await fixture.pool.query('SELECT attempts,delivered_at,lease_until,claim_token FROM department_operations.notification_outbox WHERE id=$1', [id])).rows[0];
    expect(pending).toEqual({ attempts: 1, delivered_at: null, lease_until: null, claim_token: null });
    await fixture.pool.query('UPDATE department_operations.notification_outbox SET next_attempt_at=now() WHERE id=$1', [id]);
    expect(await dispatchDepartmentNotifications(fixture.pool, fixture.id, async (event) => { received.push(event.id); })).toEqual({ delivered: 1, deferred: 0 });
    expect(received).toEqual([id, id]);
    expect((await fixture.pool.query('SELECT delivered_at IS NOT NULL delivered FROM department_operations.notification_outbox WHERE id=$1', [id])).rows[0].delivered).toBe(true);
  });
  it('claims concurrent dispatchers once and leaves exhausted rows intact', async () => {
    const id = await withTransaction(fixture.pool, (client) => enqueueDepartmentNotification(client, 'department_operations.assignment', { userId: fixture.users.leader.id }));
    let sends = 0;
    await Promise.all([dispatchDepartmentNotifications(fixture.pool, fixture.id, async () => { sends++; }), dispatchDepartmentNotifications(fixture.pool, fixture.id, async () => { sends++; })]);
    expect(sends).toBe(1);
    await fixture.pool.query('UPDATE department_operations.notification_outbox SET delivered_at=NULL,attempts=8 WHERE id=$1', [id]);
    await dispatchDepartmentNotifications(fixture.pool, fixture.id, async () => { throw new Error('Exhausted row must not be sent'); });
    expect((await fixture.pool.query('SELECT attempts,delivered_at FROM department_operations.notification_outbox WHERE id=$1', [id])).rows[0]).toEqual({ attempts: 8, delivered_at: null });
  });
  it('uses only its own schema ACL, not permission to write notification-service delivery tables', async () => {
    await withTransaction(fixture.pool, async (client) => {
      await client.query('SET LOCAL ROLE gc_department_operations_service');
      const privileges = (await client.query("SELECT has_table_privilege(current_user,'department_operations.notification_outbox','INSERT') own_insert,has_table_privilege(current_user,'notifications.deliveries','INSERT') cross_insert")).rows[0];
      expect(privileges).toEqual({ own_insert: true, cross_insert: false });
      await enqueueDepartmentNotification(client, 'department_operations.task', { userId: fixture.users.leader.id });
    });
  });
});
