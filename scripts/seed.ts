import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { controlPool, databaseNameForTenant } from '@gc/database';
import { ensureControlDatabase, migrateControl, provisionTenantDatabase } from '@gc/database/migrations';

try {
  process.loadEnvFile?.('.env');
} catch {}

if (process.env.NODE_ENV === 'production') {
  throw new Error('El seed de demostración no se permite en producción. Aprovisione iglesias reales y credenciales únicas mediante el procedimiento administrativo.');
}

const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const controlUrl = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';
await ensureControlDatabase(adminUrl);
await migrateControl(controlUrl);

const globalHash = await argon2.hash('GestionChurch!2026', { type: argon2.argon2id });
await controlPool.query(
  `INSERT INTO control.global_users(email, name, password_hash)
   VALUES ('global@gestionchurch.local', 'Administración global', $1)
   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name`,
  [globalHash]
);

let tenant = await controlPool.query<{ id: string; database_name: string }>(
  `SELECT id, database_name FROM control.tenants WHERE slug = 'central'`
);
if (tenant.rowCount === 0) {
  const id = randomUUID();
  const databaseName = databaseNameForTenant(id);
  tenant = await controlPool.query(
    `INSERT INTO control.tenants(id, slug, name, timezone, database_name, status)
     VALUES ($1, 'central', 'Iglesia Adventista Central', 'America/La_Paz', $2, 'ACTIVE')
     RETURNING id, database_name`,
    [id, databaseName]
  );
}

const tenantId = tenant.rows[0]!.id;
const databaseName = await provisionTenantDatabase(adminUrl, tenantId);
const tenantUrl = new URL(adminUrl);
tenantUrl.pathname = `/${databaseName}`;
const db = new Client({ connectionString: tenantUrl.toString() });
await db.connect();

const passwords = {
  admin: await argon2.hash('GestionChurch!2026', { type: argon2.argon2id }),
  secretary: await argon2.hash('Revision!2026', { type: argon2.argon2id }),
  leader: await argon2.hash('Actividad!2026', { type: argon2.argon2id })
};

const departments = [
  ['Jóvenes', '#0f766e'],
  ['Ministerio Infantil', '#7c3aed'],
  ['Mayordomía', '#c47f17'],
  ['Música', '#2563eb'],
  ['Ancianos', '#8a6b27'],
  ['Ministerios Personales', '#168473'],
  ['Publicidad', '#c45270'],
  ['Adoración', '#2563a8']
] as const;
for (const [name, color] of departments) {
  await db.query(
    `INSERT INTO calendar.departments(name, color) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color`,
    [name, color]
  );
}
await db.query(
  `INSERT INTO calendar.venues(name, capacity, color) VALUES
    ('Templo principal', 350, '#0f766e'), ('Salón de jóvenes', 90, '#7c3aed'), ('Patio', 250, '#c47f17')
   ON CONFLICT (name) DO NOTHING`
);
await db.query(
  `INSERT INTO calendar.resources(name, exclusive) VALUES
    ('Equipo de sonido', true), ('Proyector', true), ('Transporte', true)
   ON CONFLICT (name) DO NOTHING`
);

