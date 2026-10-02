import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

type ApiRequest = { method: string; path: string };
type PublicTraffic = { requests: ApiRequest[]; anonymousGuard: boolean };

// Routing is installed before navigation so a regression cannot reach the API.
// The only API responses this suite permits are synthetic anonymous 401s.
const test = base.extend<{ publicTraffic: PublicTraffic }>({
  publicTraffic: [async ({ context, page }, use) => {
    const traffic: PublicTraffic = { requests: [], anonymousGuard: false };
    const consoleErrors: { text: string; url: string }[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await context.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, '');
      traffic.requests.push({ method: request.method(), path });
      const anonymousRead = traffic.anonymousGuard && request.method() === 'GET' && ['/me', '/dashboard'].includes(path);
      await route.fulfill({
        status: anonymousRead ? 401 : 403,
        contentType: 'application/problem+json',
        headers: {
          'access-control-allow-origin': request.headers().origin ?? new URL(page.url()).origin,
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify({ code: anonymousRead ? 'UNAUTHORIZED' : 'QA_API_BLOCKED', detail: 'Isolated public landing browser test.' }),
      });
    });

    await use(traffic);

    if (traffic.anonymousGuard) {
      // Dashboard already reads its own data in parallel with the identity guard.
      // Both reads are mocked; no request reaches the gateway or database.
      expect(traffic.requests.filter(({ method, path }) => method !== 'GET' || !['/me', '/dashboard'].includes(path)), 'Unexpected API traffic in anonymous guard').toEqual([]);
    } else {
      expect(traffic.requests, 'Public navigation must not request authenticated API data').toEqual([]);
    }
    const unexpectedConsoleErrors = consoleErrors.filter(({ text, url }) => !(
      traffic.anonymousGuard && /\/api\/v1\/(me|dashboard)(\?|$)/.test(url) && /401/.test(text)
    ));
    expect(unexpectedConsoleErrors, 'Browser console errors').toEqual([]);
    expect(pageErrors, 'Uncaught browser errors').toEqual([]);
  }, { auto: true }],
});

const locales = [
  {
    code: 'es', name: 'Español', title: 'GestionChurch · Coordinación con propósito',
    hero: ['Más orden.', 'Más tiempo para la misión.'],
    lead: 'Conecta a tus departamentos, organiza el calendario y acompaña cada programa desde un solo lugar.',
    features: ['Un calendario compartido', 'Un espacio para cada ministerio', 'Seguimiento que da claridad'],
    cta: 'Ingresar a mi iglesia', purpose: 'Organizar también es cuidar.', credit: 'Desarrollado por',
    verse: '“Pero hágase todo decentemente y con orden.” · 1 Corintios 14:40',
  },
  {
    code: 'en', name: 'English', title: 'GestionChurch · Purposeful coordination',
    hero: ['Better organization.', 'More time for the mission.'],
    lead: 'Connect your departments, organize the calendar, and support every program in one place.',
    features: ['A shared calendar', 'A space for every ministry', 'Progress tracking that brings clarity'],
    cta: 'Sign in to my church', purpose: 'Organization is also a form of care.', credit: 'Developed by',
    verse: '“But everything should be done in a fitting and orderly way.” · 1 Corinthians 14:40',
  },
  {
    code: 'fr', name: 'Français', title: 'GestionChurch · Coordination porteuse de sens',
    hero: ['Plus d’organisation.', 'Plus de temps pour la mission.'],
    lead: 'Reliez vos départements, organisez le calendrier et accompagnez chaque programme au même endroit.',
    features: ['Un calendrier partagé', 'Un espace pour chaque ministère', 'Un suivi qui apporte de la clarté'],
    cta: 'Me connecter à mon église', purpose: 'Organiser, c’est aussi prendre soin.', credit: 'Développé par',
    verse: '« Mais que tout se fasse avec bienséance et avec ordre. » · 1 Corinthiens 14:40',
  },
] as const;

