import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_READ_CONTRACT_DB_TESTS === '1' ? describe : describe.skip;
let fixture: SyntheticTenantFixture;
async function sourceQuery(path: string, prefix: string): Promise<string> {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const statement = source.split('`').find((part) => part.startsWith(prefix));
  if (!statement) throw new Error('The exact source SQL query under test was not found.');
  return statement;
}
live('read-only cross-service and privacy SQL contracts against owned suspended database', () => {
  beforeAll(async () => { fixture = await createTenantFixture({ backgroundWork: false }); }, 120_000);
  afterAll(async () => { await fixture?.destroy(); }, 120_000);
  it.each(['SELECT c.id,c.resource_type', 'SELECT r.id,r.record_type'])('executes exact source query %s under department service grants', async (prefix) => {
    const sql = await sourceQuery('../../services/department-operations-service/src/main.ts', prefix);
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE gc_department_operations_service');
      const result = await client.query(sql, [randomUUID(), false, ['RESTRICTED_SYNTHETIC']]);
      expect(result.rows).toEqual([]);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  it('allows the exact Women calendar ownership read without requiring an UPDATE grant', async () => {
    const sql = await sourceQuery('../../services/womens-ministry-service/src/main.ts', 'SELECT 1 FROM calendar.activities WHERE id=$1 AND department_id=$2');
    const id = (await fixture.pool.query<{ id: string }>("INSERT INTO calendar.activities(title,description,department_id,responsible_name,responsible_user_id,created_by) VALUES('Synthetic cross-service read','Synthetic',$1,'Synthetic',$2,$2) RETURNING id", [fixture.departments.woman, fixture.users.admin.id])).rows[0]!.id;
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE gc_womens_ministry_service');
      expect((await client.query(sql, [id, fixture.departments.woman])).rowCount).toBe(1);
      const rights = await client.query("SELECT has_table_privilege(current_user,'calendar.activities','UPDATE') allowed");
      expect(rights.rows[0].allowed).toBe(false);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
});