const users = [
  ['admin@central.local', 'Ana Administradora', passwords.admin, ['TENANT_ADMIN']],
  ['secretaria@central.local', 'María Secretaria', passwords.secretary, ['BOARD_SECRETARY']],
  ['jovenes@central.local', 'Samuel Jóvenes', passwords.leader, ['DEPARTMENT_LEADER']],
  ['infantil@central.local', 'Laura Ministerio Infantil', passwords.leader, ['DEPARTMENT_LEADER']],
  ['mision@central.local', 'Daniel Misionero', passwords.leader, ['DEPARTMENT_LEADER']],
  ['primeranciano@central.local', 'Raúl Pérez', passwords.leader, ['FIRST_ELDER']],
  ['anciano@central.local', 'Alfredo Fersobe', passwords.leader, ['ELDER']]
] as const;
for (const [email, name, hash, roles] of users) {
  await db.query(
    `INSERT INTO identity.users(email, name, password_hash, roles)
     VALUES ($1, $2, $3, $4::text[])
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, roles = EXCLUDED.roles`,
    [email, name, hash, roles]
  );
}
await db.query(
  `INSERT INTO identity.credentials(user_id,password_hash)
   SELECT id,password_hash FROM identity.users ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash`
);
await db.query(
  `UPDATE identity.users SET department_ids=ARRAY[(SELECT id FROM calendar.departments WHERE name='Jóvenes')]
   WHERE email='jovenes@central.local'`
);
await db.query(
  `INSERT INTO identity.department_memberships(user_id,department_id,role)
   SELECT u.id,d.id,'DIRECTOR' FROM identity.users u CROSS JOIN calendar.departments d
   WHERE (u.email='jovenes@central.local' AND d.name='Jóvenes')
      OR (u.email='infantil@central.local' AND d.name='Ministerio Infantil')
      OR (u.email='mision@central.local' AND d.name='Ministerios Personales')
      OR (u.email='primeranciano@central.local' AND d.name='Ancianos')
   ON CONFLICT(user_id,department_id) DO UPDATE SET role=EXCLUDED.role`
);
await db.query(
  `INSERT INTO identity.department_memberships(user_id,department_id,role)
   SELECT u.id,d.id,'CONTRIBUTOR' FROM identity.users u CROSS JOIN calendar.departments d
   WHERE u.email='anciano@central.local' AND d.name='Ancianos'
   ON CONFLICT(user_id,department_id) DO UPDATE SET role=EXCLUDED.role`
);
await db.query(
  `UPDATE identity.users u SET department_ids=ARRAY[d.id]
   FROM calendar.departments d WHERE u.email='infantil@central.local' AND d.name='Ministerio Infantil'`
);
await db.query(
  `UPDATE identity.users u SET department_ids=ARRAY[d.id]
   FROM calendar.departments d WHERE u.email IN ('primeranciano@central.local','anciano@central.local') AND d.name='Ancianos'`
);
await db.query(
  `INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled,reminders_enabled,optional_updates_enabled)
   SELECT id,true,false,true,true FROM identity.users ON CONFLICT(user_id) DO NOTHING`
);

const existing = await db.query(`SELECT 1 FROM calendar.activities WHERE code = 'DEMO-1001'`);
if (existing.rowCount === 0) {
  const meta = await db.query<{
    department_id: string; venue_id: string; user_id: string;
  }>(
    `SELECT
      (SELECT id FROM calendar.departments WHERE name='Jóvenes') department_id,
      (SELECT id FROM calendar.venues WHERE name='Templo principal') venue_id,
      (SELECT id FROM identity.users WHERE email='jovenes@central.local') user_id`
  );
  const { department_id, venue_id, user_id } = meta.rows[0]!;
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const activity = await db.query<{ id: string }>(
    `INSERT INTO calendar.activities(code,title,description,objective,department_id,venue_id,responsible_name,responsible_user_id,status)
     VALUES ('DEMO-1001','Culto joven especial','Programa de demostración para validar reservas y conflictos.','Integrar a la juventud',$1,$2,'Samuel Jóvenes',$3,'APPROVED') RETURNING id`,
    [department_id, venue_id, user_id]
  );
  const option = await db.query<{ id: string }>(
    `INSERT INTO calendar.schedule_options(activity_id,label,preference,status,is_selected)
     VALUES ($1,'Fecha principal',1,'CONFIRMED',true) RETURNING id`,
    [activity.rows[0]!.id]
  );
  const session = await db.query<{ id: string }>(
    `INSERT INTO calendar.schedule_sessions(option_id,starts_at,ends_at,effective_range)
     VALUES ($1,$2,$3,tstzrange($2,$3,'[)')) RETURNING id`,
    [option.rows[0]!.id, start.toISOString(), end.toISOString()]
  );
  await db.query(
    `INSERT INTO calendar.reservations(activity_id,option_id,session_id,venue_id,reserved_range,status)
     VALUES ($1,$2,$3,$4,tstzrange($5,$6,'[)'),'CONFIRMED')`,
    [activity.rows[0]!.id, option.rows[0]!.id, session.rows[0]!.id, venue_id, start.toISOString(), end.toISOString()]
  );
}

