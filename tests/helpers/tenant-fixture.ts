import { randomBytes, randomUUID } from 'node:crypto';
import { access, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import argon2 from 'argon2';
import { Client, Pool } from 'pg';
import { permissionsFor, type AuthPrincipal, type Role } from '../../packages/contracts/src/index.js';
import { provisionTenantDatabase } from '../../packages/database/src/migrations.js';
import { signAccessToken } from '../../packages/platform/src/index.js';

export type FixtureUser = {
  id: string;
  email: string;
  password: string;
  principal: AuthPrincipal;
  token: string;
};

const departmentNames = {
  youth: 'Jóvenes', children: 'Infantil', worship: 'Adoración', music: 'Música',
  stewardship: 'Mayordomía', treasury: 'Tesorería', communications: 'Publicidad',
  sabbathSchool: 'Escuela Sabática', deacons: 'Diáconos', family: 'Familia',
  health: 'Salud', mission: 'Ministerios Personales', woman: 'Ministerio de la Mujer',
  elders: 'Ancianos',
} as const;

export type SyntheticTenantFixture = {
  id: string;
  slug: string;
  database: string;
  pool: Pool;
  departments: Record<keyof typeof departmentNames, string>;
  users: Record<'admin' | 'secretary' | 'leader' | 'planner' | 'viewer' | 'member' | 'pastor' | 'firstElder' | 'elder', FixtureUser>;
  createUser: (roles: Role[], memberships?: Array<{ departmentId: string; role: string }>) => Promise<FixtureUser>;
  destroy: () => Promise<void>;
};

function requireLocalDatabase(url: string): void {
  const target = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.port !== '55432') {
    throw new Error('Synthetic fixture refuses a non-local database target. Use a separately approved staging harness.');
  }
}

