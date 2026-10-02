import { createHmac, randomUUID } from 'node:crypto';
import { SMTPServer } from 'smtp-server';
import { beforeAll, describe, expect, it } from 'vitest';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';
let adminCookie = '';
let secretaryCookie = '';
let leaderCookie = '';
let departmentIds: string[] = [];
let venueId = '';
let tenantId = '';

async function request(path: string, options: RequestInit = {}, cookie = adminCookie) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { ...(options.body && !(options.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...options.headers }
  });
  const body = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : await response.text();
  return { response, body };
}

async function login(email: string, password: string) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'central', email, password })
  });
  expect(response.status).toBe(201);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

beforeAll(async () => {
  const health = await fetch('http://127.0.0.1:4000/health/live');
  if (!health.ok) throw new Error('Los servicios deben estar levantados para las pruebas E2E.');
  adminCookie = await login('admin@central.local', 'GestionChurch!2026');
  secretaryCookie = await login('secretaria@central.local', 'Revision!2026');
  leaderCookie = await login('jovenes@central.local', 'Actividad!2026');
  departmentIds = ((await request('/departments')).body as { items: Array<{ id: string }> }).items.map((item) => item.id);
  venueId = ((await request('/venues')).body as { items: Array<{ id: string }> }).items[0]!.id;
  tenantId = ((await request('/me')).body as { user: { tenantId: string } }).user.tenantId;
});

