import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { createTenantFixture, type SyntheticTenantFixture, type FixtureUser } from '../helpers/tenant-fixture.js';

const publicDiagnostics = new WeakMap<Page, Array<Record<string, string | number | boolean>>>();
function observePublicDiagnostics(page: Page) {
  const records: Array<Record<string, string | number | boolean>> = [];
  publicDiagnostics.set(page, records);
  page.on('response', async (response) => {
    const endpoint = new URL(response.url());
    if (endpoint.origin !== 'http://localhost:4100') return;
    if (response.status() >= 400) {
      const body = await response.json().catch(() => ({})) as { error?: { code?: string } };
      records.push({ path: endpoint.pathname, status: response.status(), code: body.error?.code ?? 'unknown' });
    } else if (endpoint.pathname === '/v1/session') {
      const body = await response.json().catch(() => ({})) as { data?: { serverTime?: string; expiresAt?: string } };
      records.push({ path: endpoint.pathname, status: response.status(), hasServerTime: Boolean(body.data?.serverTime),
        lifetimeMs: Date.parse(body.data?.expiresAt ?? '') - Date.parse(body.data?.serverTime ?? '') });
    } else if (endpoint.pathname === '/v1/integrations/gestionchurch/session') {
      records.push({ path: endpoint.pathname, status: response.status(), pagePath: new URL(page.url()).pathname });
    }
  });
  page.on('pageerror', (error) => records.push({ kind: 'pageerror', name: error.name }));
}
test.beforeEach(async ({ page }) => { observePublicDiagnostics(page); });
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await info.attach('public-http-diagnostics', { body: JSON.stringify(publicDiagnostics.get(page) ?? []), contentType: 'application/json' });
});

const run = promisify(execFile);
const nominationsRoot = 'X:/CODE/NOMBRAMIENTOS';
const helper = resolve(nominationsRoot, 'packages/database/scripts/gestionchurch-browser-fixture.mjs');
const moduleScript = resolve(nominationsRoot, 'scripts/gestionchurch-module.ps1');
const gateway = 'http://localhost:4000/api/v1';
let church: SyntheticTenantFixture;
let provisioned = false;
let receipt: string;
let diagnosticWindowOpenedAt = '';

async function captureUpstreamDiagnostics(info: TestInfo) {
  const records: Array<{ event: string; operation: string; upstreamStatus: number; observedAt: string }> = [];
  const content = await readFile(resolve(nominationsRoot, '.local/gestionchurch-module/api.log'), 'utf8').catch(() => '');
  for (const line of content.split(/\r?\n/u)) {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (record.event !== 'gestionchurch.upstream_rejected'
        || !['authorize', 'redeem', 'organization'].includes(String(record.operation))
        || !Number.isInteger(record.upstreamStatus) || Number(record.upstreamStatus) < 100 || Number(record.upstreamStatus) > 599
        || typeof record.observedAt !== 'string' || !Number.isFinite(Date.parse(record.observedAt))
        || Date.parse(record.observedAt) < Date.parse(diagnosticWindowOpenedAt)) continue;
      records.push({ event: 'gestionchurch.upstream_rejected', operation: String(record.operation),
        upstreamStatus: Number(record.upstreamStatus), observedAt: record.observedAt });
    } catch { /* Runtime startup output is not diagnostic JSON. Never attach raw lines. */ }
  }
  await info.attach('public-upstream-diagnostics-before-cleanup', {
    body: JSON.stringify({ capturedAt: new Date().toISOString(), windowOpenedAt: diagnosticWindowOpenedAt, records }),
    contentType: 'application/json',
  });
}

async function fixtureOperation(mode: string, value: string) {
  const { stdout } = await run(process.execPath, [helper, mode, value], { cwd: nominationsRoot, timeout: 120_000 });
  const result = JSON.parse(stdout.trim()) as { pass: boolean; resourcesAbsent?: boolean };
  expect(result.pass).toBe(true);
  return result;
}

async function moduleOperation(action: 'Start' | 'Stop') {
  await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', moduleScript,
    '-Action', action, '-GestionChurchRoot', resolve('.'), ...(action === 'Start' ? ['-NoPrepare'] : [])],
  { cwd: nominationsRoot, timeout: 160_000 });
}

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
}

