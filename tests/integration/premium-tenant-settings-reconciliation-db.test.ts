import { randomUUID } from 'node:crypto';
import { Client, Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tenantSettingsReconciliationSchemaSql } from '../../packages/database/src/tenant-settings-reconciliation.js';
import { enqueueSettingsUpdate, readSettingsState, reconcileDueSettingsUpdates, reconcileSettingsUpdate, settingsRequestHash } from '../../services/tenant-service/src/settings-reconciliation.js';

const enabled = process.env.RUN_PREMIUM_TENANT_SETTINGS_RECONCILIATION_DB_TESTS === '1';
const tenantId = randomUUID(), actorId = randomUUID(), nonce = randomUUID();
const databases = [`gc_settings_control_${tenantId.replaceAll('-', '')}`, `gc_tenant_${tenantId.replaceAll('-', '_')}`];
const original = { name: 'Synthetic settings fixture', timezone: 'Europe/Paris' };
const owner = 'premium-settings-reconciliation-test';
let admin: Client, control: Pool, tenant: Pool;
const created: { database: string; pool?: Pool }[] = [];

// Fault injection executes the real COMMIT first, then loses its response.
// It tests durable receipt recovery, not an artificial rollback simulation.
function loseCommitAcknowledgement(pool: Pool, nth: number): Pool {
  let commits = 0;
  return new Proxy(pool, { get(target, property) {
    if (property === 'connect') return (callback: (error: Error | undefined, client?: PoolClient, done?: (error?: Error | boolean) => void) => void) =>
      target.connect((error, client, done) => {
        if (error || !client) { callback(error, client, done); return; }
        const proxy = new Proxy(client, { get(acquired, key) {
          if (key === 'query') return async (...args: unknown[]) => {
            const result = await (acquired.query as (...input: unknown[]) => Promise<unknown>).apply(acquired, args);
            if (args[0] === 'COMMIT' && ++commits === nth) throw new Error('Synthetic lost COMMIT acknowledgement');
            return result;
          };
          const value = Reflect.get(acquired, key); return typeof value === 'function' ? value.bind(acquired) : value;
        } });
        callback(undefined, proxy, done);
      });
    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
  } });
}
const resolve = async () => tenant;
const enqueue = (input: Parameters<typeof enqueueSettingsUpdate>[4], pool = control) =>
  enqueueSettingsUpdate(pool, tenant, tenantId, actorId, input, 'synthetic-settings-test');
async function receipts() {
  return { tenant: (await tenant.query("SELECT count(*)::integer AS count FROM audit.audit_events WHERE action='tenant.settings.updated'")).rows[0].count,
    completed: (await control.query("SELECT count(*)::integer AS count FROM control.audit_log WHERE action='tenant.settings.updated'")).rows[0].count,
    intents: (await control.query("SELECT count(*)::integer AS count FROM control.audit_log WHERE action='tenant.settings.update_requested'")).rows[0].count };
}
async function injectAuditFailure(pool: Pool, schema: 'control' | 'audit', table: 'audit_log' | 'audit_events') {
  await pool.query(`CREATE FUNCTION ${schema}.fixture_settings_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='tenant.settings.updated' THEN RAISE EXCEPTION 'Synthetic mandatory audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER fixture_settings_failure BEFORE INSERT ON ${schema}.${table} FOR EACH ROW EXECUTE FUNCTION ${schema}.fixture_settings_failure()`);
  return async () => { await pool.query(`DROP TRIGGER fixture_settings_failure ON ${schema}.${table}`); await pool.query(`DROP FUNCTION ${schema}.fixture_settings_failure()`); };
}

