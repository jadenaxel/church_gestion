import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

async function login(page: import('@playwright/test').Page, email = 'admin@central.local', password = 'GestionChurch!2026') {
  await page.goto('/login');
  await page.getByLabel('Iglesia o código').click();
  await page.getByLabel('Iglesia o código').fill('central');
  await page.getByLabel('Usuario').click();
  await page.getByLabel('Usuario').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).click();
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: /Ingresar/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
}

test('las preferencias de idioma y accesibilidad se sincronizan con el perfil autenticado', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'La persistencia de perfil compartido se valida una sola vez para evitar escrituras concurrentes del mismo usuario.');
  await login(page, 'anciano@central.local', 'Actividad!2026');
  await page.getByRole('button', { name: 'Abrir accesibilidad e idiomas' }).click();
  await page.locator('#experience-panel').getByRole('radio', { name: /English/ }).click();
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch('http://localhost:4000/api/v1/notifications/preferences', { credentials: 'include' });
    const preferences = await response.json() as { uiLocale?: string };
    return preferences.uiLocale;
  })).toBe('en');
  await page.evaluate(() => localStorage.removeItem('gestionchurch:experience'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Control center' })).toBeVisible();
  await page.getByRole('button', { name: 'Open accessibility and languages' }).click();
  await page.locator('#experience-panel').getByRole('radio', { name: /Español/ }).click();
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch('http://localhost:4000/api/v1/notifications/preferences', { credentials: 'include' });
    const preferences = await response.json() as { uiLocale?: string };
    return preferences.uiLocale;
  })).toBe('es');
});