const approved = await db.query<{
  activity_id: string; option_id: string; starts_at: Date; ends_at: Date; department_id: string; venue_id: string; user_id: string;
}>(
  `SELECT a.id activity_id,o.id option_id,s.starts_at,s.ends_at,a.department_id,a.venue_id,a.responsible_user_id user_id
   FROM calendar.activities a JOIN calendar.schedule_options o ON o.activity_id=a.id AND o.is_selected
   JOIN calendar.schedule_sessions s ON s.option_id=o.id WHERE a.code='DEMO-1001' LIMIT 1`
);
const base = approved.rows[0]!;

async function seedSimpleActivity(
  code: string, title: string, status: 'DRAFT' | 'SUBMITTED', departmentName: string, venueName: string, dayOffset: number
) {
  if ((await db.query(`SELECT 1 FROM calendar.activities WHERE code=$1`, [code])).rowCount) return;
  const start = new Date(); start.setDate(start.getDate() + dayOffset); start.setHours(17, 0, 0, 0);
  const end = new Date(start.getTime() + 90 * 60_000);
  const activity = await db.query<{ id: string; venue_id: string }>(
    `INSERT INTO calendar.activities(code,title,description,department_id,venue_id,responsible_name,responsible_user_id,status)
     SELECT $1,$2,'Actividad de demostración para el flujo completo.',d.id,v.id,u.name,u.id,$3
     FROM calendar.departments d CROSS JOIN calendar.venues v CROSS JOIN identity.users u
     WHERE d.name=$4 AND v.name=$5 AND u.email='infantil@central.local' RETURNING id,venue_id`,
    [code, title, status, departmentName, venueName]
  );
  const option = await db.query<{ id: string }>(
    `INSERT INTO calendar.schedule_options(activity_id,label,preference,status,is_selected)
     VALUES($1,'Fecha principal',1,$2,$3) RETURNING id`,
    [activity.rows[0]!.id, status === 'SUBMITTED' ? 'PROVISIONAL_HOLD' : 'PROPOSED', status === 'SUBMITTED']
  );
  const session = await db.query<{ id: string }>(
    `INSERT INTO calendar.schedule_sessions(option_id,starts_at,ends_at,effective_range)
     VALUES($1,$2,$3,tstzrange($2,$3,'[)')) RETURNING id`, [option.rows[0]!.id, start, end]
  );
  if (status === 'SUBMITTED') {
    await db.query(
      `INSERT INTO calendar.reservations(activity_id,option_id,session_id,venue_id,reserved_range,status)
       VALUES($1,$2,$3,$4,tstzrange($5,$6,'[)'),'PROVISIONAL')`,
      [activity.rows[0]!.id, option.rows[0]!.id, session.rows[0]!.id, activity.rows[0]!.venue_id, start, end]
    );
  }
}
await seedSimpleActivity('DEMO-1002', 'Taller infantil en borrador', 'DRAFT', 'Ministerio Infantil', 'Salón de jóvenes', 12);
await seedSimpleActivity('DEMO-1003', 'Encuentro de familias pendiente', 'SUBMITTED', 'Ministerio Infantil', 'Patio', 14);

