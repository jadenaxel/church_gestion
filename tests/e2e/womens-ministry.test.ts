import { beforeAll, describe, expect, it } from 'vitest';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';
let cookie = '';
let leaderCookie = '';
let departmentId = '';

async function request(path: string, options: RequestInit = {}, session = cookie) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      cookie: session,
      ...options.headers
    }
  });
  const body = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : await response.text();
  return { response, body };
}

async function login(email: string, password: string) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'central', email, password })
  });
  expect(response.status).toBe(201);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

beforeAll(async () => {
  cookie = await login('admin@central.local', 'GestionChurch!2026');
  leaderCookie = await login('jovenes@central.local', 'Actividad!2026');
  const departments = await request('/departments');
  const existing = (departments.body as { items: Array<{ id: string; name: string }> }).items.find((item) => item.name === 'Ministerio de la Mujer');
  if (existing) departmentId = existing.id;
  else {
    const created = await request('/departments', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Ministerio de la Mujer',
        description: 'Cuidado, crecimiento espiritual, misión y acompañamiento integral de todas las mujeres.',
        color: '#8B5CF6'
      })
    });
    expect(created.response.status).toBe(201);
    departmentId = (created.body as { id: string }).id;
  }
});

describe('Ministerio de la Mujer end-to-end', () => {
  it('limita el módulo al equipo autorizado y respeta el alcance financiero del rol', async () => {
    const users = await request('/users');
    const leader = (users.body as { items: Array<{ id: string; email: string }> }).items.find((item) => item.email === 'jovenes@central.local')!;
    const memberships = await request('/department-memberships');
    const alreadyAssigned = (memberships.body as { items: Array<{ user_id: string; department_id: string }> }).items.some((item) => item.user_id === leader.id && item.department_id === departmentId);
    if (alreadyAssigned) await request(`/department-memberships/${leader.id}/${departmentId}`, { method: 'DELETE' });

    expect((await request('/womens-ministry/context', {}, leaderCookie)).response.status).toBe(403);
    const assigned = await request('/department-memberships', {
      method: 'POST',
      body: JSON.stringify({ userId: leader.id, departmentId, role: 'PLANNER' })
    });
    expect(assigned.response.status).toBe(201);
    const authorized = await request('/womens-ministry/context', {}, leaderCookie);
    expect(authorized.response.status).toBe(200);
    expect(authorized.body).toMatchObject({ access: { departmentRole: 'PLANNER', canRead: true, canManage: true, canFinance: false } });
    await request(`/department-memberships/${leader.id}/${departmentId}`, { method: 'DELETE' });
  });

  it('opera roster, planificación, presupuesto, participación, retiro, pagos y seguimiento con auditoría', async () => {
    const stamp = Date.now();
    const initial = await request('/womens-ministry/context');
    expect(initial.response.status).toBe(200);
    expect(initial.body).toMatchObject({
      department: { id: departmentId, name: 'Ministerio de la Mujer' },
      access: { canRead: true, canManage: true, canFinance: true }
    });
    const adminId = (initial.body as { availableUsers: Array<{ id: string; email: string }> }).availableUsers.find((item) => item.email === 'admin@central.local')!.id;

    const profile = await request('/womens-ministry/women', {
      method: 'POST',
      body: JSON.stringify({
        name: `Mujer E2E ${stamp}`,
        email: `mujer.${stamp}@example.local`,
        phone: '+18095550101',
        dateOfBirth: '1988-04-17',
        membershipStatus: 'MEMBER',
        preferredContact: 'WHATSAPP',
        interests: ['oración', 'mentoría'],
        inclusionNotes: 'Perfil creado por validación integral.'
      })
    });
    expect(profile.response.status).toBe(201);
    const womanId = (profile.body as { id: string }).id;

    const startsAt = new Date(Date.now() + 390 * 86_400_000);
    startsAt.setUTCHours(22, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);
    const coreActivity = await request('/activities', {
      method: 'POST',
      headers: { 'idempotency-key': `women-e2e-${stamp}` },
      body: JSON.stringify({
        title: `Encuentro integral ${stamp}`,
        description: 'Actividad integral del Ministerio de la Mujer.',
        objective: 'Fortalecer la vida espiritual, el acompañamiento y la inclusión.',
        departmentId,
        venueId: null,
        responsibleName: 'Directiva del Ministerio de la Mujer',
        audience: 'Mujeres de la iglesia y comunidad',
        category: 'Ministerio de la Mujer',
        options: [{ label: 'Fecha principal', preference: 1, sessions: [{ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
      })
    });
    expect(coreActivity.response.status).toBe(201);
    const calendarActivityId = (coreActivity.body as { id: string }).id;
    expect((await request(`/activities/${calendarActivityId}/submit`, { method: 'POST' })).response.status).toBe(201);

    const ministryActivity = await request('/womens-ministry/activities', {
      method: 'POST',
      body: JSON.stringify({
        calendarActivityId,
        title: `Encuentro integral ${stamp}`,
        activityType: 'SPIRITUAL',
        objective: 'Fortalecer la vida espiritual, el acompañamiento y la inclusión.',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        venue: 'Salón multiuso',
        responsibleId: adminId,
        targetAgeBands: ['18_25', '26_39', '40_59', '60_PLUS'],
        plannedBudget: 25000,
        currency: 'DOP',
        status: 'PLANNED'
      })
    });
    expect(ministryActivity.response.status).toBe(201);
    const activityId = (ministryActivity.body as { id: string }).id;

    expect((await request(`/womens-ministry/activities/${activityId}/budget`, {
      method: 'POST',
      body: JSON.stringify({ entryType: 'EXPENSE', category: 'Alimentación', description: 'Refrigerio', amount: 4500, occurredOn: '2026-09-29', receiptReference: `REC-${stamp}` })
    })).response.status).toBe(201);
    expect((await request(`/womens-ministry/activities/${activityId}/participation`, {
      method: 'POST',
      body: JSON.stringify({ womanId, status: 'ATTENDED', notes: 'Participó activamente.' })
    })).response.status).toBe(201);
    expect((await request(`/womens-ministry/activities/${activityId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COMPLETED', outcome: 'Objetivo alcanzado y próxima mentoría identificada.' })
    })).response.status).toBe(200);

    const retreat = await request('/womens-ministry/retreats', {
      method: 'POST',
      body: JSON.stringify({
        title: `Retiro espiritual E2E ${stamp}`,
        year: 2029,
        resort: 'Resort de prueba',
        startsOn: '2029-08-10',
        endsOn: '2029-08-12',
        capacity: 80,
        costPerPerson: 8500,
        totalBudget: 680000,
        depositDeadline: '2029-06-30',
        currency: 'DOP',
        status: 'REGISTRATION_OPEN',
        notes: 'Retiro anual con control financiero y logístico.'
      })
    });
    expect(retreat.response.status).toBe(201);
    const retreatId = (retreat.body as { id: string }).id;
    const registration = await request(`/womens-ministry/retreats/${retreatId}/registrations`, {
      method: 'POST',
      body: JSON.stringify({ womanId, attendanceStatus: 'CONFIRMED', amountDue: 8500, roomAssignment: 'A-12', transportRequired: true, dietaryNotes: 'Sin nueces', notes: 'Salida desde la iglesia.' })
    });
    expect(registration.response.status).toBe(201);
    const registrationId = (registration.body as { id: string }).id;
    for (const [amount, reference] of [[3000, `DEP-${stamp}`], [5500, `FIN-${stamp}`]] as const) {
      expect((await request(`/womens-ministry/retreat-registrations/${registrationId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount, paidOn: '2026-09-29', method: 'TRANSFER', reference })
      })).response.status).toBe(201);
    }

    const followUp = await request('/womens-ministry/follow-ups', {
      method: 'POST',
      body: JSON.stringify({ womanId, activityId, reason: 'Incorporar al equipo de mentoría', dueOn: '2026-10-15', assignedTo: adminId, notes: 'Contacto acordado.' })
    });
    expect(followUp.response.status).toBe(201);
    expect((await request(`/womens-ministry/follow-ups/${(followUp.body as { id: string }).id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COMPLETED', notes: 'Integración confirmada.' })
    })).response.status).toBe(200);

    const final = await request('/womens-ministry/context');
    expect(final.response.status).toBe(200);
    const context = final.body as {
      women: Array<{ id: string; ageBand: string; attendedCount: number; engagementStatus: string }>;
      activities: Array<{ id: string; status: string; spentBudget: number; attendedCount: number }>;
      retreats: Array<{ id: string; collected: number; registrations: Array<{ id: string; paymentStatus: string; amountPaid: number }> }>;
      followUps: Array<{ id: string; status: string }>;
    };
    expect(context.women.find((item) => item.id === womanId)).toMatchObject({ ageBand: '26_39', attendedCount: 1, engagementStatus: 'ENGAGED' });
    expect(context.activities.find((item) => item.id === activityId)).toMatchObject({ status: 'COMPLETED', spentBudget: 4500, attendedCount: 1 });
    expect(context.retreats.find((item) => item.id === retreatId)).toEqual(expect.objectContaining({ collected: 8500, registrations: [expect.objectContaining({ id: registrationId, paymentStatus: 'PAID', amountPaid: 8500 })] }));
    expect(context.followUps.find((item) => item.id === (followUp.body as { id: string }).id)).toMatchObject({ status: 'COMPLETED' });

    const audit = await request('/audit/events?action=womens_ministry.retreat_payment.created&pageSize=10');
    expect(audit.response.status).toBe(200);
    expect((audit.body as { items: Array<{ action: string }> }).items).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'womens_ministry.retreat_payment.created' })]));

    await request(`/activities/${calendarActivityId}/cancel`, { method: 'POST' });
  });

  it('alerta a la directiva sobre cumpleaños próximos sin duplicar notificaciones', async () => {
    const stamp = Date.now();
    const users = await request('/users');
    const leader = (users.body as { items: Array<{ id: string; email: string }> }).items.find((item) => item.email === 'jovenes@central.local')!;
    const memberships = await request('/department-memberships');
    const alreadyAssigned = (memberships.body as { items: Array<{ user_id: string; department_id: string }> }).items.some((item) => item.user_id === leader.id && item.department_id === departmentId);
    if (alreadyAssigned) await request(`/department-memberships/${leader.id}/${departmentId}`, { method: 'DELETE' });

    const assigned = await request('/department-memberships', {
      method: 'POST',
      body: JSON.stringify({ userId: leader.id, departmentId, role: 'ASSISTANT_DIRECTOR' })
    });
    expect(assigned.response.status).toBe(201);

    const todayParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santo_Domingo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const currentYear = Number(todayParts.find((part) => part.type === 'year')!.value);
    const month = todayParts.find((part) => part.type === 'month')!.value;
    const day = todayParts.find((part) => part.type === 'day')!.value;
    const name = `Cumpleaños E2E ${stamp}`;

    const profile = await request('/womens-ministry/women', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email: `cumpleanos.${stamp}@example.local`,
        phone: '+18095550102',
        dateOfBirth: `1990-${month}-${day}`,
        membershipStatus: 'MEMBER',
        preferredContact: 'WHATSAPP',
        interests: ['acompañamiento'],
        inclusionNotes: 'Perfil para validar la alerta anual de cumpleaños.'
      })
    });
    expect(profile.response.status).toBe(201);
    const womanId = (profile.body as { id: string }).id;

    const firstContext = await request('/womens-ministry/context');
    expect(firstContext.response.status).toBe(200);
    const birthdayContext = firstContext.body as {
      birthdays: Array<{ id: string; daysUntil: number; isToday: boolean; turningAge: number }>;
      metrics: { birthdaysNext30: number; birthdaysThisWeek: number };
    };
    expect(birthdayContext.birthdays.find((item) => item.id === womanId)).toMatchObject({
      daysUntil: 0,
      isToday: true,
      turningAge: currentYear - 1990
    });
    expect(birthdayContext.metrics.birthdaysNext30).toBeGreaterThanOrEqual(1);
    expect(birthdayContext.metrics.birthdaysThisWeek).toBeGreaterThanOrEqual(1);

    const notificationsAfterFirstLoad = await request('/notifications', {}, leaderCookie);
    expect(notificationsAfterFirstLoad.response.status).toBe(200);
    const matchingFirst = (notificationsAfterFirstLoad.body as { items: Array<{ title: string; body: string }> }).items.filter((item) => `${item.title} ${item.body}`.includes(name));
    expect(matchingFirst).toHaveLength(1);

    expect((await request('/womens-ministry/context')).response.status).toBe(200);
    const notificationsAfterSecondLoad = await request('/notifications', {}, leaderCookie);
    const matchingSecond = (notificationsAfterSecondLoad.body as { items: Array<{ title: string; body: string }> }).items.filter((item) => `${item.title} ${item.body}`.includes(name));
    expect(matchingSecond).toHaveLength(1);

    const audit = await request('/audit/events?action=womens_ministry.birthday_alert.generated&pageSize=100');
    expect(audit.response.status).toBe(200);
    expect((audit.body as { items: Array<{ action: string; resource_id: string }> }).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'womens_ministry.birthday_alert.generated', resource_id: womanId })
    ]));

    await request(`/department-memberships/${leader.id}/${departmentId}`, { method: 'DELETE' });
  });
});