test('idiomas y accesibilidad se aplican y persisten en toda la experiencia', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Abrir accesibilidad e idiomas' }).click();
  const panel = page.locator('#experience-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('radio', { name: /English/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(panel.getByRole('heading', { name: 'Experience preferences' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to your church' })).toBeVisible();
  await panel.getByRole('radio', { name: /Français/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { name: 'Connectez-vous à votre église' })).toBeVisible();
  await panel.getByRole('switch', { name: /Contraste élevé/ }).click();
  await panel.getByRole('button', { name: 'Très grand' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'xlarge');
  await panel.getByRole('button', { name: 'Fermer l’accessibilité' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.getByRole('heading', { name: 'Connectez-vous à votre église' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
});

test('ministerios personales opera estrategia y seguimiento de punta a punta', async ({ page }, testInfo) => {
	const activate = async (button: import('@playwright/test').Locator) => {
		if (testInfo.project.name === 'mobile-360') {
			await button.scrollIntoViewIfNeeded();
			const box = await button.boundingBox();
			expect(box).not.toBeNull();
			await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
			return;
		}
		await button.click();
	};
  await login(page);
  if (testInfo.project.name.startsWith('mobile')) await page.goto('/personal-ministries');
  else await page.getByRole('link', { name: 'Ministerios Personales', exact: true }).click();
  await expect(page).toHaveURL(/\/personal-ministries$/);
  await expect(page.getByRole('heading', { name: 'Ministerios Personales' })).toBeVisible();
  await expect(page.getByText('Del plan a cada persona,')).toBeVisible();
  await expect(page.getByRole('button', { name: /Iniciativas activas/ })).toBeVisible();

  const stamp = Date.now();
  await page.getByRole('button', { name: 'Nueva iniciativa' }).first().click();
  const initiativeDialog = page.getByRole('dialog', { name: 'Formulario de Ministerios Personales' });
  await initiativeDialog.getByLabel('Nombre de la iniciativa').fill(`Iniciativa navegador ${stamp}`);
  await initiativeDialog.getByLabel('Descripción').fill('Validación integral del flujo ministerial.');
  await initiativeDialog.getByLabel('Inicio').fill('2028-03-01');
  await initiativeDialog.getByLabel('Final').fill('2028-03-31');
  await initiativeDialog.getByLabel('Presupuesto aprobado').fill('25000');
  await activate(initiativeDialog.getByRole('button', { name: 'Guardar y enlazar' }));
  await expect(page.getByText('Iniciativa creada, calendarizada y asignada.')).toBeVisible();
  await expect(page.getByText(`Iniciativa navegador ${stamp}`).first()).toBeVisible();

  await activate(page.getByRole('tab', { name: 'Presupuesto' }));
  await expect(page.getByRole('heading', { name: 'Presupuesto por actividad' })).toBeVisible();
  await activate(page.getByRole('button', { name: new RegExp(`Iniciativa navegador ${stamp}`) }));
  await activate(page.getByRole('button', { name: 'Nueva partida' }));
  const budgetDialog = page.getByRole('dialog', { name: 'Formulario de Ministerios Personales' });
  await budgetDialog.getByLabel('Tipo de movimiento').selectOption('EXPENSE');
  await budgetDialog.getByLabel('Estado').selectOption('PAID');
  await budgetDialog.getByLabel('Categoría').fill('Materiales');
  await budgetDialog.getByLabel('Monto').fill('2500');
  await budgetDialog.getByLabel('Fecha').fill('2028-03-02');
  await budgetDialog.getByLabel('Descripción').fill(`Literatura navegador ${stamp}`);
  await activate(budgetDialog.getByRole('button', { name: 'Guardar y enlazar' }));
  await expect(page.getByText('Partida presupuestaria registrada.')).toBeVisible();
  await expect(page.getByText(`Literatura navegador ${stamp}`)).toBeVisible();

  await activate(page.getByRole('tab', { name: 'Interesados y estudios' }));
  await activate(page.getByRole('button', { name: 'Nuevo interesado' }));
  const contactDialog = page.getByRole('dialog', { name: 'Formulario de Ministerios Personales' });
  await contactDialog.getByLabel('Nombre completo').fill(`Persona acompañada ${stamp}`);
  await contactDialog.getByLabel('Fuente').fill('Visita misionera');
  await contactDialog.getByLabel('Responsable').selectOption({ index: 1 });
  await contactDialog.getByText('La persona autorizó el registro de sus datos de contacto.').click();
  await activate(contactDialog.getByRole('button', { name: 'Guardar y enlazar' }));
  await expect(page.getByText(`Persona acompañada ${stamp}`)).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
});

test('Ministerio de la Mujer ofrece planificación, roster e inclusión responsive', async ({ page }) => {
  await login(page);
  const departments = await page.request.get('http://localhost:4000/api/v1/departments');
  expect(departments.ok()).toBeTruthy();
  const body = await departments.json() as { items: Array<{ name: string }> };
  if (!body.items.some((item) => item.name === 'Ministerio de la Mujer')) {
    const created = await page.request.post('http://localhost:4000/api/v1/departments', {
      data: {
        name: 'Ministerio de la Mujer',
        description: 'Cuidado, crecimiento espiritual, misión y acompañamiento integral de todas las mujeres.',
        color: '#8B5CF6'
      }
    });
    expect(created.ok()).toBeTruthy();
  }

  await page.goto('/womens-ministry');
  await expect(page.getByRole('heading', { name: 'Ministerio de la Mujer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cada mujer vista, incluida y acompañada.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Secciones del Ministerio de la Mujer' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Roster activo/ })).toBeVisible();

  const stamp = Date.now();
  await page.getByRole('button', { name: 'Roster de mujeres' }).click();
  await page.getByRole('button', { name: 'Agregar mujer' }).click();
  const rosterForm = page.locator('.wm-modal').filter({ has: page.getByRole('heading', { name: 'Agregar mujer' }) });
  await rosterForm.getByLabel('Nombre completo').fill(`Mujer navegador ${stamp}`);
  await rosterForm.getByLabel('Correo').fill(`mujer.navegador.${stamp}@example.local`);
  await rosterForm.getByLabel('WhatsApp / teléfono').fill('+18095550999');
  const today = new Date();
  const birthdayMonth = String(today.getMonth() + 1).padStart(2, '0');
  const birthdayDay = String(today.getDate()).padStart(2, '0');
  await rosterForm.getByLabel('Fecha de nacimiento').fill(`1989-${birthdayMonth}-${birthdayDay}`);
  await rosterForm.getByLabel('Intereses').fill('Oración, salud, mentoría');
  await rosterForm.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByText('Perfil agregado al roster ministerial.')).toBeVisible();
  await expect(page.getByText(`Mujer navegador ${stamp}`)).toBeVisible();
  await page.getByLabel('Filtrar por edad').selectOption('26_39');
  await expect(page.getByText(`Mujer navegador ${stamp}`)).toBeVisible();

  await page.getByRole('button', { name: 'Centro de control' }).click();
  await expect(page.getByRole('heading', { name: 'Cumpleaños de los próximos 30 días' })).toBeVisible();
  const birthdayCard = page.locator('.wm-birthday-center button').filter({ hasText: `Mujer navegador ${stamp}` });
  await expect(birthdayCard).toBeVisible();
  await expect(birthdayCard.getByText('Cumpleaños de hoy')).toBeVisible();
  await expect(page.getByText('Cumpleaños próximos', { exact: true })).toBeVisible();
  for (const scale of ['large', 'xlarge']) {
    await page.evaluate((value) => { document.documentElement.dataset.fontScale = value; }, scale);
    const layout = await birthdayCard.evaluate((card) => {
      const blocks = [card.querySelector('time'), card.querySelector(':scope > span'), card.querySelector(':scope > svg')]
        .filter((item): item is Element => Boolean(item))
        .map((item) => item.getBoundingClientRect());
      const copyRows = [...card.querySelectorAll(':scope > span > *')].map((item) => item.getBoundingClientRect());
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        blockOverlap: blocks.some((block, index) => blocks.slice(index + 1).some((other) => overlaps(block, other))),
        rowOverlap: copyRows.some((row, index) => copyRows.slice(index + 1).some((other) => overlaps(row, other))),
        contained: blocks.every((block) => block.left >= card.getBoundingClientRect().left && block.right <= card.getBoundingClientRect().right)
      };
    });
    expect(layout, `Tarjeta de cumpleaños sin superposición con texto ${scale}`).toEqual({ blockOverlap: false, rowOverlap: false, contained: true });
  }
  await page.evaluate(() => { document.documentElement.dataset.fontScale = 'normal'; });

  await page.getByRole('button', { name: 'Retiro espiritual' }).click();
  await page.getByRole('button', { name: 'Nuevo retiro' }).click();
  const retreatForm = page.locator('.wm-modal').filter({ has: page.getByRole('heading', { name: 'Crear retiro espiritual' }) });
  await retreatForm.getByLabel('Nombre').fill(`Retiro navegador ${stamp}`);
  await retreatForm.getByLabel('Año').fill('2030');
  await retreatForm.getByLabel('Resort').fill('Resort Esperanza');
  await retreatForm.getByLabel('Inicio').fill('2030-07-12');
  await retreatForm.getByLabel('Final').fill('2030-07-14');
  await retreatForm.getByLabel('Capacidad').fill('65');
  await retreatForm.getByLabel('Costo por persona').fill('9000');
  await retreatForm.getByLabel('Presupuesto total').fill('585000');
  await retreatForm.getByRole('button', { name: 'Crear retiro' }).click();
  await expect(page.getByText('Retiro anual creado y listo para gestionar inscripciones.')).toBeVisible();
  await expect(page.getByText(`Retiro navegador ${stamp}`).first()).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('recorrido principal accesible y responsive', async ({ page }) => {
  await login(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible();
  await expect(page.getByLabel('Buscar en el calendario')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('la tipografía secundaria conserva un mínimo legible en GestionChurch y Nombramientos', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'La escala tipográfica global se valida una sola vez en escritorio.');
  await login(page);

  const unreadableLeafText = async (minimumPx: number) => page.evaluate((minimum) => {
    const visible = (element: Element) => {
      const style = window.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && bounds.width > 0
        && bounds.height > 0;
    };
    return [...document.querySelectorAll('body *')]
      .filter((element) => visible(element)
        && element.children.length === 0
        && Boolean(element.textContent?.trim())
        && !element.closest('[aria-hidden="true"], svg, script, style, .sr-only'))
      .map((element) => ({
        text: element.textContent?.trim().slice(0, 80),
        size: Number.parseFloat(window.getComputedStyle(element).fontSize),
      }))
      .filter(({ size }) => Number.isFinite(size) && size < minimum);
  }, minimumPx);

  for (const route of ['/dashboard', '/calendar', '/reviews', '/reports', '/elders', '/womens-ministry', '/documents', '/settings/channels']) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    expect(await unreadableLeafText(11), `Texto menor de 11px en ${route}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `Desborde horizontal en ${route}`).toBeLessThanOrEqual(1);
  }

  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Nombramientos' }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:3300\/es\/app\//, { timeout: 30_000 });
  expect(await unreadableLeafText(12), 'Texto menor de 12px en Nombramientos').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'Desborde horizontal en Nombramientos').toBeLessThanOrEqual(1);
});

test('solo administración configura y prueba correo y WhatsApp desde un centro responsive', async ({ page }) => {
  await login(page);
  await page.goto('/settings/channels');
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Correo electrónico' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'WhatsApp' })).toBeVisible();
  await expect(page.getByLabel('Servidor SMTP')).toHaveValue('127.0.0.1');
  await expect(page.getByLabel('Phone Number ID')).toBeVisible();
  await expect(page.getByText('Solo admins')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validar conexión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validar con Meta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar WhatsApp real' })).toBeDisabled();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
});

test('la auditoría inmutable permite investigar, filtrar y exportar sin exponerla a otros roles', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'La consola administrativa completa se valida una vez en escritorio.');
  await login(page);
  await page.getByRole('link', { name: 'Auditoría' }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByRole('heading', { name: 'Auditoría', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Centro de auditoría' })).toBeVisible();
  await expect(page.getByLabel('Buscar en auditoría')).toBeVisible();
  await expect(page.locator('.audit-table tbody > tr').first()).toBeVisible();
  await page.locator('.audit-table tbody > tr').first().click();
  await expect(page.getByText('Contexto seguro')).toBeVisible();
  const auditResponse = await page.request.get('http://localhost:4000/api/v1/audit/events?page=1&pageSize=10');
  expect(auditResponse.status()).toBe(200);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
});

test('administración global abre los canales del tenant seleccionado', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'El acceso global se valida una vez en escritorio.');
  await page.goto('/global/login');
  await page.getByLabel('Usuario').click();
  await page.getByLabel('Usuario').fill('global@gestionchurch.local');
  await page.getByLabel('Contraseña').click();
  await page.getByLabel('Contraseña').fill('GestionChurch!2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Iglesias y tenants' })).toBeVisible();
  const central = page.locator('.tenant-card').filter({ hasText: 'Iglesia Adventista Central' });
  await central.getByRole('link', { name: 'Canales' }).click();
  await expect(page.getByRole('heading', { name: /Canales de Iglesia Adventista Central/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Correo electrónico' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a tenants' }).click();
  await expect(page.getByRole('heading', { name: 'Iglesias y tenants' })).toBeVisible();
  await page.getByRole('link', { name: 'Auditoría' }).click();
  await expect(page.getByRole('heading', { name: 'Auditoría de la plataforma' })).toBeVisible();
  await page.getByLabel('Ámbito').selectOption({ label: 'Iglesia Adventista Central' });
  await expect(page.locator('.audit-table tbody > tr').first()).toBeVisible();
});

test('Nombramientos abre por SSO, conserva el tenant y permite navegar el módulo', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-390', 'La integración móvil se valida una vez con una identidad federada independiente.');
  const browserErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  const mobile = testInfo.project.name.startsWith('mobile');
  await login(page, mobile ? 'secretaria@central.local' : 'admin@central.local', mobile ? 'Revision!2026' : 'GestionChurch!2026');
  if (mobile) {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  }
  await page.getByRole('link', { name: 'Nombramientos' }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:3300\/es\/app\//, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);
  await expect(mobile
    ? page.locator('.topbar').getByText('Nombramientos', { exact: true })
    : page.locator('.brand-lockup:visible').getByText('Nombramientos', { exact: true })).toBeVisible();
  await expect(page.locator('body')).toContainText('Iglesia Adventista Central');

  const sessionResult = await page.evaluate(async () => {
    const response = await fetch('http://localhost:4100/v1/session', { credentials: 'include' });
    return { status: response.status, envelope: await response.json() };
  }) as {
    status: number;
    envelope: { data: { tenant: { name: string }; security: { authMethod: string }; permissions: string[] } };
  };
  expect(sessionResult.status).toBe(200);
  const sessionEnvelope = sessionResult.envelope;
  expect(sessionEnvelope.data.tenant.name).toBe('Iglesia Adventista Central');
  expect(sessionEnvelope.data.security.authMethod).toBe('federated');
  expect(sessionEnvelope.data.permissions.length).toBeGreaterThan(0);

  await page.goto('http://localhost:3300/es/app/catalog');
  await expect(page).toHaveURL('http://localhost:3300/es/app/catalog');
  await expect(page.getByRole('heading', { name: 'Departamentos, cargos y configuración' })).toBeVisible();

  if (!mobile) {
    const accessStatuses = await page.evaluate(async () => Object.fromEntries(await Promise.all([
      'roles', 'permissions', 'bindings',
    ].map(async (resource) => {
      const response = await fetch(`http://localhost:4100/v1/access/${resource}`, { credentials: 'include' });
      return [resource, response.status];
    }))));
    expect(accessStatuses).toEqual({ roles: 200, permissions: 200, bindings: 200 });
    await page.goto('http://localhost:3300/es/app/access');
    await expect(page).toHaveURL('http://localhost:3300/es/app/access');
    await expect(page.getByRole('heading', { name: 'Roles, permisos y asignaciones' })).toBeVisible();
    await expect(page.getByText('Administración centralizada', { exact: true })).toBeVisible();
    await expect(page.getByText('Roles disponibles', { exact: true })).toBeVisible();
    await expect(page.getByText('Esta consola exige una sesión MFA', { exact: false })).toHaveCount(0);
    await expect(page.getByText('No se pudo cargar el control de acceso', { exact: false })).toHaveCount(0);
  }

  await page.goto('http://localhost:3300/es/app/settings');
  await expect(page.getByRole('heading', { name: 'Seguridad y preferencias' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ciclo de vida de la clave de la iglesia' })).toBeVisible();
  await expect(page.getByTestId('key-lifecycle-view').getByText('Contexto protegido', { exact: true })).toBeVisible();
  await expect(page.getByText('MFA reciente obligatorio', { exact: true })).toHaveCount(0);
  if (mobile) {
    await expect(page.getByRole('heading', { name: 'Este navegador' })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: 'Inicialización sin custodia del servidor' })).toBeVisible();
  }
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);
  const returnButton = page.getByRole('link', { name: 'Volver a GestionChurch' });
  await expect(returnButton).toBeVisible();
  await returnButton.click();
  await expect(page).toHaveURL('http://localhost:3000/dashboard');
  await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
  expect(browserErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test('Nombramientos inicia un período con el asistente guiado sin exigir registrar el equipo', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'El inicio administrativo se valida una sola vez y sin persistir un ciclo de prueba.');
  await login(page);
  await page.getByRole('link', { name: 'Nombramientos' }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:3300\/es\/app\//, { timeout: 30_000 });
  await expect(page.getByText('Un administrador debe completar el alta inicial desde Configuración.')).toHaveCount(0);
  const globalStart = page.locator('.topbar').getByRole('link', { name: 'Iniciar proceso' });
  await expect(globalStart).toBeVisible();
  await globalStart.click();
  await expect(page).toHaveURL('http://localhost:3300/es/app/workflow');

  await expect(page.getByRole('heading', { name: 'Inicia un proceso de nombramientos en minutos' })).toBeVisible();
  await expect(page.getByText('registrar este equipo', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Este navegador' })).toHaveCount(0);

  let submittedCycle: Record<string, unknown> | undefined;
  await page.route('http://localhost:4100/v1/cycles', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    submittedCycle = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: '91ca5801-1d19-4c5e-b347-5fb45be2a888',
          name: submittedCycle.name,
          status: 'draft',
          locale: 'es',
          timezone: 'America/Santo_Domingo',
          jurisdiction: 'Iglesia local',
          termStart: submittedCycle.termStart,
          termEnd: submittedCycle.termEnd,
          normativeVersion: '2025.1.0',
          version: 1,
          clonedFromCycleId: null,
          createdAt: '2026-09-29T19:00:00.000Z',
          updatedAt: '2026-09-29T19:00:00.000Z',
          activatedAt: null,
          closedAt: null,
          archivedAt: null,
          readiness: { processes: 0, sessions: 0, committeeMembers: 0, electors: 0 },
        },
      }),
    });
  });

  await page.getByRole('button', { name: /Iniciar (?:nuevo período|proceso)/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Nuevo proceso de nombramientos' })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  await dialog.getByLabel('Nombre', { exact: true }).fill('Nombramientos 2027–2028');
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByRole('heading', { name: 'Confirma la base del proceso' })).toBeVisible();
  await expect(dialog.getByText('Todo permanece enlazado')).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByRole('heading', { name: 'Revisa e inicia' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Crear e iniciar proceso' }).click();

  await expect(page.getByText('El proceso de nombramientos fue iniciado correctamente.')).toBeVisible();
  expect(submittedCycle).toMatchObject({
    name: 'Nombramientos 2027–2028',
    locale: 'es',
    configuration: {
      initiationMode: 'guided_quick_start',
      rosterSource: 'tenant_directory',
    },
  });
});

test('Nombramientos renueva una sesión federada vencida y conserva la sección', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'La recuperación federada se valida una vez en escritorio.');
  await login(page);
  await page.getByRole('link', { name: 'Nombramientos' }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:3300\/es\/app\//, { timeout: 30_000 });
  await page.goto('http://localhost:3300/es/app/catalog');
  await expect(page.getByRole('heading', { name: 'Departamentos, cargos y configuración' })).toBeVisible();

  await page.context().clearCookies({ name: /^(nom_session|nom_csrf)$/u });
  const renewedLaunch = page.waitForResponse((response) =>
    response.url() === 'http://localhost:4000/api/v1/integrations/nominations/launch'
      && response.request().method() === 'POST',
  );
  await page.locator('a[href="/es/app/access"]').filter({ visible: true }).first().click();
  expect((await renewedLaunch).status()).toBe(201);

  await expect(page).toHaveURL('http://localhost:3300/es/app/access', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Roles, permisos y asignaciones' })).toBeVisible();
  await expect(page.getByText('No se pudo cargar el control de acceso', { exact: false })).toHaveCount(0);
  const accessStatuses = await page.evaluate(async () => Object.fromEntries(await Promise.all([
    'roles', 'permissions', 'bindings',
  ].map(async (resource) => {
    const response = await fetch(`http://localhost:4100/v1/access/${resource}`, { credentials: 'include' });
    return [resource, response.status];
  }))));
  expect(accessStatuses).toEqual({ roles: 200, permissions: 200, bindings: 200 });
});

test('Nombramientos conserva el idioma elegido durante el acceso SSO', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'La propagación de idioma se valida una vez en escritorio.');
  await page.route('**/api/v1/notifications/preferences', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uiLocale: 'fr' }) });
      return;
    }
    await route.continue();
  });
  await login(page);
  await page.getByRole('button', { name: 'Abrir accesibilidad e idiomas' }).click();
  await page.locator('#experience-panel').getByRole('radio', { name: /Français/ }).click();
  await page.locator('#experience-panel').getByRole('button', { name: 'Fermer l’accessibilité' }).click();
  const dashboardText = await page.locator('main').innerText();
  for (const untranslatedSystemText of [
    ' vencidas', ' decisiones', ' esta semana', 'salud operativa', 'Turno vigente / próximo',
    'enlace(s) departamental(es) activo(s)', 'cierre confirmado', 'ciclo aún abierto',
    'requieren cierre', 'esperando decisión', 'requieren coordinación', 'Prioridad operativa',
    'probabilidad operativa', '\nMuestra\n', '\nConfianza\n', ' activas', 'critical', 'pending'
  ]) expect(dashboardText).not.toContain(untranslatedSystemText);
  await page.getByRole('link', { name: 'Nominations' }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:3300\/fr\/app\//, { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('formulario de actividad permite alternativas y archivo', async ({ page }) => {
  await login(page);
  await page.goto('/activities/new');
  await expect(page.getByRole('heading', { name: 'Nueva actividad' })).toBeVisible();
  await page.getByLabel('Nombre de la actividad').fill('Actividad visual automatizada');
  await page.getByLabel('Descripción').fill('Prueba automatizada del formulario móvil y sus controles.');
  await page.getByLabel('Responsable').fill('Equipo de calidad');
  await page.getByLabel('Inicio').first().fill('2026-10-03T18:00');
  await page.getByLabel('Finalización').first().fill('2026-10-03T20:00');
  await expect(page.getByText('Conflicto que requiere resolución')).toBeVisible();
  await expect(page.getByText(/Primera solicitud · tiene preferencia/).first()).toBeVisible();
  await expect(page.getByText(/Fecha y horario en disputa/)).toBeVisible();
  await page.getByRole('button', { name: 'Agregar otra fecha' }).click();
  await expect(page.getByText('2. Alternativa 1')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'critical')).toEqual([]);
});