async function openLanding(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#landing-title')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-locale', 'es');
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function assertPublicLinks(page: Page) {
  await expect(page.locator('a[href="/login"]')).toHaveCount(3);
  await expect(page.locator('a[href="#funcionalidades"]')).toHaveCount(2);
  const credit = page.getByRole('link', { name: /^Idara Global Technologies/ });
  await expect(credit).toHaveAttribute('href', 'https://idaraglobaltechnologies.com/');
  await expect(credit).toHaveAttribute('target', '_blank');
  await expect(credit).toHaveAttribute('rel', /\bnoopener\b/);
  await expect(credit).toHaveAttribute('rel', /\bnoreferrer\b/);
  const allowed = new Set(['/', '/login', '#funcionalidades', '#main-content', 'https://idaraglobaltechnologies.com/']);
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs.filter((href) => !allowed.has(href ?? '')), 'Landing navigation destinations').toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = [...document.querySelectorAll<HTMLElement>('#main-content h1, #main-content h2, #main-content h3, #main-content p, #main-content blockquote, #main-content a, header fieldset, footer')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ text: element.innerText.slice(0, 80), left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }))
      .filter((element) => element.left < -1 || element.right > width + 1);
    return { width, body: document.body.scrollWidth, document: document.documentElement.scrollWidth, clipped };
  });
  expect(layout.body, 'Body horizontal overflow').toBeLessThanOrEqual(layout.width + 1);
  expect(layout.document, 'Document horizontal overflow').toBeLessThanOrEqual(layout.width + 1);
  expect(layout.clipped, 'Landing content outside the viewport').toEqual([]);
}

async function assertAxe(page: Page, testInfo: TestInfo, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  await testInfo.attach(`axe-${label}`, { body: Buffer.from(JSON.stringify(result.violations, null, 2)), contentType: 'application/json' });
  expect(result.violations, `Accessibility violations (${label})`).toEqual([]);
}