describe('calendario end-to-end', () => {
  it('reproduce una creación idempotente sin duplicar actividad', async () => {
    const start = new Date(Date.now() + 210 * 86400_000);
    const end = new Date(start.getTime() + 3600_000);
    const payload = {
      title: `Idempotencia ${Date.now()}`, description: 'Valida reintentos seguros desde redes móviles.',
      departmentId: departmentIds[0], venueId: null, responsibleName: 'Suite E2E',
      options: [{ label: 'Principal', preference: 1, sessions: [{ startsAt: start.toISOString(), endsAt: end.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
    };
    const key = `e2e-${Date.now()}-idempotent`;
    const first = await request('/activities', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(payload) });
    const replay = await request('/activities', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(payload) });
    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(201);
    expect((replay.body as { id: string }).id).toBe((first.body as { id: string }).id);
    expect((replay.body as { replayed: boolean }).replayed).toBe(true);
    await request(`/activities/${(first.body as { id: string }).id}/cancel`, { method: 'POST' });
  });

  it('ofrece y confirma una alternativa libre antes de solicitar coexistencia', async () => {
    let primary = new Date(Date.now() + 240 * 86400_000); primary.setUTCHours(18, 0, 0, 0);
    let primaryEnd = new Date(primary.getTime() + 3600_000);
    for (let attempt = 0; attempt < 20; attempt++) {
      const check = await request(`/availability?start=${encodeURIComponent(primary.toISOString())}&end=${encodeURIComponent(primaryEnd.toISOString())}&venueId=${venueId}`);
      if ((check.body as { available: boolean }).available) break;
      primary = new Date(primary.getTime() + 86400_000); primaryEnd = new Date(primaryEnd.getTime() + 86400_000);
    }
    const reserved = await request('/activities', { method: 'POST', body: JSON.stringify({
      title: `Reserva principal ${Date.now()}`, description: 'Ocupa la primera opción para la prueba.', departmentId: departmentIds[0], venueId,
      responsibleName: 'Suite E2E', options: [{ label: 'Principal', preference: 1, sessions: [{ startsAt: primary.toISOString(), endsAt: primaryEnd.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
    }) });
    const reservedId = (reserved.body as { id: string }).id;
    expect((await request(`/activities/${reservedId}/submit`, { method: 'POST' })).response.status).toBe(201);
    const alternate = new Date(primary.getTime() + 86400_000);
    const alternateEnd = new Date(primaryEnd.getTime() + 86400_000);
    const candidate = await request('/activities', { method: 'POST', body: JSON.stringify({
      title: `Candidato alternativo ${Date.now()}`, description: 'Debe proponer la segunda fecha disponible.', departmentId: departmentIds[1], venueId,
      responsibleName: 'Suite E2E', options: [
        { label: 'Preferida', preference: 1, sessions: [{ startsAt: primary.toISOString(), endsAt: primaryEnd.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] },
        { label: 'Alternativa libre', preference: 2, sessions: [{ startsAt: alternate.toISOString(), endsAt: alternateEnd.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }
      ]
    }) });
    const candidateId = (candidate.body as { id: string }).id;
    const submitted = await request(`/activities/${candidateId}/submit`, { method: 'POST' });
    expect((submitted.body as { status: string }).status).toBe('ALTERNATIVE_AVAILABLE');
    const optionId = (submitted.body as { alternative: { id: string } }).alternative.id;
    const confirmed = await request(`/activities/${candidateId}/options/${optionId}/confirm`, { method: 'POST' });
    expect((confirmed.body as { status: string }).status).toBe('SUBMITTED');
    await request(`/activities/${reservedId}/cancel`, { method: 'POST' });
    await request(`/activities/${candidateId}/cancel`, { method: 'POST' });
  });

  it('serializa dos envíos concurrentes y resuelve el conflicto con una alternativa administrada', async () => {
    let day = new Date(Date.now() + 120 * 86400_000);
    day.setUTCHours(22, 0, 0, 0);
    for (let attempt = 0; attempt < 30; attempt++) {
      const end = new Date(day.getTime() + 2 * 3600_000);
      const check = await request(`/availability?start=${encodeURIComponent(day.toISOString())}&end=${encodeURIComponent(end.toISOString())}&venueId=${venueId}`);
      if ((check.body as { available: boolean }).available) break;
      day = new Date(day.getTime() + 86400_000);
    }
    const end = new Date(day.getTime() + 2 * 3600_000);
    const create = async (title: string, departmentId: string) => {
      const result = await request('/activities', {
        method: 'POST',
        body: JSON.stringify({
          title, description: 'Prueba automatizada de concurrencia.', objective: 'Comprobar el lock transaccional.',
          departmentId, venueId, responsibleName: 'Suite E2E', audience: 'Congregación', estimatedAttendance: 30,
          options: [{ label: 'Fecha preferida', preference: 1, sessions: [{ startsAt: day.toISOString(), endsAt: end.toISOString(), setupMinutes: 10, teardownMinutes: 10 }] }]
        })
      });
      expect(result.response.status).toBe(201);
      return result.body as { id: string };
    };
    const [a, b] = await Promise.all([
      create(`Concurrencia A ${Date.now()}`, departmentIds[0]!),
      create(`Concurrencia B ${Date.now()}`, departmentIds[1]!)
    ]);
    const submissions = await Promise.all([
      request(`/activities/${a.id}/submit`, { method: 'POST' }),
      request(`/activities/${b.id}/submit`, { method: 'POST' })
    ]);
    const statuses = submissions.map((item) => (item.body as { status: string }).status).sort();
    expect(statuses).toEqual(['CONFLICTED', 'SUBMITTED']);
    const conflictedIndex = submissions.findIndex((item) => (item.body as { status: string }).status === 'CONFLICTED');
    const submittedIndex = submissions.findIndex((item) => (item.body as { status: string }).status === 'SUBMITTED');
    const conflictedActivity = conflictedIndex === 0 ? a : b;
    const preferredActivity = submittedIndex === 0 ? a : b;
    const conflictPayload = submissions[conflictedIndex]!.body as {
      conflict: { details: Array<{ activity_id: string; code: string; department: string; submitted_by_name: string; submitted_at: string; disputed_start: string; disputed_end: string; same_venue: boolean }> };
    };
    expect(conflictPayload.conflict.details[0]).toMatchObject({ activity_id: preferredActivity.id, same_venue: true });
    expect(conflictPayload.conflict.details[0]!.department).toBeTruthy();
    expect(conflictPayload.conflict.details[0]!.submitted_by_name).toBeTruthy();
    expect(new Date(conflictPayload.conflict.details[0]!.disputed_end).getTime()).toBeGreaterThan(new Date(conflictPayload.conflict.details[0]!.disputed_start).getTime());
    const liveAlert = await request(`/availability?start=${encodeURIComponent(day.toISOString())}&end=${encodeURIComponent(end.toISOString())}&venueId=${venueId}&departmentId=${departmentIds[conflictedIndex]}`);
    expect(liveAlert.body).toMatchObject({ available: false, conflicts: [expect.objectContaining({ activity_id: preferredActivity.id, submitted_by_name: expect.any(String) })] });
    const review = await request(`/activities/${conflictedActivity.id}/request-review`, {
      method: 'POST',
      body: JSON.stringify({
        reason: 'La prueba requiere conservar el mismo bloque para validar la revisión.',
        coexistencePlan: 'Se utilizarán responsables y recursos separados durante toda la actividad.',
        alternative: 'No aplica en esta prueba automatizada.'
      })
    });
    expect(review.response.status).toBe(201);
    const reviewQueue = await request('/review-requests', {}, secretaryCookie);
    const reviewCase = (reviewQueue.body as { items: Array<{ id: string; requested_by_name: string; requested_submitted_at: string; details: Array<{ activity_id: string; has_priority: boolean; disputed_start: string; disputed_end: string }> }> }).items.find((item) => item.id === (review.body as { id: string }).id);
    expect(reviewCase).toMatchObject({ requested_by_name: expect.any(String), details: [expect.objectContaining({ activity_id: preferredActivity.id, has_priority: true })] });
    expect(new Date(reviewCase!.details[0]!.disputed_end).getTime()).toBeGreaterThan(new Date(reviewCase!.details[0]!.disputed_start).getTime());
    const suggestions = await request(`/review-requests/${(review.body as { id: string }).id}/alternative-suggestions?limit=3`);
    expect(suggestions.response.status).toBe(200);
    const suggested = (suggestions.body as { items: Array<{ startsAt: string; endsAt: string; setupMinutes: number; teardownMinutes: number }> }).items[0]!;
    expect(suggested).toMatchObject({ startsAt: expect.any(String), endsAt: expect.any(String) });
    const alternative = await request(`/review-requests/${(review.body as { id: string }).id}/alternatives`, {
      method: 'POST',
      body: JSON.stringify({ label: 'Alternativa libre E2E', ...suggested })
    });
    expect(alternative.response.status).toBe(201);
    const alternativeId = (alternative.body as { id: string }).id;
    const queueWithAlternative = await request('/review-requests');
    const updatedCase = (queueWithAlternative.body as { items: Array<{ id: string; requested_option_id: string; options: Array<{ id: string; label: string }> }> }).items.find((item) => item.id === (review.body as { id: string }).id);
    expect(updatedCase?.options).toContainEqual(expect.objectContaining({ id: alternativeId, label: 'Alternativa libre E2E' }));
    expect(alternativeId).not.toBe(updatedCase?.requested_option_id);
    const forbiddenDecision = await request(`/review-requests/${(review.body as { id: string }).id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'APPROVE_ALTERNATIVE', optionId: alternativeId, notes: 'Un administrador de tenant no recibe el permiso final de manera implícita.' })
    });
    expect(forbiddenDecision.response.status).toBe(403);
    const decision = await request(`/review-requests/${(review.body as { id: string }).id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'APPROVE_ALTERNATIVE', optionId: alternativeId, notes: 'Alternativa autorizada por secretaría con trazabilidad completa.' })
    }, secretaryCookie);
    expect(decision.response.status).toBe(201);
    const detail = await request(`/activities/${conflictedActivity.id}`, {}, secretaryCookie);
    expect((detail.body as { status: string }).status).toBe('APPROVED');
    await request(`/activities/${a.id}/cancel`, { method: 'POST' });
    await request(`/activities/${b.id}/cancel`, { method: 'POST' });
  });

  it('entrega notificaciones in-app sin fingir entrega de WhatsApp', async () => {
    const me = await request('/me', {}, secretaryCookie);
    const userId = (me.body as { user: { sub: string } }).user.sub;
    expect((await request('/notifications/preferences', {
      method: 'PATCH', body: JSON.stringify({ whatsappEnabled: false })
    }, secretaryCookie)).response.status).toBe(200);
    const marker = `Consentimiento-${randomUUID()}`;
    const notification = await fetch('http://127.0.0.1:4015/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret',
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ id: randomUUID(), type: 'activity.submitted', aggregateId: randomUUID(), payload: { title: marker, userId } })
    });
    expect(notification.status).toBe(201);
    const result = await request('/notifications', {}, secretaryCookie);
    expect(result.response.status).toBe(200);
    const item = (result.body as { items: Array<{ body: string; deliveries: Record<string, string> }> }).items
      .find((entry) => entry.body.includes(marker));
    expect(item?.deliveries.IN_APP).toBe('DELIVERED');
    expect(item?.deliveries.WHATSAPP).toBeUndefined();
  });

  it('convoca juntas por secretaría o administración y las enlaza al calendario personal', async () => {
    const eligible = await request('/review-sessions/eligible-participants');
    expect(eligible.response.status).toBe(200);
    const users = (eligible.body as { items: Array<{ id: string; email: string }> }).items;
    const admin = users.find((item) => item.email === 'admin@central.local');
    const secretary = users.find((item) => item.email === 'secretaria@central.local');
    const leader = users.find((item) => item.email === 'jovenes@central.local');
    expect(admin).toBeTruthy();
    expect(secretary).toBeTruthy();
    expect(leader).toBeTruthy();
    expect((await request('/notifications/preferences', {
      method: 'PATCH', body: JSON.stringify({ whatsappEnabled: true })
    }, leaderCookie)).response.status).toBe(200);

    const startsAt = new Date(Date.now() + 280 * 86400_000);
    startsAt.setUTCHours(23, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
    const title = `Junta operativa E2E ${Date.now()}`;
    const created = await request('/review-sessions', {
      method: 'POST',
      body: JSON.stringify({
        title,
        scheduledAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: 'Sala de juntas E2E',
        agenda: 'Revisar actividades, conflictos, responsables y acuerdos de seguimiento.',
        participantIds: [admin!.id, secretary!.id, leader!.id],
        reviewRequestIds: [],
        reminderMinutes: [1440, 60]
      })
    });
    expect(created.response.status).toBe(201);
    const sessionId = (created.body as { id: string }).id;

    let invitation: { title: string; link: string; deliveries: Record<string, string> } | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const inbox = await request('/notifications', {}, leaderCookie);
      invitation = (inbox.body as { items: Array<{ title: string; link: string; deliveries: Record<string, string> }> }).items
        .find((item) => item.title === 'Convocatoria a junta de revisión' && item.link === `/reviews?sessionId=${sessionId}`);
      if (invitation?.deliveries.WHATSAPP === 'SIMULATED') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(invitation).toMatchObject({ deliveries: { IN_APP: 'DELIVERED', WHATSAPP: 'SIMULATED' } });

    const adminAgenda = await request(`/review-sessions/my-agenda?from=${encodeURIComponent(new Date(startsAt.getTime() - 60_000).toISOString())}&to=${encodeURIComponent(new Date(endsAt.getTime() + 60_000).toISOString())}`);
    expect(adminAgenda.response.status).toBe(200);
    expect((adminAgenda.body as { items: Array<{ id: string; title: string; caseCount: number }> }).items)
      .toContainEqual(expect.objectContaining({ id: sessionId, title, caseCount: 0 }));

    const secretaryAgenda = await request(`/review-sessions/my-agenda?from=${encodeURIComponent(new Date(startsAt.getTime() - 60_000).toISOString())}&to=${encodeURIComponent(new Date(endsAt.getTime() + 60_000).toISOString())}`, {}, secretaryCookie);
    expect((secretaryAgenda.body as { items: Array<{ id: string }> }).items).toContainEqual(expect.objectContaining({ id: sessionId }));
    const leaderAgenda = await request(`/review-sessions/my-agenda?from=${encodeURIComponent(new Date(startsAt.getTime() - 60_000).toISOString())}&to=${encodeURIComponent(new Date(endsAt.getTime() + 60_000).toISOString())}`, {}, leaderCookie);
    expect((leaderAgenda.body as { items: Array<{ id: string }> }).items).toContainEqual(expect.objectContaining({ id: sessionId }));
    const leaderSessions = await request('/review-sessions', {}, leaderCookie);
    expect(leaderSessions.response.status).toBe(200);
    expect((leaderSessions.body as { capabilities: { canManageSessions: boolean }; items: Array<{ id: string }> })).toMatchObject({
      capabilities: { canManageSessions: false },
      items: expect.arrayContaining([expect.objectContaining({ id: sessionId })])
    });

    const response = await request(`/review-sessions/${sessionId}/response`, {
      method: 'PATCH', body: JSON.stringify({ response: 'CONFIRMED' })
    }, secretaryCookie);
    expect(response.body).toMatchObject({ invitationStatus: 'CONFIRMED' });

    const listed = await request('/review-sessions');
    expect(listed.response.status).toBe(200);
    const session = (listed.body as {
      capabilities: { canManageSessions: boolean };
      items: Array<{ id: string; participants: Array<{ userId: string; invitationStatus: string }> }>;
    });
    expect(session.capabilities.canManageSessions).toBe(true);
    expect(session.items.find((item) => item.id === sessionId)?.participants)
      .toContainEqual(expect.objectContaining({ userId: secretary!.id, invitationStatus: 'CONFIRMED' }));

    const closed = await request(`/review-sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'CLOSED',
        minutes: 'Se revisaron los casos y se asignaron responsables con seguimiento documentado.',
        attendedParticipantIds: [admin!.id, secretary!.id, leader!.id]
      })
    });
    expect(closed.response.status).toBe(200);
    expect(closed.body).toMatchObject({ status: 'CLOSED' });

    const secretaryStart = new Date(startsAt.getTime() + 2 * 86400_000);
    const createdBySecretary = await request('/review-sessions', {
      method: 'POST',
      body: JSON.stringify({
        title: `Convocatoria de secretaría ${Date.now()}`,
        scheduledAt: secretaryStart.toISOString(),
        endsAt: new Date(secretaryStart.getTime() + 60 * 60_000).toISOString(),
        location: 'Sala pastoral',
        agenda: 'Confirmar que secretaría puede convocar y administrar una sesión completa.',
        participantIds: [admin!.id, secretary!.id],
        reviewRequestIds: [],
        reminderMinutes: [60]
      })
    }, secretaryCookie);
    expect(createdBySecretary.response.status).toBe(201);
    expect((await request(`/review-sessions/${(createdBySecretary.body as { id: string }).id}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' })
    }, secretaryCookie)).response.status).toBe(200);
    await request('/notifications/preferences', {
      method: 'PATCH', body: JSON.stringify({ whatsappEnabled: false })
    }, leaderCookie);
  });

  it('convierte el dashboard en centro de control y cierra actividades vencidas', async () => {
    // Use a historical day that changes between runs so a previously interrupted
    // E2E execution cannot leave an approved reservation on the same slot.
    const historicalOffsetDays = 30 + Math.floor(Math.random() * 3_000);
    const startsAt = new Date(Date.now() - historicalOffsetDays * 86400_000);
    const endsAt = new Date(startsAt.getTime() + 3600_000);
    const created = await request('/activities', { method: 'POST', body: JSON.stringify({
      title: `Cierre operativo ${Date.now()}`, description: 'Valida indicadores, vencimiento y cierre desde el centro de control.',
      departmentId: departmentIds[0], responsibleName: 'Suite E2E',
      options: [{ label: 'Fecha finalizada', preference: 1, sessions: [{ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
    }) });
    expect(created.response.status).toBe(201);
    const activityId = (created.body as { id: string }).id;
    expect((await request(`/activities/${activityId}/submit`, { method: 'POST' })).response.status).toBe(201);
    expect((await request(`/activities/${activityId}/approve`, { method: 'POST' }, secretaryCookie)).response.status).toBe(201);
    const before = await request('/dashboard');
    expect(before.response.status).toBe(200);
    const beforeBody = before.body as {
      stats: { completed: number; overdue: number; incomplete: number; coordinationScore: number };
      attention: Array<{ id: string; kind: string }>;
      trend: unknown[];
      forecast: { sampleSize: number; probability: number; predictions: unknown[]; recentActivities: unknown[] };
    };
    expect(beforeBody.stats.overdue).toBeGreaterThan(0);
    expect(beforeBody.attention).toContainEqual(expect.objectContaining({ id: activityId, kind: 'OVERDUE' }));
    expect(beforeBody.trend).toHaveLength(6);
    expect(beforeBody.forecast.probability).toBeGreaterThanOrEqual(12);
    expect(beforeBody.stats.coordinationScore).toBeGreaterThanOrEqual(12);
    const actionRequired = await request('/activities?attention=ACTION_REQUIRED');
    expect(actionRequired.response.status).toBe(200);
    expect((actionRequired.body as { items: Array<{ id: string }> }).items.some((item) => item.id === activityId)).toBe(true);
    const plannedPeriod = await request(`/activities?attention=PLANNED&from=${encodeURIComponent(new Date(startsAt.getTime() - 1_000).toISOString())}&to=${encodeURIComponent(new Date(endsAt.getTime() + 1_000).toISOString())}`);
    expect(plannedPeriod.response.status).toBe(200);
    expect((plannedPeriod.body as { items: Array<{ id: string }> }).items.some((item) => item.id === activityId)).toBe(true);
    const detail = await request(`/activities/${activityId}`);
    expect(detail.body).toMatchObject({ lifecycle: { overdue: true }, capabilities: { canComplete: true } });
    const completed = await request(`/activities/${activityId}/complete`, { method: 'POST' });
    expect(completed.response.status).toBe(201);
    expect((completed.body as { status: string }).status).toBe('COMPLETED');
    const after = await request('/dashboard');
    const afterStats = (after.body as { stats: { completed: number; overdue: number } }).stats;
    expect(afterStats.completed).toBe(beforeBody.stats.completed + 1);
    expect(afterStats.overdue).toBe(beforeBody.stats.overdue - 1);
    const resolvedAttention = await request('/activities?attention=ACTION_REQUIRED');
    expect((resolvedAttention.body as { items: Array<{ id: string }> }).items.some((item) => item.id === activityId)).toBe(false);
    const completedFilter = await request('/activities?attention=COMPLETED');
    expect((completedFilter.body as { items: Array<{ id: string }> }).items.some((item) => item.id === activityId)).toBe(true);
  });

  it('carga, registra y descarga el programa de una actividad', async () => {
    const start = new Date(Date.now() + 180 * 86400_000);
    const end = new Date(start.getTime() + 3600_000);
    const created = await request('/activities', {
      method: 'POST',
      body: JSON.stringify({
        title: `Programa E2E ${Date.now()}`,
        description: 'Actividad para validar el ciclo completo de documentos.',
        objective: 'Comprobar carga y descarga seguras.',
        departmentId: departmentIds[0],
        venueId,
        responsibleName: 'Suite E2E',
        audience: 'Equipo de prueba',
        estimatedAttendance: 5,
        options: [{ label: 'Fecha principal', preference: 1, sessions: [{ startsAt: start.toISOString(), endsAt: end.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
      })
    });
    expect(created.response.status).toBe(201);
    const activityId = (created.body as { id: string }).id;
    const contents = 'Programa de prueba GestionChurch';
    const form = new FormData();
    form.append('file', new Blob([contents], { type: 'text/plain' }), 'programa-e2e.txt');
    const uploaded = await request(`/files/activity/${activityId}`, { method: 'POST', body: form });
    expect(uploaded.response.status).toBe(201);
    expect((uploaded.body as { status: string }).status).toBe('AVAILABLE');
    const fileId = (uploaded.body as { id: string }).id;
    const listed = await request(`/files/activity/${activityId}`);
    expect((listed.body as { items: Array<{ id: string }> }).items.some((item) => item.id === fileId)).toBe(true);
    const downloaded = await request(`/files/${fileId}/download`);
    expect(downloaded.response.status).toBe(200);
    expect(downloaded.body).toBe(contents);
    const access = await request(`/files/${fileId}/access-token`, { method: 'POST' });
    expect(access.response.status).toBe(201);
    const signedPath = (access.body as { url: string }).url.replace('/api/v1', '');
    expect((await request(signedPath)).response.status).toBe(200);
    const tampered = new URL((access.body as { url: string }).url, 'http://localhost');
    tampered.searchParams.set('token', `${tampered.searchParams.get('token')}alterado`);
    expect((await request(`${tampered.pathname.replace('/api/v1', '')}${tampered.search}`)).response.status).toBe(403);
    await request(`/activities/${activityId}/cancel`, { method: 'POST' });
  });

  it('pone en cuarentena la firma EICAR y no la expone en descargas', async () => {
    const start = new Date(Date.now() + 300 * 86400_000);
    const end = new Date(start.getTime() + 3600_000);
    const created = await request('/activities', { method: 'POST', body: JSON.stringify({
      title: `Antivirus E2E ${Date.now()}`, description: 'Valida el control de contenido malicioso.', departmentId: departmentIds[0],
      responsibleName: 'Suite E2E', options: [{ label: 'Principal', preference: 1, sessions: [{ startsAt: start.toISOString(), endsAt: end.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
    }) });
    const activityId = (created.body as { id: string }).id;
    const form = new FormData();
    form.append('file', new Blob(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'], { type: 'text/plain' }), 'eicar.txt');
    const upload = await request(`/files/activity/${activityId}`, { method: 'POST', body: form });
    expect(upload.response.status).toBe(422);
    expect((upload.body as { code: string }).code).toBe('QUARANTINED');
    const files = await request(`/files/activity/${activityId}`);
    expect((files.body as { items: Array<{ status: string }> }).items.every((file) => file.status !== 'AVAILABLE')).toBe(true);
    await request(`/activities/${activityId}/cancel`, { method: 'POST' });
  });

  it('reprograma, vuelve a validar, exporta iCalendar y libera la reserva al cancelar', async () => {
    const firstStart = new Date(Date.now() + 330 * 86400_000); firstStart.setUTCHours(14, 0, 0, 0);
    const firstEnd = new Date(firstStart.getTime() + 3600_000);
    const created = await request('/activities', { method: 'POST', body: JSON.stringify({
      title: `Reprogramación E2E ${Date.now()}`, description: 'Comprueba reapertura de validación y liberación de reservas.',
      departmentId: departmentIds[0], venueId, responsibleName: 'Suite E2E',
      options: [{ label: 'Fecha inicial', preference: 1, sessions: [{ startsAt: firstStart.toISOString(), endsAt: firstEnd.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
    }) });
    const activityId = (created.body as { id: string }).id;
    expect((await request(`/activities/${activityId}/submit`, { method: 'POST' })).response.status).toBe(201);
    expect((await request(`/activities/${activityId}/approve`, { method: 'POST' }, secretaryCookie)).response.status).toBe(201);
    const detail = await request(`/activities/${activityId}`);
    const secondStart = new Date(firstStart.getTime() + 86400_000);
    const secondEnd = new Date(firstEnd.getTime() + 86400_000);
    const updated = await request(`/activities/${activityId}`, { method: 'PATCH', body: JSON.stringify({
      expectedVersion: Number((detail.body as { version: number }).version),
      changeReason: 'Cambio de fecha validado por la prueba automatizada.',
      options: [{ label: 'Fecha reprogramada', preference: 1, sessions: [{ startsAt: secondStart.toISOString(), endsAt: secondEnd.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
    }) });
    expect((updated.body as { status: string }).status).toBe('DRAFT');
    const oldSlot = await request(`/availability?start=${encodeURIComponent(firstStart.toISOString())}&end=${encodeURIComponent(firstEnd.toISOString())}&venueId=${venueId}`);
    expect((oldSlot.body as { available: boolean }).available).toBe(true);
    expect((await request(`/activities/${activityId}/submit`, { method: 'POST' })).response.status).toBe(201);
    const calendarExport = await request('/exports/calendar.ics');
    expect(calendarExport.response.status).toBe(200);
    expect(String(calendarExport.body)).toContain('BEGIN:VCALENDAR');
    await request(`/activities/${activityId}/cancel`, { method: 'POST' });
    const released = await request(`/availability?start=${encodeURIComponent(secondStart.toISOString())}&end=${encodeURIComponent(secondEnd.toISOString())}&venueId=${venueId}`);
    expect((released.body as { available: boolean }).available).toBe(true);
  });

  it('gobierna departamentos, roles y cambios de actividades aprobadas', async () => {
    const marker = Date.now();
    const department = await request('/departments', { method: 'POST', body: JSON.stringify({
      name: `Departamento E2E ${marker}`, description: 'Valida gobierno y permisos departamentales.', color: '#2563eb'
    }) });
    expect(department.response.status).toBe(201);
    const departmentId = (department.body as { id: string }).id;
    const email = `director.${marker}@central.local`;
    const createdUser = await request('/users', { method: 'POST', body: JSON.stringify({
      name: 'Director Departamental E2E', email, password: 'TempDirector!234', assignedRoles: ['VIEWER'],
      memberships: [{ departmentId, role: 'DIRECTOR' }]
    }) });
    expect(createdUser.response.status).toBe(201);
    expect((createdUser.body as { memberships: Array<{ role: string }> }).memberships[0]?.role).toBe('DIRECTOR');
    const userId = (createdUser.body as { id: string }).id;
    const directorCookie = await login(email, 'TempDirector!234');
    const startsAt = new Date(Date.now() + 430 * 86400_000);
    const endsAt = new Date(startsAt.getTime() + 3600_000);
    const activity = await request('/activities', { method: 'POST', body: JSON.stringify({
      title: `Gobierno departamental ${marker}`, description: 'Actividad para validar protección posterior a la aprobación.',
      departmentId, responsibleName: 'Director Departamental E2E',
      options: [{ label: 'Principal', preference: 1, sessions: [{ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
    }) }, directorCookie);
    expect(activity.response.status).toBe(201);
    const activityId = (activity.body as { id: string }).id;
    expect((await request(`/activities/${activityId}/submit`, { method: 'POST' }, directorCookie)).response.status).toBe(201);
    expect((await request(`/activities/${activityId}/approve`, { method: 'POST' }, secretaryCookie)).response.status).toBe(201);
    const approved = await request(`/activities/${activityId}`, {}, directorCookie);
    const approvedBody = approved.body as { version: number; capabilities: { canEdit: boolean; canCancel: boolean; canRequestChange: boolean } };
    expect(approvedBody.capabilities).toMatchObject({ canEdit: false, canCancel: false, canRequestChange: true });
    const directEdit = await request(`/activities/${activityId}`, { method: 'PATCH', body: JSON.stringify({
      title: 'No debe aplicarse', expectedVersion: approvedBody.version, changeReason: 'Intento directo'
    }) }, directorCookie);
    expect(directEdit.response.status).toBe(409);
    expect((directEdit.body as { code: string }).code).toBe('APPROVED_ACTIVITY_REQUIRES_AUTHORIZATION');
    expect((await request(`/activities/${activityId}/cancel`, { method: 'POST' }, directorCookie)).response.status).toBe(409);
    const change = await request(`/activities/${activityId}/change-requests`, { method: 'POST', body: JSON.stringify({
      reason: 'Se requiere ajustar el nombre para comunicar mejor el propósito.',
      changes: { title: `Cambio autorizado ${marker}`, expectedVersion: approvedBody.version, changeReason: 'Solicitud formal del director' }
    }) }, directorCookie);
    expect(change.response.status).toBe(201);
    const changeId = (change.body as { id: string }).id;
    const queue = await request('/activity-change-requests?status=PENDING', {}, secretaryCookie);
    expect((queue.body as { items: Array<{ id: string }> }).items.some((item) => item.id === changeId)).toBe(true);
    const decision = await request(`/activity-change-requests/${changeId}/decision`, { method: 'POST', body: JSON.stringify({
      decision: 'APPROVE', notes: 'Cambio revisado y autorizado por la secretaría de la junta.'
    }) }, secretaryCookie);
    expect((decision.body as { status: string }).status).toBe('APPLIED');
    const final = await request(`/activities/${activityId}`, {}, directorCookie);
    expect(final.body).toMatchObject({ title: `Cambio autorizado ${marker}`, status: 'APPROVED' });
    await request(`/activities/${activityId}/cancel`, { method: 'POST' });
    await request(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
    await request(`/departments/${departmentId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
  });

  it('revoca permisos de una sesión abierta inmediatamente', async () => {
    const users = (await request('/users')).body as { items: Array<{ id: string; email: string; department_ids: string[] }> };
    const leader = users.items.find((item) => item.email === 'jovenes@central.local');
    expect(leader).toBeDefined();
    const leaderCookie = await login('jovenes@central.local', 'Actividad!2026');
    await request(`/users/${leader!.id}`, { method: 'PATCH', body: JSON.stringify({ assignedRoles: ['VIEWER'] }) });
    try {
      const denied = await request('/activities', { method: 'POST', body: JSON.stringify({
        title: 'No debe crearse', description: 'La sesión perdió su permiso de escritura.', departmentId: departmentIds[0], responsibleName: 'Sin permiso',
        options: [{ label: 'Principal', preference: 1, sessions: [{ startsAt: new Date(Date.now() + 400 * 86400_000).toISOString(), endsAt: new Date(Date.now() + 400 * 86400_000 + 3600_000).toISOString(), setupMinutes: 0, teardownMinutes: 0 }] }]
      }) }, leaderCookie);
      expect(denied.response.status).toBe(403);
    } finally {
      await request(`/users/${leader!.id}`, { method: 'PATCH', body: JSON.stringify({ assignedRoles: ['DEPARTMENT_LEADER'], memberships: leader!.department_ids.map((departmentId) => ({ departmentId, role: 'DIRECTOR' })) }) });
    }
  });

  it('acepta webhooks Meta firmados y rechaza cualquier alteración', async () => {
    const secret = process.env.WHATSAPP_APP_SECRET ?? 'gestionchurch-meta-development-secret';
    const body = JSON.stringify({ id: randomUUID(), entry: [] });
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const accepted = await fetch(`${apiUrl}/webhooks/meta`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-hub-signature-256': signature }, body
    });
    expect(accepted.status).toBe(201);
    const rejected = await fetch(`${apiUrl}/webhooks/meta`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-hub-signature-256': signature }, body: `${body} `
    });
    expect(rejected.status).toBe(401);
  });

  it('publica turnos de ancianos como capa informativa sin ocupar disponibilidad', async () => {
    const context = await request('/elders/context');
    expect(context.response.status).toBe(200);
    const people = (context.body as { people: Array<{ id: string }> }).people;
    expect(people.length).toBeGreaterThanOrEqual(2);

    const start = new Date('2028-05-07T14:00:00.000Z');
    const end = new Date('2028-05-07T16:00:00.000Z');
    const availabilityPath = `/availability?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&venueId=${venueId}`;
    const before = await request(availabilityPath);
    const created = await request('/elders/rotations', {
      method: 'POST',
      body: JSON.stringify({
        title: `Cobertura E2E ${Date.now()}`,
        startsOn: '2028-05-07',
        endsOn: '2028-05-13',
        elderIds: people.slice(0, 2).map((item) => item.id),
        notes: 'Turno de cobertura que no reserva lugar ni equipo.'
      })
    });
    expect(created.response.status).toBe(201);
    expect((created.body as { message: string }).message).toContain('sin generar conflictos');
    const after = await request(availabilityPath);
    expect((after.body as { available: boolean }).available).toBe((before.body as { available: boolean }).available);
    const agenda = await request(`/elders/calendar?from=${encodeURIComponent('2028-05-01T00:00:00.000Z')}&to=${encodeURIComponent('2028-05-31T23:59:59.000Z')}`);
    expect((agenda.body as { items: Array<{ id: string; informational: boolean }> }).items.some((item) => item.id === (created.body as { id: string }).id && item.informational)).toBe(true);
    await request(`/elders/rotations/${(created.body as { id: string }).id}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) });
  });

  it('permite al primer anciano generar y administrar el calendario anual completo', async () => {
    const firstElderCookie = await login('primeranciano@central.local', 'Actividad!2026');
    const context = await request('/elders/context', {}, firstElderCookie);
    const people = (context.body as { access: { manager: boolean }; people: Array<{ id: string }> });
    expect(people.access.manager).toBe(true);
    expect(people.people.length).toBeGreaterThanOrEqual(2);
    const generated = await request('/elders/rotations/annual-plan', {
      method: 'POST',
      body: JSON.stringify({
        year: 2029,
        elderIds: people.people.slice(0, 2).map((item) => item.id),
        eldersPerWeek: 2,
        notes: 'Calendario anual creado por el primer anciano.'
      })
    }, firstElderCookie);
    expect(generated.response.status).toBe(201);
    const result = generated.body as { createdIds: string[]; createdCount: number; totalWeeks: number; informationalOnly: boolean };
    expect(result.createdCount).toBeGreaterThanOrEqual(52);
    expect(result.createdCount).toBe(result.totalWeeks);
    expect(result.informationalOnly).toBe(true);
    const annual = await request(`/elders/rotations?from=${encodeURIComponent('2029-01-01T00:00:00.000Z')}&to=${encodeURIComponent('2029-12-31T23:59:59.000Z')}`, {}, firstElderCookie);
    expect((annual.body as { items: Array<{ id: string }> }).items.filter((item) => result.createdIds.includes(item.id))).toHaveLength(result.createdCount);
    for (const id of result.createdIds) await request(`/elders/rotations/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) }, firstElderCookie);
  });

  it('conecta ancianos con departamentos durante una vigencia auditable', async () => {
    const context = await request('/elders/context');
    const payload = context.body as {
      people: Array<{ id: string }>;
      departments: Array<{ id: string; name: string }>;
      departmentAssignments: Array<{ departmentName: string; elderName: string; status: string }>;
    };
    expect(payload.departmentAssignments.length).toBeGreaterThanOrEqual(4);
    expect(payload.departmentAssignments.some((item) => item.departmentName === 'Jóvenes' && item.elderName === 'Raúl Pérez')).toBe(true);

    const created = await request('/elders/department-assignments', {
      method: 'POST',
      body: JSON.stringify({
        elderId: payload.people[0]!.id,
        departmentIds: [payload.departments.find((item) => item.name === 'Mayordomía')!.id],
        startsOn: '2028-01-01',
        endsOn: '2028-12-31',
        notes: 'Cobertura E2E de acompañamiento ministerial.'
      })
    });
    expect(created.response.status).toBe(201);
    const assignmentId = (created.body as { ids: string[] }).ids[0]!;
    const listed = await request(`/elders/department-assignments?from=${encodeURIComponent('2028-01-01T00:00:00.000Z')}&to=${encodeURIComponent('2028-12-31T23:59:59.000Z')}`);
    expect((listed.body as { items: Array<{ id: string }> }).items.some((item) => item.id === assignmentId)).toBe(true);
    const closed = await request(`/elders/department-assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify({ status: 'INACTIVE' }) });
    expect(closed.response.status).toBe(200);
  });

  it('diseña la plataforma, aplica plantillas y guarda el orden minuto a minuto', async () => {
    const context = await request('/elders/context');
    const elderData = context.body as {
      people: Array<{ id: string; name: string }>;
      participants: Array<{ id: string; name: string }>;
      templates: Array<{ id: string; serviceType: string; isSystem: boolean; items: Array<{ title: string }> }>;
    };
    expect(elderData.templates.filter((item) => item.isSystem).map((item) => item.serviceType)).toEqual(expect.arrayContaining(['SABBATH', 'WEDNESDAY']));
    expect(elderData.participants.length).toBeGreaterThan(elderData.people.length);

    const program = await request('/elders/programs', {
      method: 'POST', body: JSON.stringify({
        elderId: elderData.people[0]!.id,
        serviceAt: '2030-05-04T13:00:00.000Z',
        endsAt: '2030-05-04T16:00:00.000Z',
        serviceType: 'SABBATH',
        title: `Culto con plataforma E2E ${Date.now()}`,
        preacherName: 'Predicador E2E', singerName: '', hymn: 'Santo, santo, santo', bibleReading: 'Apocalipsis 14:6-7', notes: '', status: 'DRAFT'
      })
    });
    expect(program.response.status).toBe(201);
    const programId = (program.body as { id: string }).id;
    const sabbathTemplate = elderData.templates.find((item) => item.serviceType === 'SABBATH' && item.isSystem)!;
    const applied = await request(`/elders/programs/${programId}/platform/apply-template`, {
      method: 'POST', body: JSON.stringify({ templateId: sabbathTemplate.id })
    });
    expect(applied.response.status).toBe(201);
    const appliedPlan = applied.body as { items: Array<Record<string, unknown>>; platformMembers: unknown[] };
    expect(appliedPlan.items.length).toBeGreaterThanOrEqual(10);
    expect(appliedPlan.platformMembers).toHaveLength(0);

    const platformPeople = elderData.participants.slice(0, 2);
    const saved = await request(`/elders/programs/${programId}/platform`, {
      method: 'PATCH', body: JSON.stringify({
        platformMembers: platformPeople.map((person, index) => ({ userId: person.id, displayName: person.name, roleLabel: index === 0 ? 'Director de plataforma' : 'Apoyo de plataforma', isLead: index === 0 })),
        items: appliedPlan.items.map((item, index) => ({
          templateItemId: item.templateItemId,
          title: item.title,
          participationType: item.participationType,
          startsAt: item.startsAt,
          durationMinutes: item.durationMinutes,
          assigneeUserId: platformPeople[index % platformPeople.length]!.id,
          assigneeName: platformPeople[index % platformPeople.length]!.name,
          notes: item.notes,
          status: 'READY'
        }))
      })
    });
    expect(saved.response.status).toBe(200);
    const savedPlan = saved.body as { platformMembers: Array<{ isLead: boolean }>; items: Array<{ status: string; startsAt: string }>; message: string };
    expect(savedPlan.platformMembers).toHaveLength(2);
    expect(savedPlan.platformMembers.filter((item) => item.isLead)).toHaveLength(1);
    expect(savedPlan.items.every((item) => item.status === 'READY')).toBe(true);
    expect(savedPlan.items.map((item) => new Date(item.startsAt).getTime())).toEqual([...savedPlan.items.map((item) => new Date(item.startsAt).getTime())].sort((a, b) => a - b));
    expect(savedPlan.message).toContain('trazabilidad completa');

    const customTemplate = await request('/elders/platform/templates', {
      method: 'POST', body: JSON.stringify({
        name: `Plantilla E2E ${Date.now()}`, serviceType: 'WEDNESDAY', description: 'Orden local reutilizable.',
        items: [{ title: 'Bienvenida y oración', participationType: 'WELCOME', durationMinutes: 8, instructions: 'Inicio coordinado.', required: true }]
      })
    });
    expect(customTemplate.response.status).toBe(201);
    const refreshed = await request('/elders/platform/templates');
    expect((refreshed.body as { items: Array<{ id: string }> }).items.some((item) => item.id === (customTemplate.body as { id: string }).id)).toBe(true);
  });

  it('gestiona documentos departamentales con visor, alineación y aislamiento', async () => {
    const context = await request('/files/department-documents/context', {}, leaderCookie);
    expect(context.response.status).toBe(200);
    const leaderContext = context.body as { canUpload: boolean; canReview: boolean; departments: Array<{ id: string; name: string; canUpload: boolean }> };
    expect(leaderContext).toMatchObject({ canUpload: true, canReview: false });
    const youthDepartment = leaderContext.departments.find((item) => item.name === 'Jóvenes');
    expect(youthDepartment).toMatchObject({ canUpload: true });

    const title = `Programa ministerial E2E ${Date.now()}`;
    const text = 'Programa de Jóvenes\nObjetivo: servir, discipular y coordinar con el plan anual.';
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'text/plain' }), 'programa-jovenes-e2e.txt');
    form.append('departmentId', youthDepartment!.id);
    form.append('title', title);
    form.append('description', 'Programa departamental sometido desde la biblioteca integrada.');
    form.append('documentType', 'PROGRAM');
    form.append('ministryYear', '2027');
    form.append('alignmentBasis', 'ANNUAL_CHURCH_PLAN');
    form.append('alignmentReference', 'Plan anual 2027 · Objetivo 3');
    form.append('alignmentNotes', 'Conecta discipulado, servicio y coordinación del calendario.');
    form.append('visibility', 'DEPARTMENT');
    form.append('alignmentConfirmed', 'true');
    const uploaded = await request('/files/department-documents', { method: 'POST', body: form }, leaderCookie);
    expect(uploaded.response.status).toBe(201);
    const created = uploaded.body as { id: string; fileId: string; version: number; alignmentStatus: string };
    expect(created).toMatchObject({ version: 1, alignmentStatus: 'DECLARED' });

    const library = await request(`/files/department-documents?q=${encodeURIComponent(title)}`, {}, leaderCookie);
    expect(library.response.status).toBe(200);
    const item = (library.body as { items: Array<{ id: string; title: string; capabilities: { canReview: boolean; canDelete: boolean } }> }).items.find((candidate) => candidate.id === created.id);
    expect(item).toMatchObject({ title, capabilities: { canReview: false, canDelete: true } });

    const preview = await request(`/files/department-documents/${created.id}/preview`, {}, leaderCookie);
    expect(preview.response.status).toBe(200);
    expect(preview.response.headers.get('content-type')).toContain('text/html');
    expect(preview.body).toContain('servir, discipular y coordinar');
    expect(preview.response.headers.get('content-security-policy')).toContain("default-src 'none'");

    const forbiddenReview = await request(`/files/department-documents/${created.id}/alignment`, {
      method: 'PATCH', body: JSON.stringify({ status: 'VERIFIED', notes: 'Intento departamental sin permiso de revisión.' })
    }, leaderCookie);
    expect(forbiddenReview.response.status).toBe(403);

    const reviewed = await request(`/files/department-documents/${created.id}/alignment`, {
      method: 'PATCH', body: JSON.stringify({ status: 'VERIFIED', notes: 'Revisado contra el plan anual vigente por liderazgo autorizado.' })
    });
    expect(reviewed.response.status).toBe(200);
    expect(reviewed.body).toMatchObject({ id: created.id, alignmentStatus: 'VERIFIED' });

    const downloaded = await request(`/files/${created.fileId}/download`, {}, leaderCookie);
    expect(downloaded.response.status).toBe(200);
    expect(downloaded.body).toBe(text);

    const infantCookie = await login('infantil@central.local', 'Actividad!2026');
    const isolated = await request(`/files/department-documents/${created.id}/preview`, {}, infantCookie);
    expect(isolated.response.status).toBe(403);
    const infantLibrary = await request(`/files/department-documents?q=${encodeURIComponent(title)}`, {}, infantCookie);
    expect((infantLibrary.body as { items: unknown[] }).items).toHaveLength(0);

    const removed = await request(`/files/department-documents/${created.id}`, { method: 'DELETE' }, leaderCookie);
    expect(removed.response.status).toBe(200);
    expect(removed.body).toEqual({ id: created.id, deleted: true });
  });

  it('entrega correo real contra un servidor SMTP local de contrato', async () => {
    const messages: string[] = [];
    const server = new SMTPServer({
      secure: false,
      authOptional: true,
      disabledCommands: ['STARTTLS', 'AUTH'],
      onData(stream, _session, callback) {
        let message = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => { message += chunk; });
        stream.on('end', () => { messages.push(message); callback(); });
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(1025, '127.0.0.1', () => resolve());
    });
    const marker = `SMTP-${randomUUID()}`;
    const eventId = randomUUID();
    const eventBody = JSON.stringify({ id: eventId, type: 'activity.submitted', aggregateId: randomUUID(), payload: { title: marker, email: 'quality@gestionchurch.local' } });
    try {
      const response = await fetch('http://127.0.0.1:4015/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret', 'x-tenant-id': tenantId },
        body: eventBody
      });
      expect(response.status).toBe(201);
      expect(messages.some((message) => message.includes(marker))).toBe(true);
      const duplicate = await fetch('http://127.0.0.1:4015/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret', 'x-tenant-id': tenantId },
        body: eventBody
      });
      expect(duplicate.status).toBe(201);
      expect(await duplicate.json()).toEqual({ duplicate: true });
      expect(messages.filter((message) => message.includes(marker))).toHaveLength(1);

      const forbidden = await request('/notifications/channels/settings', {}, leaderCookie);
      expect(forbidden.response.status).toBe(403);
      const verifyForbidden = await request('/notifications/channels/verify/email', { method: 'POST' }, leaderCookie);
      expect(verifyForbidden.response.status).toBe(403);
      const settings = await request('/notifications/channels/settings');
      expect(settings.response.status).toBe(200);
      expect(settings.body).toMatchObject({
        tenant: { id: tenantId },
        settings: { smtpHost: '127.0.0.1', smtpPort: 1025, whatsappMode: 'simulated' }
      });
      expect((settings.body as { settings: Record<string, unknown> }).settings).not.toHaveProperty('smtpPassword');
      expect((settings.body as { settings: Record<string, unknown> }).settings).not.toHaveProperty('whatsappAccessToken');

      const privateWebhookBlocked = await request('/notifications/channels/settings', {
        method: 'PATCH', body: JSON.stringify({
          smtpHost: '127.0.0.1', smtpPort: 1025, smtpSecure: false, smtpRequireTls: false, smtpUser: null,
          smtpFromName: 'GestionChurch', smtpFromEmail: 'no-reply@gestionchurch.local', whatsappMode: 'live',
          whatsappPhoneNumberId: '123456789012345', whatsappAccessToken: 'test-access-token',
          whatsappVerifyToken: 'test-verify-token', whatsappAppSecret: 'test-app-secret',
          whatsappTemplateName: 'gestionchurch_alerta', whatsappTemplateLanguage: 'es', metaGraphVersion: 'v23.0'
        })
      });
      expect(privateWebhookBlocked.response.status).toBe(400);
      expect(JSON.stringify(privateWebhookBlocked.body)).toContain('HTTPS pública');

      const emailVerification = await request('/notifications/channels/verify/email', { method: 'POST' });
      expect(emailVerification.response.status).toBe(201);
      expect(emailVerification.body).toMatchObject({ channel: 'EMAIL', status: 'VERIFIED' });

      const emailTest = await request('/notifications/channels/test/email', {
        method: 'POST', body: JSON.stringify({ recipient: 'quality@gestionchurch.local' })
      });
      expect(emailTest.response.status).toBe(201);
      expect(emailTest.body).toMatchObject({ channel: 'EMAIL', status: 'SENT' });
      expect(messages.some((message) => message.includes('Prueba de correo'))).toBe(true);

      const whatsappTest = await request('/notifications/channels/test/whatsapp', {
        method: 'POST', body: JSON.stringify({ phone: '+18095551234' })
      });
      expect(whatsappTest.response.status).toBe(201);
      expect(whatsappTest.body).toMatchObject({ channel: 'WHATSAPP', status: 'SIMULATED' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
