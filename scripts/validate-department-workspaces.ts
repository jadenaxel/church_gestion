import { closePools, tenantPoolFromSlug } from '@gc/database';

// Diagnostic only: never creates business records or changes Ozama assignments.
// HTTP probes use the existing Central development fixture, never an Ozama account.
const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';
type DepartmentApp = { departmentId: string; name: string; key: string; href: string };

async function login(email: string, password: string) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'central', email, password }),
  });
  if (response.status !== 201) throw new Error(`Central diagnostic login: ${response.status}`);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

async function get(path: string, cookie: string) {
  const response = await fetch(`${apiUrl}${path}`, { headers: { cookie } });
  const body = await response.json();
  return { status: response.status, body };
}

try {
  const { pool } = await tenantPoolFromSlug('ozama');
  const inventory = await pool.query<{
    name: string; ministry_key: string; members: number; department_id: string;
  }>(`SELECT d.id department_id,d.name,w.ministry_key,count(m.user_id)::int members
    FROM calendar.departments d JOIN department_operations.workspaces w ON w.department_id=d.id
    LEFT JOIN identity.department_memberships m ON m.department_id=d.id
    WHERE d.active AND w.active GROUP BY d.id,d.name,w.ministry_key ORDER BY d.name`);
  const roster = await pool.query(`SELECT
    (SELECT count(*)::int FROM department_operations.annual_plans) plans,
    (SELECT count(*)::int FROM department_operations.initiatives) initiatives,
    (SELECT count(*)::int FROM department_operations.tasks) tasks`);
  const adminCookie = await login('admin@central.local', 'GestionChurch!2026');
  const me = await get('/me', adminCookie);
  const apps = me.body.user.departmentApps as DepartmentApp[];
  const probes = [];
  for (const app of apps) {
    const result = await get(`/department-operations/context?departmentId=${app.departmentId}`, adminCookie);
    const selected = result.body.selected;
    probes.push({
      department: selected?.name ?? app.name, route: app.href, status: result.status,
      exactDepartment: selected?.departmentId === app.departmentId,
      pack: selected?.pack?.key, recordTypes: selected?.pack?.recordTypes?.map((item: { type: string }) => item.type),
      access: result.body.access, budgetLedgerInContext: Object.hasOwn(result.body, 'budgetEntries'),
    });
  }
  const specialized = [];
  for (const path of ['/elders/context', '/personal-ministries/context', '/womens-ministry/context']) {
    const result = await get(path, adminCookie);
    specialized.push({ path, status: result.status, sections: Object.keys(result.body), access: result.body.access });
  }
  const leaderCookie = await login('mision@central.local', 'Actividad!2026');
  const leaderMe = await get('/me', leaderCookie);
  const leaderApps = leaderMe.body.user.departmentApps as DepartmentApp[];
  const unrelated = apps.find((app) => !leaderApps.some((own) => own.departmentId === app.departmentId))!;
  const denied = await get(`/department-operations/context?departmentId=${unrelated.departmentId}`, leaderCookie);
  const foreign = await get(`/department-operations/context?departmentId=${inventory.rows[0]!.department_id}`, adminCookie);
  const unauthenticated = await get('/department-operations/context', '');
  const roleProbes = [];
  for (const fixture of [
    { email: 'jovenes@central.local', label: 'Youth director' },
    { email: 'anciano@central.local', label: 'Elder / contributor' },
  ]) {
    const cookie = await login(fixture.email, 'Actividad!2026');
    const context = await get('/department-operations/context', cookie);
    roleProbes.push({ fixture: fixture.label, status: context.status,
      department: context.body.selected?.name, access: context.body.access });
  }
  const { pool: centralPool } = await tenantPoolFromSlug('central');
  const notificationProbe = await centralPool.query(`SELECT n.event_type,
    count(DISTINCT n.id)::int notifications,
    count(DISTINCT n.id) FILTER(WHERE d.channel IN ('EMAIL','WHATSAPP'))::int external_delivery_records
    FROM notifications.notifications n LEFT JOIN notifications.deliveries d ON d.notification_id=n.id
    WHERE n.event_type LIKE 'personal_ministries.%' OR n.event_type LIKE 'womens_ministry.%'
    GROUP BY n.event_type ORDER BY n.event_type`);
  const budgetProbe = await centralPool.query(`SELECT
    count(*) FILTER(WHERE initiative_id IS NULL)::int unlinked_budget_movements,
    count(*) FILTER(WHERE status IN ('APPROVED','PAID') AND approved_by IS NULL)::int approved_or_paid_without_approver
    FROM department_operations.budget_entries`);
  const context = await get('/department-operations/context', adminCookie);
  const report = await fetch(`${apiUrl}/department-operations/reports/executive.csv?workspaceId=${context.body.selected.id}`,
    { headers: { cookie: adminCookie, 'accept-language': 'en' } });
  const reportText = await report.text();
  const counts = inventory.rows.reduce<Record<string, number>>((totals, row) => {
    totals[row.ministry_key] = (totals[row.ministry_key] ?? 0) + 1;
    return totals;
  }, {});
  const technicalPass = probes.every((probe) => probe.status === 200 && probe.exactDepartment)
    && specialized.every((probe) => probe.status === 200)
    && roleProbes.every((probe) => probe.status === 200)
    && roleProbes[0]!.access.canManage === true && roleProbes[0]!.access.canApprove === false
    && roleProbes[1]!.access.canManage === false && roleProbes[1]!.access.canFinance === false
    && report.status === 200
    && denied.status === 403 && foreign.status === 403 && unauthenticated.status === 401;
  console.log(JSON.stringify({
    technicalProbeStatus: technicalPass ? 'PASS' : 'FAIL',
    completenessCertification: 'NOT_CERTIFIED_REQUIRES_DOMAIN_AND_UX_REMEDIATION',
    ozama: { departments: inventory.rows.length, packCounts: counts,
      inventory: inventory.rows.map(({ department_id: _id, ...row }) => row),
      businessRecordCounts: roster.rows[0] },
    central: { workspaceProbes: probes, specialized, roleProbes,
      notificationProbe: notificationProbe.rows, budgetProbe: budgetProbe.rows[0],
      englishReportProbe: { status: report.status, spanishHeaderDespiteEnglish: reportText.includes('"Departamento"') } },
    authorization: { ownAreasForMissionLeader: leaderApps.map((app) => app.key),
      unrelatedDepartment: denied.status, foreignTenantDepartment: foreign.status,
      anonymous: unauthenticated.status },
  }, null, 2));
  if (!technicalPass) process.exitCode = 1;
} finally {
  await closePools();
}