describe.skipIf(!enabled)('durable settings reconciliation on two fresh owned PostgreSQL databases', () => {
  beforeAll(async () => {
    const target = new URL(process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres');
    if (process.env.NODE_ENV === 'production' || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1'
      || target.port !== '55432' || target.pathname !== '/postgres' || decodeURIComponent(target.username) !== 'postgres' || target.search || target.hash)
      throw new Error('Only the exact local synthetic PostgreSQL target is authorized.');
    admin = new Client({ connectionString: target.href, connectionTimeoutMillis: 3000 });
    admin.on('error', () => undefined); await admin.connect();
    for (const database of databases) {
      if (!/^gc_(?:settings_control_[a-f0-9]{32}|tenant_[a-f0-9]{8}(?:_[a-f0-9]{4}){3}_[a-f0-9]{12})$/.test(database)) throw new Error('Invalid synthetic database name.');
      expect((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount).toBe(0);
      await admin.query(`CREATE DATABASE ${database}`);
      const record: { database: string; pool?: Pool } = { database }; created.push(record);
      target.pathname = `/${database}`;
      const pool = new Pool({ connectionString: target.href, max: 4, connectionTimeoutMillis: 3000,
        application_name: `premium-settings-${tenantId}`, options: '-c statement_timeout=5000 -c lock_timeout=2000' });
      pool.on('error', () => undefined); record.pool = pool;
      await pool.query('CREATE TABLE premium_settings_marker(tenant_id uuid PRIMARY KEY,nonce uuid NOT NULL,owner text NOT NULL)');
      await pool.query('INSERT INTO premium_settings_marker VALUES($1,$2,$3)', [tenantId, nonce, owner]);
    }
    control = created[0]!.pool!; tenant = created[1]!.pool!;
    await control.query(`CREATE SCHEMA control;
      CREATE TABLE control.tenants(id uuid PRIMARY KEY,slug text NOT NULL,name text NOT NULL,timezone text NOT NULL,status text NOT NULL,database_name text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE control.audit_log(id bigserial PRIMARY KEY,actor_id uuid,action text NOT NULL,resource_type text NOT NULL,resource_id uuid,metadata jsonb NOT NULL);`);
    await control.query('INSERT INTO control.tenants(id,slug,name,timezone,status,database_name) VALUES($1,$2,$3,$4,$5,$6)', [tenantId, `premium-${nonce}`, original.name, original.timezone, 'ACTIVE', databases[1]]);
    await control.query(tenantSettingsReconciliationSchemaSql);
    await tenant.query(`CREATE SCHEMA calendar; CREATE SCHEMA audit;
      CREATE TABLE calendar.tenant_calendar_settings(singleton boolean PRIMARY KEY CHECK(singleton),timezone text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),max_options integer NOT NULL DEFAULT 9);
      CREATE TABLE audit.audit_events(id bigserial PRIMARY KEY,actor_id uuid,action text NOT NULL,resource_type text NOT NULL,resource_id uuid,before_data jsonb,after_data jsonb,correlation_id text);`);
    await tenant.query('INSERT INTO calendar.tenant_calendar_settings(singleton,timezone) VALUES(true,$1)', [original.timezone]);
  });

  beforeEach(async () => {
    await control.query('TRUNCATE control.tenant_settings_updates,control.audit_log');
    await tenant.query('TRUNCATE audit.audit_events');
    await control.query('UPDATE control.tenants SET name=$2,timezone=$3,status=$4 WHERE id=$1', [tenantId, original.name, original.timezone, 'ACTIVE']);
    await tenant.query('UPDATE calendar.tenant_calendar_settings SET timezone=$1 WHERE singleton', [original.timezone]);
  });

  afterAll(async () => {
    try {
      for (const record of [...created].reverse()) {
        if (!databases.includes(record.database) || !record.pool) throw new Error('Synthetic ownership receipt is incomplete; refusing cleanup.');
        const marker = await record.pool.query('SELECT tenant_id::text,nonce::text,owner,current_database() AS database FROM premium_settings_marker');
        expect(marker.rows).toEqual([{ tenant_id: tenantId, nonce, owner, database: record.database }]);
        await record.pool.end();
        expect((await admin.query('SELECT 1 FROM pg_stat_activity WHERE datname=$1', [record.database])).rowCount).toBe(0);
        await admin.query(`DROP DATABASE ${record.database}`);
        expect((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [record.database])).rowCount).toBe(0);
      }
      console.log(JSON.stringify({ event: 'tenant.settings_reconciliation.synthetic_cleanup', databasesCreated: created.length, databasesRemaining: 0, originalDataMutations: 0 }));
    } finally { if (admin) await admin.end(); }
  });

  it('preserves an omitted timezone and all unrelated calendar settings on a name-only command', async () => {
    const before = (await tenant.query('SELECT * FROM calendar.tenant_calendar_settings')).rows;
    const job = await enqueue({ name: 'Synthetic renamed fixture' });
    expect((await reconcileSettingsUpdate(control, resolve, job.id, true))?.state).toBe('COMPLETED');
    expect((await tenant.query('SELECT * FROM calendar.tenant_calendar_settings')).rows).toEqual(before);
    expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ name: 'Synthetic renamed fixture', timezone: 'Europe/Paris', settingsCoherent: true, settingsVersion: 1 });
    expect(await receipts()).toEqual({ tenant: 1, completed: 1, intents: 1 });
  });

  it('retains the accepted intent but rolls back the entire tenant stage when mandatory audit fails', async () => {
    const removeFailure = await injectAuditFailure(tenant, 'audit', 'audit_events');
    const job = await enqueue({ name: 'Synthetic reconciled fixture', timezone: 'Asia/Tokyo' });
    try {
      expect((await reconcileSettingsUpdate(control, resolve, job.id, true))?.state).toBe('PENDING');
      expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ ...original, calendarTimezone: original.timezone, settingsCoherent: false, reconciliationStatus: 'PENDING' });
      expect(await receipts()).toEqual({ tenant: 0, completed: 0, intents: 1 });
    } finally { await removeFailure(); }
    expect((await reconcileSettingsUpdate(control, resolve, job.id, true))?.state).toBe('COMPLETED');
    expect(await receipts()).toEqual({ tenant: 1, completed: 1, intents: 1 });
  });

  it('recovers a durable tenant stage after control audit failure using the restart worker, without duplicate writes', async () => {
    const removeFailure = await injectAuditFailure(control, 'control', 'audit_log');
    const job = await enqueue({ timezone: 'Asia/Tokyo' });
    try {
      expect((await reconcileSettingsUpdate(control, resolve, job.id, true))?.state).toBe('PENDING');
      expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ timezone: original.timezone, calendarTimezone: 'Asia/Tokyo', settingsCoherent: false });
      expect(await receipts()).toEqual({ tenant: 1, completed: 0, intents: 1 });
    } finally { await removeFailure(); }
    const appliedAt = (await tenant.query('SELECT updated_at FROM calendar.tenant_calendar_settings')).rows[0].updated_at;
    await control.query("UPDATE control.tenant_settings_updates SET next_attempt_at=now()-interval '1 second' WHERE id=$1", [job.id]);
    expect(await reconcileDueSettingsUpdates(control, resolve)).toBe(1);
    expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ timezone: 'Asia/Tokyo', settingsCoherent: true });
    expect((await tenant.query('SELECT updated_at FROM calendar.tenant_calendar_settings')).rows[0].updated_at).toEqual(appliedAt);
    expect(await receipts()).toEqual({ tenant: 1, completed: 1, intents: 1 });
  });

  it('recovers a lost intent COMMIT acknowledgement only from the exact durable operation receipt', async () => {
    const idempotencyKey = randomUUID();
    const input = { timezone: 'Asia/Tokyo', idempotencyKey };
    const job = await enqueue(input, loseCommitAcknowledgement(control, 1));
    expect(job.id).toBe(idempotencyKey); expect(job.state).toBe('PENDING');
    expect((await enqueue(input)).id).toBe(idempotencyKey);
    expect(await receipts()).toEqual({ tenant: 0, completed: 0, intents: 1 });
    expect((await reconcileSettingsUpdate(control, resolve, job.id, true))?.state).toBe('COMPLETED');
  });

  it('does not credit a lost tenant COMMIT acknowledgement as completion and safely replays its receipt', async () => {
    const job = await enqueue({ timezone: 'Asia/Tokyo' });
    const faultyTenant = loseCommitAcknowledgement(tenant, 1);
    expect((await reconcileSettingsUpdate(control, async () => faultyTenant, job.id, true))?.state).toBe('PENDING');
    expect(await receipts()).toEqual({ tenant: 1, completed: 0, intents: 1 });
    expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ settingsCoherent: false });
    expect((await reconcileSettingsUpdate(control, resolve, job.id, true))?.state).toBe('COMPLETED');
    expect(await receipts()).toEqual({ tenant: 1, completed: 1, intents: 1 });
  });

  it('confirms a lost final control COMMIT acknowledgement only after reading completed durable evidence', async () => {
    const job = await enqueue({ timezone: 'Asia/Tokyo' });
    expect((await reconcileSettingsUpdate(loseCommitAcknowledgement(control, 2), resolve, job.id, true))?.state).toBe('COMPLETED');
    expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ settingsCoherent: true });
    expect(await receipts()).toEqual({ tenant: 1, completed: 1, intents: 1 });
  });

  it('does not write tenant data after a lost claim acknowledgement and resumes an expired owned lease', async () => {
    const job = await enqueue({ timezone: 'Asia/Tokyo' });
    const result = await reconcileSettingsUpdate(loseCommitAcknowledgement(control, 1), resolve, job.id, true);
    expect(result?.state).toBe('PENDING'); expect(result?.lease_token).not.toBeNull();
    expect(await receipts()).toEqual({ tenant: 0, completed: 0, intents: 1 });
    await control.query("UPDATE control.tenant_settings_updates SET lease_until=now()-interval '1 second' WHERE id=$1", [job.id]);
    expect(await reconcileDueSettingsUpdates(control, resolve)).toBe(1);
    expect(await receipts()).toEqual({ tenant: 1, completed: 1, intents: 1 });
  });

  it('detects an independent Calendar change without overwriting it and requires an explicit versioned replacement', async () => {
    const job = await enqueue({ timezone: 'America/La_Paz' });
    await tenant.query("UPDATE calendar.tenant_calendar_settings SET timezone='Asia/Tokyo' WHERE singleton");
    expect((await reconcileSettingsUpdate(control, resolve, job.id, true))?.state).toBe('CONFLICT');
    expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ timezone: original.timezone, calendarTimezone: 'Asia/Tokyo', settingsCoherent: false });
    expect(await receipts()).toEqual({ tenant: 0, completed: 0, intents: 1 });
    await expect(enqueue({ timezone: 'Europe/London' })).rejects.toMatchObject({ code: 'TENANT_SETTINGS_UPDATE_PENDING', status: 409 });
    expect((await enqueue({ timezone: 'America/La_Paz' })).state).toBe('CONFLICT');
    expect((await enqueue({ timezone: 'America/La_Paz', expectedVersion: 1, idempotencyKey: job.id })).id).toBe(job.id);
    const replacement = await enqueue({ timezone: 'America/La_Paz', expectedVersion: 1 });
    expect(replacement.version).toBe(2);
    expect((await control.query('SELECT state FROM control.tenant_settings_updates WHERE id=$1', [job.id])).rows[0].state).toBe('SUPERSEDED');
    expect((await reconcileSettingsUpdate(control, resolve, replacement.id, true))?.state).toBe('COMPLETED');
    expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ timezone: 'America/La_Paz', settingsCoherent: true });
  });

  it('serializes duplicate intents and rejects reused keys, actors and stale versions', async () => {
    const input = { timezone: 'Asia/Tokyo' };
    const [first, second] = await Promise.all([enqueue(input), enqueue(input)]);
    expect(first.id).toBe(second.id); expect(await receipts()).toEqual({ tenant: 0, completed: 0, intents: 1 });
    await expect(enqueue({ timezone: 'Europe/London', idempotencyKey: first.id })).rejects.toMatchObject({ code: 'TENANT_SETTINGS_KEY_REUSED' });
    await expect(enqueueSettingsUpdate(control, tenant, tenantId, randomUUID(), { ...input, idempotencyKey: first.id }, null)).rejects.toMatchObject({ code: 'TENANT_SETTINGS_KEY_REUSED' });
    await expect(enqueue({ timezone: 'Europe/London', expectedVersion: 0 })).rejects.toMatchObject({ code: 'TENANT_SETTINGS_VERSION_CONFLICT' });
    await Promise.all([reconcileSettingsUpdate(control, resolve, first.id, true), reconcileSettingsUpdate(control, resolve, first.id, true)]);
    expect(await receipts()).toEqual({ tenant: 1, completed: 1, intents: 1 });
  });

  it('rejects a wrong database and reports subsequent Calendar divergence without auto-synchronizing', async () => {
    const job = await enqueue({ timezone: 'Asia/Tokyo' });
    expect((await reconcileSettingsUpdate(control, async () => control, job.id, true))?.state).toBe('PENDING');
    expect(await receipts()).toEqual({ tenant: 0, completed: 0, intents: 1 });
    expect((await reconcileSettingsUpdate(control, resolve, job.id, true))?.state).toBe('COMPLETED');
    await tenant.query("UPDATE calendar.tenant_calendar_settings SET timezone='Europe/London' WHERE singleton");
    expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ reconciliationStatus: 'CONFLICT', settingsCoherent: false });
    await expect(enqueue({ name: 'Synthetic explicit review required' })).rejects.toMatchObject({ code: 'TENANT_SETTINGS_SOURCE_CONFLICT' });
    expect((await control.query('SELECT count(*)::integer AS count FROM control.tenant_settings_updates')).rows[0].count).toBe(1);
    expect((await tenant.query('SELECT timezone FROM calendar.tenant_calendar_settings')).rows[0].timezone).toBe('Europe/London');
  });

  it('does not let twelve older suspended intents starve recovery of a newer active tenant', async () => {
    const job = await enqueue({ timezone: 'Asia/Tokyo' });
    const inactiveIds = Array.from({ length: 12 }, () => randomUUID());
    // Only rows inside this owned control database represent previously
    // accepted intents whose tenants later became suspended. No tenant DB,
    // registered church or service credential is provisioned for these rows.
    for (const id of inactiveIds) {
      const database = `gc_tenant_${id.replaceAll('-', '_')}`;
      await control.query('INSERT INTO control.tenants(id,slug,name,timezone,status,database_name) VALUES($1,$2,$3,$4,$5,$6)', [id, `premium-${id}`, original.name, original.timezone, 'SUSPENDED', database]);
      await control.query(`INSERT INTO control.tenant_settings_updates
        (id,tenant_id,version,actor_id,request_hash,database_name,before_name,before_timezone,source_tenant_timezone,desired_name,desired_timezone,changes_timezone,next_attempt_at)
        VALUES($1,$2,1,$3,$4,$5,$6,$7,$7,$6,$8,true,now()-interval '1 day')`,
      [randomUUID(), id, actorId, settingsRequestHash(id, actorId, { timezone: 'Asia/Tokyo' }), database, original.name, original.timezone, 'Asia/Tokyo']);
    }
    expect(await reconcileDueSettingsUpdates(control, resolve, 10)).toBe(1);
    expect((await control.query('SELECT state FROM control.tenant_settings_updates WHERE id=$1', [job.id])).rows[0].state).toBe('COMPLETED');
    expect((await control.query("SELECT count(*)::integer AS count FROM control.tenant_settings_updates WHERE tenant_id=ANY($1::uuid[]) AND state='PENDING' AND attempts=0 AND lease_token IS NULL", [inactiveIds])).rows[0].count).toBe(12);
    expect(await receipts()).toEqual({ tenant: 1, completed: 1, intents: 1 });
  });

  it('never pairs an old name with a newer optimistic version when a completion races the control read', async () => {
    const first = await enqueue({ name: 'Synthetic snapshot version one' });
    expect((await reconcileSettingsUpdate(control, resolve, first.id, true))?.state).toBe('COMPLETED');
    let raced = false;
    const racingControl = new Proxy(control, { get(target, key) {
      if (key === 'query') return async (...args: unknown[]) => {
        const result = await (target.query as (...input: unknown[]) => Promise<unknown>).apply(target, args);
        if (!raced && typeof args[0] === 'string' && /FROM control\.tenants\b/i.test(args[0])) {
          raced = true;
          const next = await enqueue({ name: 'Synthetic snapshot version two', expectedVersion: 1 });
          expect((await reconcileSettingsUpdate(control, resolve, next.id, true))?.state).toBe('COMPLETED');
        }
        return result;
      };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const snapshot = await readSettingsState(racingControl, tenant, tenantId);
    expect(raced).toBe(true);
    expect(snapshot).toMatchObject({ name: 'Synthetic snapshot version one', settingsVersion: 1, settingsCoherent: true });
    expect(await readSettingsState(control, tenant, tenantId)).toMatchObject({ name: 'Synthetic snapshot version two', settingsVersion: 2 });
    await expect(enqueue({ name: snapshot.name, expectedVersion: snapshot.settingsVersion })).rejects.toMatchObject({ code: 'TENANT_SETTINGS_VERSION_CONFLICT', status: 409 });
    expect(await receipts()).toEqual({ tenant: 2, completed: 2, intents: 2 });
  });
});