async function launch(page: Page, phase: string) {
  await page.goto('/nominations');
  await expect(page).toHaveURL(/localhost:3300\/es\/app\/[a-z-]+$/, { timeout: 45_000 });
  const response = await page.request.get('http://localhost:4100/v1/session');
  const body = await response.json().catch(() => ({})) as { data?: { tenant: { id: string }; permissions: string[]; user: { email: string }; csrfToken: string }; error?: { code?: string } };
  const diagnostic = { path: '/v1/session', phase, status: response.status(), code: body.error?.code ?? 'none' };
  publicDiagnostics.get(page)?.push(diagnostic);
  expect(response.ok(), JSON.stringify(diagnostic)).toBe(true);
  return body.data!;
}

type BrowserBinding = { sessionId: string; deviceId: string; signingFingerprint: string; deviceStatus: string; hasActiveGrant: boolean };
async function browserBinding(page: Page): Promise<BrowserBinding> {
  const response = await page.request.get('http://localhost:4100/v1/device-session');
  const body = await response.json() as { data?: { binding: BrowserBinding }; error?: { code?: string } };
  const diagnostic = { path: '/v1/device-session', status: response.status(), code: body.error?.code ?? 'none',
    pagePath: new URL(page.url()).pathname };
  publicDiagnostics.get(page)?.push(diagnostic);
  if (!response.ok()) {
    const sessionResponse = await page.request.get('http://localhost:4100/v1/session');
    const sessionBody = await sessionResponse.json().catch(() => ({})) as { error?: { code?: string } };
    publicDiagnostics.get(page)?.push({ path: '/v1/session', status: sessionResponse.status(), code: sessionBody.error?.code ?? 'none', pagePath: new URL(page.url()).pathname });
  }
  expect(response.ok(), JSON.stringify(diagnostic)).toBe(true);
  return body.data!.binding;
}

async function expectRecognizedBrowserReady(page: Page) {
  await page.goto('http://localhost:3300/es/app/settings');
  await expect(page).toHaveURL('http://localhost:3300/es/app/settings');
  await expect(page.getByTestId('device-sessions-panel')).toBeVisible();
  await expect(page.getByTestId('device-session-guide')).toHaveCount(0);
}

async function registerBrowser(page: Page, label: string) {
  const guide = page.getByTestId('device-session-guide');
  await expect(guide).toBeVisible();
  await guide.getByLabel('Nombre de este navegador', { exact: true }).fill(label);
  const completed = page.waitForResponse((response) => response.url().endsWith('/v1/device-session/enrollment/complete') && response.request().method() === 'POST');
  await guide.getByRole('button', { name: 'Preparar este navegador', exact: true }).click();
  expect((await completed).ok()).toBe(true);
  await expect(page.getByText('Este navegador espera autorización de custodia', { exact: true })).toBeVisible();
  const binding = await browserBinding(page);
  expect(binding.deviceStatus).toBe('pending');
  expect(binding.hasActiveGrant).toBe(false);
  return binding;
}

async function signerMetadata(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('nombramientos-device-signers', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('signer metadata unavailable'));
    });
    try {
      const records = await new Promise<Array<{ deviceId: string; fingerprint: string; privateKey: CryptoKey }>>((resolve, reject) => {
        const request = database.transaction('signers', 'readonly').objectStore('signers').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('signer metadata unavailable'));
      });
      return records.map((record) => ({ deviceId: record.deviceId, fingerprint: record.fingerprint, extractable: record.privateKey.extractable }));
    } finally { database.close(); }
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({ width: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll<HTMLElement>('body *')].filter((element) => {
      const bounds = element.getBoundingClientRect();
      return element.getClientRects().length && (bounds.right > window.innerWidth + 1 || bounds.left < -1);
    }).slice(0, 16).map((element) => {
      const bounds = element.getBoundingClientRect();
      return { tag: element.tagName, className: element.getAttribute('class'), width: Math.round(bounds.width), right: Math.round(bounds.right), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    }) }));
  if (geometry.documentWidth > geometry.width + 1) await page.screenshot({ path: `.local/device-session-browser-results/overflow-${geometry.width}-${Date.now()}.png` });
  expect(geometry.documentWidth <= geometry.width + 1, JSON.stringify(geometry)).toBe(true);
}

