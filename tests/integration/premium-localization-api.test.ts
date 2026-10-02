import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { controlPool } from '@gc/database';
import { createTenantFixture, type SyntheticTenantFixture } from '../helpers/tenant-fixture.js';

const live = process.env.RUN_PREMIUM_LOCALIZATION_API_TESTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:4000/api/v1';
let fixture: SyntheticTenantFixture;
const request = (path: string, method = 'GET', body?: unknown) => fetch(`${base}${path}`, { method, headers: { cookie: `gc_session=${fixture.users.admin.token}`, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'content-type': 'application/json', 'x-timezone': 'Not/A_Timezone' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });

live('localized exports and personal notification rendering on owned tenant', () => {
  let workspaceId: string;
  let activityId: string;
  beforeAll(async () => {
    expect((await fetch('http://127.0.0.1:4000/health/ready', { signal: AbortSignal.timeout(5_000) })).ok).toBe(true);
    fixture = await createTenantFixture();
    await controlPool.query('UPDATE control.tenants SET timezone=$1 WHERE id=$2 AND slug=$3', ['Pacific/Honolulu', fixture.id, fixture.slug]);
    await fixture.pool.query('INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled) SELECT id,false,false FROM identity.users');
    // Deliberately unscheduled drafts are not evidence of operational success.
    activityId = (await fixture.pool.query<{ id: string }>("INSERT INTO calendar.activities(title,description,department_id,responsible_name,responsible_user_id,created_by,timezone) VALUES('Encuentro Jóvenes sin horario','Synthetic report evidence',$1,'Original responsible',$2,$2,'Pacific/Honolulu') RETURNING id", [fixture.departments.youth, fixture.users.admin.id])).rows[0]!.id;
    const context = await request(`/department-operations/context?departmentId=${fixture.departments.youth}`); expect(context.status).toBe(200);
    workspaceId = (await context.json()).selected.id;
    for (const currency of ['DOP', 'USD']) await fixture.pool.query("INSERT INTO department_operations.initiatives(workspace_id,initiative_type,title,description,objective,starts_on,ends_on,planned_budget,currency,created_by) VALUES($1,'PROGRAM',$2,'Synthetic','Synthetic','2030-01-01','2030-01-02',100,$3,$4)", [workspaceId, `Original ${currency} initiative`, currency, fixture.users.admin.id]);
  }, 120_000);
  afterAll(async () => { await fixture?.destroy(); await controlPool.end(); }, 120_000);

  it.each(['es', 'en', 'fr'] as const)('exports system labels in %s and preserves original content with tenant timezone', async (lang) => {
    const overview = await request(`/reports/overview?lang=${lang}&from=2020-01-01T00:00:00Z&to=2040-01-01T00:00:00Z`); expect(overview.status).toBe(200);
    const report = await overview.json(); expect(report.locale).toBe(lang); expect(report.timezone).toBe('Pacific/Honolulu');
    expect(report.summary.coordinationEvidence).toMatchObject({ level: 'INSUFFICIENT_HISTORY', sampleSize: 0, calibrated: false });
    expect(report.trend.reduce((sum: number, item: { planned: number }) => sum + item.planned, 0)).toBe(0);
    expect(report.trend.reduce((sum: number, item: { unscheduled: number }) => sum + item.unscheduled, 0)).toBe(1);
    expect(report.insights.some((item: { title: string }) => ['Departamento destacado', 'Leading department', 'Département remarquable', 'Mejora de cumplimiento', 'Improved completion', 'Amélioration de la réalisation'].includes(item.title))).toBe(false);
    const csv = await request(`/reports/activities.csv?lang=${lang}`); expect(csv.status).toBe(200); const contents = await csv.text();
    expect(contents).toContain(({ es: 'Código', en: 'Code', fr: 'Code' })[lang]);
    expect(contents).toContain('Encuentro Jóvenes sin horario'); expect(contents).toContain(({ es: 'Borrador', en: 'Draft', fr: 'Brouillon' })[lang]);
    const pdf = await request(`/reports/executive.pdf?lang=${lang}`); expect(pdf.status).toBe(200); expect(pdf.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
    const departmental = await request(`/department-operations/reports/executive.csv?workspaceId=${workspaceId}&lang=${lang}`); expect(departmental.status).toBe(200);
    const departmentCsv = await departmental.text(); expect(departmentCsv).toContain('DOP'); expect(departmentCsv).toContain('USD'); expect(departmentCsv).toContain('Original USD initiative');
  });
  it('rejects unsupported report locales and exposes separate currencies in the workspace', async () => {
    expect((await request('/reports/overview?lang=de')).status).toBe(400);
    expect((await request(`/department-operations/reports/executive.csv?workspaceId=${workspaceId}&lang=de`)).status).toBe(400);
    const response = await request(`/department-operations/context?departmentId=${fixture.departments.youth}`); expect(response.status).toBe(200);
    const context = await response.json(); expect(context.metrics.budgetAggregationComparable).toBe(false);
    expect(context.metrics.budgetsByCurrency).toEqual([{ currency: 'DOP', plannedBudget: 100, spentBudget: 0, availableBudget: 100 }, { currency: 'USD', plannedBudget: 100, spentBudget: 0, availableBudget: 100 }]);
    await fixture.pool.query("INSERT INTO calendar.activities(title,description,department_id,responsible_name,responsible_user_id,created_by,status) VALUES('Synthetic untimed completion','Synthetic',$1,'Synthetic',$2,$2,'COMPLETED')", [fixture.departments.youth, fixture.users.admin.id]);
    const scheduledId = (await fixture.pool.query<{ id: string }>("INSERT INTO calendar.activities(title,description,department_id,responsible_name,responsible_user_id,created_by) VALUES('Synthetic tenant month','Synthetic',$1,'Synthetic',$2,$2) RETURNING id", [fixture.departments.youth, fixture.users.admin.id])).rows[0]!.id;
    const optionId = (await fixture.pool.query<{ id: string }>("INSERT INTO calendar.schedule_options(activity_id,label,preference,is_selected) VALUES($1,'Synthetic primary',1,true) RETURNING id", [scheduledId])).rows[0]!.id;
    await fixture.pool.query("INSERT INTO calendar.schedule_sessions(option_id,starts_at,ends_at,effective_range) VALUES($1,'2030-02-01T02:00:00Z','2030-02-01T03:00:00Z',tstzrange('2030-02-01T02:00:00Z','2030-02-01T03:00:00Z','[)'))", [optionId]);
    const evidenced = await request('/reports/overview'); expect(evidenced.status).toBe(200); const metrics = await evidenced.json();
    expect(metrics.summary.onTimeEvidence).toEqual({ sampleSize: 0, untimedCompleted: 1 }); expect(metrics.summary.onTimeRate).toBe(0);
    expect(metrics.trend.find((month: { month: string }) => month.month === '2030-01').planned).toBe(1);
    expect(metrics.trend.some((month: { month: string }) => month.month === '2030-02')).toBe(false);
  });
  it('renders the recipient locale for alerts and can change presentation without translating authored text', async () => {
    expect((await request('/notifications/preferences', 'PATCH', { uiLocale: 'fr' })).status).toBe(200);
    const event = { id: randomUUID(), type: 'activity.approved', aggregateId: activityId, payload: { title: 'Encuentro Jóvenes Original', userId: fixture.users.admin.id } };
    const response = await fetch('http://127.0.0.1:4015/events', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant-id': fixture.id, 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret' }, body: JSON.stringify(event) }); expect(response.status).toBe(201);
    const saved = (await fixture.pool.query('SELECT title,body FROM notifications.notifications WHERE event_id=$1', [event.id])).rows[0]; expect(saved.title).toBe('Activité approuvée'); expect(saved.body).toContain('Encuentro Jóvenes Original');
    expect((await request('/notifications/preferences', 'PATCH', { uiLocale: 'en' })).status).toBe(200);
    const alerts = await request('/notifications'); expect(alerts.status).toBe(200);
    const alert = (await alerts.json()).items.find((item: { body: string }) => item.body.includes('Encuentro Jóvenes Original'));
    expect(alert.title).toBe('Activity approved');
    expect((await fixture.pool.query("SELECT 1 FROM notifications.deliveries WHERE notification_id IN (SELECT id FROM notifications.notifications WHERE event_id=$1) AND channel IN ('EMAIL','WHATSAPP')", [event.id])).rowCount).toBe(0);
  });
  it('exposes the exact active birthday subset and clock behind the roster KPI', async () => {
    const initial = await request('/roster/context'); expect(initial.status).toBe(200);
    const today = (await initial.json()).today; expect(today).toMatch(/^\d{4}-\d\d-\d\d$/);
    const dateOfBirth = `2000-${today.slice(5)}`;
    const active = await fixture.pool.query<{ id: string }>("INSERT INTO identity.church_members(member_code,first_name,last_name,display_name,sex,date_of_birth,active,created_by) VALUES('BIRTHDAY-A','Synthetic','Birthday','Synthetic Birthday','UNSPECIFIED',$1,true,$2) RETURNING id", [dateOfBirth, fixture.users.admin.id]);
    const inactive = await fixture.pool.query<{ id: string }>("INSERT INTO identity.church_members(member_code,first_name,last_name,display_name,sex,date_of_birth,active,created_by) VALUES('BIRTHDAY-I','Synthetic','Inactive','Synthetic Inactive','UNSPECIFIED',$1,false,$2) RETURNING id", [dateOfBirth, fixture.users.admin.id]);
    const response = await request('/roster/context'); expect(response.status).toBe(200); const result = await response.json();
    expect(result.today).toBe(today); expect(result.birthdayMemberIds).toContain(active.rows[0]!.id); expect(result.birthdayMemberIds).not.toContain(inactive.rows[0]!.id);
    expect(result.metrics.birthdaysNext30).toBe(result.birthdayMemberIds.length);
  });
});