if (!(await db.query(`SELECT 1 FROM calendar.activities WHERE code='DEMO-1004'`)).rowCount) {
  const conflictActivity = await db.query<{ id: string }>(
    `INSERT INTO calendar.activities(code,title,description,department_id,venue_id,responsible_name,responsible_user_id,status)
     SELECT 'DEMO-1004','Ensayo general en conflicto','Caso reproducible para la junta.',d.id,$1,u.name,u.id,'UNDER_REVIEW'
     FROM calendar.departments d CROSS JOIN identity.users u
     WHERE d.name='Música' AND u.email='infantil@central.local' RETURNING id`, [base.venue_id]
  );
  const option = await db.query<{ id: string }>(
    `INSERT INTO calendar.schedule_options(activity_id,label,preference,status)
     VALUES($1,'Fecha solicitada',1,'EXCEPTION_REQUESTED') RETURNING id`, [conflictActivity.rows[0]!.id]
  );
  await db.query(
    `INSERT INTO calendar.schedule_sessions(option_id,starts_at,ends_at,effective_range)
     VALUES($1,$2,$3,tstzrange($2,$3,'[)'))`, [option.rows[0]!.id, base.starts_at, base.ends_at]
  );
  const conflict = await db.query<{ id: string }>(
    `INSERT INTO calendar.conflict_cases(activity_id,requested_option_id,severity,details,status)
     VALUES($1,$2,'CRITICAL',$3::jsonb,'REVIEW_REQUESTED') RETURNING id`,
    [conflictActivity.rows[0]!.id, option.rows[0]!.id, JSON.stringify([{ activity_id: base.activity_id, title: 'Culto joven especial', starts_at: base.starts_at, ends_at: base.ends_at, same_venue: true }])]
  );
  await db.query(
    `INSERT INTO calendar.review_requests(conflict_case_id,requested_by,reason,impact,coexistence_plan,resource_plan,alternative)
     VALUES($1,$2,'El ensayo necesita conservar el horario por disponibilidad de músicos.','Moverlo afecta al programa del sábado.','Usar áreas y equipos separados con responsables identificados.','El equipo de sonido se asignará al culto; el ensayo será acústico.','Usar el salón de jóvenes si la junta no autoriza.')`,
    [conflict.rows[0]!.id, base.user_id]
  );
}

// Keep the demonstration conflict fully traceable even on databases seeded by
// earlier versions: the reservation that arrived first is the preferred party.
await db.query(
  `UPDATE calendar.activities SET created_by=responsible_user_id
    WHERE code IN ('DEMO-1001','DEMO-1002','DEMO-1003','DEMO-1004') AND created_by IS NULL`
);
await db.query(
  `UPDATE calendar.conflict_cases cc
      SET submitted_by=COALESCE(cc.submitted_by,requested.responsible_user_id),
          submitted_at=COALESCE(cc.submitted_at,cc.created_at)
     FROM calendar.activities requested
    WHERE requested.id=cc.activity_id AND requested.code='DEMO-1004'`
);
await db.query(
  `WITH context AS (
     SELECT cc.id conflict_case_id,occupied.id conflicting_activity_id,r.id reservation_id,
            occupied.code,occupied.title,department.name department,venue.name venue,
            occupied.responsible_name,r.created_at submitted_at,
            lower(r.reserved_range) starts_at,upper(r.reserved_range) ends_at
       FROM calendar.conflict_cases cc
       JOIN calendar.activities requested ON requested.id=cc.activity_id AND requested.code='DEMO-1004'
       JOIN calendar.activities occupied ON occupied.code='DEMO-1001'
       JOIN calendar.departments department ON department.id=occupied.department_id
       JOIN calendar.reservations r ON r.activity_id=occupied.id AND r.status IN ('PROVISIONAL','CONFIRMED')
       LEFT JOIN calendar.venues venue ON venue.id=r.venue_id
      ORDER BY r.created_at LIMIT 1
   )
   INSERT INTO calendar.conflict_links(conflict_case_id,conflicting_activity_id,conflict_type,details)
   SELECT conflict_case_id,conflicting_activity_id,factor,
          jsonb_build_object('reservation_id',reservation_id,'activity_id',conflicting_activity_id,'code',code,
            'title',title,'department',department,'venue',venue,'responsible_name',responsible_name,
            'submitted_at',submitted_at,'starts_at',starts_at,'ends_at',ends_at,'same_venue',true)
     FROM context CROSS JOIN unnest(ARRAY['GENERAL','VENUE']::text[]) factor
   ON CONFLICT DO NOTHING`
);

