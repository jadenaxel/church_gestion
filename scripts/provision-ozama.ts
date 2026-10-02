import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { controlPool, databaseNameForTenant } from '@gc/database';
import { ensureControlDatabase, migrateControl, provisionTenantDatabase } from '@gc/database/migrations';

try {
  process.loadEnvFile?.('.env');
} catch {}

type Appointment = readonly [department: string, name: string, title: string];
type DepartmentRole = 'DIRECTOR' | 'ASSISTANT_DIRECTOR' | 'DEPARTMENT_SECRETARY' | 'PLANNER' | 'CONTRIBUTOR' | 'VIEWER';

const tenant = {
  slug: 'ozama',
  name: 'Iglesia Adventista Ozama',
  timezone: 'America/Santo_Domingo',
  domain: 'ozama.gestionchurch.com'
} as const;

const sourcePdf = resolve('X:/Documents/Reporte_Ejecutivo_Cargos_Ozama.pdf');
const credentialsPath = resolve('tmp/ozama-provisioning/credentials.json');
const appointments: Appointment[] = [
  ['Adoración', 'Mariela Mejía', 'Dirección de Adoración'],
  ['Ancianos', 'Churchil Ramírez', 'Primer anciano'],
  ['Ancianos', 'Abraham Rodríguez', 'Anciano/a'],
  ['Ancianos', 'Alfredo Fersobe', 'Anciano/a'],
  ['Ancianos', 'Ángel Oviedo', 'Anciano/a'],
  ['Ancianos', 'Anyelo Díaz', 'Anciano/a'],
  ['Ancianos', 'Delgis Ballista', 'Anciano/a'],
  ['Ancianos', 'Fabio Armando', 'Anciano/a'],
  ['Ancianos', 'Fara Nieves', 'Anciano/a'],
  ['Ancianos', 'Jonathan Poueriet', 'Anciano/a'],
  ['Ancianos', 'Juan Peralta', 'Anciano/a'],
  ['Ancianos', 'Julio Coiscou', 'Anciano/a'],
  ['Ancianos', 'Kelvy Burgos', 'Anciano/a'],
  ['Ancianos', 'Lucinda Mercedes', 'Anciano/a'],
  ['Ancianos', 'Pablo Torres', 'Anciano/a'],
  ['Ancianos', 'Raúl Pérez', 'Anciano/a'],
  ['Ancianos', 'Roberto Roche', 'Anciano/a'],
  ['Audiovisuales', 'Pablo Torres', 'Dirección de Audiovisuales'],
  ['Club de Aventureros', 'Juliany Florentino', 'Dirección de Aventureros'],
  ['Club de Aventureros', 'Miulbi Rosmery Peralta de Roche', 'Subdirección de Aventureros'],
  ['Club de Conquistadores', 'Roanny Lisbeth González Guzmán', 'Dirección de Conquistadores'],
  ['Club de Conquistadores', 'Christian Burgos', 'Subdirección de Conquistadores'],
  ['Club de Conquistadores', 'Génesis L. Vargas Tejeda', 'Subdirección de Conquistadores'],
  ['Club de Guías', 'Guibby Caro', 'Dirección del Club de Guías'],
  ['Club de Guías', 'Anghilda de Jesús', 'Subdirección del Club de Guías'],
  ['Club de Guías', 'Enmanuel Perdomo', 'Subdirección del Club de Guías'],
  ['Club de Guías', 'Fara Nieves', 'Subdirección del Club de Guías'],
  ['Clubes', 'Máximo de Jesús', 'Coordinación de Clubes'],
  ['Comunicaciones', 'Karina Calderón', 'Dirección de Comunicaciones'],
  ['Comunicaciones', 'Anyelo Díaz', 'Subdirección de Comunicaciones'],
  ['Diaconisas', 'Zoila Bidó', 'Dirección de Diaconisas'],
  ['Diaconisas', 'Alexandra Vasquez', 'Diaconisa'],
  ['Diaconisas', 'Altagracia Martínez', 'Diaconisa'],
  ['Diaconisas', 'Ana Tejada', 'Diaconisa'],
  ['Diaconisas', 'Celestina Echavarría', 'Diaconisa'],
  ['Diaconisas', 'Claudia Mejía', 'Diaconisa'],
  ['Diaconisas', 'Elena Piña', 'Diaconisa'],
  ['Diaconisas', 'Evalina Cuevas', 'Diaconisa'],
  ['Diaconisas', 'Fanny Contreras', 'Diaconisa'],
  ['Diaconisas', 'Francisca María', 'Diaconisa'],
  ['Diaconisas', 'Francisca Tejada', 'Diaconisa'],
  ['Diaconisas', 'Iris de Castro', 'Diaconisa'],
  ['Diaconisas', 'Isabel Rodríguez', 'Diaconisa'],
  ['Diaconisas', 'Jennifer Quiñones', 'Diaconisa'],
  ['Diaconisas', 'Jennifer Soler', 'Diaconisa'],
  ['Diaconisas', 'Jessy García', 'Diaconisa'],
  ['Diaconisas', 'Juana Pérez', 'Secretaría de Diaconisas'],
  ['Diaconisas', 'Lindy Martínez', 'Diaconisa'],
  ['Diaconisas', 'Lucy Madrigal', 'Diaconisa'],
  ['Diaconisas', 'Mariel Abreu', 'Diaconisa'],
  ['Diaconisas', 'Martha Guerrero', 'Diaconisa'],
  ['Diaconisas', 'Miscauly Rojas', 'Diaconisa'],
  ['Diaconisas', 'Nancy Garay', 'Diaconisa'],
  ['Diaconisas', 'Nancy Sánchez', 'Diaconisa'],
  ['Diaconisas', 'Rose Mary Medina', 'Diaconisa'],
  ['Diaconisas', 'Rosita Carrasco', 'Diaconisa'],
  ['Diaconisas', 'Sagrario Martínez', 'Diaconisa'],
  ['Diaconisas', 'Sulta Dorestant', 'Diaconisa'],
  ['Diaconisas', 'Wisairis Jerez', 'Diaconisa'],
  ['Diáconos', 'Ángel Oviedo', 'Dirección de Diáconos'],
  ['Diáconos', 'Fabio Armando', 'Subdirección de Diáconos'],
  ['Diáconos', 'Ángel Janvier', 'Diácono'],
  ['Diáconos', 'Antonio Obas', 'Diácono'],
  ['Diáconos', 'Chidly Laurent', 'Diácono'],
  ['Diáconos', 'Danny Janvier', 'Diácono'],
  ['Diáconos', 'Eddie Cornelio', 'Diácono'],
  ['Diáconos', 'Gabriel Lázaro', 'Diácono'],
  ['Diáconos', 'Jackson Louis', 'Diácono'],
  ['Diáconos', 'Janel Janvier', 'Diácono'],
  ['Diáconos', 'Jorge Brito', 'Diácono'],
  ['Diáconos', 'Juan Peralta', 'Diácono'],
  ['Diáconos', 'Julio Coiscou', 'Diácono'],
  ['Diáconos', 'Máximo de Jesús', 'Diácono'],
  ['Diáconos', 'Miguel Ángel Rosario', 'Diácono'],
  ['Diáconos', 'Miguel Mercedes', 'Diácono'],
  ['Diáconos', 'Raider Hernández', 'Diácono'],
  ['Diáconos', 'Ramón Pérez', 'Diácono'],
  ['Diáconos', 'Robert González', 'Diácono'],
  ['Diáconos', 'Romel Cáceres', 'Diácono'],
  ['Diáconos', 'Weslie Ramírez', 'Diácono'],
  ['Dorcas', 'Mitzy Mateo', 'Dirección de Dorcas'],
  ['Educación', 'Fanny Contreras', 'Dirección de Educación'],
  ['Escuela Sabática', 'Rossy García', 'Dirección de Escuela Sabática - Primer semestre'],
  ['Escuela Sabática', 'Lucy Madrigal', 'Dirección de Escuela Sabática - Segundo semestre'],
  ['Escuela Sabática', 'Alexandra Vasquez', 'Asociado/a de Escuela Sabática'],
  ['Escuela Sabática', 'Altagracia Martínez', 'Asociado/a de Escuela Sabática'],
  ['Escuela Sabática', 'Isabel Rodríguez', 'Asociado/a de Escuela Sabática'],
  ['Escuela Sabática', 'Lindy Martínez', 'Asociado/a de Escuela Sabática'],
  ['Escuela Sabática', 'Lucía Carvajal', 'Asociado/a de Escuela Sabática'],
  ['Escuela Sabática', 'Miriam Manon', 'Asociado/a de Escuela Sabática'],
  ['Escuela Sabática', 'Miscauly Rojas', 'Asociado/a de Escuela Sabática'],
  ['Escuela Sabática', 'Sagrario Martínez', 'Asociado/a de Escuela Sabática'],
  ['Hogar y Familia', 'Fabio Armando', 'Dirección de Hogar y Familia'],
  ['Jóvenes', 'Enmanuel Perdomo', 'Dirección de Jóvenes'],
  ['Jóvenes', 'Anghilda de Jesús', 'Subdirección de Jóvenes'],
  ['Jóvenes', 'Chanisa Moreta', 'Subdirección de Jóvenes'],
  ['Jóvenes', 'Jennifer Quiñones', 'Subdirección de Jóvenes'],
  ['Jóvenes', 'Keisy Ramírez', 'Subdirección de Jóvenes'],
  ['Jóvenes', 'Luz Clara', 'Subdirección de Jóvenes'],
  ['Jóvenes', 'Waleska Peña', 'Subdirección de Jóvenes'],
  ['Jóvenes', 'Angie Pérez', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Anyelo Díaz', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Avril Lázaro', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Camila Fersobe', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Chanisa Moreta', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Danny Janvier', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Dara Pérez', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Diana Paula', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Fara Nieves', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Jarommy Mateo', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Jonathan Poueriet', 'Consejería de Jóvenes'],
  ['Jóvenes', 'Julia Félix', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Karina Calderón', 'Consejería de Jóvenes'],
  ['Jóvenes', 'Miguel Ángel Vargas', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Mitzy de Jesus', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Ramón Pérez', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Solangel Gervacio', 'Colaboración de Jóvenes'],
  ['Jóvenes', 'Wisairis Jerez', 'Colaboración de Jóvenes'],
  ['Libertad Religiosa', 'Juan Peralta', 'Dirección de Libertad Religiosa'],
  ['Mantenimiento', 'Fabio Armando', 'Responsable de Mantenimiento'],
  ['Mantenimiento', 'Máximo de Jesús', 'Responsable de Mantenimiento'],
  ['Mayordomía', 'Alfredo Fersobe', 'Dirección de Mayordomía'],
  ['Ministerio de Caballeros', 'Roberto Roche', 'Dirección del Ministerio de Caballeros'],
  ['Ministerio de la Mujer', 'Damaris López', 'Dirección del Ministerio de la Mujer'],
  ['Ministerio de Música', 'Karina Calderón', 'Dirección del Ministerio de Música'],
  ['Ministerio de Oración', 'Mercedes Olivero', 'Dirección del Ministerio de Oración'],
  ['Ministerio de Oración', 'Waleska Peña', 'Subdirección del Ministerio de Oración'],
  ['Ministerio de Publicaciones', 'Ruth Rodríguez', 'Dirección del Ministerio de Publicaciones'],
  ['Ministerio Infantil', 'Nataly Torres Garay', 'Dirección del Ministerio Infantil'],
  ['Ministerio Infantil', 'July Mercedes', 'Colaboración del Ministerio Infantil'],
  ['Ministerio Infantil', 'Miulbi Rosmery Peralta de Roche', 'Colaboración del Ministerio Infantil'],
  ['Ministerios Personales', 'Raúl Pérez', 'Dirección de Ministerios Personales'],
  ['Ministerios Personales', 'Delgis Ballista', 'Coordinación de Interesados'],
  ['Ministerios Personales', 'Jennifer Quiñones', 'Secretaría de Ministerios Personales'],
  ['Ministerios Personales', 'Kelvy Burgos', 'Secretaría de Ministerios Personales'],
  ['Pianistas', 'Javier Peña Ramírez', 'Dirección de Pianistas'],
  ['Pianistas', 'Jonathan Martínez', 'Pianista'],
  ['Pianistas', 'Luca Pérez', 'Pianista'],
  ['Pianistas', 'Mariela Mejía', 'Pianista'],
  ['Posibilidades y ADRA', 'Lourdes Olivero', 'Dirección de ADRA'],
  ['Salud', 'Rosa García', 'Dirección de Salud'],
  ['Secretaría', 'Jonathan Poueriet', 'Secretaría'],
  ['Secretaría', 'Pablo Torres', 'Asistencia de Secretaría'],
  ['Tesorería', 'Ruth Rodríguez', 'Tesorería'],
  ['Tesorería', 'Juana Pérez', 'Asistencia de Tesorería'],
  ['Tesorería', 'Raúl Pérez', 'Asistencia de Tesorería'],
  ['Tesorería', 'Yanirca Guzmán', 'Asistencia de Tesorería']
];

const colorPalette = [
  '#00665A', '#008A7A', '#C69320', '#204F7A', '#7B4BC4', '#B84A62', '#3B7D45', '#A65D17', '#2E6DB4', '#5C7080'
] as const;

const rolePriority: Record<DepartmentRole, number> = {
  DIRECTOR: 6,
  ASSISTANT_DIRECTOR: 5,
  DEPARTMENT_SECRETARY: 4,
  PLANNER: 3,
  CONTRIBUTOR: 2,
  VIEWER: 1
};

function departmentRoleFor(title: string): DepartmentRole {
  if (title === 'Primer anciano' || title === 'Tesorería' || title === 'Secretaría' || title === 'Coordinación de Clubes' || title.startsWith('Dirección')) return 'DIRECTOR';
  if (title.startsWith('Subdirección')) return 'ASSISTANT_DIRECTOR';
  if (title.startsWith('Secretaría de')) return 'DEPARTMENT_SECRETARY';
  if (title.startsWith('Asistencia') || title.startsWith('Asociado') || title.startsWith('Responsable') || title.startsWith('Coordinación de Interesados') || title.startsWith('Consejería')) return 'PLANNER';
  if (title.startsWith('Colaboración')) return 'CONTRIBUTOR';
  return 'VIEWER';
}

function normalizeEmailName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const random = randomBytes(14);
  let body = '';
  for (const byte of random) body += alphabet[byte % alphabet.length];
  return `Oz!${body}7`;
}

function systemRolesFor(name: string, memberships: Map<string, DepartmentRole>): string[] {
  const roles = new Set<string>();
  if (name === 'Robert Hernandez') {
    roles.add('TENANT_ADMIN');
    roles.add('PASTOR');
  }
  if (name === 'Jonathan Poueriet') {
    roles.add('TENANT_ADMIN');
    roles.add('BOARD_SECRETARY');
    roles.add('ELDER');
  }
  if (name === 'Churchil Ramírez') {
    roles.add('FIRST_ELDER');
    roles.add('ELDER');
  } else if (appointments.some(([department, person, title]) => department === 'Ancianos' && person === name && title === 'Anciano/a')) {
    roles.add('ELDER');
  }
  if ([...memberships.values()].includes('DIRECTOR')) roles.add('DEPARTMENT_LEADER');
  if ([...memberships.values()].some((role) => !['DIRECTOR', 'VIEWER'].includes(role))) roles.add('DEPARTMENT_PLANNER');
  if (roles.size === 0) roles.add('VIEWER');
  return [...roles];
}

if (appointments.length !== 147) throw new Error(`Se esperaban 147 nombramientos y se encontraron ${appointments.length}.`);
const pdfPeople = [...new Set(appointments.map(([, name]) => name))].sort((a, b) => a.localeCompare(b, 'es'));
if (pdfPeople.length !== 101) throw new Error(`Se esperaban 101 personas únicas y se encontraron ${pdfPeople.length}.`);
const departments = [...new Set(appointments.map(([department]) => department))];
if (departments.length !== 30) throw new Error(`Se esperaban 30 departamentos y se encontraron ${departments.length}.`);

const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const controlUrl = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';
const tenantId = randomUUID();
const databaseName = databaseNameForTenant(tenantId);
const jobId = randomUUID();
const sourceHash = createHash('sha256').update(await readFile(sourcePdf)).digest('hex');

await ensureControlDatabase(adminUrl);
await migrateControl(controlUrl);

const duplicate = await controlPool.query(`SELECT id,status FROM control.tenants WHERE slug=$1`, [tenant.slug]);
if (duplicate.rowCount) {
  throw new Error(`El tenant '${tenant.slug}' ya existe (${duplicate.rows[0]?.status}). No se sobrescribió ningún dato.`);
}

await controlPool.query(
  `INSERT INTO control.tenants(id,slug,name,timezone,database_name,status)
   VALUES($1,$2,$3,$4,$5,'PROVISIONING')`,
  [tenantId, tenant.slug, tenant.name, tenant.timezone, databaseName]
);
await controlPool.query(
  `INSERT INTO control.tenant_provisioning_jobs(id,tenant_id,status,started_at)
   VALUES($1,$2,'RUNNING',now())`,
  [jobId, tenantId]
);

let db: Client | undefined;
try {
  await provisionTenantDatabase(adminUrl, tenantId);
  const tenantUrl = new URL(adminUrl);
  tenantUrl.pathname = `/${databaseName}`;
  db = new Client({ connectionString: tenantUrl.toString() });
  await db.connect();
  await db.query('BEGIN');
  await db.query(`UPDATE calendar.tenant_calendar_settings SET timezone=$1,updated_at=now() WHERE singleton`, [tenant.timezone]);

  const departmentIds = new Map<string, string>();
  for (const [index, department] of departments.entries()) {
    const result = await db.query<{ id: string }>(
      `INSERT INTO calendar.departments(name,color,description)
       VALUES($1,$2,$3) RETURNING id`,
      [department, colorPalette[index % colorPalette.length], `Departamento de ${department} · Iglesia Adventista Ozama`]
    );
    departmentIds.set(department, result.rows[0]!.id);
  }

  const appointmentsByPerson = new Map<string, Appointment[]>();
  for (const appointment of appointments) {
    const list = appointmentsByPerson.get(appointment[1]) ?? [];
    list.push(appointment);
    appointmentsByPerson.set(appointment[1], list);
  }
  appointmentsByPerson.set('Robert Hernandez', []);

  const credentials: Array<{
    name: string;
    email: string;
    temporaryPassword: string;
    roles: string[];
    departments: string[];
    appointments: string[];
  }> = [];
  const userIds = new Map<string, string>();
  const usedEmails = new Set<string>();

  for (const name of [...appointmentsByPerson.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
    const personAppointments = appointmentsByPerson.get(name) ?? [];
    const memberships = new Map<string, DepartmentRole>();
    for (const [department, , title] of personAppointments) {
      const candidate = departmentRoleFor(title);
      const current = memberships.get(department);
      if (!current || rolePriority[candidate] > rolePriority[current]) memberships.set(department, candidate);
    }
    const roles = systemRolesFor(name, memberships);
    let localPart = normalizeEmailName(name);
    let email = `${localPart}@ozama.gestionchurch.local`;
    let suffix = 2;
    while (usedEmails.has(email)) email = `${localPart}.${suffix++}@ozama.gestionchurch.local`;
    usedEmails.add(email);
    const password = temporaryPassword();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const departmentIdList = [...memberships.keys()].map((department) => departmentIds.get(department)!);
    const result = await db.query<{ id: string }>(
      `INSERT INTO identity.users(email,name,password_hash,roles,department_ids)
       VALUES($1,$2,$3,$4::text[],$5::uuid[]) RETURNING id`,
      [email, name, passwordHash, roles, departmentIdList]
    );
    const userId = result.rows[0]!.id;
    userIds.set(name, userId);
    await db.query(`INSERT INTO identity.credentials(user_id,password_hash) VALUES($1,$2)`, [userId, passwordHash]);
    await db.query(
      `INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled,reminders_enabled,optional_updates_enabled)
       VALUES($1,true,false,true,true)`,
      [userId]
    );
    for (const [department, role] of memberships) {
      await db.query(
        `INSERT INTO identity.department_memberships(user_id,department_id,role,assigned_by)
         VALUES($1,$2,$3,$4)`,
        [userId, departmentIds.get(department), role, userId]
      );
    }
    credentials.push({
      name,
      email,
      temporaryPassword: password,
      roles,
      departments: [...memberships.keys()],
      appointments: personAppointments.map(([department, , title]) => `${department}: ${title}`)
    });
  }

  const robertId = userIds.get('Robert Hernandez')!;
  await db.query(`UPDATE identity.department_memberships SET assigned_by=$1`, [robertId]);
  for (const [department, name, title] of appointments) {
    await db.query(
      `INSERT INTO identity.department_appointments(user_id,department_id,title,source)
       VALUES($1,$2,$3,$4)`,
      [userIds.get(name), departmentIds.get(department), title, 'Reporte_Ejecutivo_Cargos_Ozama.pdf']
    );
  }
  await db.query(
    `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,reason,correlation_id)
     VALUES($1,'tenant.bootstrap.completed','tenant',$2,$3::jsonb,$4,$5)`,
    [
      robertId,
      tenantId,
      JSON.stringify({
        tenant: tenant.name,
        departments: departments.length,
        users: credentials.length,
        appointments: appointments.length,
        source_sha256: sourceHash,
        excluded: ['datos de demostración', 'actividades de prueba', 'usuarios adicionales']
      }),
      'Provisionamiento inicial autorizado con base en el reporte ejecutivo de cargos.',
      `ozama-bootstrap-${tenantId}`
    ]
  );
  await db.query('COMMIT');

  await controlPool.query(
    `INSERT INTO control.tenant_domains(tenant_id,domain,verified_at) VALUES($1,$2,now())`,
    [tenantId, tenant.domain]
  );
  await controlPool.query(
    `INSERT INTO control.tenant_database_registry(tenant_id,database_name) VALUES($1,$2)`,
    [tenantId, databaseName]
  );
  await controlPool.query(
    `INSERT INTO control.audit_log(action,resource_type,resource_id,metadata)
     VALUES('tenant.bootstrap.completed','tenant',$1,$2::jsonb)`,
    [
      tenantId,
      JSON.stringify({ slug: tenant.slug, database_name: databaseName, departments: departments.length, users: credentials.length, appointments: appointments.length, source_sha256: sourceHash })
    ]
  );
  await controlPool.query(`UPDATE control.tenants SET status='ACTIVE',updated_at=now() WHERE id=$1`, [tenantId]);
  await controlPool.query(
    `UPDATE control.tenant_provisioning_jobs SET status='COMPLETED',completed_at=now() WHERE id=$1`,
    [jobId]
  );

  await mkdir(resolve('tmp/ozama-provisioning'), { recursive: true });
  await writeFile(
    credentialsPath,
    JSON.stringify(
      {
        tenant: { ...tenant, id: tenantId, databaseName, loginUrl: 'http://localhost:3000/login' },
        generatedAt: new Date().toISOString(),
        source: { path: sourcePdf, sha256: sourceHash },
        summary: { departments: departments.length, sourcePeople: pdfPeople.length, usersCreated: credentials.length, appointments: appointments.length, activities: 0, venues: 0, resources: 0 },
        pending: { copastorSamuel: 'El nombre completo no aparece en el PDF fuente; no se creó una identidad especulativa.' },
        credentials,
        appointments: appointments.map(([department, name, title]) => ({ department, name, title, accessRole: departmentRoleFor(title) }))
      },
      null,
      2
    ),
    { encoding: 'utf8', mode: 0o600 }
  );

  console.log(JSON.stringify({
    tenantId,
    databaseName,
    status: 'ACTIVE',
    departments: departments.length,
    users: credentials.length,
    appointments: appointments.length,
    credentialsPath,
    pending: 'Nombre completo del copastor Samuel'
  }, null, 2));
} catch (error) {
  if (db) {
    try { await db.query('ROLLBACK'); } catch {}
  }
  await controlPool.query(`UPDATE control.tenants SET status='FAILED',updated_at=now() WHERE id=$1`, [tenantId]);
  await controlPool.query(
    `UPDATE control.tenant_provisioning_jobs SET status='FAILED',error=$2,completed_at=now() WHERE id=$1`,
    [jobId, error instanceof Error ? error.message.slice(0, 1000) : 'Error de provisionamiento']
  );
  throw error;
} finally {
  if (db) await db.end();
  await controlPool.end();
}