test('junta de revisión carga rutas y recursos sin errores', async ({ page }) => {
  await login(page);
  const browserErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('/reviews');
  await expect(page.getByRole('heading', { name: 'Junta de revisión' })).toBeVisible();
  await expect(page.getByText('No fue posible completar la acción')).toHaveCount(0);
  await expect(page.getByText('Sesiones de junta')).toBeVisible();
  await expect(page.getByLabel('Buscar sesiones de junta')).toBeVisible();
  await expect(page.getByLabel('Buscar en la junta de revisión')).toBeVisible();
  await page.getByRole('button', { name: 'Crear sesión', exact: true }).click();
  const sessionCreator = page.getByRole('dialog', { name: 'Crear sesión de junta' });
  await expect(sessionCreator).toBeVisible();
  await expect(sessionCreator.getByText('Seguimiento automático')).toBeVisible();
  await expect(sessionCreator.getByText('Participantes', { exact: true })).toBeVisible();
  await expect(sessionCreator.getByText('Casos para revisar')).toBeVisible();
  await expect(sessionCreator.getByRole('button', { name: 'Crear y enviar convocatoria' })).toBeVisible();
  await sessionCreator.getByRole('button', { name: 'Cerrar creador de sesión' }).click();
  const firstConflict = page.locator('.conflict-review-row').first();
  if (await firstConflict.count()) {
    await firstConflict.click();
    await expect(page.getByText('Fecha y horario exactos en disputa')).toBeVisible();
    await expect(page.getByText('Regla de preferencia activa')).toBeVisible();
    await expect(page.getByText(/1ª solicitud · Preferencia/).first()).toBeVisible();
    await expect(page.getByText(/2ª solicitud · En revisión/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alternativas de calendario' })).toBeVisible();
    const createAlternative = page.getByRole('button', { name: /Crear alternativa/ });
    await expect(createAlternative).toBeVisible();
    await createAlternative.click();
    await expect(page.getByRole('heading', { name: 'Nueva alternativa' })).toBeVisible();
    await expect(page.getByText('Horarios libres recomendados')).toBeVisible();
    const smartSlot = page.locator('.smart-slots button').first();
    await expect(smartSlot).toBeVisible();
    await smartSlot.click();
    await expect(page.getByLabel('Inicio')).not.toHaveValue('');
    await expect(page.getByLabel('Finalización')).not.toHaveValue('');
    await expect(page.getByRole('button', { name: 'Guardar alternativa' })).toBeEnabled();
  }

  const icon = await page.request.get('/icon.svg');
  const favicon = await page.request.get('/favicon.ico');
  expect(icon.status()).toBe(200);
  expect(favicon.status()).toBe(200);
  expect(browserErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test('cada invitado abre la junta desde su calendario y confirma asistencia', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'), 'El recorrido completo de invitación se valida una vez en escritorio.');
  await login(page);
  const apiUrl = 'http://localhost:4000/api/v1';
  const eligibleResponse = await page.request.get(`${apiUrl}/review-sessions/eligible-participants`);
  expect(eligibleResponse.status()).toBe(200);
  const eligible = await eligibleResponse.json() as { items: Array<{ id: string; email: string }> };
  const leader = eligible.items.find((item) => item.email === 'jovenes@central.local');
  expect(leader).toBeTruthy();
  const start = new Date(Date.now() + 48 * 60 * 60_000);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 90 * 60_000);
  const title = `Junta visual ${Date.now()}`;
  const createdResponse = await page.request.post(`${apiUrl}/review-sessions`, {
    data: {
      title,
      scheduledAt: start.toISOString(),
      endsAt: end.toISOString(),
      location: 'Sala de coordinación',
      agenda: 'Revisar actividades pendientes y confirmar responsables de seguimiento.',
      participantIds: [leader!.id],
      reviewRequestIds: [],
      reminderMinutes: [60]
    }
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json() as { id: string };

  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Iglesia o código').click();
  await page.getByLabel('Iglesia o código').fill('central');
  await page.getByLabel('Usuario').click();
  await page.getByLabel('Usuario').fill('jovenes@central.local');
  await page.getByLabel('Contraseña', { exact: true }).click();
  await page.getByLabel('Contraseña', { exact: true }).fill('Actividad!2026');
  await page.getByRole('button', { name: /Ingresar/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const from = new Date(start.getTime() - 60 * 60_000).toISOString();
  const to = new Date(end.getTime() + 60 * 60_000).toISOString();
  await page.goto(`/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&label=${encodeURIComponent(title)}`);
  const calendarEntry = page.getByRole('link', { name: new RegExp(title) }).first();
  await expect(calendarEntry).toBeVisible();
  await calendarEntry.click();
  await expect(page).toHaveURL(new RegExp(`/reviews\\?sessionId=${created.id}`));
  await expect(page.locator('.session-followup').getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('¿Participarás en esta sesión?')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar asistencia' }).click();
  await expect(page.getByText('¿Participarás en esta sesión?')).toHaveCount(0);
  await expect(page.getByText('No fue posible completar la acción')).toHaveCount(0);
});

test('dashboard permite navegar hacia la información filtrada', async ({ page }) => {
  const browserErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await login(page);

  await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lo que requiere atención' })).toBeVisible();
  await expect(page.getByText('Pronóstico operativo', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planificación vs. cierre' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Últimas tres actividades' })).toBeVisible();
  await expect(page.getByText(/Estimación explicable basada en estado, conflictos y anticipación/)).toBeVisible();
  await expect(page.getByRole('link', { name: /^Ver \d+ actividades completadas$/ })).toHaveAttribute('href', /attention=COMPLETED/);
  await expect(page.getByRole('link', { name: /^Ver \d+ actividades incompletas$/ })).toHaveAttribute('href', /attention=INCOMPLETE/);
  await expect(page.getByRole('link', { name: /^Ver \d+ actividades vencidas$/ })).toHaveAttribute('href', /attention=OVERDUE/);
  await expect(page.getByRole('link', { name: /salud operativa/i })).toHaveAttribute('href', /attention=INCOMPLETE/);
  await expect(page.locator('.forecast-baseline a')).toHaveCount(4);
  await expect(page.locator('.trend-bar-link')).toHaveCount(18);
  await expect(page.locator('.chart-legend a')).toHaveCount(3);

  const forecastRows = page.locator('.prediction-row');
  if (await forecastRows.count()) await expect(forecastRows.first()).toHaveAttribute('href', /\/activities\//);

  const monthPlanned = page.locator('.trend-column').last().locator('.trend-bar-link').first();
  await expect(monthPlanned).toHaveAttribute('href', /attention=PLANNED/);
  await monthPlanned.click();
  await expect(page).toHaveURL(/\/calendar\?.*attention=PLANNED/);
  await expect(page.locator('.calendar-filter-summary')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
  const approvedCard = page.locator('.stat-card').filter({ hasText: 'Actividades aprobadas' });
  await expect(approvedCard).toHaveAttribute('href', /status=APPROVED/);
  await approvedCard.click();
  await expect(page).toHaveURL(/\/calendar\?status=APPROVED/);
  await expect(page.getByRole('heading', { name: 'Actividades aprobadas' })).toBeVisible();
  await expect(page.getByText(/actividades? visibles?/)).toBeVisible();

  await page.goto('/dashboard');
  const departmentRow = page.locator('.department-panel .bar-row').first();
  await expect(departmentRow).toHaveAttribute('href', /departmentId=/);
  const departmentName = (await departmentRow.locator('div span').textContent()) ?? '';
  await departmentRow.click();
  await expect(page).toHaveURL(/departmentId=/);
  await expect(page.getByRole('heading', { name: `Departamento: ${departmentName}` })).toBeVisible();
  await expect(page.locator('.agenda-row').first()).toBeVisible();
  expect(browserErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test('menú lateral retractil conserva la preferencia y respeta móvil', async ({ page }, testInfo) => {
  await login(page);
  const shell = page.locator('.app-shell');
  const sidebar = page.locator('#primary-sidebar');
  const collapseButton = page.getByRole('button', { name: 'Contraer menú lateral' });
  await expect(sidebar.getByText('Configuración', { exact: true })).toBeAttached();
  await expect(sidebar.locator('nav a')).toHaveText([
    'Inicio', 'Alertas', 'Calendario', 'Nueva actividad', 'Revisión', 'Reportes',
    'Ancianos', 'Documentos', 'Nombramientos', 'Departamentos', 'Equipo', 'Formulario', 'Configuración', 'Auditoría'
  ]);
  await expect(sidebar.locator('.nav-section-label')).toHaveText(['General', 'Planificación', 'Ministerios', 'Administración', 'Gobernanza']);

  if (testInfo.project.name.startsWith('mobile')) {
    await expect(collapseButton).toBeHidden();
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(sidebar).toHaveClass(/open/);
    await expect(sidebar.getByText('Calendario', { exact: true })).toBeVisible();
    return;
  }

  await expect(sidebar).toHaveCSS('width', '262px');
  await collapseButton.click();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await expect(sidebar).toHaveCSS('width', '82px');
  await expect(page.getByRole('button', { name: 'Expandir menú lateral' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gestionchurch:sidebar-collapsed'))).toBe('true');

  await page.reload();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await expect(sidebar).toHaveCSS('width', '82px');
  await page.getByRole('button', { name: 'Expandir menú lateral' }).click();
  await expect(sidebar).toHaveCSS('width', '262px');
});

test('administrador diseña y previsualiza el formulario antes de publicar', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'), 'El constructor completo se valida en escritorio.');
  await login(page);
  await page.goto('/settings/activity-form');
  await expect(page.getByRole('heading', { name: 'Diseñador de formulario' })).toBeVisible();
  await expect(page.getByText('Diseña → guarda → revisa → publica')).toBeVisible();

  await page.getByRole('button', { name: /Campo personalizado/ }).click();
  await page.getByRole('textbox', { name: 'Etiqueta', exact: true }).fill('Dato personalizado de prueba');
  await page.getByRole('button', { name: 'Revisar vista previa' }).click();

  const preview = page.getByRole('dialog', { name: 'Vista previa del formulario' });
  await expect(preview.getByText('Dato personalizado de prueba')).toBeVisible();
  await preview.getByRole('button', { name: 'Vista móvil' }).click();
  await expect(preview.locator('.preview-browser')).toHaveClass(/mobile/);
  await preview.getByRole('button', { name: 'Aprobar vista previa' }).click();

  await expect(page.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  await expect(page.getByText('La publicación requiere guardar y aprobar la vista previa.')).toBeVisible();
});

test('administrador organiza departamentos, integrantes y roles', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'), 'El centro administrativo completo se valida en escritorio.');
  await login(page);
  await page.goto('/settings/departments');
  await expect(page.getByRole('heading', { name: 'Departamentos', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText('Un lugar para cada equipo y cada responsabilidad')).toBeVisible();
  await expect(page.getByText('Protección de actividades aprobadas')).toBeVisible();
  const departmentSearch = page.getByLabel('Buscar departamentos');
  await expect(departmentSearch).toBeVisible();
  await expect(page.locator('.department-list')).toHaveCSS('overflow-y', 'auto');
  await departmentSearch.fill('Jóvenes');
  await expect(page.locator('.department-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpiar búsqueda de departamentos' }).click();

  await page.getByRole('button', { name: 'Nuevo departamento' }).click();
  await expect(page.getByRole('heading', { name: 'Crear departamento' })).toBeVisible();
  await page.getByLabel('Nombre del departamento').fill('Departamento visual de prueba');
  await expect(page.locator('.department-preview')).toContainText('Departamento visual de prueba');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await page.getByRole('button', { name: /^Jóvenes / }).click();
  await expect(page.getByLabel('Buscar integrantes del departamento')).toBeVisible();
  await page.getByRole('button', { name: 'Integrante', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agregar integrante' })).toBeVisible();
  await page.getByLabel('Rol dentro del departamento').selectOption('DIRECTOR');
  await expect(page.locator('form .field-help')).toContainText('Control total antes de aprobación');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'critical')).toEqual([]);
});

test('creación de usuario enlaza departamentos y roles departamentales', async ({ page }) => {
  await login(page);
  await page.goto('/team');
  const userSearch = page.getByLabel('Buscar usuarios');
  await expect(userSearch).toBeVisible();
  await expect(page.locator('.connected-user-grid')).toHaveCSS('overflow-y', 'auto');
  await userSearch.fill('admin@central.local');
  await expect(page.locator('.connected-user-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpiar búsqueda de usuarios' }).click();
  await expect(page.locator('.user-department-link').first()).toHaveAttribute('href', /\/settings\/departments\?departmentId=/);
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  await expect(page.getByRole('heading', { name: 'Agregar usuario' })).toBeVisible();
  await expect(page.getByText('Departamentos y responsabilidades')).toBeVisible();

  await page.locator('.membership-editor-row').first().locator('select').nth(0).selectOption({ label: 'Jóvenes' });
  await page.locator('.membership-editor-row').first().locator('select').nth(1).selectOption('DIRECTOR');
  await expect(page.locator('.membership-confirmation')).toContainText('Jóvenes');
  await expect(page.locator('.membership-confirmation')).toContainText('Publica y administra actividades');

  await page.getByRole('button', { name: 'Agregar otro departamento' }).click();
  await page.locator('.membership-editor-row').nth(1).locator('select').nth(0).selectOption({ label: 'Ministerio Infantil' });
  await page.locator('.membership-editor-row').nth(1).locator('select').nth(1).selectOption('PLANNER');
  await expect(page.locator('.membership-confirmation')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Crear usuario conectado' })).toBeVisible();
});

test('reportes enterprise conecta filtros, gráficos, detalle y exportaciones', async ({ page }, testInfo) => {
  await login(page);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Decisiones claras, respaldadas por datos.' })).toBeVisible();
  await expect(page.getByText('Filtros ejecutivos')).toBeVisible();
  await expect(page.locator('.report-kpi')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Planificación y resultados' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estado del portafolio' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hallazgos accionables' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desempeño por departamento' })).toBeVisible();
  await expect(page.getByLabel('Buscar en el reporte')).toBeVisible();

  const firstActivityCode = await page.locator('.report-table tbody tr').first().locator('td').first().locator('small').textContent();
  if (firstActivityCode) {
    await page.getByLabel('Buscar en el reporte').fill(firstActivityCode);
    await expect(page.locator('.report-table tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Limpiar búsqueda del reporte' }).click();
  }

  if (testInfo.project.name.startsWith('desktop')) {
    const overview = await page.request.get('http://localhost:4000/api/v1/reports/overview');
    expect(overview.status()).toBe(200);
    const payload = await overview.json() as { summary: { coordinationScore: number }; activities: unknown[] };
    expect(payload.summary.coordinationScore).toBeGreaterThanOrEqual(0);
    expect(payload.activities.length).toBeGreaterThan(0);

    const csv = await page.request.get('http://localhost:4000/api/v1/reports/activities.csv');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect(await csv.text()).toContain('Código');

    const pdf = await page.request.get('http://localhost:4000/api/v1/reports/executive.pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
  }

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'critical')).toEqual([]);
});

test('módulo de ancianos conecta turnos, programas, calendario y dashboard sin conflictos', async ({ page }) => {
  await login(page);
  await page.goto('/elders');
  await expect(page.getByRole('heading', { name: 'Ancianos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Una agenda clara para cuidar cada culto.' })).toBeVisible();
  await expect(page.getByText('Visible, no conflictivo')).toHaveCount(0);

  await page.getByRole('button', { name: /Cobertura departamental/ }).click();
  await expect(page.getByRole('heading', { name: 'Anciano responsable por departamento' })).toBeVisible();
  await expect(page.getByLabel('Buscar cobertura departamental')).toBeVisible();
  await expect(page.locator('.elder-coverage-card')).toHaveCount(4);
  await expect(page.getByText('Raúl Pérez').first()).toBeVisible();

  await page.getByRole('button', { name: /Turnos anuales/ }).click();
  await expect(page.getByRole('heading', { name: 'Turnos de responsabilidad' })).toBeVisible();
  await expect(page.getByText('Visible, no conflictivo')).toBeVisible();
  await expect(page.locator('.elder-rotation-card')).toHaveCount(1);

  await page.getByRole('button', { name: /Programas/ }).click();
  await expect(page.getByRole('heading', { name: 'Programas coordinados' })).toBeVisible();
  await expect(page.locator('.elder-program-card')).toHaveCount(2);
  await page.locator('.elder-program-card').first().click();
  await expect(page.getByText('Ficha del culto')).toBeVisible();
  await expect(page.getByText('Lectura bíblica')).toBeVisible();
  await expect(page.getByText('Himno solicitado')).toBeVisible();

  const calendar = await page.request.get('http://localhost:4000/api/v1/elders/calendar?from=2026-09-01T00:00:00.000Z&to=2026-10-31T23:59:59.000Z');
  expect(calendar.status()).toBe(200);
  const calendarPayload = await calendar.json() as { items: Array<{ informational: boolean; kind: string }> };
  expect(calendarPayload.items.length).toBeGreaterThanOrEqual(3);
  expect(calendarPayload.items.every((item) => item.informational)).toBe(true);
  expect(calendarPayload.items.some((item) => item.kind === 'ELDER_ROTATION')).toBe(true);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Ancianos y próximos cultos' })).toBeVisible();
  await expect(page.getByText('4 enlace(s) departamental(es) activo(s)')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'critical')).toEqual([]);
});

test('ancianos diseña plataforma y orden minuto a minuto desde una plantilla', async ({ page }) => {
  await login(page);
  const contextResponse = await page.request.get('http://localhost:4000/api/v1/elders/context');
  expect(contextResponse.status()).toBe(200);
  const context = await contextResponse.json() as { people: Array<{ id: string }> };
  const created = await page.request.post('http://localhost:4000/api/v1/elders/programs', { data: {
    elderId: context.people[0]!.id,
    serviceAt: '2026-12-05T13:00:00.000Z',
    endsAt: '2026-12-05T16:00:00.000Z',
    serviceType: 'SABBATH',
    title: `Plataforma navegador ${Date.now()}`,
    preacherName: '', singerName: '', hymn: '', bibleReading: '', notes: '', status: 'DRAFT'
  } });
  expect(created.status()).toBe(201);
  const programId = ((await created.json()) as { id: string }).id;
  await page.goto(`/elders?view=platform&programId=${programId}`);
  await expect(page.getByRole('heading', { name: 'Plataforma y orden minuto a minuto' })).toBeVisible();
  await expect(page.getByText('El orden aún no está definido')).toBeVisible();
  await page.getByLabel('Plantilla para aplicar').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Aplicar plantilla' }).click();
  await expect(page.getByRole('heading', { name: 'Diseñar plataforma y minuto a minuto' })).toBeVisible();
  await page.locator('.platform-member-add select').selectOption({ index: 1 });
  await page.locator('.platform-member-add').first().getByRole('button', { name: 'Agregar' }).click();
  await expect(page.locator('.platform-member-editor article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Guardar plataforma' }).click();
  await expect(page.getByText('Plataforma y orden del culto guardados con trazabilidad completa.')).toBeVisible();
  await expect(page.locator('.service-timeline article')).toHaveCount(14);
  await expect(page.locator('.platform-team')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'critical')).toEqual([]);
});

test('primer anciano diseña el calendario anual con vista previa', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'), 'La autoridad y el constructor anual se validan una vez en escritorio.');
  await login(page, 'primeranciano@central.local', 'Actividad!2026');
  await page.goto('/elders?view=rotations');
  await expect(page.getByRole('heading', { name: 'Turnos de responsabilidad' })).toBeVisible();
  await page.getByRole('button', { name: 'Generar calendario anual' }).click();
  const planner = page.getByRole('heading', { name: 'Crear calendario de ancianos' }).locator('..');
  await expect(page.getByText('Vista previa antes de publicar')).toBeVisible();
  await expect(page.locator('.annual-preview-list article')).toHaveCount(53);
  await expect(page.getByRole('button', { name: /Publicar calendario/ })).toBeEnabled();
  await expect(planner).toContainText('Las semanas existentes se respetan');
});

test('biblioteca ministerial carga, visualiza, revisa y retira un programa', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'), 'El flujo documental completo se valida una vez en escritorio.');
  await login(page);
  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'Biblioteca ministerial' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Programas claros, accesibles y con propósito.' })).toBeVisible();
  await expect(page.getByLabel('Buscar documentos')).toBeVisible();

  const title = `Programa visual ${Date.now()}`;
  await page.getByRole('button', { name: 'Cargar documento', exact: true }).last().click();
  const uploader = page.getByRole('heading', { name: 'Cargar documento' }).locator('..');
  await uploader.getByLabel('Título').fill(title);
  await uploader.getByLabel('Descripción').fill('Programa ministerial para validar el repositorio conectado.');
  await uploader.getByLabel('Referencia exacta').fill('Plan anual 2027 · Objetivo 3');
  await uploader.getByLabel('Notas de alineación').fill('Apoya discipulado, servicio y coordinación de la iglesia.');
  await uploader.locator('input[type="file"]').setInputFiles({
    name: 'programa-visual.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Programa ministerial visual\nContenido visible dentro de GestionChurch.')
  });
  await uploader.getByRole('checkbox').check();
  await uploader.getByRole('button', { name: 'Cargar y registrar' }).click();
  await expect(page.getByText('Documento cargado, analizado y registrado para revisión de alineación.')).toBeVisible();

  await page.getByLabel('Buscar documentos').fill(title);
  const card = page.locator('.document-card').filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Alineación declarada')).toBeVisible();
  await card.getByRole('button', { name: 'Visualizar' }).click();
  const viewer = page.getByRole('dialog', { name: `Visor de ${title}` });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('iframe')).toBeVisible();
  await expect(viewer.locator('iframe').contentFrame().getByText('Contenido visible dentro de GestionChurch.')).toBeVisible();
  await viewer.getByRole('button', { name: 'Cerrar visor' }).click();

  await card.getByRole('button', { name: `Revisar alineación de ${title}` }).click();
  const review = page.getByRole('heading', { name: 'Validar alineación' }).locator('..');
  await review.getByLabel('Fundamento').fill('Validado por liderazgo contra el plan anual vigente de la iglesia.');
  await review.getByRole('button', { name: 'Guardar revisión' }).click();
  await expect(page.getByText('La revisión de alineación fue registrada con trazabilidad.')).toBeVisible();
  await expect(card.getByText('Alineación verificada')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: `Retirar ${title}` }).click();
  await expect(page.getByText('El documento fue retirado de manera auditable.')).toBeVisible();
  await expect(card).toHaveCount(0);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'critical')).toEqual([]);
});

test('biblioteca ministerial conserva búsqueda y experiencia responsive', async ({ page }) => {
  await login(page);
  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'Biblioteca ministerial' })).toBeVisible();
  await expect(page.getByLabel('Buscar documentos')).toBeVisible();
  await expect(page.getByLabel('Filtrar por departamento')).toBeVisible();
  await expect(page.getByLabel('Filtrar por tipo')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
});

test('el padrón maestro importa, previsualiza y comparte fotografías con Ministerio de la Mujer', async ({ page }) => {
  await login(page);
  await page.goto('/settings/roster');
  await expect(page.getByRole('heading', { name: 'Padrón de iglesia' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Descargar plantilla' })).toHaveAttribute('href', '/templates/plantilla-padron-iglesia.xlsx');

  const stamp = Date.now();
  const name = `Mujer Padrón ${stamp}`;
  const memberCode = `WEB-${stamp}`;
  const csv = [
    'Código de miembro,Nombres,Apellidos,Sexo,Fecha de nacimiento,Correo electrónico,WhatsApp,Estado civil,Estado de membresía',
    `${memberCode},Mujer,Padrón ${stamp},Femenino,1992-06-15,mujer.padron.${stamp}@example.local,+18095550303,Soltera,Miembro`
  ].join('\n');
  await page.getByRole('button', { name: 'Cargar información' }).click();
  await page.getByLabel('Archivo del padrón').setInputFiles({ name: `padron-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Previsualizar importación' }).click();
  await expect(page.locator('.roster-preview-kpis .valid').getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
  await page.getByRole('button', { name: 'Importar 1 filas válidas' }).click();
  await expect(page.getByText(/1 personas importadas/)).toBeVisible();

  await page.getByLabel('Buscar en el padrón').fill(memberCode);
  const card = page.locator('.roster-member-grid article').filter({ hasText: name });
  await expect(card).toBeVisible();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await card.getByLabel(`Cargar fotografía de ${name}`).setInputFiles({ name: 'perfil.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText(`Fotografía actualizada para ${name}.`)).toBeVisible();
  await expect(card.getByRole('img', { name: `Foto de ${name}` })).toBeVisible();

  await page.goto('/womens-ministry');
  await page.getByRole('button', { name: 'Roster de mujeres' }).click();
  await page.getByLabel('Buscar en roster').fill(name);
  const ministryCard = page.locator('.wm-roster-grid article').filter({ hasText: name });
  await expect(ministryCard).toBeVisible();
  await expect(ministryCard.getByRole('img', { name: `Foto de ${name}` })).toBeVisible();

  const viewport = await page.evaluate(() => ({ body: document.body.scrollWidth, view: document.documentElement.clientWidth }));
  expect(viewport.body).toBeLessThanOrEqual(viewport.view + 1);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
});
