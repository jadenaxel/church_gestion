import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createTenantFixture, type SyntheticTenantFixture, type FixtureUser } from '../helpers/tenant-fixture.js';
import { translateText, type Locale } from '../../apps/web/lib/i18n.js';

let church: SyntheticTenantFixture;
const gateway = 'http://localhost:4000/api/v1';

// The Next.js route announcer is an accessibility live region outside main,
// not an application failure. Keep it enabled and check actual application alerts.
function appAlerts(page: Page) { return page.locator('main').getByRole('alert'); }

async function login(page: Page, user: FixtureUser = church.users.admin) {
  await page.goto('/login');
  await page.getByLabel('Iglesia o código', { exact: true }).click();
  await page.getByLabel('Iglesia o código', { exact: true }).fill(church.slug);
  await page.getByLabel('Usuario', { exact: true }).click();
  await page.getByLabel('Usuario', { exact: true }).fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).click();
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Centro de control', exact: true })).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  expect((await request.get('http://localhost:4000/health/ready')).ok()).toBe(true);
  church = await createTenantFixture();
});
test.afterAll(async () => { if (church) await church.destroy(); });

test('blank login, guarded routes and layout at 320/360/390/768/820/1280/1440', async ({ page, browser }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Iglesia o código', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Usuario', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
  const routes = ['/dashboard', '/calendar', '/reviews', '/reports', '/notifications', '/team', '/documents', '/settings/departments', '/settings/roster', '/settings/activity-form', '/settings/channels', '/audit', '/personal-ministries', '/womens-ministry', '/elders', '/ministry-hub'];
  for (const width of [320, 360, 390, 768, 820, 1280, 1440]) {
    // Each viewport is a distinct authorized session, as it is on real devices.
    // Avoid hitting the production API rate budget through an artificial rapid
    // 112-page navigation storm in a single session; the limit stays enabled.
    const device = await browser.newContext({ baseURL: 'http://localhost:3000', viewport: { width, height: width < 768 ? 844 : 900 } });
    const devicePage = await device.newPage();
    try {
    await login(devicePage);
    for (const route of routes) {
      await test.step(`${route} at ${width}px`, async () => {
        await devicePage.goto(route);
        await expect(devicePage.locator('main')).toBeVisible();
        await expect(devicePage.locator('.spinner'), `${route}: ${await devicePage.locator('main').innerText()}`).toHaveCount(0);
        await expect(appAlerts(devicePage), `${route} must load authorized data, not just render a heading`).toHaveCount(0);
        const dimensions = await devicePage.evaluate(() => ({ body: document.body.scrollWidth, view: document.documentElement.clientWidth }));
        expect(dimensions.body, `${route} at ${width}px`).toBeLessThanOrEqual(dimensions.view + 1);
      });
    }
    } finally { await device.close(); }
  }
});