let rotation = await db.query<{ id: string }>(
  `SELECT id FROM elders.rotations WHERE title='Semana pastoral · 27 sep–3 oct 2026' LIMIT 1`
);
if (!rotation.rowCount) {
  rotation = await db.query<{ id: string }>(
    `INSERT INTO elders.rotations(title,starts_on,ends_on,notes,created_by)
     SELECT 'Semana pastoral · 27 sep–3 oct 2026','2026-09-27','2026-10-03',
       'Cobertura de coordinación para los cultos semanales.',u.id
     FROM identity.users u WHERE u.email='primeranciano@central.local' RETURNING id`
  );
}
  await db.query(
    `INSERT INTO elders.rotation_members(rotation_id,elder_id)
     SELECT $1,u.id FROM identity.users u WHERE u.email IN ('primeranciano@central.local','anciano@central.local')
     ON CONFLICT DO NOTHING`, [rotation.rows[0]!.id]
  );

  await db.query(
    `INSERT INTO elders.department_assignments(elder_id,department_id,starts_on,ends_on,notes,created_by)
     SELECT u.id,d.id,'2026-01-01','2026-12-31',
       'Acompañamiento departamental y enlace con la junta de iglesia.',
       (SELECT id FROM identity.users WHERE email='admin@central.local')
     FROM identity.users u
     JOIN calendar.departments d ON
       (u.email='primeranciano@central.local' AND d.name IN ('Jóvenes','Adoración')) OR
       (u.email='anciano@central.local' AND d.name IN ('Ministerio Infantil','Publicidad'))
     ON CONFLICT(elder_id,department_id,starts_on,ends_on)
     DO UPDATE SET notes=EXCLUDED.notes,status='ACTIVE',updated_at=now()`
  );
  
  await db.query(
  `INSERT INTO elders.programs(rotation_id,elder_id,service_at,ends_at,service_type,title,preacher_name,singer_name,hymn,bible_reading,notes,status,created_by)
   SELECT $1,u.id,'2026-09-30T19:00:00-04:00','2026-09-30T20:30:00-04:00','WEDNESDAY',
     'Culto de oración y testimonio','Pr. Daniel Rojas','María Luz','Santo, santo, santo','Salmo 46:1-3',
     'Recepción desde las 6:30 p. m.','PUBLISHED',u.id
   FROM identity.users u WHERE u.email='primeranciano@central.local'
     AND NOT EXISTS(SELECT 1 FROM elders.programs WHERE title='Culto de oración y testimonio' AND service_at='2026-09-30T19:00:00-04:00')`,
  [rotation.rows[0]!.id]
);
await db.query(
  `INSERT INTO elders.programs(rotation_id,elder_id,service_at,ends_at,service_type,title,preacher_name,singer_name,hymn,bible_reading,notes,status,created_by)
   SELECT $1,u.id,'2026-10-03T11:00:00-04:00','2026-10-03T12:30:00-04:00','SABBATH',
     'Culto divino de esperanza','Pr. Samuel Ortega','Dúo Eben-ezer','Castillo fuerte es nuestro Dios','Isaías 40:28-31',
     'Tema: Esperanza que transforma','PUBLISHED',u.id
   FROM identity.users u WHERE u.email='anciano@central.local'
     AND NOT EXISTS(SELECT 1 FROM elders.programs WHERE title='Culto divino de esperanza' AND service_at='2026-10-03T11:00:00-04:00')`,
  [rotation.rows[0]!.id]
);

await db.end();
await controlPool.end();
console.log('Datos de demostración creados para el tenant central.');
console.log('Credenciales locales documentadas en README.md.');