/** Credentials are returned in memory for login tests; never serialize/log the fixture. */
export async function createTenantFixture(options: { backgroundWork?: boolean } = {}): Promise<SyntheticTenantFixture> {
  if (process.env.NODE_ENV === 'production') throw new Error('Synthetic local fixtures are disabled in production.');
  const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
  const controlUrl = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';
  requireLocalDatabase(adminUrl);
  requireLocalDatabase(controlUrl);
  const id = randomUUID();
  const slug = `premium-${randomBytes(8).toString('hex')}`;
  const database = `gc_tenant_${id.replaceAll('-', '_')}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) {
      throw new Error('Synthetic database already exists; ownership is not established.');
    }
  } finally { await admin.end(); }
  const control = new Pool({ connectionString: controlUrl });
  const tenantUrl = new URL(adminUrl); tenantUrl.pathname = `/${database}`;
  const pool = new Pool({ connectionString: tenantUrl.toString() });
  let owned = false;
  let destroyed = false;
  const destroy = async () => {
    if (destroyed) return;
    if (!owned || !/^[a-f0-9-]{36}$/.test(id) || !/^premium-[a-f0-9]{16}$/.test(slug) || database !== `gc_tenant_${id.replaceAll('-', '_')}`) {
      throw new Error('Refusing cleanup without exact fixture ownership.');
    }
    const registered = await control.query<{ slug: string; database_name: string }>('SELECT slug,database_name FROM control.tenants WHERE id=$1', [id]);
    if (registered.rows[0] && (registered.rows[0].slug !== slug || registered.rows[0].database_name !== database)) {
      throw new Error('Fixture ownership changed; cleanup refused.');
    }
    await pool.end();
    await control.query('DELETE FROM control.module_launch_codes WHERE tenant_id=$1', [id]);
    await control.query('DELETE FROM control.tenants WHERE id=$1 AND slug=$2 AND database_name=$3', [id, slug, database]);
    if ((await control.query('SELECT 1 FROM control.tenants WHERE id=$1', [id])).rowCount) throw new Error('Fixture registration remains.');
    const cleanupAdmin = new Client({ connectionString: adminUrl });
    await cleanupAdmin.connect();
    try {
      await cleanupAdmin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
      await cleanupAdmin.query(`DROP DATABASE IF EXISTS ${database}`);
      if ((await cleanupAdmin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) throw new Error('Fixture database remains.');
    } finally { await cleanupAdmin.end(); }
    const uploadRoot = resolve(process.env.UPLOAD_ROOT ?? '.local/uploads');
    const uploadTarget = resolve(uploadRoot, id);
    if (dirname(uploadTarget) !== uploadRoot) throw new Error('Refusing unsafe fixture storage cleanup.');
    await rm(uploadTarget, { recursive: true, force: true });
    try { await access(uploadTarget); throw new Error('Fixture uploads remain.'); }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
    await control.end();
    destroyed = true;
  };
  try {
    // No existing database can be adopted: the UUID target was absent above.
    owned = true;
    if (await provisionTenantDatabase(adminUrl, id) !== database) throw new Error('Fixture database identity mismatch.');
    await control.query('INSERT INTO control.tenants(id,slug,name,database_name,status) VALUES($1,$2,$3,$4,$5)', [id, slug, 'Synthetic premium validation', database, options.backgroundWork === false ? 'SUSPENDED' : 'ACTIVE']);
    const departments = {} as SyntheticTenantFixture['departments'];
    for (const [key, name] of Object.entries(departmentNames)) {
      const departmentId = randomUUID();
      departments[key as keyof typeof departmentNames] = departmentId;
      await pool.query('INSERT INTO calendar.departments(id,name,color) VALUES($1,$2,$3)', [departmentId, name, '#08776a']);
    }
    const createUser: SyntheticTenantFixture['createUser'] = async (roles, memberships = []) => {
      const userId = randomUUID(), sessionId = randomUUID();
      const email = `${userId}@premium.example`, password = `${randomBytes(24).toString('base64url')}!9aA`;
      await pool.query('INSERT INTO identity.users(id,email,name,password_hash,roles,active) VALUES($1,$2,$3,$4,$5,true)', [userId, email, 'Synthetic premium user', await argon2.hash(password), roles]);
      await pool.query("INSERT INTO identity.sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '2 hours')", [sessionId, userId]);
      for (const membership of memberships) {
        if (!Object.values(departments).includes(membership.departmentId)) throw new Error('Membership outside fixture departments.');
        await pool.query('INSERT INTO identity.department_memberships(user_id,department_id,role) VALUES($1,$2,$3)', [userId, membership.departmentId, membership.role]);
      }
      const principal: AuthPrincipal = { sub: userId, email, name: 'Synthetic premium user', roles, permissions: permissionsFor(roles), tenantId: id, tenantSlug: slug, scope: 'tenant', sessionId };
      return { id: userId, email, password, principal, token: await signAccessToken(principal) };
    };
    const users = {
      admin: await createUser(['TENANT_ADMIN']), secretary: await createUser(['BOARD_SECRETARY']),
      leader: await createUser(['DEPARTMENT_LEADER'], [{ departmentId: departments.youth, role: 'DIRECTOR' }, { departmentId: departments.mission, role: 'DIRECTOR' }, { departmentId: departments.woman, role: 'DIRECTOR' }]),
      planner: await createUser(['DEPARTMENT_PLANNER'], [{ departmentId: departments.youth, role: 'PLANNER' }]),
      viewer: await createUser(['VIEWER']),
      member: await createUser(['VIEWER'], [{ departmentId: departments.youth, role: 'VIEWER' }]),
      pastor: await createUser(['PASTOR']), firstElder: await createUser(['FIRST_ELDER', 'ELDER']), elder: await createUser(['ELDER']),
    };
    return { id, slug, database, pool, departments, users, createUser, destroy };
  } catch (error) {
    try { await destroy(); } catch { throw new Error('Fixture setup failed and cleanup needs review; do not delete unknown targets.', { cause: error }); }
    throw error;
  }
}
