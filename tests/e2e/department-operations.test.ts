import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools, getTenantRecord, getTenantPool } from '@gc/database';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';
let cookie = '';
afterAll(async () => { await closePools(); });

async function request(path: string, options: RequestInit = {}) {
	const response = await fetch(`${apiUrl}${path}`, {
		...options,
		headers: {
			...(options.body ? { 'content-type': 'application/json' } : {}),
			cookie,
			...options.headers,
		},
	});
	const contentType = response.headers.get('content-type') ?? '';
	const body = contentType.includes('json')
		? await response.json()
		: contentType.includes('text')
			? await response.text()
			: await response.arrayBuffer();
	return { response, body };
}

beforeAll(async () => {
	const response = await fetch(`${apiUrl}/auth/login`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			tenant: 'central',
			email: 'admin@central.local',
			password: 'GestionChurch!2026',
		}),
	});
	expect(response.status).toBe(201);
	cookie = response.headers.get('set-cookie')!.split(';')[0]!;
});

describe('Espacios departamentales end-to-end', () => {
	it('publica un catálogo de aplicaciones derivado de roles y departamentos', async () => {
		const current = await request('/me');
		expect(current.response.status).toBe(200);
		const user = (current.body as {
			user: {
				moduleAccess: string[];
				departmentApps: Array<{ key: string; href: string; departmentId: string }>;
			};
		}).user;
		expect(user.moduleAccess).toEqual(
			expect.arrayContaining([
				'department-workspaces',
				'elders',
				'personal-ministries',
				'womens-ministry',
			]),
		);
		expect(user.departmentApps.length).toBeGreaterThan(0);
		expect(user.departmentApps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'elders', href: '/elders' }),
				expect.objectContaining({
					key: 'personal-ministries',
					href: '/personal-ministries',
				}),
				expect.objectContaining({
					key: 'womens-ministry',
					href: '/womens-ministry',
				}),
			]),
		);

		const leaderLogin = await fetch(`${apiUrl}/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				tenant: 'central',
				email: 'mision@central.local',
				password: 'Actividad!2026',
			}),
		});
		expect(leaderLogin.status).toBe(201);
		const leaderCookie = leaderLogin.headers.get('set-cookie')!.split(';')[0]!;
		const leaderMe = await fetch(`${apiUrl}/me`, {
			headers: { cookie: leaderCookie },
		});
		expect(leaderMe.status).toBe(200);
		const leader = (await leaderMe.json() as {
			user: { moduleAccess: string[]; departmentApps: Array<{ key: string; departmentId: string }> };
		}).user;
		expect(leader.moduleAccess).toEqual(
			expect.arrayContaining(['department-workspaces', 'personal-ministries']),
		);
		expect(leader.moduleAccess).not.toContain('womens-ministry');
		expect(leader.departmentApps.map((item) => item.key)).toEqual([
			'personal-ministries',
		]);
		const ownContext = await fetch(`${apiUrl}/department-operations/context`, { headers: { cookie: leaderCookie } });
		expect(ownContext.status).toBe(200);
		const assigned = await ownContext.json() as { workspaces: Array<{ departmentId: string }> };
		expect(assigned.workspaces.map((item) => item.departmentId)).toEqual(leader.departmentApps.map((item) => item.departmentId));
		const otherDepartment = user.departmentApps.find((item) => item.key === 'womens-ministry')!;
		const denied = await fetch(`${apiUrl}/department-operations/context?departmentId=${otherDepartment.departmentId}`, { headers: { cookie: leaderCookie } });
		expect(denied.status).toBe(403);
		const deniedBody = await denied.json();
		expect(deniedBody).not.toHaveProperty('selected');
		const specializedDenied = await fetch(`${apiUrl}/womens-ministry/context`, { headers: { cookie: leaderCookie } });
		expect(specializedDenied.status).toBe(403);
		const unknownDepartment = await request('/department-operations/context?departmentId=00000000-0000-4000-8000-000000000000');
		expect(unknownDepartment.response.status).toBe(403);
		const invalidDepartment = await request('/department-operations/context?departmentId=invalid');
		expect(invalidDepartment.response.status).toBe(400);
		const ozama = await getTenantRecord('ozama');
		if (ozama) {
			const foreign = await getTenantPool(ozama).query<{ id: string }>('SELECT id FROM calendar.departments WHERE active ORDER BY name LIMIT 1');
			expect(foreign.rows.length).toBe(1);
			const foreignContext = await request(`/department-operations/context?departmentId=${foreign.rows[0]!.id}`);
			expect(foreignContext.response.status).toBe(403);
			expect(foreignContext.body).not.toHaveProperty('selected');
			expect(user.departmentApps.map((item) => item.departmentId)).not.toContain(foreign.rows[0]!.id);
		}
	});

	it('conecta estrategia, ejecución, finanzas, colaboración, gobierno, reportes y auditoría', async () => {
		const stamp = Date.now();
		const initial = await request('/department-operations/context');
		expect(initial.response.status).toBe(200);
		const context = initial.body as {
			selected: {
				id: string;
				departmentId: string;
				pack: { recordTypes: Array<{ type: string }> };
			};
			team: Array<{ id: string }>;
			workspaces: Array<{ id: string }>;
		};
		expect(context.workspaces.length).toBeGreaterThan(0);
		const workspaceId = context.selected.id;
		const teamMember = context.team[0];

		const plan = await request('/department-operations/plans', {
			method: 'POST',
			body: JSON.stringify({
				workspaceId,
				title: `Plan ministerial E2E ${stamp}`,
				year: 2027,
				vision: 'Servir con orden, propósito y evidencia.',
				mission:
					'Coordinar el ministerio sin sustituir el gobierno de la iglesia.',
				ownerId: teamMember?.id ?? null,
			}),
		});
		expect(plan.response.status).toBe(201);
		const planId = (plan.body as { id: string }).id;
		expect(
			(
				await request(`/department-operations/plans/${planId}/approve`, {
					method: 'POST',
				})
			).response.status,
		).toBe(201);

		expect(
			(
				await request('/department-operations/objectives', {
					method: 'POST',
					body: JSON.stringify({
						planId,
						title: `Objetivo E2E ${stamp}`,
						description: 'Resultado verificable del periodo.',
						targetValue: 100,
						unit: '%',
						dueOn: '2027-12-15',
						ownerId: teamMember?.id ?? null,
					}),
				})
			).response.status,
		).toBe(201);

		const initiative = await request('/department-operations/initiatives', {
			method: 'POST',
			body: JSON.stringify({
				workspaceId,
				planId,
				calendarActivityId: null,
				initiativeType: 'PROGRAM',
				title: `Programa E2E ${stamp}`,
				description: 'Programa integral de validación.',
				objective: 'Demostrar conexión real entre todos los componentes.',
				startsOn: '2027-02-01',
				endsOn: '2027-03-30',
				priority: 'HIGH',
				plannedBudget: 50000,
				currency: 'DOP',
				ownerId: teamMember?.id ?? null,
			}),
		});
		expect(initiative.response.status).toBe(201);
		const initiativeId = (initiative.body as { id: string }).id;

		if (teamMember) {
			expect(
				(
					await request(
						`/department-operations/initiatives/${initiativeId}/assignments`,
						{
							method: 'POST',
							body: JSON.stringify({
								userId: teamMember.id,
								responsibility: 'Coordinar la ejecución E2E',
								status: 'ASSIGNED',
							}),
						},
					)
				).response.status,
			).toBe(201);
		}

		expect(
			(
				await request('/department-operations/budget', {
					method: 'POST',
					body: JSON.stringify({
						workspaceId,
						initiativeId,
						entryType: 'EXPENSE',
						category: 'Materiales',
						description: 'Material operativo E2E',
						amount: 7500,
						occurredOn: '2027-02-05',
						status: 'PAID',
						vendor: 'Proveedor E2E',
						reference: `E2E-${stamp}`,
					}),
				})
			).response.status,
		).toBe(201);

		const task = await request('/department-operations/tasks', {
			method: 'POST',
			body: JSON.stringify({
				workspaceId,
				initiativeId,
				title: `Tarea E2E ${stamp}`,
				description: 'Entregable con responsable y vencimiento.',
				assignedTo: teamMember?.id ?? null,
				dueAt: '2027-02-15T22:00:00.000Z',
				priority: 'HIGH',
			}),
		});
		expect(task.response.status).toBe(201);
		const taskId = (task.body as { id: string }).id;
		expect(
			(
				await request(`/department-operations/tasks/${taskId}`, {
					method: 'PATCH',
					body: JSON.stringify({ status: 'IN_PROGRESS' }),
				})
			).response.status,
		).toBe(200);

		const meeting = await request('/department-operations/meetings', {
			method: 'POST',
			body: JSON.stringify({
				workspaceId,
				title: `Reunión E2E ${stamp}`,
				scheduledAt: '2027-02-10T22:00:00.000Z',
				endsAt: '2027-02-10T23:00:00.000Z',
				location: 'Sala de juntas',
				agenda: 'Revisar objetivo, presupuesto, tareas y evidencia.',
				participantIds: teamMember ? [teamMember.id] : [],
			}),
		});
		expect(meeting.response.status).toBe(201);
		const meetingId = (meeting.body as { id: string }).id;
		expect(
			(
				await request(`/department-operations/meetings/${meetingId}`, {
					method: 'PATCH',
					body: JSON.stringify({
						status: 'CLOSED',
						minutes:
							'Se revisó la ejecución y se aprobaron los próximos pasos.',
					}),
				})
			).response.status,
		).toBe(200);

		expect(
			(
				await request('/department-operations/decisions', {
					method: 'POST',
					body: JSON.stringify({
						workspaceId,
						meetingId,
						initiativeId,
						title: `Acuerdo E2E ${stamp}`,
						decisionText:
							'Continuar la iniciativa conforme al presupuesto y las responsabilidades aprobadas.',
						authorityType: 'DEPARTMENT',
						decidedOn: '2027-02-10',
						effectiveOn: '2027-02-11',
						evidenceReference: `ACTA-${stamp}`,
					}),
				})
			).response.status,
		).toBe(201);

		expect(
			(
				await request('/department-operations/comments', {
					method: 'POST',
					body: JSON.stringify({
						workspaceId,
						resourceType: 'INITIATIVE',
						resourceId: initiativeId,
						body: 'Avance validado; mantener informada a la persona responsable.',
						mentionUserIds: teamMember ? [teamMember.id] : [],
					}),
				})
			).response.status,
		).toBe(201);

		expect(
			(
				await request('/department-operations/kpis', {
					method: 'POST',
					body: JSON.stringify({
						workspaceId,
						name: `Indicador E2E ${stamp}`,
						description: 'Cumplimiento del programa.',
						targetValue: 100,
						currentValue: 35,
						unit: '%',
						periodStart: '2027-01-01',
						periodEnd: '2027-12-31',
					}),
				})
			).response.status,
		).toBe(201);

		const recordType = context.selected.pack.recordTypes[0]?.type;
		if (recordType) {
			expect(
				(
					await request('/department-operations/records', {
						method: 'POST',
						body: JSON.stringify({
							workspaceId,
							recordType,
							title: `Registro E2E ${stamp}`,
							recordDate: '2027-02-10',
							visibility: 'TEAM',
							ownerId: teamMember?.id ?? null,
							data: {
								notes: 'Evidencia operativa validada.',
								reference: `REF-${stamp}`,
							},
						}),
					})
				).response.status,
			).toBe(201);
		}

		const final = await request(
			`/department-operations/context?departmentId=${context.selected.departmentId}`,
		);
		expect(final.response.status).toBe(200);
		expect(final.body).toEqual(
			expect.objectContaining({
				metrics: expect.objectContaining({
					activePlans: expect.any(Number),
					activeInitiatives: expect.any(Number),
				}),
				forecast: expect.objectContaining({
					riskLevel: expect.stringMatching(/LOW|MEDIUM|HIGH/),
				}),
			}),
		);
		expect(
			(
				final.body as {
					initiatives: Array<{ id: string; spentBudget: number }>;
					comments: Array<{ resourceId: string }>;
				}
			).initiatives.find((item) => item.id === initiativeId),
		).toMatchObject({ spentBudget: 7500 });
		expect(
			(final.body as { comments: Array<{ resourceId: string }> }).comments.some(
				(item) => item.resourceId === initiativeId,
			),
		).toBe(true);

		const pdf = await request(
			`/department-operations/reports/executive.pdf?workspaceId=${workspaceId}`,
		);
		expect(pdf.response.status).toBe(200);
		expect(pdf.response.headers.get('content-type')).toContain(
			'application/pdf',
		);
		expect((pdf.body as ArrayBuffer).byteLength).toBeGreaterThan(1000);
		const csv = await request(
			`/department-operations/reports/executive.csv?workspaceId=${workspaceId}`,
		);
		expect(csv.response.status).toBe(200);
		expect(String(csv.body)).toContain(`Programa E2E ${stamp}`);

		const audit = await request(
			'/audit/events?action=department_operations.report.exported&pageSize=10',
		);
		expect(audit.response.status).toBe(200);
		expect((audit.body as { items: Array<{ action: string }> }).items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					action: 'department_operations.report.exported',
				}),
			]),
		);
	});
});