async function assertStickyHeaderDoesNotCoverFocusedControl(page: Page) {
  const control = page.getByTestId('device-sessions-panel').getByRole('button').first();
  await expect.poll(() => page.evaluate(() => {
    const headerHeight = document.querySelector('header.session-topbar')?.getBoundingClientRect().height ?? 0;
    return parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) - headerHeight;
  })).toBeGreaterThanOrEqual(0);
  await control.evaluate((element) => {
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  const geometry = await control.evaluate((element) => ({
    width: window.innerWidth,
    controlTop: element.getBoundingClientRect().top,
    headerBottom: document.querySelector('header.session-topbar')?.getBoundingClientRect().bottom ?? 0,
    focused: document.activeElement === element,
  }));
  expect(geometry.focused).toBe(true);
  expect(geometry.controlTop >= geometry.headerBottom - 1, JSON.stringify(geometry)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

async function unlockBrowser(page: Page, label: string) {
  const unlock = page.getByRole('button', { name: `Desbloquear con ${label}`, exact: true });
  await expect(unlock).toBeVisible();
  await unlock.click();
  await expect(page.getByText('Desbloqueada en memoria', { exact: true })).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  diagnosticWindowOpenedAt = new Date().toISOString();
  expect((await request.get('http://localhost:4000/health/ready')).ok()).toBe(true);
  expect((await request.get('http://localhost:4100/healthz')).ok()).toBe(true);
  church = await createTenantFixture();
  receipt = resolve(nominationsRoot, `packages/database/.local/gc-browser-fixture-${church.id}.json`);
  await fixtureOperation('--check', church.id);
  await fixtureOperation('--create', church.id);
  provisioned = true;
});

test.afterAll(async ({}, info) => {
  // Stop only the task-scoped module processes, never PostgreSQL or GestionChurch.
  // The helper rechecks exact marker, nonce, UUID routing, memberships and absence
  // of connections before deleting its own synthetic resources. Audit is retained.
  let cleanupComplete = !church;
  if (provisioned) {
    await captureUpstreamDiagnostics(info);
    await moduleOperation('Stop');
    try {
      expect((await fixtureOperation('--cleanup', receipt)).resourcesAbsent).toBe(true);
      cleanupComplete = true;
    } finally { await moduleOperation('Start'); }
  }
  // Do not remove the source after a failed/partial provision without review.
  if (cleanupComplete && church) await church.destroy();
});

test('GestionChurch SSO, tenant isolation and return work in the real browser', async ({ page }) => {
  await login(page);
  const session = await launch(page, 'SSO-initial');
  expect(session.tenant.id).toBe(church.id);
  expect(session.user.email).toBe(church.users.admin.email);
  expect(session.permissions).toContain('cycle.manage');
  expect(session.permissions).not.toContain('proposal.submit');
  expect(session.permissions).not.toContain('ballot.submit');
  expect(session.permissions).not.toContain('tally.custody');
  await page.getByRole('link', { name: 'Volver a GestionChurch', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3000/dashboard');
  await expect(page.getByRole('heading', { name: 'Centro de control', exact: true })).toBeVisible();
});

test('device-bound guided start, persisted browser proof, explicit approval and targeted revocation work end to end', async ({ page, browser }) => {
  await login(page);
  await launch(page, 'A-initial');
  const browserALabel = `Synthetic browser A ${church.id}`;
  const bindingA = await registerBrowser(page, browserALabel);
  // First-key creation is explicit, isolated to this owned synthetic church.
  // The encrypted offline backup is downloaded, never attached or logged.
  await page.locator('#bootstrap-passphrase').fill(`Synthetic offline recovery ${church.id}`);
  await page.locator('#bootstrap-confirm').fill(`Synthetic offline recovery ${church.id}`);
  await page.getByRole('button', { name: 'Crear y verificar copia local', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar copia offline', exact: true }).click();
  const backup = await downloaded;
  expect(await backup.failure()).toBeNull();
  await backup.delete();
  const initialized = page.waitForResponse((response) => response.url().endsWith('/v1/key-lifecycle/grants/initialize') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Activar primera concesión', exact: true }).click();
  expect((await initialized).ok()).toBe(true);
  await expect(page.getByText('Este navegador espera autorización de custodia', { exact: true })).toHaveCount(0);
  const activatedA = await browserBinding(page);
  expect(activatedA.deviceId).toBe(bindingA.deviceId);
  expect(activatedA.hasActiveGrant).toBe(true);
  expect(await signerMetadata(page)).toEqual([{ deviceId: bindingA.deviceId, fingerprint: bindingA.signingFingerprint, extractable: false }]);
  // Overview can also render its empty-state CTA after the session is ready.
  // Exercise the persistent header entry without removing either valid path.
  const start = page.locator('header.topbar').getByRole('link', { name: 'Iniciar proceso', exact: true });
  await expect(start).toHaveCount(1);
  await start.click();
  await expect(page).toHaveURL(/\/es\/app\/workflow$/);
  await page.getByRole('button', { name: 'Iniciar proceso', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo proceso de nombramientos', exact: true });
  const name = `Synthetic browser period ${church.id}`;
  await dialog.locator('input:not([type=date])').fill(name);
  await dialog.locator('input[type=date]').nth(0).fill('2027-01-01');
  await dialog.locator('input[type=date]').nth(1).fill('2027-12-31');
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  const createdPromise = page.waitForResponse((response) => response.url().endsWith('/v1/cycles') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Crear período en borrador', exact: true }).click();
  const created = await createdPromise;
  expect(created.status()).toBe(201);
  expect(Boolean(created.request().headers()['x-device-proof'])).toBe(true);
  await expect(dialog).toHaveCount(0);
  // Routine reload resumes only the same signer. Decryption remains explicit.
  await page.goto('http://localhost:3300/es/app/settings');
  await expect(page.getByTestId('device-sessions-panel')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('device-sessions-panel')).toBeVisible();
  await expect(page.getByTestId('device-session-guide')).toHaveCount(0);
  expect((await browserBinding(page)).signingFingerprint).toBe(bindingA.signingFingerprint);
  expect(await signerMetadata(page)).toEqual([{ deviceId: bindingA.deviceId, fingerprint: bindingA.signingFingerprint, extractable: false }]);
  await unlockBrowser(page, browserALabel);
  // A phone set a day ahead must not log a valid server session out or sign
  // with a client timestamp. Only this owned Nombramientos page is skewed.
  await page.addInitScript(() => { if (location.port === '3300') { const wallNow = Date.now.bind(Date); Date.now = () => wallNow() + 86_400_000; } });
  const translatedTitles = { es: 'Tus sesiones activas', en: 'Your active sessions', fr: 'Vos sessions actives' };
  for (const locale of ['es', 'en', 'fr'] as const) {
    await page.goto(`http://localhost:3300/${locale}/app/settings`);
    await expect(page.getByRole('heading', { name: translatedTitles[locale], exact: true })).toBeVisible();
    await expect(page.getByTestId('device-session-guide')).toHaveCount(0);
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await assertNoHorizontalOverflow(page);
      await assertStickyHeaderDoesNotCoverFocusedControl(page);
      if (locale === 'fr' && width === 768) await page.screenshot({ path: `.local/device-session-browser-results/device-session-active-tablet-fr-${church.id}.png` });
    }
  }
  await page.goto('http://localhost:3300/es/app/settings');
  await unlockBrowser(page, browserALabel);
  await page.screenshot({ path: `.local/device-session-browser-results/device-session-active-desktop-${church.id}.png` });
  await page.setViewportSize({ width: 360, height: 844 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `.local/device-session-browser-results/device-session-active-mobile-${church.id}.png` });
  await page.setViewportSize({ width: 1440, height: 900 });

  const contextB = await browser.newContext({ baseURL: 'http://localhost:3000', serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const pageB = await contextB.newPage();
  observePublicDiagnostics(pageB);
  try {
    await login(pageB);
    await launch(pageB, 'B-initial');
    const browserBLabel = `Synthetic browser B ${church.id}`;
    const bindingB = await registerBrowser(pageB, browserBLabel);
    await assertNoHorizontalOverflow(pageB);
    await pageB.setViewportSize({ width: 360, height: 844 });
    await assertNoHorizontalOverflow(pageB);
    await pageB.screenshot({ path: `.local/device-session-browser-results/device-session-pending-mobile-${church.id}.png` });
    await pageB.setViewportSize({ width: 390, height: 844 });
    await expect(pageB.getByRole('heading', { name: 'Aprobar otro dispositivo', exact: true })).toHaveCount(0);
    await expect(pageB.getByTestId('device-sessions-panel')).toHaveCount(0);
    const pendingTitles = { es: 'Este navegador espera autorización de custodia', en: 'This browser is awaiting custody authorization', fr: 'Ce navigateur attend une autorisation de garde' };
    const approvalTitles = { es: 'Aprobar otro dispositivo', en: 'Approve another device', fr: 'Approuver un autre appareil' };
    for (const locale of ['es', 'en', 'fr'] as const) {
      await pageB.goto(`http://localhost:3300/${locale}/app/settings`);
      await expect(pageB.getByText(pendingTitles[locale], { exact: true })).toBeVisible();
      await expect(pageB.getByRole('heading', { name: approvalTitles[locale], exact: true })).toHaveCount(0);
      await expect(pageB.getByTestId('device-sessions-panel')).toHaveCount(0);
      for (const width of [360, 390, 768]) { await pageB.setViewportSize({ width, height: 844 }); await assertNoHorizontalOverflow(pageB); }
    }
    await pageB.goto('http://localhost:3300/es/app/settings');
    await pageB.setViewportSize({ width: 390, height: 844 });
    // A pending administrator is not silently authorized; no protected reads.
    const beforeApproval = await pageB.request.get('http://localhost:4100/v1/cycles');
    expect(beforeApproval.status()).toBe(403);
    const stateResponse = await page.request.get('http://localhost:4100/v1/key-lifecycle');
    expect(stateResponse.ok()).toBe(true);
    const state = await stateResponse.json() as { data: { devices: Array<{ deviceId: string; wrappingKeyFingerprint: string }> } };
    const target = state.data.devices.find((device) => device.deviceId === bindingB.deviceId)!;
    const confirmation = target.wrappingKeyFingerprint.replace(/^sha256:/u, '').slice(-8).toUpperCase();
    await page.reload();
    await unlockBrowser(page, browserALabel);
    const approval = page.locator('section.surface-card').filter({ has: page.getByRole('heading', { name: 'Aprobar otro dispositivo', exact: true }) });
    const targetCard = approval.locator('div.rounded-xl.border.p-4').filter({ hasText: browserBLabel });
    await targetCard.getByRole('button', { name: 'Verificar huella', exact: true }).click();
    await page.locator(`#approve-${bindingB.deviceId}`).fill(confirmation);
    const approved = page.waitForResponse((response) => response.url().endsWith('/v1/key-lifecycle/grants') && response.request().method() === 'POST');
    await targetCard.getByRole('button', { name: 'Aprobar y sellar', exact: true }).click();
    expect((await approved).ok()).toBe(true);
    await pageB.reload();
    await expectRecognizedBrowserReady(pageB);
    await expect(pageB.getByText('Este navegador espera autorización de custodia', { exact: true })).toHaveCount(0);
    expect((await browserBinding(pageB)).hasActiveGrant).toBe(true);
    await pageB.goto('http://localhost:3300/es/app/settings');
    await unlockBrowser(pageB, browserBLabel);
    await expect(pageB.getByTestId('device-sessions-panel')).toBeVisible();

    // Close precisely B's HTTP session from A, without retiring its wrapping grant.
    const panelA = page.getByTestId('device-sessions-panel');
    await panelA.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await expect(panelA.locator(`article[data-session-id="${bindingA.sessionId}"]`).getByText(browserALabel, { exact: true })).toBeVisible();
    await expect(panelA.locator(`article[data-session-id="${bindingB.sessionId}"]`).getByText(browserBLabel, { exact: true })).toBeVisible();
    const closedOne = page.waitForResponse((response) => response.url().endsWith(`/v1/auth/sessions/${bindingB.sessionId}`) && response.request().method() === 'DELETE');
    await panelA.locator(`article[data-session-id="${bindingB.sessionId}"]`).getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar cierre', exact: true }).click();
    expect((await closedOne).ok()).toBe(true);
    expect((await pageB.request.get('http://localhost:4100/v1/session')).status()).toBe(401);
    await launch(pageB, 'B-first-reentry-after-close-one');
    await expectRecognizedBrowserReady(pageB);
    const reboundB = await browserBinding(pageB);
    expect(reboundB.deviceId).toBe(bindingB.deviceId);
    expect(reboundB.signingFingerprint).toBe(bindingB.signingFingerprint);
    expect(reboundB.hasActiveGrant).toBe(true);
    await panelA.getByRole('button', { name: 'Actualizar', exact: true }).click();
    const closedOthers = page.waitForResponse((response) => response.url().endsWith('/v1/auth/sessions/revoke-others') && response.request().method() === 'POST');
    await panelA.getByRole('button', { name: 'Cerrar las demás sesiones', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar cierre', exact: true }).click();
    expect((await closedOthers).ok()).toBe(true);
    expect((await pageB.request.get('http://localhost:4100/v1/session')).status()).toBe(401);
    await launch(pageB, 'B-second-reentry-after-close-others');
    await expectRecognizedBrowserReady(pageB);
    const resumedAfterOthers = await browserBinding(pageB);
    expect(resumedAfterOthers.deviceId).toBe(bindingB.deviceId);
    expect(resumedAfterOthers.signingFingerprint).toBe(bindingB.signingFingerprint);
    expect(resumedAfterOthers.hasActiveGrant).toBe(true);

    // Revoke only B's custody grant: A, same identity, remains authorized/unlocked.
    const grants = page.locator('section.surface-card').filter({ has: page.getByRole('heading', { name: 'Concesiones y revocación', exact: true }) });
    const grantCard = grants.locator('div.rounded-xl.border.p-4').filter({ hasText: browserBLabel });
    await grantCard.getByRole('button', { name: 'Revocar', exact: true }).click();
    await grantCard.locator('input').fill(confirmation);
    await grantCard.locator('select').selectOption('DEVICE_RETIRED');
    const revoked = page.waitForResponse((response) => response.url().endsWith('/v1/key-lifecycle/grants/revoke') && response.request().method() === 'POST');
    await grantCard.getByRole('button', { name: 'Confirmar revocación', exact: true }).click();
    expect((await revoked).ok()).toBe(true);
    expect((await pageB.request.get('http://localhost:4100/v1/session')).status()).toBe(401);
    expect(await signerMetadata(pageB)).toEqual([{ deviceId: bindingB.deviceId, fingerprint: bindingB.signingFingerprint, extractable: false }]);
    expect((await browserBinding(page)).hasActiveGrant).toBe(true);
    await expect(page.getByText('Desbloqueada en memoria', { exact: true })).toBeVisible();
    const reread = page.waitForResponse((response) => response.url().endsWith('/v1/cycles') && response.request().method() === 'GET' && response.ok());
    await page.goto('http://localhost:3300/es/app/workflow');
    const persisted = await reread;
    expect(Boolean(persisted.request().headers()['x-device-proof'])).toBe(true);
    const periods = await persisted.json() as { data: { items: Array<{ name: string; status: string }> } };
    expect(periods.data.items.find((period) => period.name === name)?.status).toBe('draft');
  } catch (error) {
    publicDiagnostics.get(pageB)?.push({ kind: 'failure', pagePath: new URL(pageB.url()).pathname });
    await test.info().attach('public-http-diagnostics-browser-b', { body: JSON.stringify(publicDiagnostics.get(pageB) ?? []), contentType: 'application/json' });
    throw error;
  } finally { await contextB.close(); }
});

test('central explicit operational roles project and revocation invalidates the old session', async ({ page }) => {
  const subject = await church.createUser(['NOMINATIONS_COMMISSION_MEMBER', 'NOMINATIONS_BALLOT_CUSTODIAN']);
  await login(page, subject);
  const session = await launch(page, 'role-projection-initial');
  expect(session.permissions).toContain('proposal.submit');
  expect(session.permissions).toContain('ballot.submit');
  expect(session.permissions).toContain('tally.custody');
  expect(session.permissions).not.toContain('cycle.manage');
  // Central HTTP assignment, not a manual local Nombramientos role binding.
  const updated = await page.request.patch(`${gateway}/users/${subject.id}`, {
    headers: { authorization: `Bearer ${church.users.admin.token}`, origin: 'http://localhost:3000' },
    data: {
      assignedRoles: ['NOMINATIONS_COMMISSION_MEMBER'],
      expectedRoles: ['NOMINATIONS_COMMISSION_MEMBER', 'NOMINATIONS_BALLOT_CUSTODIAN'],
    },
  });
  expect(updated.ok()).toBe(true);
  const stale = await page.request.get('http://localhost:4100/v1/session');
  expect(stale.status()).toBe(401);
});
