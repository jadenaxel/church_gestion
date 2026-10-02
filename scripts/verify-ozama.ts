import { Client, Pool } from 'pg';

try {
  process.loadEnvFile?.('.env');
} catch {}

const controlUrl = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';
const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const control = new Pool({ connectionString: controlUrl });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  const tenant = await control.query<{
    id: string;
    slug: string;
    name: string;
    status: string;
    database_name: string;
    registered_database: string;
    domain: string;
  }>(
    `SELECT t.id,t.slug,t.name,t.status,t.database_name,r.database_name registered_database,d.domain
       FROM control.tenants t
       JOIN control.tenant_database_registry r ON r.tenant_id=t.id
       JOIN control.tenant_domains d ON d.tenant_id=t.id
      WHERE t.slug='ozama'`
  );
  assert(tenant.rowCount === 1, 'Debe existir exactamente un tenant Ozama.');
  const record = tenant.rows[0]!;
  assert(record.status === 'ACTIVE', 'El tenant no está activo.');
  assert(record.database_name === record.registered_database, 'El registro físico de base no coincide.');
  assert(record.domain === 'ozama.gestionchurch.com', 'El dominio del tenant no coincide.');

  const url = new URL(adminUrl);
  url.pathname = `/${record.database_name}`;
  const ozama = new Client({ connectionString: url.toString() });
  await ozama.connect();
  try {
    const counts = await ozama.query<{
      users: number;
      departments: number;
      appointments: number;
      activities: number;
      venues: number;
      resources: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM identity.users) users,
        (SELECT count(*)::int FROM calendar.departments) departments,
        (SELECT count(*)::int FROM identity.department_appointments) appointments,
        (SELECT count(*)::int FROM calendar.activities) activities,
        (SELECT count(*)::int FROM calendar.venues) venues,
        (SELECT count(*)::int FROM calendar.resources) resources`
    );
    const actual = counts.rows[0]!;
    assert(actual.users === 102, `Usuarios inesperados: ${actual.users}.`);
    assert(actual.departments === 30, `Departamentos inesperados: ${actual.departments}.`);
    assert(actual.appointments === 147, `Nombramientos inesperados: ${actual.appointments}.`);
    assert(actual.activities === 0 && actual.venues === 0 && actual.resources === 0, 'El tenant contiene datos operativos o de prueba no autorizados.');

    const identityIntegrity = await ozama.query<{ sourced_users: number; unexpected_users: number; invalid_domains: number }>(
      `SELECT
        (SELECT count(DISTINCT user_id)::int FROM identity.department_appointments) sourced_users,
        (SELECT count(*)::int FROM identity.users u
          WHERE u.name <> 'Robert Hernandez'
            AND NOT EXISTS (SELECT 1 FROM identity.department_appointments a WHERE a.user_id=u.id)) unexpected_users,
        (SELECT count(*)::int FROM identity.users WHERE email NOT LIKE '%@ozama.gestionchurch.local') invalid_domains`
    );
    assert(identityIntegrity.rows[0]!.sourced_users === 101, 'No están representadas exactamente las 101 personas del informe.');
    assert(identityIntegrity.rows[0]!.unexpected_users === 0, 'Existe un usuario ajeno al informe o a la administración pastoral autorizada.');
    assert(identityIntegrity.rows[0]!.invalid_domains === 0, 'Existe un usuario con dominio de identidad ajeno al tenant Ozama.');

    const leaders = await ozama.query<{ name: string; roles: string[] }>(
      `SELECT name,roles FROM identity.users WHERE name IN ('Robert Hernandez','Jonathan Poueriet','Churchil Ramírez') ORDER BY name`
    );
    const roleMap = new Map(leaders.rows.map((row) => [row.name, row.roles]));
    assert(roleMap.get('Robert Hernandez')?.includes('TENANT_ADMIN') && roleMap.get('Robert Hernandez')?.includes('PASTOR'), 'Robert Hernandez no tiene los roles requeridos.');
    assert(roleMap.get('Jonathan Poueriet')?.includes('TENANT_ADMIN') && roleMap.get('Jonathan Poueriet')?.includes('BOARD_SECRETARY'), 'Jonathan Poueriet no tiene los roles requeridos.');
    assert(roleMap.get('Churchil Ramírez')?.includes('FIRST_ELDER'), 'Churchil Ramírez no tiene el rol de primer anciano.');
    const personalMinistriesTeam = await ozama.query<{ name: string; role: string; title: string }>(
      `SELECT u.name,m.role,a.title
         FROM identity.users u
         JOIN identity.department_memberships m ON m.user_id=u.id
         JOIN calendar.departments d ON d.id=m.department_id
         JOIN identity.department_appointments a ON a.user_id=u.id AND a.department_id=d.id AND a.active
        WHERE lower(translate(d.name,'áéíóúüñ','aeiouun'))='ministerios personales'
        ORDER BY CASE m.role WHEN 'DIRECTOR' THEN 0 ELSE 1 END,u.name`
    );
    assert(personalMinistriesTeam.rowCount === 4, 'El equipo de Ministerios Personales de Ozama no contiene exactamente sus cuatro integrantes reales.');
    const raul = personalMinistriesTeam.rows.find((member) => member.name === 'Raúl Pérez');
    assert(raul?.role === 'DIRECTOR' && /Dirección de Ministerios Personales/i.test(raul.title), 'Raúl Pérez no tiene control directivo de Ministerios Personales.');
    assert((await ozama.query(`SELECT 1 FROM identity.users WHERE name ILIKE '%Samuel%'`)).rowCount === 0, 'Se creó un Samuel sin identificación completa confirmada.');
  } finally {
    await ozama.end();
  }

  const central = await control.query<{ database_name: string }>(`SELECT database_name FROM control.tenants WHERE slug='central'`);
  if (central.rowCount) {
    assert(central.rows[0]!.database_name !== record.database_name, 'Ozama comparte físicamente la base de datos con otro tenant.');
    const url = new URL(adminUrl);
    url.pathname = `/${central.rows[0]!.database_name}`;
    const centralDb = new Client({ connectionString: url.toString() });
    await centralDb.connect();
    try {
      const leaked = await centralDb.query(`SELECT 1 FROM identity.users WHERE email LIKE '%@ozama.gestionchurch.local' LIMIT 1`);
      assert(leaked.rowCount === 0, 'Se detectaron identidades de Ozama dentro de otro tenant.');
    } finally {
      await centralDb.end();
    }
  }

  console.log(JSON.stringify({
    status: 'PASS',
    tenantId: record.id,
    database: record.database_name,
    isolation: 'physical database + zero leaked identities',
    exactUsers: 102,
    departments: 30,
    appointments: 147,
    personalMinistriesTeam: 4,
    personalMinistriesDirector: 'Raúl Pérez',
    demoData: 0,
    pending: 'Nombre completo del copastor Samuel'
  }, null, 2));
} finally {
  await control.end();
}
