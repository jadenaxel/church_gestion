import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../../packages/database/src/index.js';

const enabled = process.env.RUN_PREMIUM_LEASED_CLIENT_DB_TESTS === '1';
const id = randomUUID(), nonce = randomUUID();
const database = `gc_lease_${id.replaceAll('-', '')}`;
const application = `premium-lease-${id}`;
let admin: Client, pool: Pool, created = false;

describe.skipIf(!enabled)('borrowed client disconnect on a fresh owned PostgreSQL database', () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') throw new Error('Local leased-client fixtures are disabled in production.');
    const target = new URL(process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres');
    if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '55432'
      || target.pathname !== '/postgres' || decodeURIComponent(target.username) !== 'postgres' || target.search || target.hash
      || !/^gc_lease_[a-f0-9]{32}$/.test(database)) throw new Error('Refusing a noncanonical local synthetic target.');
    admin = new Client({ connectionString: target.href, connectionTimeoutMillis: 3000 });
    admin.on('error', () => undefined); await admin.connect();
    if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) throw new Error('Synthetic target already exists; ownership is absent.');
    await admin.query(`CREATE DATABASE ${database}`); created = true;
    target.pathname = `/${database}`;
    pool = new Pool({ connectionString: target.href, max: 1, connectionTimeoutMillis: 3000,
      application_name: application, options: '-c statement_timeout=5000 -c lock_timeout=2000' });
    pool.on('error', () => undefined);
    await pool.query('CREATE TABLE premium_lease_marker(tenant_id uuid PRIMARY KEY,nonce uuid NOT NULL,owner text NOT NULL)');
    await pool.query('INSERT INTO premium_lease_marker VALUES($1,$2,$3)', [id, nonce, 'premium-leased-client-test']);
    await pool.query('CREATE TABLE premium_lease_probe(id uuid PRIMARY KEY,value text NOT NULL)');
  });

  afterAll(async () => {
    if (created) {
      if (!/^gc_lease_[a-f0-9]{32}$/.test(database) || database !== `gc_lease_${id.replaceAll('-', '')}`) throw new Error('Synthetic cleanup target changed.');
      const marker = await pool.query('SELECT tenant_id::text,nonce::text,owner,current_database() AS database FROM premium_lease_marker');
      expect(marker.rows).toEqual([{ tenant_id: id, nonce, owner: 'premium-leased-client-test', database }]);
      await pool.end();
      if ((await admin.query('SELECT 1 FROM pg_stat_activity WHERE datname=$1', [database])).rowCount) throw new Error('Synthetic connection remains; cleanup never terminates unknown clients.');
      await admin.query(`DROP DATABASE ${database}`);
      expect((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount).toBe(0);
    }
    if (admin) await admin.end();
  });

  it('handles the error event while work is paused, rejects apparent success, and discards the broken client', async () => {
    let resume!: () => void;
    const resumeWork = new Promise<void>((resolve) => { resume = resolve; });
    let paused!: (pid: number) => void;
    const borrowed = new Promise<number>((resolve) => { paused = resolve; });
    let observed!: (error: Error) => void;
    const disconnected = new Promise<Error>((resolve) => { observed = resolve; });
    const recordId = randomUUID();
    const transaction = withTransaction(pool, async (client) => {
      client.once('error', observed);
      await client.query('INSERT INTO premium_lease_probe VALUES($1,$2)', [recordId, 'synthetic pending']);
      const result = await client.query('SELECT pg_backend_pid() AS pid,current_database() AS database');
      expect(result.rows[0].database).toBe(database);
      paused(result.rows[0].pid as number);
      await resumeWork;
      return { accepted: true };
    });
    // Observe rejection before killing the owned backend. No unknown pid,
    // church database, service connection or broad termination is eligible.
    const outcome = transaction.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
    try {
      const pid = await borrowed;
      const terminated = await admin.query('SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE pid=$1 AND datname=$2 AND application_name=$3', [pid, database, application]);
      expect(terminated.rowCount).toBe(1); expect(terminated.rows[0].terminated).toBe(true);
      const connectionError = await disconnected;
      resume();
      const result = await outcome;
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Disconnected transaction was incorrectly acknowledged.');
      expect(result.error).toBe(connectionError);
      expect((await pool.query('SELECT count(*)::integer AS count FROM premium_lease_probe')).rows[0].count).toBe(0);
    } finally { resume(); await outcome; }
  });

  it('a fresh lease remains healthy and commits subsequent work exactly once', async () => {
    const recordId = randomUUID();
    await expect(withTransaction(pool, async (client) => {
      await client.query('INSERT INTO premium_lease_probe VALUES($1,$2)', [recordId, 'synthetic committed']);
      return { accepted: true };
    })).resolves.toEqual({ accepted: true });
    expect((await pool.query('SELECT count(*)::integer AS count FROM premium_lease_probe WHERE id=$1', [recordId])).rows[0].count).toBe(1);
  });
});
