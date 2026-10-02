import { closePools, controlPool, tenantPoolFromSlug } from '@gc/database';

// Read-only audit: assignments are compared with the church's loaded appointments.
try {
  const { tenant, pool } = await tenantPoolFromSlug('ozama');
  const expected = `
    SELECT a.user_id,a.department_id,max(CASE
      WHEN a.title IN ('Primer anciano','Tesorería','Secretaría','Coordinación de Clubes') OR a.title LIKE 'Dirección%' THEN 6
      WHEN a.title LIKE 'Subdirección%' THEN 5
      WHEN a.title LIKE 'Secretaría de%' THEN 4
      WHEN a.title ~ '^(Asistencia|Asociado|Responsable|Coordinación de Interesados|Consejería)' THEN 3
      WHEN a.title LIKE 'Colaboración%' THEN 2 ELSE 1 END) priority
    FROM identity.department_appointments a
    JOIN identity.users u ON u.id=a.user_id AND u.active
    JOIN calendar.departments d ON d.id=a.department_id AND d.active
    WHERE a.active GROUP BY a.user_id,a.department_id`;
  const [mismatches, counts, examples, databases] = await Promise.all([
    pool.query(`WITH expected AS (${expected})
      SELECT u.name,d.name department,m.role,
        CASE e.priority WHEN 6 THEN 'DIRECTOR' WHEN 5 THEN 'ASSISTANT_DIRECTOR' WHEN 4 THEN 'DEPARTMENT_SECRETARY'
          WHEN 3 THEN 'PLANNER' WHEN 2 THEN 'CONTRIBUTOR' WHEN 1 THEN 'VIEWER' END expected_role
      FROM expected e FULL JOIN identity.department_memberships m USING(user_id,department_id)
      JOIN identity.users u ON u.id=COALESCE(e.user_id,m.user_id)
      JOIN calendar.departments d ON d.id=COALESCE(e.department_id,m.department_id)
      WHERE u.active AND d.active AND (e.user_id IS NULL OR m.user_id IS NULL OR m.role IS DISTINCT FROM
        CASE e.priority WHEN 6 THEN 'DIRECTOR' WHEN 5 THEN 'ASSISTANT_DIRECTOR' WHEN 4 THEN 'DEPARTMENT_SECRETARY'
          WHEN 3 THEN 'PLANNER' WHEN 2 THEN 'CONTRIBUTOR' WHEN 1 THEN 'VIEWER' END)`),
    pool.query(`SELECT
      (SELECT count(*)::int FROM identity.users WHERE active) users,
      (SELECT count(*)::int FROM calendar.departments WHERE active) departments,
      (SELECT count(*)::int FROM identity.department_appointments WHERE active) appointments,
      (SELECT count(*)::int FROM identity.department_memberships) memberships,
      (SELECT count(*)::int FROM department_operations.workspaces WHERE active) workspaces,
      (SELECT count(*)::int FROM identity.users u WHERE u.active AND
        ARRAY(SELECT unnest(u.department_ids) ORDER BY 1) IS DISTINCT FROM
        ARRAY(SELECT m.department_id FROM identity.department_memberships m WHERE m.user_id=u.id ORDER BY 1)) inconsistent_department_ids`),
    pool.query(`SELECT u.name,u.roles,COALESCE(jsonb_agg(jsonb_build_object('department',d.name,'role',m.role)
        ORDER BY d.name) FILTER(WHERE d.id IS NOT NULL),'[]'::jsonb) assignments
      FROM identity.users u LEFT JOIN identity.department_memberships m ON m.user_id=u.id
      LEFT JOIN calendar.departments d ON d.id=m.department_id
      WHERE u.name IN ('Raúl Pérez','Alfredo Fersobe','Damaris López','Jonathan Poueriet','Robert Hernandez')
      GROUP BY u.id ORDER BY u.name`),
    controlPool.query(`SELECT count(*)::int tenants,count(DISTINCT database_name)::int databases FROM control.tenants WHERE status='ACTIVE'`),
  ]);
  const summary = counts.rows[0];
  const isolated = databases.rows[0].tenants === databases.rows[0].databases;
  const pass = mismatches.rowCount === 0 && summary.inconsistent_department_ids === 0 && summary.departments === summary.workspaces && isolated;
  console.log(JSON.stringify({ status: pass ? 'PASS' : 'FAIL', tenant: tenant.name, ...summary, isolated,
    assignmentMismatches: mismatches.rows, examples: examples.rows }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await closePools();
}
