import { beforeAll, describe, expect, it } from 'vitest';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';
let cookie = '';

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), cookie, ...options.headers }
  });
  const body = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : await response.text();
  return { response, body };
}

beforeAll(async () => {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'central', email: 'admin@central.local', password: 'GestionChurch!2026' })
  });
  expect(response.status).toBe(201);
  cookie = response.headers.get('set-cookie')!.split(';')[0]!;
});

describe('Presupuesto de Ministerios Personales', () => {
  it('controla presupuesto, compromisos, gastos, ingresos, proyección y auditoría por actividad', async () => {
    const stamp = Date.now();
    const created = await request('/personal-ministries/initiatives', {
      method: 'POST',
      body: JSON.stringify({
        title: `Actividad presupuestaria E2E ${stamp}`, description: 'Validación financiera integral.', scope: 'LOCAL', initiativeType: 'MISSIONARY',
        startsOn: '2029-02-01', endsOn: '2029-02-28', priority: 'HIGH', targetCount: 100, plannedBudget: 50000, currency: 'DOP',
        assigneeId: null, responsibility: '', workloadPercent: 0
      })
    });
    expect(created.response.status).toBe(201);
    expect(created.body).toMatchObject({ plannedBudget: 50000, currency: 'DOP' });
    const initiativeId = (created.body as { id: string }).id;

    const commitment = await request(`/personal-ministries/initiatives/${initiativeId}/budget-entries`, {
      method: 'POST', body: JSON.stringify({ entryType: 'COMMITMENT', category: 'Logística', description: 'Reserva de transporte', amount: 12000, occurredOn: '2029-02-01', vendor: 'Transporte Misión', reference: `COT-${stamp}`, notes: 'Cotización aprobada.', status: 'APPROVED' })
    });
    expect(commitment.response.status).toBe(201);

    const expense = await request(`/personal-ministries/initiatives/${initiativeId}/budget-entries`, {
      method: 'POST', body: JSON.stringify({ entryType: 'EXPENSE', category: 'Materiales', description: 'Literatura misionera', amount: 8500, occurredOn: '2029-02-03', vendor: 'Librería', reference: `FAC-${stamp}`, notes: '', status: 'PAID' })
    });
    expect(expense.response.status).toBe(201);

    const income = await request(`/personal-ministries/initiatives/${initiativeId}/budget-entries`, {
      method: 'POST', body: JSON.stringify({ entryType: 'INCOME', category: 'Donación', description: 'Aporte para evangelismo', amount: 5000, occurredOn: '2029-02-04', vendor: 'Donante autorizado', reference: `ING-${stamp}`, notes: '', status: 'PAID' })
    });
    expect(income.response.status).toBe(201);

    const context = await request('/personal-ministries/context');
    expect(context.response.status).toBe(200);
    const initiative = (context.body as { initiatives: Array<Record<string, unknown>> }).initiatives.find((item) => item.id === initiativeId);
    expect(initiative).toMatchObject({ plannedBudget: 50000, committedBudget: 12000, spentBudget: 8500, incomeBudget: 5000, forecastBudget: 20500, availableBudget: 34500 });

    const commitmentId = (commitment.body as { id: string }).id;
    const voided = await request(`/personal-ministries/budget-entries/${commitmentId}`, { method: 'PATCH', body: JSON.stringify({ status: 'VOID' }) });
    expect(voided.response.status).toBe(200);
    expect(voided.body).toMatchObject({ status: 'VOID' });

    const updated = await request(`/personal-ministries/initiatives/${initiativeId}`, { method: 'PATCH', body: JSON.stringify({ plannedBudget: 60000, currency: 'DOP' }) });
    expect(updated.response.status).toBe(200);
    expect(updated.body).toMatchObject({ plannedBudget: 60000, currency: 'DOP' });

    const finalContext = await request('/personal-ministries/context');
    const finalInitiative = (finalContext.body as { initiatives: Array<Record<string, unknown>> }).initiatives.find((item) => item.id === initiativeId);
    expect(finalInitiative).toMatchObject({ plannedBudget: 60000, committedBudget: 0, spentBudget: 8500, incomeBudget: 5000, forecastBudget: 8500, availableBudget: 56500 });

    const audit = await request('/audit/events?action=personal_ministries.budget_entry.updated&pageSize=20');
    expect(audit.response.status).toBe(200);
    expect((audit.body as { items: Array<{ resource_id: string }> }).items).toEqual(expect.arrayContaining([expect.objectContaining({ resource_id: commitmentId })]));
  });
});