test('browser creates an activity with two dates and a real program; persisted detail survives reload', async ({ page }) => {
  await login(page, church.users.leader);
  await page.goto(`/activities/new?departmentId=${church.departments.youth}`);
  const title = 'Synthetic browser activity';
  await page.getByLabel(/Nombre de la actividad/).fill(title);
  await page.getByLabel(/^Descripción/).fill('Synthetic program: browser, gateway, services and persistence.');
  await page.getByLabel(/^Responsable/).fill('Synthetic coordinator');
  await page.getByRole('button', { name: 'Agregar otra fecha', exact: true }).click();
  await expect(page.locator('.date-option')).toHaveCount(2);
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-program.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic program without personal information.') });
  const saved = page.waitForResponse((response) => response.url().endsWith('/activities') && response.request().method() === 'POST');
  await page.locator('button[type=submit]:not([data-intent=draft])').click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const created = await response.json() as { id: string };
  await expect(page.getByRole('heading', { name: 'Actividad enviada', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver detalle', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/activities/${created.id}$`));
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const detailResponse = await page.request.get(`${gateway}/activities/${created.id}`);
  expect(detailResponse.ok()).toBe(true);
  const detail = await detailResponse.json() as { status: string; options: unknown[] };
  expect(detail.status).toBe('SUBMITTED');
  expect(detail.options).toHaveLength(2);
  const files = await page.request.get(`${gateway}/files/activity/${created.id}`);
  expect(files.ok()).toBe(true);
  expect((await files.json() as { items: unknown[] }).items).toHaveLength(1);
});

test('department navigation follows real memberships; administrator-only settings refuse member', async ({ page }) => {
  await login(page, church.users.member);
  await page.goto('/ministry-hub');
  await expect(page.locator('main')).toContainText('Jóvenes');
  await expect(page.locator('main')).not.toContainText('Tesorería');
  expect((await page.request.get(`${gateway}/notifications/channels/settings`)).status()).toBe(403);
  await page.goto('/settings/channels');
  await expect(appAlerts(page)).toBeVisible();
});

test('form designer saves privately, previews mobile and publishes a usable audited custom field', async ({ page, browser }) => {
  await login(page);
  await page.goto('/settings/activity-form');
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Quitar Nombre de la actividad', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Campo personalizado Texto, lista, fecha y más', exact: true }).click();
  const customLabel = 'Synthetic logistics detail';
  await page.getByLabel('Etiqueta', { exact: true }).fill(customLabel);
  const savedPromise = page.waitForResponse((response) => response.url().endsWith('/activity-form/template/draft') && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  expect((await savedPromise).status()).toBe(200);
  const before = await page.request.get(`${gateway}/activity-form/template`);
  const privateDraft = await before.json() as { published: { fields: Array<{ label: string }> }; draft: { fields: Array<{ id: string; label: string }> } };
  expect(privateDraft.published.fields.some((field) => field.label === customLabel)).toBe(false);
  const custom = privateDraft.draft.fields.find((field) => field.label === customLabel);
  expect(custom).toBeDefined();
  await page.getByRole('button', { name: 'Revisar vista previa', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Vista previa del formulario', exact: true });
  await preview.getByRole('button', { name: 'Vista móvil', exact: true }).click();
  await expect(preview.locator('.preview-browser.mobile')).toBeVisible();
  await expect(preview.getByLabel(new RegExp(customLabel))).toBeVisible();
  await preview.getByRole('button', { name: 'Aprobar vista previa', exact: true }).click();
  const publishedPromise = page.waitForResponse((response) => response.url().endsWith('/activity-form/template/publish') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  expect((await publishedPromise).status()).toBe(201);
  const unauthorized = await fetch(`${gateway}/activity-form/template/publish`, {
    method: 'POST', headers: { authorization: `Bearer ${church.users.leader.token}`, origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify({ expectedDraftVersion: 2 }),
  });
  expect(unauthorized.status).toBe(403);
  const leaderContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  try {
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, church.users.leader);
    await leaderPage.goto(`/activities/new?departmentId=${church.departments.youth}`);
    await leaderPage.getByLabel(/^Nombre de la actividad/).fill('Synthetic configured form activity');
    await leaderPage.getByLabel(/^Descripción/).fill('Synthetic published configuration persistence proof.');
    await leaderPage.getByLabel(/^Responsable/).fill('Synthetic coordinator');
    await leaderPage.getByLabel(new RegExp(customLabel)).fill('Synthetic logistics answer');
    const createdPromise = leaderPage.waitForResponse((response) => response.url().endsWith('/activities') && response.request().method() === 'POST');
    await leaderPage.locator('button[type=submit]:not([data-intent=draft])').click();
    const response = await createdPromise;
    expect(response.status()).toBe(201);
    const created = await response.json() as { id: string };
    const persisted = (await church.pool.query('SELECT custom_data FROM calendar.activities WHERE id=$1', [created.id])).rows[0];
    expect(persisted.custom_data[custom!.id]).toBe('Synthetic logistics answer');
    expect((await church.pool.query("SELECT action FROM audit.audit_events WHERE action IN ('activity-form.draft.updated','activity-form.published') ORDER BY created_at")).rows.map(({ action }) => action)).toEqual(['activity-form.draft.updated', 'activity-form.published']);
  } finally { await leaderContext.close(); }
});

test('central commission and custodian assignments are editable without replacing departmental memberships', async ({ page }) => {
  const subject = await church.createUser(['DEPARTMENT_LEADER', 'ELDER'], [{ departmentId: church.departments.youth, role: 'DIRECTOR' }]);
  await login(page);
  await page.goto('/team');
  await page.getByRole('textbox', { name: 'Buscar usuarios', exact: true }).fill(subject.email);
  await page.getByRole('button', { name: 'Editar asignaciones', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar asignaciones', exact: true });
  await dialog.getByRole('checkbox', { name: /^Miembro de comisión de Nombramientos/ }).check();
  await dialog.getByRole('checkbox', { name: /^Custodio de escrutinio de Nombramientos/ }).check();
  const saved = page.waitForResponse((response) => response.url().endsWith(`/users/${subject.id}`) && response.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Guardar asignaciones', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole('textbox', { name: 'Buscar usuarios', exact: true }).fill(subject.email);
  await expect(page.locator('.user-card')).toHaveCount(1);
  await expect(page.locator('.user-card')).toContainText('Custodio de escrutinio de Nombramientos');
  const account = (await church.pool.query('SELECT roles,name,email FROM identity.users WHERE id=$1', [subject.id])).rows[0];
  expect(account.roles.sort()).toEqual(['DEPARTMENT_LEADER', 'ELDER', 'NOMINATIONS_BALLOT_CUSTODIAN', 'NOMINATIONS_COMMISSION_MEMBER'].sort());
  expect(account.email).toBe(subject.email);
  expect((await church.pool.query('SELECT department_id,role FROM identity.department_memberships WHERE user_id=$1', [subject.id])).rows).toEqual([{ department_id: church.departments.youth, role: 'DIRECTOR' }]);
  await page.getByRole('button', { name: 'Editar asignaciones', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /^Custodio de escrutinio de Nombramientos/ }).uncheck();
  const revoked = page.waitForResponse((response) => response.url().endsWith(`/users/${subject.id}`) && response.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Guardar asignaciones', exact: true }).click();
  expect((await revoked).status()).toBe(200);
  const current = (await church.pool.query('SELECT roles FROM identity.users WHERE id=$1', [subject.id])).rows[0].roles;
  expect(current).toContain('NOMINATIONS_COMMISSION_MEMBER');
  expect(current).not.toContain('NOMINATIONS_BALLOT_CUSTODIAN');
});

test('report filters match persisted records and produce a real CSV/PDF download', async ({ page }) => {
  // Arrangement is synthetic database data, not evidence of an approval flow.
  for (const [department, prefix] of [[church.departments.youth, 'Youth report fixture'], [church.departments.treasury, 'Treasury report fixture']] as const) {
    for (let index = 1; index <= 3; index += 1) {
      await church.pool.query("INSERT INTO calendar.activities(id,title,description,department_id,responsible_name,responsible_user_id,created_by,status,estimated_attendance) VALUES($1,$2,'Synthetic reporting dataset',$3,'Synthetic coordinator',$4,$4,'DRAFT',20)", [randomUUID(), `${prefix} ${index}`, department, church.users.admin.id]);
    }
  }
  await login(page);
  await page.goto('/reports');
  await page.getByLabel(/^Departamento/).selectOption(church.departments.youth);
  await page.getByLabel(/^Estado/).selectOption('DRAFT');
  const generated = page.waitForResponse((response) => response.url().includes('/reports/overview?') && response.url().includes(`departmentId=${church.departments.youth}`) && response.url().includes('status=DRAFT'));
  await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  const report = await (await generated).json() as { summary: { total: number }; activities: Array<{ title: string }> };
  expect(report.summary.total).toBe(3);
  expect(report.activities.map(({ title }) => title).sort()).toEqual(['Youth report fixture 1', 'Youth report fixture 2', 'Youth report fixture 3']);
  await expect(page.locator('.report-kpi').first().locator('strong')).toHaveText('3');
  const folder = resolve('docs/premium-evidence/2026-10-01');
  await mkdir(folder, { recursive: true });
  const csvPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const csv = await csvPromise;
  expect(await csv.failure()).toBeNull();
  await csv.saveAs(resolve(folder, 'reporte-sintetico.csv'));
  const pdfPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Reporte PDF', exact: true }).click();
  const pdf = await pdfPromise;
  expect(await pdf.failure()).toBeNull();
  await pdf.saveAs(resolve(folder, 'reporte-sintetico.pdf'));
});

test('keyboard and automated accessibility checks on representative full pages', async ({ page }) => {
  await login(page);
  for (const route of ['/dashboard', '/calendar', '/reviews', '/settings/departments', '/personal-ministries', '/womens-ministry', '/elders']) {
    await page.goto(route);
    await expect(page.locator('.spinner')).toHaveCount(0);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect.soft(results.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })), route).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  const menu = page.getByRole('button', { name: /Abrir menú/ });
  await menu.click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
});

async function selectLocale(page: Page, locale: Locale) {
  await page.locator('.experience-trigger').click();
  const nativeName = { es: 'Español', en: 'English', fr: 'Français' }[locale];
  const saved = page.waitForResponse((response) => response.url().endsWith('/notifications/preferences') && response.request().method() === 'PATCH');
  await page.locator('.language-option').filter({ hasText: nativeName }).locator('input').check();
  expect((await saved).ok()).toBe(true);
  await page.locator('#experience-panel header .icon-button').click();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

for (const locale of ['es', 'en', 'fr'] as const) {
  test(`${locale}: localized navigation survives reload and user-authored content is not translated`, async ({ page }) => {
    const user = await church.createUser(['TENANT_ADMIN']);
    await login(page, user);
    if (locale !== 'es') await selectLocale(page, locale);
    const created = await page.request.post(`${gateway}/activities`, { headers: { origin: 'http://localhost:3000' }, data: {
      title: 'Inicio', description: 'Calendario', departmentId: church.departments.youth, responsibleName: 'Usuario',
      options: [{ label: 'Usuario', preference: 1, sessions: [{ startsAt: '2031-04-01T16:00:00.000Z', endsAt: '2031-04-01T17:00:00.000Z', setupMinutes: 0, teardownMinutes: 0 }] }],
    } });
    expect(created.status()).toBe(201);
    const activity = await created.json() as { id: string };
    const routes = [
      ['/dashboard', 'Centro de control'], ['/calendar', 'Calendario'], ['/reviews', 'Junta de revisión'], ['/reports', 'Reportes'],
      ['/notifications', 'Notificaciones'], ['/team', 'Equipo y permisos'], ['/documents', 'Biblioteca ministerial'],
      ['/settings/departments', 'Departamentos'], ['/settings/roster', 'Padrón de iglesia'], ['/settings/activity-form', 'Diseñador de formulario'],
      ['/settings/channels', 'Configuración'], ['/audit', 'Auditoría'], ['/personal-ministries', 'Ministerios Personales'],
      ['/womens-ministry', 'Ministerio de la Mujer'], ['/elders', 'Ancianos'], ['/ministry-hub', 'Espacios de trabajo'],
    ];
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [route, title] of routes) {
      await page.goto(route!);
      await expect(page.locator('.spinner')).toHaveCount(0);
      await expect(page.locator('main h1')).toHaveText(translateText(locale, title!));
      await expect(appAlerts(page), `${locale} ${route}: data must load`).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, view: document.documentElement.clientWidth }));
      expect(dimensions.body, `${locale} ${route} 390px`).toBeLessThanOrEqual(dimensions.view + 1);
    }
    await page.goto('/reports');
    await expect(page.locator('.spinner')).toHaveCount(0);
    const pdfPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: translateText(locale, 'Reporte PDF'), exact: true }).click();
    const pdf = await pdfPromise;
    expect(await pdf.failure()).toBeNull();
    const folder = resolve('docs/premium-evidence/2026-10-01');
    await mkdir(folder, { recursive: true });
    await pdf.saveAs(resolve(folder, `reporte-sintetico-${locale}.pdf`));
    await page.screenshot({ path: resolve(folder, `reportes-${locale}-390.png`), fullPage: true });
    await page.goto(`/activities/${activity.id}`);
    await expect(page.locator('.activity-title h2')).toHaveText('Inicio');
    await expect(page.locator('.activity-detail .lead')).toHaveText('Calendario');
    await page.reload();
    await expect(page.locator('.activity-title h2')).toHaveText('Inicio');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect((await page.request.get(`${gateway}/notifications/preferences`)).ok()).toBe(true);
  });
}

test('failed dashboard does not invent zero metrics and a retry recovers the real result', async ({ page }) => {
  await login(page);
  await page.route('**/api/v1/dashboard', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Synthetic temporary unavailability' }) }));
  await page.goto('/dashboard');
  await expect(appAlerts(page)).toContainText('No fue posible cargar el centro de control');
  await expect(page.locator('.stat-card')).toHaveCount(0);
  await page.unroute('**/api/v1/dashboard');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(appAlerts(page)).toHaveCount(0);
  await expect(page.locator('.stat-card').first()).toBeVisible();
});

test('dirty activity survives cancelled link navigation and browser Back without leaking a draft to storage', async ({ page }) => {
  await login(page, church.users.leader);
  await page.locator('.top-actions a[href="/activities/new"]').click();
  await expect(page.locator('.spinner')).toHaveCount(0);
  const title = page.getByLabel(/Nombre de la actividad/);
  const sentinel = `Synthetic private draft ${randomUUID()}`;
  await title.fill(sentinel);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#primary-sidebar a[href="/calendar"]').click();
  await expect(page).toHaveURL(/\/activities\/new$/);
  await expect(title).toHaveValue(sentinel);
  const prompt = page.waitForEvent('dialog');
  const back = page.goBack({ waitUntil: 'commit', timeout: 5_000 }).catch(() => null);
  const dialog = await prompt;
  await dialog.dismiss();
  await back;
  await expect(page).toHaveURL(/\/activities\/new$/);
  await expect(title).toHaveValue(sentinel);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain(sentinel);
  // Explicitly approve the final discard; the test does not leave a live draft.
  page.once('dialog', (discard) => discard.accept());
  await page.locator('#primary-sidebar a[href="/calendar"]').click();
  await expect(page).toHaveURL(/\/calendar$/);
});

async function expireCurrentSession(page: Page) {
  const response = await page.request.get(`${gateway}/me`);
  expect(response.ok()).toBe(true);
  const session = await response.json() as { user: { sessionId: string } };
  await church.pool.query('UPDATE identity.sessions SET revoked_at=now() WHERE id=$1', [session.user.sessionId]);
}

test('lost acknowledgements after activity and attachment commits resume the same persisted records', async ({ page }) => {
  await login(page, church.users.leader);
  await page.goto(`/activities/new?departmentId=${church.departments.youth}`);
  const title = `Synthetic uncertain response ${randomUUID()}`;
  await page.getByLabel(/^Nombre de la actividad/).fill(title);
  await page.getByLabel(/^Descripción/).fill('Synthetic lost-acknowledgement proof with no personal data.');
  await page.getByLabel(/^Responsable/).fill('Synthetic coordinator');
  await page.locator('.date-option input[type="datetime-local"]').nth(0).fill('2032-06-01T10:00');
  await page.locator('.date-option input[type="datetime-local"]').nth(1).fill('2032-06-01T11:00');
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-uncertain.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic exact attachment bytes.') });
  let lostCreate = false, lostUpload = false;
  const createKeys: string[] = [], uploadKeys: string[] = [];
  await page.route(/\/api\/v1\/activities$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    createKeys.push(route.request().headers()['idempotency-key'] ?? '');
    const committed = await route.fetch();
    expect(committed.status()).toBe(201);
    if (!lostCreate) {
      lostCreate = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Synthetic lost activity acknowledgement' }) });
    } else await route.fulfill({ response: committed });
  });
  await page.route(/\/api\/v1\/files\/activity\/[a-f0-9-]+$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    uploadKeys.push(route.request().headers()['idempotency-key'] ?? '');
    const committed = await route.fetch();
    expect(committed.status()).toBe(201);
    if (!lostUpload) {
      lostUpload = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Synthetic lost upload acknowledgement' }) });
    } else await route.fulfill({ response: committed });
  });
  await page.locator('button[type=submit]:not([data-intent=draft])').click();
  await expect(appAlerts(page)).toContainText('Synthetic lost activity acknowledgement');
  expect((await church.pool.query('SELECT count(*)::int count FROM calendar.activities WHERE title=$1', [title])).rows[0].count).toBe(1);
  await page.locator('button[type=submit]:not([data-intent=draft])').click();
  await expect(appAlerts(page)).toContainText('Synthetic lost upload acknowledgement');
  const activity = (await church.pool.query('SELECT id FROM calendar.activities WHERE title=$1', [title])).rows[0];
  await page.locator('button[type=submit]:not([data-intent=draft])').click();
  await expect(page.getByRole('heading', { name: 'Actividad enviada', exact: true })).toBeVisible();
  expect(createKeys).toHaveLength(2); expect(createKeys[0]).toBeTruthy(); expect(createKeys[1]).toBe(createKeys[0]);
  expect(uploadKeys).toHaveLength(2); expect(uploadKeys[0]).toBeTruthy(); expect(uploadKeys[1]).toBe(uploadKeys[0]);
  expect((await church.pool.query('SELECT count(*)::int count FROM calendar.activities WHERE title=$1', [title])).rows[0].count).toBe(1);
  const files = await page.request.get(`${gateway}/files/activity/${activity.id}`);
  expect(files.ok()).toBe(true);
  expect((await files.json() as { items: unknown[] }).items).toHaveLength(1);
});

test('administrative publication recovery requires confirmation and reports scheduling rather than delivery', async ({ page, browser }) => {
  const aggregateId = randomUUID();
  const event = (await church.pool.query("INSERT INTO calendar.outbox_events(event_type,aggregate_id,payload,attempts) VALUES('fixture.browser_recovery',$1,$2::jsonb,8) RETURNING id", [aggregateId, JSON.stringify({ privateSynthetic: 'Synthetic payload not intended for UI' })])).rows[0];
  await login(page);
  await page.goto('/notifications');
  const queue = page.getByRole('region', { name: 'Cola de publicaciones agotadas', exact: true });
  await expect(queue).toContainText(event.id);
  await expect(queue).not.toContainText('Synthetic payload not intended for UI');
  await queue.locator('article').filter({ hasText: event.id }).getByRole('button', { name: 'Reprogramar publicación', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar reprogramación', exact: true });
  await expect(dialog.getByRole('button', { name: 'Confirmar y reprogramar', exact: true })).toBeDisabled();
  const reason = 'Synthetic recovery after operator diagnosis';
  await dialog.getByLabel('Razón operativa del reintento', { exact: true }).fill(reason);
  const scheduled = page.waitForResponse((response) => response.url().endsWith(`/calendar/outbox/${event.id}/retry`) && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Confirmar y reprogramar', exact: true }).click();
  expect((await scheduled).status()).toBe(201);
  await expect(page.getByText('Publicación reprogramada con el mismo identificador. La entrega todavía no está confirmada.', { exact: true })).toBeVisible();
  expect((await church.pool.query("SELECT after_data FROM audit.audit_events WHERE action='calendar.outbox_retry_requested' AND resource_id=$1", [event.id])).rows).toEqual([expect.objectContaining({ after_data: expect.objectContaining({ reason, previousAttempts: 8 }) })]);
  const memberContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  try {
    const memberPage = await memberContext.newPage();
    await login(memberPage, church.users.member);
    await memberPage.goto('/notifications');
    await expect(memberPage.getByRole('region', { name: 'Cola de publicaciones agotadas', exact: true })).toHaveCount(0);
  } finally { await memberContext.close(); }
});

test('explicit draft save reconciles lost acknowledgements and keeps custom data and program after reload and another tab', async ({ page, context }) => {
  await login(page, church.users.leader);
  await page.goto(`/activities/new?departmentId=${church.departments.youth}`);
  const title = `Synthetic durable draft ${randomUUID()}`;
  await page.getByLabel(/^Nombre de la actividad/).fill(title);
  await page.getByLabel(/^Descripción/).fill('Synthetic draft persistence, no automatic submission or reservation.');
  await page.getByLabel(/^Responsable/).fill('Synthetic draft coordinator');
  const customLabel = 'Synthetic logistics detail';
  await page.getByLabel(new RegExp(customLabel)).fill('Synthetic saved custom answer');
  await page.getByRole('button', { name: 'Agregar otra fecha', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-saved-draft.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic durable program attachment.') });
  const createKeys: string[] = [], uploadKeys: string[] = [];
  let lostCreate = false, lostUpload = false, submissions = 0;
  await page.route('**/api/v1/activities', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    createKeys.push(route.request().headers()['idempotency-key']!);
    const committed = await route.fetch(); expect(committed.status()).toBe(201);
    if (!lostCreate) { lostCreate = true; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Synthetic lost draft acknowledgement' }) }); }
    await route.fulfill({ response: committed });
  });
  await page.route('**/api/v1/files/activity/*', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    uploadKeys.push(route.request().headers()['idempotency-key']!);
    const committed = await route.fetch(); expect(committed.status()).toBe(201);
    if (!lostUpload) { lostUpload = true; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Synthetic lost draft program acknowledgement' }) }); }
    await route.fulfill({ response: committed });
  });
  page.on('request', request => { if (request.url().match(/\/activities\/[^/]+\/submit$/)) submissions++; });
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(appAlerts(page)).toContainText('Synthetic lost draft acknowledgement');
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(appAlerts(page)).toContainText('Synthetic lost draft program acknowledgement');
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page).toHaveURL(/\/activities\/[a-f0-9-]{36}$/);
  const id = page.url().split('/').at(-1)!;
  expect(submissions).toBe(0); expect(createKeys).toHaveLength(2); expect(createKeys[1]).toBe(createKeys[0]);
  expect(uploadKeys).toHaveLength(2); expect(uploadKeys[1]).toBe(uploadKeys[0]);
  expect((await church.pool.query('SELECT count(*)::int count FROM calendar.activities WHERE title=$1', [title])).rows[0].count).toBe(1);
  expect((await church.pool.query('SELECT count(*)::int count FROM calendar.reservations WHERE activity_id=$1', [id])).rows[0].count).toBe(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText('Synthetic saved custom answer');
  const tab = await context.newPage();
  try {
    await tab.goto(`/activities/${id}`);
    await expect(tab.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const detail = await (await tab.request.get(`${gateway}/activities/${id}`)).json();
    expect(detail.status).toBe('DRAFT'); expect(detail.options).toHaveLength(2);
    const files = await tab.request.get(`${gateway}/files/activity/${id}`); expect(files.ok()).toBe(true);
    expect((await files.json()).items).toHaveLength(1);
    await tab.getByRole('link', { name: 'Editar actividad', exact: true }).click();
    await tab.getByLabel(new RegExp(customLabel)).fill('Synthetic custom answer changed after reload');
    await tab.getByLabel('Motivo del cambio', { exact: true }).fill('Synthetic resumed draft editing');
    await tab.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(tab).toHaveURL(new RegExp(`/activities/${id}$`));
    await tab.reload();
    await expect(tab.locator('main')).toContainText('Synthetic custom answer changed after reload');
    const edited = await (await tab.request.get(`${gateway}/activities/${id}`)).json();
    expect(edited.status).toBe('DRAFT'); expect(edited.options).toHaveLength(2); expect(edited.tags).toEqual(detail.tags);
  } finally { await tab.close(); }
});

test('password reset publication recovery exposes only metadata and forbids expired intent retries', async ({ page }) => {
  const activeTokenId = randomUUID(), expiredTokenId = randomUUID(), activeEventId = randomUUID(), expiredEventId = randomUUID();
  await church.pool.query("INSERT INTO identity.password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$3,$4,now()+interval '30 minutes'),($2,$3,$5,now()-interval '1 minute')", [activeTokenId, expiredTokenId, church.users.leader.id, randomUUID(), randomUUID()]);
  // Invalid encrypted envelopes are deliberate fixtures. The worker cannot
  // decrypt or send them: this UI test proves recovery metadata/audit, not email.
  await church.pool.query("INSERT INTO identity.password_reset_outbox(id,reset_token_id,user_id,payload_ciphertext,expires_at,attempts) VALUES($1,$2,$3,'synthetic-owned-invalid-envelope',now()+interval '30 minutes',8),($4,$5,$3,'synthetic-owned-invalid-envelope',now()-interval '1 minute',8)", [activeEventId, activeTokenId, church.users.leader.id, expiredEventId, expiredTokenId]);
  await login(page); await page.goto('/notifications');
  const queue = page.getByRole('region', { name: 'Cola de publicaciones agotadas', exact: true });
  await expect(queue).toContainText('Recuperación de contraseña');
  await expect(queue).not.toContainText('synthetic-owned-invalid-envelope');
  const expired = queue.locator('article').filter({ hasText: expiredEventId });
  await expect(expired).toContainText('Enlace vencido');
  await expect(expired.getByRole('button', { name: 'Reprogramar publicación', exact: true })).toBeDisabled();
  await queue.locator('article').filter({ hasText: activeEventId }).getByRole('button', { name: 'Reprogramar publicación', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar reprogramación', exact: true });
  await dialog.getByLabel('Razón operativa del reintento', { exact: true }).fill('Synthetic reset outbox operator recovery');
  const ack = page.waitForResponse(r => r.url().endsWith(`/auth/password/outbox/${activeEventId}/retry`) && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Confirmar y reprogramar', exact: true }).click(); expect((await ack).status()).toBe(201);
  await expect(page.getByText('Publicación reprogramada con el mismo identificador. La entrega todavía no está confirmada.', { exact: true })).toBeVisible();
  expect((await church.pool.query("SELECT count(*)::int count FROM audit.audit_events WHERE action='auth.password_reset.notification_retried' AND resource_id=$1", [activeEventId])).rows[0].count).toBe(1);
  expect((await church.pool.query('SELECT count(*)::int count FROM identity.password_reset_outbox WHERE id=$1', [activeEventId])).rows[0].count).toBe(1);
});

async function authenticatePopup(page: Page, user: FixtureUser) {
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Abrir acceso en otra pestaña', exact: true }).click();
  const popup = await popupPromise;
  await popup.getByLabel('Iglesia o código', { exact: true }).click();
  await popup.getByLabel('Iglesia o código', { exact: true }).fill(church.slug);
  await popup.getByLabel('Usuario', { exact: true }).click();
  await popup.getByLabel('Usuario', { exact: true }).fill(user.email);
  await popup.getByLabel('Contraseña', { exact: true }).click();
  await popup.getByLabel('Contraseña', { exact: true }).fill(user.password);
  const authenticated = popup.waitForResponse((response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
  await popup.getByRole('button', { name: 'Ingresar', exact: true }).click();
  expect((await authenticated).ok()).toBe(true);
  await page.getByRole('button', { name: 'Comprobar sesión y continuar', exact: true }).click();
  return popup;
}

test('session expiry preserves the activity and File in memory until same-account reauthentication and explicit retry', async ({ page }) => {
  await login(page, church.users.leader);
  await page.goto(`/activities/new?departmentId=${church.departments.youth}`);
  const title = `Synthetic expired draft ${randomUUID()}`;
  await page.getByLabel(/^Nombre de la actividad/).fill(title);
  await page.getByLabel(/^Descripción/).fill('Synthetic draft retained only in the open authenticated tab.');
  await page.getByLabel(/^Responsable/).fill('Synthetic coordinator');
  await page.locator('.date-option input[type="datetime-local"]').nth(0).fill('2032-05-01T10:00');
  await page.locator('.date-option input[type="datetime-local"]').nth(1).fill('2032-05-01T11:00');
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-reauth-program.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic memory-only attachment.') });
  await expireCurrentSession(page);
  await page.locator('button[type=submit]:not([data-intent=draft])').click();
  await expect(page.getByRole('heading', { name: 'Tu sesión expiró', exact: true })).toBeVisible();
  expect((await church.pool.query('SELECT 1 FROM calendar.activities WHERE title=$1', [title])).rowCount).toBe(0);
  const popup = await authenticatePopup(page, church.users.leader);
  try {
    await expect(page.getByRole('heading', { name: 'Tu sesión expiró', exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/^Nombre de la actividad/)).toHaveValue(title);
    expect(await page.locator('input[type=file]').evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe('synthetic-reauth-program.txt');
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage).not.toContain(title);
    const createdPromise = page.waitForResponse((response) => response.url().endsWith('/activities') && response.request().method() === 'POST');
    await page.locator('button[type=submit]:not([data-intent=draft])').click();
    const createdResponse = await createdPromise;
    expect(createdResponse.status()).toBe(201);
    const activity = await createdResponse.json() as { id: string };
    await expect(page.getByRole('heading', { name: 'Actividad enviada', exact: true })).toBeVisible();
    const files = await page.request.get(`${gateway}/files/activity/${activity.id}`);
    expect((await files.json() as { items: unknown[] }).items).toHaveLength(1);
    expect((await church.pool.query('SELECT count(*)::int count FROM calendar.activities WHERE title=$1', [title])).rows[0].count).toBe(1);
  } finally { if (!popup.isClosed()) await popup.close(); }
});

test('a different reauthenticated identity cannot inherit the old draft or attachment', async ({ page }) => {
  await login(page, church.users.leader);
  await page.goto(`/activities/new?departmentId=${church.departments.youth}`);
  const sentinel = `Synthetic previous-account draft ${randomUUID()}`;
  await page.getByLabel(/^Nombre de la actividad/).fill(sentinel);
  await page.getByLabel(/^Descripción/).fill('Synthetic previous-account private content.');
  await page.getByLabel(/^Responsable/).fill('Synthetic coordinator');
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-old-account.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic previous-account file.') });
  await expireCurrentSession(page);
  await page.locator('button[type=submit]:not([data-intent=draft])').click();
  await expect(page.getByRole('heading', { name: 'Tu sesión expiró', exact: true })).toBeVisible();
  const popup = await authenticatePopup(page, church.users.member);
  try {
    await expect(page.getByRole('heading', { name: 'Cambió la cuenta o la iglesia', exact: true })).toBeVisible();
    await expect(page.getByLabel(/^Nombre de la actividad/)).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toContain(sentinel);
    expect((await church.pool.query('SELECT 1 FROM calendar.activities WHERE title=$1', [sentinel])).rowCount).toBe(0);
    await page.getByRole('link', { name: 'Ir al inicio', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally { if (!popup.isClosed()) await popup.close(); }
});