async function attachPublicScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; });
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function assertBlankLogin(page: Page) {
  await expect(page).toHaveURL(/\/login$/);
  for (const name of ['gc-tenant-code', 'gc-user-id', 'gc-access-key']) {
    await expect(page.locator(`input[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('input[name="gc-access-key"]')).toHaveAttribute('type', 'password');
}

async function tabTo(page: Page, target: Locator) {
  for (let press = 0; press < 12; press += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(target).toBeFocused();
}

test('the homepage remains public, readable and free of API calls', async ({ page }, testInfo) => {
  await openLanding(page);
  await expect(page).toHaveTitle(locales[0].title);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.locator('footer')).toContainText('Desarrollado por Idara Global Technologies');
  await expect(page.locator('blockquote')).toHaveText(locales[0].verse);
  await expect(page.locator('.app-shell, .sidebar, .bottom-nav')).toHaveCount(0);
  await assertPublicLinks(page);
  await assertNoHorizontalOverflow(page);
  const width = page.viewportSize()?.width;
  if (width === 1440 || width === 390) {
    const name = `landing-${width === 1440 ? 'desktop' : 'mobile'}-${width}.png`;
    await attachPublicScreenshot(page, testInfo, name);
  }
});

test('ES, EN and FR translate public copy, verse and credit while preserving destinations', async ({ page }, testInfo) => {
  await openLanding(page);
  for (const locale of locales) {
    await test.step(locale.code, async () => {
      const language = page.getByRole('button', { name: locale.name, exact: true });
      await language.click();
      await expect(language).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
      await expect(page).toHaveTitle(locale.title);
      for (const text of locale.hero) await expect(page.locator('#landing-title')).toContainText(text);
      await expect(page.getByText(locale.lead, { exact: true })).toBeVisible();
      for (const feature of locale.features) await expect(page.getByRole('heading', { name: feature, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: locale.purpose, exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: locale.cta, exact: true })).toHaveCount(2);
      await expect(page.locator('footer')).toContainText(locale.credit);
      await expect(page.locator('blockquote')).toHaveText(locale.verse);
      await assertPublicLinks(page);
      await assertNoHorizontalOverflow(page);
      await assertAxe(page, testInfo, locale.code);
      if (page.viewportSize()?.width === 1440 && locale.code !== 'es') {
        await attachPublicScreenshot(page, testInfo, `landing-desktop-1440-${locale.code}.png`);
      }
    });
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#landing-title')).toContainText(locales[2].hero[0]);
});

test('all sign-in calls to action open an empty login without authenticating', async ({ page }) => {
  for (const index of [0, 1, 2]) {
    await openLanding(page);
    await page.locator('a[href="/login"]').nth(index).click();
    await assertBlankLogin(page);
  }
});

test('anonymous dashboard access still requires authentication', async ({ page, publicTraffic }) => {
  publicTraffic.anonymousGuard = true;
  await page.goto('/dashboard');
  await assertBlankLogin(page);
  expect(publicTraffic.requests.filter(({ method, path }) => method === 'GET' && path === '/me').length, 'Identity guard must check /me').toBeGreaterThan(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('keyboard users can skip to content, change language and close accessibility preferences', async ({ page }) => {
  await openLanding(page);
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Saltar al contenido principal', exact: true });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page).toHaveURL(/\/#main-content$/);

  await page.reload();
  // The server-rendered buttons are visible before the experience handlers hydrate.
  await expect(page.locator('html')).toHaveAttribute('data-locale', 'es');
  await tabTo(page, page.getByRole('button', { name: 'English', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#landing-title')).toContainText(locales[1].hero[0]);
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeFocused();
  await page.keyboard.press('Alt+Shift+A');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement)), 'Modal keyboard focus stays inside preferences').toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeFocused();
});

test('local accessibility preferences work and survive reload on the public homepage', async ({ page }, testInfo) => {
  await openLanding(page);
  const lead = page.locator('#landing-title + p');
  const normalSize = await lead.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const trigger = page.getByRole('button', { name: 'Abrir accesibilidad e idiomas', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Preferencias de experiencia', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Grande', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'large');
  const largeSize = await lead.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await dialog.getByRole('button', { name: 'Muy grande', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'xlarge');
  const xlargeSize = await lead.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await testInfo.attach('lead-font-scales', { body: Buffer.from(JSON.stringify({ normalSize, largeSize, xlargeSize })), contentType: 'application/json' });
  expect(largeSize, 'Large text must increase the lead size').toBeGreaterThan(normalSize);
  expect(xlargeSize, 'Extra large text must increase the lead size again').toBeGreaterThan(largeSize);
  for (const name of ['Alto contraste', 'Fuente legible', 'Espaciado cómodo', 'Reducir movimiento']) {
    const control = dialog.getByRole('switch', { name: new RegExp(`^${name}`) });
    await control.click();
    await expect(control).toHaveAttribute('aria-checked', 'true');
  }
  await expect(dialog.getByRole('button', { name: 'Muy grande', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.reload();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-contrast', 'high');
  await expect(html).toHaveAttribute('data-font-scale', 'xlarge');
  await expect(html).toHaveAttribute('data-readable-font', 'true');
  await expect(html).toHaveAttribute('data-comfortable-spacing', 'true');
  await expect(html).toHaveAttribute('data-reduce-motion', 'true');
  const readingStyle = await page.locator('#main-content p').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { font: style.fontFamily, size: Number.parseFloat(style.fontSize), lineHeight: Number.parseFloat(style.lineHeight), spacing: Number.parseFloat(style.letterSpacing) };
  });
  expect(readingStyle.font).toContain('Verdana');
  expect(readingStyle.size).toBeGreaterThanOrEqual(17);
  expect(readingStyle.lineHeight / readingStyle.size).toBeGreaterThanOrEqual(1.74);
  expect(readingStyle.spacing).toBeGreaterThan(0);
  const verseSize = await page.locator('blockquote').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(verseSize, 'Extra large text must also enlarge the verse').toBeGreaterThanOrEqual(24);
  const transitionDuration = await page.locator('#main-content a[href="/login"]').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(transitionDuration).toBeLessThanOrEqual(0.001);
  await assertNoHorizontalOverflow(page);
  await assertAxe(page, testInfo, 'high-contrast-readable-large-spaced');
  if (page.viewportSize()?.width === 320) {
    await page.getByRole('button', { name: 'Français', exact: true }).click();
    await expect(html).toHaveAttribute('lang', 'fr');
    await expect(page.locator('#landing-title')).toContainText(locales[2].hero[0]);
    const coordinationLines = await page.getByRole('heading', { name: 'Coordonnez', exact: true }).evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    });
    expect(coordinationLines, 'The French step title must fit on one line at 320px with extra large text').toBe(1);
    await assertNoHorizontalOverflow(page);
    await assertAxe(page, testInfo, 'fr-320-high-contrast-readable-large-spaced');
    await attachPublicScreenshot(page, testInfo, 'landing-mobile-320-fr-accessibility-xlarge.png');
  }
});

test('system reduced motion and forced colors keep public content and controls usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await openLanding(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  await expect(page.locator('#landing-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeVisible();
  await expect(page.locator('#main-content a[href="/login"]').first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
});
