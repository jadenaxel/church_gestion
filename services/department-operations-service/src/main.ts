import 'reflect-metadata';
import type { Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import PDFDocument from 'pdfkit';
import {
	Body,
	Controller,
	Get,
	Module,
	Param,
	Patch,
	Post,
	Query,
	Req,
	Res,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import type { AuthPrincipal } from '@gc/contracts';
import { controlPool, tenantPoolFromId } from '@gc/database';
import { activeDomainClient, atomicDomainMutation, domainTransaction } from '../../shared/atomic-domain-mutation.js';
import { dispatchDepartmentNotifications, enqueueDepartmentNotification, recoverDepartmentNotification } from './notification-outbox.js';
import {
	activityReadPredicate,
	bootstrapNest,
	currentUser,
	HEALTH_RESPONSE,
	JwtAuthGuard,
	Public,
	requirePermission,
	safeCsvCell,
} from '@gc/platform';
import {
	canReadMinistryRecord,
	departmentAccess as accessFor,
  effectiveRecordVisibility,
	type DepartmentAccess as Access,
} from './authorization.js';
import { budgetCurrencyTotals, departmentReportInstant, departmentReportStatus, departmentReportText } from './report-localization.js';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_department_operations_service';

type RecordDefinition = {
	type: string;
	label: string;
	description: string;
	privacy?: 'TEAM' | 'LEADERSHIP' | 'RESTRICTED';
};
type CapabilityPack = {
	key: string;
	title: string;
	purpose: string;
	accent: string;
	recordTypes: RecordDefinition[];
	guidance: string[];
};

const commonGuidance = [
	'La planificación apoya la misión y permanece sujeta a los acuerdos de la iglesia local.',
	'Toda decisión relevante conserva autoridad, aprobador, fecha y evidencia.',
	'El calendario central valida disponibilidad y conflictos antes de confirmar actividades.',
];

const capabilityPacks: Record<string, CapabilityPack> = {
	GENERAL: {
		key: 'GENERAL',
		title: 'Operaciones departamentales',
		purpose:
			'Planificar, colaborar y demostrar resultados durante todo el año.',
		accent: '#08776a',
		recordTypes: [
			{
				type: 'PROGRAM',
				label: 'Programa',
				description: 'Programa departamental y sus resultados.',
			},
			{
				type: 'SERVICE_LOG',
				label: 'Registro de servicio',
				description: 'Evidencia de una acción realizada.',
			},
			{
				type: 'RESOURCE',
				label: 'Recurso',
				description: 'Recurso operativo o necesidad del equipo.',
			},
		],
		guidance: commonGuidance,
	},
	ELDERS_OPERATIONS: {
		key: 'ELDERS_OPERATIONS',
		title: 'Ancianos',
		purpose:
			'Coordinar cobertura pastoral, turnos, plataformas y programas de culto.',
		accent: '#116a61',
		recordTypes: [
			{ type: 'PASTORAL_COORDINATION', label: 'Coordinación pastoral', description: 'Cobertura, responsable y seguimiento ministerial.', privacy: 'LEADERSHIP' },
			{ type: 'WORSHIP_PLATFORM', label: 'Plataforma de culto', description: 'Participantes, funciones y minuto a minuto del servicio.' },
			{ type: 'ELDER_ROTATION', label: 'Turno de ancianos', description: 'Semana, ancianos asignados y responsabilidades.' },
			{ type: 'CARE_FOLLOW_UP', label: 'Seguimiento de cuidado', description: 'Seguimiento mínimo y confidencial.', privacy: 'RESTRICTED' },
		],
		guidance: [
			...commonGuidance,
			'La agenda especializada de ancianos administra los turnos y programas sin crear conflictos artificiales.',
		],
	},
	PERSONAL_MINISTRIES: {
		key: 'PERSONAL_MINISTRIES',
		title: 'Ministerios Personales',
		purpose:
			'Coordinar evangelismo, estudios bíblicos, grupos pequeños, campañas y equipo misionero.',
		accent: '#2563a9',
		recordTypes: [
			{ type: 'MISSIONARY_INITIATIVE', label: 'Iniciativa misionera', description: 'Alcance, responsables y resultados.' },
			{ type: 'BIBLE_STUDY_SUMMARY', label: 'Estudios bíblicos', description: 'Seguimiento agregado y responsable.', privacy: 'LEADERSHIP' },
			{ type: 'SMALL_GROUP', label: 'Grupo pequeño', description: 'Liderazgo, zona y actividad.' },
			{ type: 'EVANGELISTIC_CAMPAIGN', label: 'Campaña evangelística', description: 'Periodo, equipo, metas y resultados.' },
		],
		guidance: [
			...commonGuidance,
			'La aplicación especializada conserva el seguimiento de interesados con acceso por necesidad ministerial.',
		],
	},
	WOMENS_MINISTRY: {
		key: 'WOMENS_MINISTRY',
		title: 'Ministerio de la Mujer',
		purpose:
			'Planificar programas, presupuesto, participación, retiros, inclusión y acompañamiento.',
		accent: '#a43f79',
		recordTypes: [
			{ type: 'WOMENS_PROGRAM', label: 'Programa para mujeres', description: 'Audiencia, objetivo y participación.' },
			{ type: 'RETREAT', label: 'Retiro espiritual', description: 'Asistencia, pagos y coordinación.', privacy: 'LEADERSHIP' },
			{ type: 'INCLUSION_FOLLOW_UP', label: 'Seguimiento de inclusión', description: 'Acompañamiento y próxima acción.', privacy: 'RESTRICTED' },
			{ type: 'BIRTHDAY_CARE', label: 'Cuidado de cumpleaños', description: 'Acción de acompañamiento planificada.', privacy: 'LEADERSHIP' },
		],
		guidance: [
			...commonGuidance,
			'El padrón y los cumpleaños se muestran únicamente al equipo autorizado y con datos mínimos.',
		],
	},
	SABBATH_SCHOOL: {
		key: 'SABBATH_SCHOOL',
		title: 'Escuela Sabática',
		purpose: 'Coordinar unidades, maestros, materiales, asistencia y misión.',
		accent: '#5d52c8',
		recordTypes: [
			{
				type: 'CLASS_UNIT',
				label: 'Unidad o clase',
				description: 'Unidad, rango de edad, maestro y asistente.',
			},
			{
				type: 'TEACHER_ASSIGNMENT',
				label: 'Asignación docente',
				description: 'Maestro, lección y fecha de servicio.',
			},
			{
				type: 'ATTENDANCE',
				label: 'Asistencia',
				description: 'Asistencia consolidada sin exponer datos innecesarios.',
			},
			{
				type: 'MISSION_PROJECT',
				label: 'Proyecto misionero',
				description: 'Proyecto y seguimiento de impacto.',
			},
		],
		guidance: [
			...commonGuidance,
			'Los materiales y la enseñanza deben utilizar fuentes autorizadas por la Iglesia Adventista.',
		],
	},
	WORSHIP_MUSIC: {
		key: 'WORSHIP_MUSIC',
		title: 'Música y Adoración',
		purpose:
			'Preparar repertorios, ensayos, participantes y órdenes de servicio.',
		accent: '#2e66db',
		recordTypes: [
			{
				type: 'REPERTOIRE',
				label: 'Repertorio',
				description: 'Himno, canto, tonalidad y recursos musicales.',
			},
			{
				type: 'REHEARSAL',
				label: 'Ensayo',
				description: 'Ensayo, participantes y preparación técnica.',
			},
			{
				type: 'SERVICE_SET',
				label: 'Programa musical',
				description: 'Selección musical enlazada al servicio.',
			},
			{
				type: 'EQUIPMENT',
				label: 'Equipo técnico',
				description: 'Disponibilidad y condición del equipo.',
			},
		],
		guidance: [
			...commonGuidance,
			'La selección musical se coordina con el responsable del culto y su propósito espiritual.',
		],
	},
	DEACONRY: {
		key: 'DEACONRY',
		title: 'Diáconos y Diaconisas',
		purpose:
			'Coordinar turnos, preparación del templo, servicios y necesidades de atención.',
		accent: '#b87613',
		recordTypes: [
			{
				type: 'DUTY_ROTATION',
				label: 'Turno de servicio',
				description: 'Responsables, fecha y área de servicio.',
			},
			{
				type: 'ORDINANCE_PREPARATION',
				label: 'Preparación de ceremonia',
				description: 'Lista de verificación y responsables.',
				privacy: 'LEADERSHIP',
			},
			{
				type: 'FACILITY_READINESS',
				label: 'Preparación del templo',
				description: 'Condición y necesidades de las instalaciones.',
			},
			{
				type: 'CARE_REQUEST',
				label: 'Necesidad de atención',
				description: 'Seguimiento pastoral o práctico.',
				privacy: 'RESTRICTED',
			},
		],
		guidance: [
			...commonGuidance,
			'Las necesidades personales se registran con privacidad y acceso mínimo necesario.',
		],
	},
	CHILDREN_YOUTH: {
		key: 'CHILDREN_YOUTH',
		title: 'Infancia, Adolescencia y Juventud',
		purpose:
			'Diseñar programas seguros por edad, con autorizaciones y responsables verificados.',
		accent: '#7b3fea',
		recordTypes: [
			{
				type: 'AGE_PROGRAM',
				label: 'Programa por edad',
				description: 'Programa, rango de edad y equipo responsable.',
			},
			{
				type: 'SAFEGUARDING_CHECK',
				label: 'Control de protección',
				description: 'Validación de medidas de protección.',
				privacy: 'RESTRICTED',
			},
			{
				type: 'PARENTAL_CONSENT',
				label: 'Autorización parental',
				description: 'Estado de consentimiento sin publicar datos sensibles.',
				privacy: 'RESTRICTED',
			},
			{
				type: 'CHECK_IN_SUMMARY',
				label: 'Resumen de registro',
				description: 'Conteo de entradas y salidas seguras.',
				privacy: 'LEADERSHIP',
			},
		],
		guidance: [
			...commonGuidance,
			'La protección de menores, el consentimiento y el acceso mínimo son controles obligatorios del flujo.',
		],
	},
	FAMILY: {
		key: 'FAMILY',
		title: 'Ministerio de la Familia',
		purpose:
			'Planificar programas familiares y acompañamiento con privacidad reforzada.',
		accent: '#c04d72',
		recordTypes: [
			{
				type: 'FAMILY_PROGRAM',
				label: 'Programa familiar',
				description: 'Programa de fortalecimiento y audiencia.',
			},
			{
				type: 'REFERRAL',
				label: 'Referencia de acompañamiento',
				description: 'Referencia mínima a un profesional o líder autorizado.',
				privacy: 'RESTRICTED',
			},
			{
				type: 'CARE_FOLLOW_UP',
				label: 'Seguimiento confidencial',
				description: 'Estado de seguimiento sin notas clínicas.',
				privacy: 'RESTRICTED',
			},
			{
				type: 'RESOURCE_GUIDE',
				label: 'Guía de recursos',
				description: 'Recursos aprobados para las familias.',
			},
		],
		guidance: [
			...commonGuidance,
			'No se almacenan diagnósticos ni notas clínicas; los casos sensibles usan acceso restringido.',
		],
	},
	COMMUNICATION: {
		key: 'COMMUNICATION',
		title: 'Comunicación y Publicidad',
		purpose:
			'Coordinar campañas, contenidos, recursos y aprobaciones de publicación.',
		accent: '#11729a',
		recordTypes: [
			{
				type: 'EDITORIAL_ITEM',
				label: 'Contenido editorial',
				description: 'Canal, audiencia, fecha y responsable.',
			},
			{
				type: 'CAMPAIGN_ASSET',
				label: 'Recurso de campaña',
				description: 'Pieza, formato y estado de aprobación.',
			},
			{
				type: 'PUBLICATION_APPROVAL',
				label: 'Aprobación de publicación',
				description: 'Aprobador, versión y alcance.',
				privacy: 'LEADERSHIP',
			},
			{
				type: 'MEDIA_COVERAGE',
				label: 'Cobertura',
				description: 'Plan y evidencia de cobertura.',
			},
		],
		guidance: [
			...commonGuidance,
			'La publicación exige autorización, consentimiento de imagen y versión aprobada cuando corresponda.',
		],
	},
	HEALTH: {
		key: 'HEALTH',
		title: 'Ministerio de Salud',
		purpose:
			'Gestionar iniciativas de bienestar, educación y servicio comunitario no clínico.',
		accent: '#21835c',
		recordTypes: [
			{
				type: 'WELLNESS_INITIATIVE',
				label: 'Iniciativa de bienestar',
				description: 'Objetivo, audiencia y medición de impacto.',
			},
			{
				type: 'HEALTH_EDUCATION',
				label: 'Educación en salud',
				description: 'Tema, facilitador y fuentes.',
			},
			{
				type: 'CONSENT_SUMMARY',
				label: 'Control de consentimiento',
				description: 'Estado agregado de consentimientos.',
				privacy: 'RESTRICTED',
			},
			{
				type: 'COMMUNITY_SERVICE',
				label: 'Servicio comunitario',
				description: 'Alcance, aliados y resultados.',
			},
		],
		guidance: [
			...commonGuidance,
			'Este espacio no sustituye expedientes clínicos ni atención profesional regulada.',
		],
	},
	STEWARDSHIP_FINANCE: {
		key: 'STEWARDSHIP_FINANCE',
		title: 'Mayordomía y Tesorería',
		purpose:
			'Promover fidelidad, planificar recursos y preservar controles financieros.',
		accent: '#a46c0b',
		recordTypes: [
			{
				type: 'STEWARDSHIP_PROGRAM',
				label: 'Programa de mayordomía',
				description: 'Iniciativa educativa y seguimiento agregado.',
			},
			{
				type: 'RECONCILIATION',
				label: 'Conciliación',
				description: 'Periodo, responsable, verificador y evidencia.',
				privacy: 'RESTRICTED',
			},
			{
				type: 'FINANCIAL_CONTROL',
				label: 'Control financiero',
				description: 'Verificación de segregación de funciones.',
				privacy: 'RESTRICTED',
			},
			{
				type: 'BUDGET_REVIEW',
				label: 'Revisión presupuestaria',
				description: 'Acuerdo, variación y acciones.',
				privacy: 'LEADERSHIP',
			},
		],
		guidance: [
			...commonGuidance,
			'Se exige segregación de funciones; quien registra no debe ser el único aprobador.',
			'Los datos de donantes y aportes individuales no se exponen en el espacio colaborativo.',
		],
	},
};

const text = (minimum = 1, maximum = 5000) =>
	z.string().trim().min(minimum).max(maximum);
const nullableUuid = z.uuid().nullable().optional();
function protectedRecordTypes(ministryKey: string): string[] {
  return (capabilityPacks[ministryKey] ?? capabilityPacks.GENERAL!).recordTypes
    .filter((record) => record.privacy === 'LEADERSHIP' || record.privacy === 'RESTRICTED')
    .map((record) => record.type);
}
function recordVisibility(ministryKey: string, recordType: string, storedVisibility: string): string {
  const minimum = (capabilityPacks[ministryKey] ?? capabilityPacks.GENERAL!).recordTypes.find((record) => record.type === recordType)?.privacy;
  return effectiveRecordVisibility(storedVisibility, minimum);
}

const planSchema = z.object({
	workspaceId: z.uuid(),
	title: text(3, 180),
	year: z.number().int().min(2020).max(2200),
	vision: text(0, 3000).default(''),
	mission: text(0, 3000).default(''),
	ownerId: nullableUuid,
});
const objectiveSchema = z.object({
	planId: z.uuid(),
	title: text(3, 180),
	description: text(0, 2000).default(''),
	targetValue: z.number().min(0).max(1_000_000_000),
	unit: text(1, 30).default('%'),
	dueOn: z.iso.date().nullable().optional(),
	ownerId: nullableUuid,
});
const initiativeSchema = z
	.object({
		workspaceId: z.uuid(),
		planId: nullableUuid,
		calendarActivityId: nullableUuid,
		initiativeType: z.enum([
			'ACTIVITY',
			'PROGRAM',
			'CAMPAIGN',
			'PROJECT',
			'TRAINING',
			'SERVICE',
		]),
		title: text(3, 180),
		description: text(0, 5000).default(''),
		objective: text(3, 3000),
		startsOn: z.iso.date(),
		endsOn: z.iso.date(),
		priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
		plannedBudget: z.number().min(0).max(1_000_000_000).default(0),
		currency: z.string().trim().length(3).default('DOP'),
		ownerId: nullableUuid,
	})
	.refine((value) => value.endsOn >= value.startsOn, {
		path: ['endsOn'],
		message: 'La fecha final debe ser igual o posterior al inicio.',
	});
const initiativeUpdateSchema = z
	.object({
		status: z
			.enum([
				'DRAFT',
				'PLANNED',
				'IN_PROGRESS',
				'AT_RISK',
				'COMPLETED',
				'CANCELLED',
			])
			.optional(),
		progress: z.number().int().min(0).max(100).optional(),
		outcome: text(0, 5000).optional(),
	})
	.refine(
		(value) => Object.keys(value).length > 0,
		'Indica al menos un cambio.',
	);
const assignmentSchema = z.object({
	userId: z.uuid(),
	responsibility: text(2, 500),
	status: z
		.enum(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'])
		.default('ASSIGNED'),
});
const budgetSchema = z.object({
	workspaceId: z.uuid(),
	initiativeId: nullableUuid,
	entryType: z.enum([
		'ALLOCATION',
		'COMMITMENT',
		'EXPENSE',
		'INCOME',
		'ADJUSTMENT',
	]),
	category: text(2, 120),
	description: text(0, 1000).default(''),
	amount: z.number().positive().max(1_000_000_000),
	occurredOn: z.iso.date(),
	status: z
		.enum(['PLANNED', 'SUBMITTED', 'APPROVED', 'PAID'])
		.default('PLANNED'),
	vendor: text(0, 180).default(''),
	reference: text(0, 180).default(''),
});
const budgetUpdateSchema = z.object({
	status: z.enum(['APPROVED', 'PAID', 'REJECTED', 'VOID']),
});
const taskSchema = z.object({
	workspaceId: z.uuid(),
	initiativeId: nullableUuid,
	title: text(3, 180),
	description: text(0, 2000).default(''),
	assignedTo: nullableUuid,
	dueAt: z.iso.datetime().nullable().optional(),
	priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
});
const taskUpdateSchema = z.object({
	status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']),
});
const meetingSchema = z
	.object({
		workspaceId: z.uuid(),
		title: text(3, 180),
		scheduledAt: z.iso.datetime(),
		endsAt: z.iso.datetime(),
		location: text(0, 240).default(''),
		agenda: text(3, 5000),
		participantIds: z.array(z.uuid()).max(100).default([]),
	})
	.refine((value) => new Date(value.endsAt) > new Date(value.scheduledAt), {
		path: ['endsAt'],
		message: 'La finalización debe ser posterior al inicio.',
	});
const meetingUpdateSchema = z
	.object({
		status: z.enum(['IN_PROGRESS', 'CLOSED', 'CANCELLED']).optional(),
		minutes: text(0, 10000).optional(),
	})
	.refine(
		(value) => Object.keys(value).length > 0,
		'Indica al menos un cambio.',
	);
const decisionSchema = z.object({
	workspaceId: z.uuid(),
	meetingId: nullableUuid,
	initiativeId: nullableUuid,
	title: text(3, 180),
	decisionText: text(10, 5000),
	authorityType: z.enum([
		'DEPARTMENT',
		'CHURCH_BOARD',
		'BUSINESS_MEETING',
		'PASTORAL',
		'CONFERENCE',
	]),
	decidedOn: z.iso.date(),
	effectiveOn: z.iso.date().nullable().optional(),
	evidenceReference: text(0, 500).default(''),
});
const commentSchema = z.object({
	workspaceId: z.uuid(),
	resourceType: z.enum([
		'PLAN',
		'OBJECTIVE',
		'INITIATIVE',
		'TASK',
		'MEETING',
		'DECISION',
		'RECORD',
	]),
	resourceId: z.uuid(),
	body: text(2, 3000),
	mentionUserIds: z.array(z.uuid()).max(30).default([]),
});
const kpiSchema = z
	.object({
		workspaceId: z.uuid(),
		name: text(2, 160),
		description: text(0, 1000).default(''),
		targetValue: z.number().min(0).max(1_000_000_000),
		currentValue: z.number().min(0).max(1_000_000_000).default(0),
		unit: text(0, 30).default(''),
		periodStart: z.iso.date(),
		periodEnd: z.iso.date(),
	})
	.refine((value) => value.periodEnd >= value.periodStart, {
		path: ['periodEnd'],
		message: 'El periodo final debe ser posterior al inicial.',
	});
const recordSchema = z.object({
	workspaceId: z.uuid(),
	recordType: text(2, 80),
	title: text(3, 180),
	recordDate: z.iso.date(),
	visibility: z.enum(['TEAM', 'LEADERSHIP', 'RESTRICTED']).default('TEAM'),
	data: z.record(
		z.string().max(80),
		z.union([z.string().max(3000), z.number(), z.boolean(), z.null()]),
	),
	ownerId: nullableUuid,
});

function normalized(value: string) {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}
function packKey(name: string) {
	const value = normalized(name);
	if (value.includes('ancianos')) return 'ELDERS_OPERATIONS';
	if (value.includes('ministerios personales') || value.includes('personal ministries'))
		return 'PERSONAL_MINISTRIES';
	if (/ministerio(s)? de la mujer|women.?s ministr/.test(value))
		return 'WOMENS_MINISTRY';
	if (value.includes('escuela sabatica')) return 'SABBATH_SCHOOL';
	if (/musica|adoracion/.test(value)) return 'WORSHIP_MUSIC';
	if (/diacono|diaconisa/.test(value)) return 'DEACONRY';
	if (/infantil|adolescente|joven/.test(value)) return 'CHILDREN_YOUTH';
	if (value.includes('familia')) return 'FAMILY';
	if (/comunicacion|publicidad/.test(value)) return 'COMMUNICATION';
	if (value.includes('salud')) return 'HEALTH';
	if (/tesoreria|mayordomia/.test(value)) return 'STEWARDSHIP_FINANCE';
	return 'GENERAL';
}

async function poolFor(user: AuthPrincipal): Promise<Pool | PoolClient> {
	if (user.scope !== 'tenant' || !user.tenantId)
		throw Object.assign(new Error('Se requiere una iglesia.'), { status: 403 });
	return activeDomainClient(user.tenantId) ?? (await tenantPoolFromId(user.tenantId)).pool;
}
const AtomicWrite = atomicDomainMutation(async (request: Request & { user?: AuthPrincipal }) => {
  const user = currentUser(request);
  return { pool: await poolFor(user), tenantId: user.tenantId ?? '' };
});

async function audit(
	pool: Pool | PoolClient,
	actorId: string,
	action: string,
	resourceType: string,
	resourceId: string,
	after: unknown,
) {
	await pool.query(
		`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data) VALUES($1,$2,$3,$4,$5::jsonb)`,
		[actorId, action, resourceType, resourceId, JSON.stringify(after)],
	);
}

async function notify(
	pool: Pool | PoolClient,
	tenantId: string,
	ids: string[],
	title: string,
	body: string,
	link = '/ministry-hub',
	eventType = 'department_operations.assignment',
) {
	const recipients = [...new Set(ids.filter(Boolean))];
	if (!recipients.length) return;
	await domainTransaction(pool, async (client) => {
    for (const userId of recipients) await enqueueDepartmentNotification(client, eventType, { userId, title, body, link, tenantId });
  });
}

async function ensureWorkspaces(pool: Pool | PoolClient) {
	await pool.query(
		`UPDATE department_operations.workspaces w
		    SET active=d.active,updated_at=now()
		   FROM calendar.departments d
		  WHERE d.id=w.department_id AND w.active IS DISTINCT FROM d.active`,
	);
	const departments = await pool.query<{ id: string; name: string }>(
		`SELECT id,name FROM calendar.departments WHERE active`,
	);
	for (const department of departments.rows) {
		await pool.query(
			`INSERT INTO department_operations.workspaces(department_id,ministry_key) VALUES($1,$2)
			 ON CONFLICT(department_id) DO UPDATE SET ministry_key=EXCLUDED.ministry_key,active=true,updated_at=now()`,
			[department.id, packKey(department.name)],
		);
	}
}

function requireRight(access: Access, right: keyof Access) {
	if (!access[right])
		throw Object.assign(
			new Error('No tiene autorización para esta función departamental.'),
			{ status: 403, code: 'DEPARTMENT_OPERATIONS_ACCESS_DENIED' },
		);
}

async function workspaceAccess(
	pool: Pool | PoolClient,
	user: AuthPrincipal,
	workspaceId: string,
	right: keyof Access = 'canRead',
) {
	const result = await pool.query<{
		id: string;
		department_id: string;
		name: string;
		ministry_key: string;
		role: string | null;
	}>(
		`SELECT w.id,w.department_id,d.name,w.ministry_key,m.role
       FROM department_operations.workspaces w JOIN calendar.departments d ON d.id=w.department_id
       LEFT JOIN identity.department_memberships m ON m.department_id=d.id AND m.user_id=$2
      WHERE w.id=$1 AND w.active AND d.active`,
		[workspaceId, user.sub],
	);
	const workspace = result.rows[0];
	if (!workspace)
		throw Object.assign(new Error('El espacio departamental no existe.'), {
			status: 404,
		});
	const access = accessFor(user, workspace.role);
	requireRight(access, right);
	return { workspace, access };
}

async function assertTeamMember(
	pool: Pool | PoolClient,
	departmentId: string,
	userId: string,
) {
	const result = await pool.query(
		`SELECT 1 FROM identity.department_memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.department_id=$1 AND m.user_id=$2 AND u.active`,
		[departmentId, userId],
	);
	if (!result.rowCount)
		throw Object.assign(
			new Error('La persona debe estar activa y pertenecer al departamento seleccionado.'),
			{ status: 400, code: 'TEAM_MEMBER_REQUIRED' },
		);
}

async function assertWorkspaceResource(
	pool: Pool | PoolClient,
	workspaceId: string,
	resourceType: z.infer<typeof commentSchema>['resourceType'],
	resourceId: string,
) {
	const source: Record<
		z.infer<typeof commentSchema>['resourceType'],
		{ table: string; workspaceExpression: string }
	> = {
		PLAN: {
			table: 'department_operations.annual_plans',
			workspaceExpression: 'workspace_id',
		},
		OBJECTIVE: {
			table:
				'department_operations.objectives o JOIN department_operations.annual_plans p ON p.id=o.plan_id',
			workspaceExpression: 'p.workspace_id',
		},
		INITIATIVE: {
			table: 'department_operations.initiatives',
			workspaceExpression: 'workspace_id',
		},
		TASK: {
			table: 'department_operations.tasks',
			workspaceExpression: 'workspace_id',
		},
		MEETING: {
			table: 'department_operations.meetings',
			workspaceExpression: 'workspace_id',
		},
		DECISION: {
			table: 'department_operations.decisions',
			workspaceExpression: 'workspace_id',
		},
		RECORD: {
			table: 'department_operations.ministry_records',
			workspaceExpression: 'workspace_id',
		},
	};
	const target = source[resourceType];
	const alias = resourceType === 'OBJECTIVE' ? 'o' : '';
	const result = await pool.query(
		`SELECT 1 FROM ${target.table} WHERE ${alias ? `${alias}.` : ''}id=$1 AND ${target.workspaceExpression}=$2`,
		[resourceId, workspaceId],
	);
	if (!result.rowCount) {
		throw Object.assign(
			new Error(
				'El recurso seleccionado no pertenece a este espacio departamental.',
			),
			{
				status: 400,
				code: 'WORKSPACE_RESOURCE_REQUIRED',
			},
		);
	}
}

async function loadExecutiveReport(
	pool: Pool | PoolClient,
	user: AuthPrincipal,
	workspaceId: string,
) {
	const { workspace, access } = await workspaceAccess(pool, user, workspaceId);
	const [
		team,
		plans,
		initiatives,
		tasks,
		meetings,
		decisions,
		records,
		documents,
		unallocatedBudgetEntries,
	] = await Promise.all([
		pool.query<{ count: number }>(
			`SELECT count(*)::int count FROM identity.department_memberships WHERE department_id=$1`,
			[workspace.department_id],
		),
		pool.query<{
			title: string;
			year: number;
			status: string;
			progress: number;
		}>(
			`SELECT title,year,status,progress FROM department_operations.annual_plans WHERE workspace_id=$1 ORDER BY year DESC,created_at DESC`,
			[workspaceId],
		),
		pool.query<{
			title: string;
			status: string;
			progress: number;
			startsOn: string;
			endsOn: string;
			ownerName: string | null;
			plannedBudget: number;
			spentBudget: number;
			currency: string;
		}>(
			`SELECT i.title,i.status,i.progress,i.starts_on "startsOn",i.ends_on "endsOn",u.name "ownerName",i.currency,i.planned_budget::float8 "plannedBudget",COALESCE(sum(b.amount) FILTER(WHERE b.entry_type='EXPENSE' AND b.status NOT IN ('REJECTED','VOID')),0)::float8 "spentBudget" FROM department_operations.initiatives i LEFT JOIN identity.users u ON u.id=i.owner_id LEFT JOIN department_operations.budget_entries b ON b.initiative_id=i.id WHERE i.workspace_id=$1 GROUP BY i.id,u.name ORDER BY CASE i.status WHEN 'AT_RISK' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'PLANNED' THEN 2 ELSE 3 END,i.starts_on`,
			[workspaceId],
		),
		pool.query<{ status: string; count: number }>(
			`SELECT status,count(*)::int count FROM department_operations.tasks WHERE workspace_id=$1 GROUP BY status`,
			[workspaceId],
		),
		pool.query<{ count: number }>(
			`SELECT count(*)::int count FROM department_operations.meetings WHERE workspace_id=$1`,
			[workspaceId],
		),
		pool.query<{ count: number }>(
			`SELECT count(*)::int count FROM department_operations.decisions WHERE workspace_id=$1`,
			[workspaceId],
		),
		pool.query<{ count: number }>(
			`SELECT count(*)::int count FROM department_operations.ministry_records WHERE workspace_id=$1 AND ($2::boolean OR (visibility='TEAM' AND NOT(record_type=ANY($3::text[]))))`,
			[workspaceId, access.canManage || access.canApprove, protectedRecordTypes(workspace.ministry_key)],
		),
		pool.query<{ count: number }>(
			`SELECT count(*)::int count FROM files.department_documents d JOIN files.file_objects f ON f.id=d.file_id WHERE d.department_id=$1 AND f.deleted_at IS NULL`,
			[workspace.department_id],
		),
    pool.query<{ count: number }>(`SELECT count(*)::int count FROM department_operations.budget_entries WHERE workspace_id=$1 AND initiative_id IS NULL AND status NOT IN ('REJECTED','VOID')`, [workspaceId]),
	]);
	const plannedBudget = initiatives.rows.reduce(
		(total, item) => total + Number(item.plannedBudget),
		0,
	);
	const spentBudget = initiatives.rows.reduce(
		(total, item) => total + Number(item.spentBudget),
		0,
	);
  const currencyTotals = budgetCurrencyTotals(initiatives.rows);
	return {
		workspace,
		generatedAt: new Date().toISOString(),
		team: team.rows[0]?.count ?? 0,
		plans: plans.rows,
		initiatives: initiatives.rows,
		tasks: tasks.rows,
		metrics: {
			activePlans: plans.rows.filter((item) => item.status === 'ACTIVE').length,
			activeInitiatives: initiatives.rows.filter(
				(item) => !['COMPLETED', 'CANCELLED'].includes(item.status),
			).length,
			atRisk: initiatives.rows.filter((item) => item.status === 'AT_RISK')
				.length,
			openTasks: tasks.rows
				.filter((item) => !['COMPLETED', 'CANCELLED'].includes(item.status))
				.reduce((total, item) => total + item.count, 0),
			meetings: meetings.rows[0]?.count ?? 0,
			decisions: decisions.rows[0]?.count ?? 0,
			records: records.rows[0]?.count ?? 0,
			documents: documents.rows[0]?.count ?? 0,
			plannedBudget,
			spentBudget,
			availableBudget: plannedBudget - spentBudget,
      budgetsByCurrency: currencyTotals,
      budgetAggregationComparable: currencyTotals.length <= 1 && !unallocatedBudgetEntries.rows[0]?.count,
      unallocatedBudgetEntries: unallocatedBudgetEntries.rows[0]?.count ?? 0,
		},
	};
}

function csvCell(value: unknown) {
	return safeCsvCell(value);
}

@Controller()
class HealthController {
	@Public() @Get('health/live') health() {
		return HEALTH_RESPONSE;
	}
}

@Controller('department-operations')
class DepartmentOperationsController {
	@Get('outbox/dead-letter')
	async deadLetterOutbox(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request); requirePermission(user, 'users.manage');
    const pool = await poolFor(user);
    const result = await pool.query(`SELECT id,event_type "eventType",aggregate_id "aggregateId",attempts,created_at "createdAt" FROM department_operations.notification_outbox WHERE delivered_at IS NULL AND attempts>=8 ORDER BY created_at LIMIT 200`);
    return { items: result.rows };
  }
	@Post('outbox/:id/retry')
	@AtomicWrite
	async retryOutbox(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'users.manage');
    const eventId = z.uuid().parse(id);
    const { reason } = z.object({ reason: z.string().trim().min(10).max(500) }).parse(body);
    return recoverDepartmentNotification(await poolFor(user), eventId, (client, event) => audit(client, user.sub, 'department_operations.outbox_retry_requested', 'department_outbox_event', eventId, { reason, eventType: event.event_type, aggregateId: event.aggregate_id, previousAttempts: event.attempts }));
  }
	private async authorized(request: Request & { user?: AuthPrincipal }) {
		const user = currentUser(request);
		const pool = await poolFor(user);
		await ensureWorkspaces(pool);
		return { user, pool };
	}

	@Get('context')
	async context(
		@Req() request: Request & { user?: AuthPrincipal },
		@Query('departmentId') departmentId?: string,
	) {
		const { user, pool } = await this.authorized(request);
		if (departmentId) z.uuid().parse(departmentId);
		const all = await pool.query<{
			id: string;
			departmentId: string;
			name: string;
			color: string;
			ministryKey: string;
			role: string | null;
		}>(
			`SELECT w.id,d.id "departmentId",d.name,d.color,w.ministry_key "ministryKey",m.role
         FROM department_operations.workspaces w JOIN calendar.departments d ON d.id=w.department_id
         LEFT JOIN identity.department_memberships m ON m.department_id=d.id AND m.user_id=$1
        WHERE w.active AND d.active
          AND ($2::boolean OR $3::boolean OR m.user_id IS NOT NULL)
        ORDER BY CASE WHEN m.role='DIRECTOR' THEN 0 WHEN m.role IS NOT NULL THEN 1 ELSE 2 END,d.name`,
			[
				user.sub,
				user.roles.some((role) =>
					['TENANT_ADMIN', 'BOARD_SECRETARY'].includes(role),
				),
				user.roles.includes('PASTOR'),
			],
		);
		const workspace = departmentId
			? all.rows.find((item) => item.departmentId === departmentId || item.id === departmentId)
			: all.rows[0];
		if (!workspace)
			throw Object.assign(
				new Error(departmentId ? 'No tiene acceso al área de trabajo solicitada.' : 'No tiene espacios departamentales asignados.'),
				{ status: 403, code: 'DEPARTMENT_OPERATIONS_ACCESS_DENIED' },
			);
		const access = accessFor(user, workspace.role);
		requireRight(access, 'canRead');
		const canSeeLeadershipRecords = access.canManage || access.canApprove;
    const privateRecordTypes = protectedRecordTypes(workspace.ministryKey);
		const [
			team,
			plans,
			initiatives,
			tasks,
			meetings,
			decisions,
			comments,
			kpis,
			records,
			calendarActivities,
			documents,
		] = await Promise.all([
			pool.query(
				`SELECT u.id,u.name,u.email,u.phone,m.role,COALESCE(array_agg(a.title ORDER BY a.title) FILTER(WHERE a.id IS NOT NULL),'{}') appointments FROM identity.department_memberships m JOIN identity.users u ON u.id=m.user_id LEFT JOIN identity.department_appointments a ON a.user_id=u.id AND a.department_id=m.department_id AND a.active WHERE m.department_id=$1 AND u.active GROUP BY u.id,m.role ORDER BY CASE m.role WHEN 'DIRECTOR' THEN 0 WHEN 'ASSISTANT_DIRECTOR' THEN 1 WHEN 'DEPARTMENT_SECRETARY' THEN 2 ELSE 3 END,u.name`,
				[workspace.departmentId],
			),
			pool.query(
				`SELECT p.id,p.title,p.year,p.vision,p.mission,p.status,p.progress,p.owner_id "ownerId",u.name "ownerName",p.approved_at "approvedAt",ap.name "approvedByName",COALESCE(obj.items,'[]'::jsonb) objectives FROM department_operations.annual_plans p LEFT JOIN identity.users u ON u.id=p.owner_id LEFT JOIN identity.users ap ON ap.id=p.approved_by LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'description',o.description,'targetValue',o.target_value::float8,'currentValue',o.current_value::float8,'unit',o.unit,'dueOn',o.due_on,'status',o.status,'ownerId',o.owner_id,'ownerName',ou.name) ORDER BY o.created_at) items FROM department_operations.objectives o LEFT JOIN identity.users ou ON ou.id=o.owner_id WHERE o.plan_id=p.id) obj ON true WHERE p.workspace_id=$1 ORDER BY p.year DESC,p.created_at DESC`,
				[workspace.id],
			),
			pool.query(
				`SELECT i.id,i.plan_id "planId",i.calendar_activity_id "calendarActivityId",i.initiative_type "initiativeType",i.title,i.description,i.objective,i.starts_on "startsOn",i.ends_on "endsOn",i.priority,i.status,i.progress,i.planned_budget::float8 "plannedBudget",i.currency,i.outcome,i.owner_id "ownerId",u.name "ownerName",ca.code "calendarCode",ca.status "calendarStatus",i.updated_at "updatedAt",COALESCE(a.items,'[]'::jsonb) assignments,COALESCE(b.committed,0)::float8 "committedBudget",COALESCE(b.spent,0)::float8 "spentBudget",COALESCE(b.income,0)::float8 "incomeBudget" FROM department_operations.initiatives i LEFT JOIN identity.users u ON u.id=i.owner_id LEFT JOIN calendar.activities ca ON ca.id=i.calendar_activity_id AND ${activityReadPredicate(user, 'ca')} LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('userId',ia.user_id,'name',iu.name,'responsibility',ia.responsibility,'status',ia.status) ORDER BY iu.name) items FROM department_operations.initiative_assignments ia JOIN identity.users iu ON iu.id=ia.user_id WHERE ia.initiative_id=i.id) a ON true LEFT JOIN LATERAL (SELECT sum(amount) FILTER(WHERE entry_type='COMMITMENT' AND status NOT IN ('REJECTED','VOID')) committed,sum(amount) FILTER(WHERE entry_type='EXPENSE' AND status NOT IN ('REJECTED','VOID')) spent,sum(amount) FILTER(WHERE entry_type='INCOME' AND status NOT IN ('REJECTED','VOID')) income FROM department_operations.budget_entries WHERE initiative_id=i.id) b ON true WHERE i.workspace_id=$1 ORDER BY CASE i.status WHEN 'AT_RISK' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'PLANNED' THEN 2 ELSE 3 END,i.starts_on`,
				[workspace.id],
			),
			pool.query(
				`SELECT t.id,t.initiative_id "initiativeId",i.title "initiativeTitle",t.title,t.description,t.assigned_to "assignedTo",u.name "assignedName",t.due_at "dueAt",t.priority,t.status,t.completed_at "completedAt" FROM department_operations.tasks t LEFT JOIN department_operations.initiatives i ON i.id=t.initiative_id LEFT JOIN identity.users u ON u.id=t.assigned_to WHERE t.workspace_id=$1 ORDER BY CASE t.status WHEN 'BLOCKED' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'TODO' THEN 2 ELSE 3 END,t.due_at NULLS LAST`,
				[workspace.id],
			),
			pool.query(
				`SELECT m.id,m.title,m.scheduled_at "scheduledAt",m.ends_at "endsAt",m.location,m.agenda,m.minutes,m.participant_ids "participantIds",m.status,(SELECT count(*)::int FROM unnest(m.participant_ids) p) "participantCount" FROM department_operations.meetings m WHERE m.workspace_id=$1 ORDER BY m.scheduled_at DESC`,
				[workspace.id],
			),
			pool.query(
				`SELECT d.id,d.meeting_id "meetingId",d.initiative_id "initiativeId",d.title,d.decision_text "decisionText",d.authority_type "authorityType",d.decided_on "decidedOn",d.effective_on "effectiveOn",d.evidence_reference "evidenceReference",u.name "approvedByName" FROM department_operations.decisions d JOIN identity.users u ON u.id=d.approved_by WHERE d.workspace_id=$1 ORDER BY d.decided_on DESC,d.created_at DESC`,
				[workspace.id],
			),
			pool.query(
				`SELECT c.id,c.resource_type "resourceType",c.resource_id "resourceId",c.body,c.mention_user_ids "mentionUserIds",u.name "createdByName",c.created_at "createdAt" FROM department_operations.comments c JOIN identity.users u ON u.id=c.created_by WHERE c.workspace_id=$1 AND (c.resource_type<>'RECORD' OR EXISTS(SELECT 1 FROM department_operations.ministry_records r WHERE r.id=c.resource_id AND r.workspace_id=c.workspace_id AND ($2::boolean OR (r.visibility='TEAM' AND NOT(r.record_type=ANY($3::text[])))))) ORDER BY c.created_at DESC LIMIT 100`,
				[workspace.id, canSeeLeadershipRecords, privateRecordTypes],
			),
			pool.query(
				`SELECT id,name,description,target_value::float8 "targetValue",current_value::float8 "currentValue",unit,period_start "periodStart",period_end "periodEnd",status FROM department_operations.kpis WHERE workspace_id=$1 ORDER BY period_end DESC,name`,
				[workspace.id],
			),
			pool.query(
				`SELECT r.id,r.record_type "recordType",r.title,r.record_date "recordDate",r.visibility,r.status,r.data,r.owner_id "ownerId",u.name "ownerName",r.created_at "createdAt" FROM department_operations.ministry_records r LEFT JOIN identity.users u ON u.id=r.owner_id WHERE r.workspace_id=$1 AND ($2::boolean OR (r.visibility='TEAM' AND NOT(r.record_type=ANY($3::text[])))) ORDER BY r.record_date DESC,r.created_at DESC LIMIT 200`,
				[workspace.id, canSeeLeadershipRecords, privateRecordTypes],
			),
			pool.query(
				`SELECT a.id,a.code,a.title,a.status,min(s.starts_at) "startsAt",max(s.ends_at) "endsAt" FROM calendar.activities a LEFT JOIN calendar.schedule_options o ON o.activity_id=a.id LEFT JOIN calendar.schedule_sessions s ON s.option_id=o.id WHERE a.department_id=$1 AND ${activityReadPredicate(user)} GROUP BY a.id ORDER BY min(s.starts_at) DESC NULLS LAST LIMIT 100`,
				[workspace.departmentId],
			),
			pool.query(
				`SELECT count(*)::int total,count(*) FILTER(WHERE d.alignment_status='VERIFIED')::int verified FROM files.department_documents d JOIN files.file_objects f ON f.id=d.file_id WHERE d.department_id=$1 AND f.deleted_at IS NULL`,
				[workspace.departmentId],
			),
		]);
		const now = Date.now();
		const openInitiatives = initiatives.rows.filter(
			(item) => !['COMPLETED', 'CANCELLED'].includes(item.status),
		);
		const completed = initiatives.rows
			.filter((item) => item.status === 'COMPLETED')
			.sort(
				(left, right) =>
					new Date(right.updatedAt ?? right.endsOn).getTime() -
					new Date(left.updatedAt ?? left.endsOn).getTime(),
			)
			.slice(0, 3);
		const onTime = completed.filter(
			(item) =>
				new Date(item.endsOn).getTime() >=
				new Date(item.updatedAt ?? item.endsOn).getTime(),
		).length;
		const completionRate = completed.length
			? Math.round((onTime / completed.length) * 100)
			: 0;
		const overdueTasks = tasks.rows.filter(
			(item) =>
				!['COMPLETED', 'CANCELLED'].includes(item.status) &&
				item.dueAt &&
				new Date(item.dueAt).getTime() < now,
		).length;
		const planned = initiatives.rows.reduce(
			(sum, item) => sum + Number(item.plannedBudget),
			0,
		);
		const spent = initiatives.rows.reduce(
			(sum, item) => sum + Number(item.spentBudget),
			0,
		);
		const pack =
			capabilityPacks[workspace.ministryKey] ?? capabilityPacks.GENERAL!;
    const currencyTotals = budgetCurrencyTotals(initiatives.rows as Array<{ currency: string; plannedBudget: unknown; spentBudget: unknown }>);
    const unallocatedBudgetEntries = await pool.query<{ count: number }>(`SELECT count(*)::int count FROM department_operations.budget_entries WHERE workspace_id=$1 AND initiative_id IS NULL AND status NOT IN ('REJECTED','VOID')`, [workspace.id]);
		return {
			workspaces: all.rows,
			selected: { ...workspace, pack },
			access,
			team: team.rows,
			plans: plans.rows,
			initiatives: initiatives.rows,
			tasks: tasks.rows,
			meetings: meetings.rows,
			decisions: decisions.rows,
			comments: comments.rows,
			kpis: kpis.rows,
			records: records.rows.map((record) => ({ ...record, visibility: recordVisibility(workspace.ministryKey, record.recordType, record.visibility) })),
			calendarActivities: calendarActivities.rows,
			documents: documents.rows[0] ?? { total: 0, verified: 0 },
			metrics: {
				activePlans: plans.rows.filter((item) => item.status === 'ACTIVE')
					.length,
				activeInitiatives: openInitiatives.length,
				atRisk: openInitiatives.filter(
					(item) =>
						item.status === 'AT_RISK' ||
						(item.endsOn &&
							new Date(`${item.endsOn}T23:59:59`).getTime() < now),
				).length,
				openTasks: tasks.rows.filter(
					(item) => !['COMPLETED', 'CANCELLED'].includes(item.status),
				).length,
				overdueTasks,
				plannedBudget: planned,
				spentBudget: spent,
				availableBudget: planned - spent,
        budgetsByCurrency: currencyTotals,
        budgetAggregationComparable: currencyTotals.length <= 1 && !unallocatedBudgetEntries.rows[0]?.count,
        unallocatedBudgetEntries: unallocatedBudgetEntries.rows[0]?.count ?? 0,
				meetingsThisMonth: meetings.rows.filter(
					(item) =>
						new Date(item.scheduledAt).getMonth() === new Date().getMonth(),
				).length,
			},
			forecast: {
				evidence: { method: 'LAST_UPDATE_PROXY', calibrated: false, totalEvaluated: initiatives.rows.length, totalCompleted: initiatives.rows.filter((item) => item.status === 'COMPLETED').length, sampleSize: completed.length },
				sampleSize: completed.length,
				onTimeRate: completionRate,
				riskLevel:
					overdueTasks > 2 ||
					openInitiatives.filter((item) => item.status === 'AT_RISK').length > 0
						? 'HIGH'
						: overdueTasks
							? 'MEDIUM'
							: 'LOW',
				message:
					completed.length < 3
						? 'El pronóstico mejorará al completar tres iniciativas.'
						: completionRate >= 80
							? 'La ejecución reciente indica una entrega estable.'
							: completionRate >= 50
								? 'La ejecución requiere seguimiento preventivo.'
								: 'La tendencia reciente requiere intervención del equipo.',
			},
		};
	}

	@Get('reports/executive.csv')
	async executiveCsv(
		@Req() request: Request & { user?: AuthPrincipal },
		@Query('workspaceId') workspaceId: string,
    @Query('lang') lang: string | undefined,
		@Res() response: Response,
	) {
		const { user, pool } = await this.authorized(request);
		const parsedWorkspaceId = z.uuid().parse(workspaceId);
    const locale = z.enum(['es', 'en', 'fr']).default('es').parse(lang);
    const text = (label: string) => departmentReportText(locale, label);
    const { tenant } = await tenantPoolFromId(user.tenantId!);
		const report = await loadExecutiveReport(pool, user, parsedWorkspaceId);
		const rows: unknown[][] = [
			['Departamento', report.workspace.name],
			['Generado', departmentReportInstant(report.generatedAt, locale, tenant.timezone)],
			[],
			['Indicador', 'Valor'],
			['Equipo', report.team],
			['Planes activos', report.metrics.activePlans],
			['Iniciativas activas', report.metrics.activeInitiatives],
			['Iniciativas en riesgo', report.metrics.atRisk],
			['Tareas abiertas', report.metrics.openTasks],
			['Reuniones', report.metrics.meetings],
			['Acuerdos', report.metrics.decisions],
			['Registros', report.metrics.records],
			['Documentos', report.metrics.documents],
      ['Importes separados por moneda; no comparables entre monedas.'],
      ...report.metrics.budgetsByCurrency.flatMap((budget) => [
        ['Presupuesto planificado', budget.currency, budget.plannedBudget],
        ['Presupuesto ejecutado', budget.currency, budget.spentBudget],
        ['Presupuesto disponible', budget.currency, budget.availableBudget],
      ]),
      ['Registros financieros sin moneda atribuible', report.metrics.unallocatedBudgetEntries],
			[],
			[
				'Iniciativa',
				'Estado',
				'Avance',
				'Responsable',
				'Inicio',
				'Fin',
				'Planificado',
				'Ejecutado',
        'Moneda',
			],
			...report.initiatives.map((item) => [
				item.title,
				departmentReportStatus(locale, item.status),
				`${item.progress}%`,
				item.ownerName ?? '',
				item.startsOn,
				item.endsOn,
				item.plannedBudget,
				item.spentBudget,
        item.currency,
			]),
		];
    // Translate only fixed labels, never workspace titles, names or user text.
    const headerIndex = rows.findIndex((row) => row[0] === 'Iniciativa');
    for (const [index, row] of rows.entries()) {
      if (index === headerIndex || (row[0] === 'Indicador' && row[1] === 'Valor')) row.splice(0, row.length, ...row.map((label) => text(String(label))));
      else if (index < headerIndex && typeof row[0] === 'string') row[0] = text(row[0]);
    }
		const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
		await audit(
			pool,
			user.sub,
			'department_operations.report.exported',
			'department_workspace',
			parsedWorkspaceId,
			{ format: 'csv' },
		);
		const slug = report.workspace.name
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-');
		response.setHeader('content-type', 'text/csv; charset=utf-8');
		response.setHeader(
			'content-disposition',
			`attachment; filename="reporte-${slug}.csv"`,
		);
		response.send(csv);
	}

	@Get('reports/executive.pdf')
	async executivePdf(
		@Req() request: Request & { user?: AuthPrincipal },
		@Query('workspaceId') workspaceId: string,
    @Query('lang') lang: string | undefined,
		@Res() response: Response,
	) {
		const { user, pool } = await this.authorized(request);
		const parsedWorkspaceId = z.uuid().parse(workspaceId);
    const locale = z.enum(['es', 'en', 'fr']).default('es').parse(lang);
    const text = (label: string) => departmentReportText(locale, label);
    const number = (value: number) => new Intl.NumberFormat(locale).format(value);
    const { tenant } = await tenantPoolFromId(user.tenantId!);
		const report = await loadExecutiveReport(pool, user, parsedWorkspaceId);
		await audit(
			pool,
			user.sub,
			'department_operations.report.exported',
			'department_workspace',
			parsedWorkspaceId,
			{ format: 'pdf' },
		);
		const slug = report.workspace.name
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-');
		response.setHeader('content-type', 'application/pdf');
		response.setHeader(
			'content-disposition',
			`attachment; filename="reporte-ejecutivo-${slug}.pdf"`,
		);
		const document = new PDFDocument({
			size: 'A4',
			margin: 42,
			bufferPages: true,
			info: {
				Title: `${text('Reporte ejecutivo')} · ${report.workspace.name}`,
				Author: 'GestionChurch',
			},
		});
		document.pipe(response);
		document.rect(0, 0, 595, 145).fill('#07594f');
		document
			.fillColor('#f3ce67')
			.fontSize(10)
			.text(text('GESTIONCHURCH · INTELIGENCIA MINISTERIAL'), 42, 36, {
				characterSpacing: 1.2,
			});
		document
			.fillColor('#ffffff')
			.fontSize(27)
			.text(report.workspace.name, 42, 59, { width: 500 });
		document
			.fillColor('#cfe8e2')
			.fontSize(10)
			.text(
				`${text('Reporte ejecutivo')} · ${departmentReportInstant(report.generatedAt, locale, tenant.timezone)}`,
				42,
				102,
			);
		const cards: Array<[string, string]> = [
			['Planes activos', String(report.metrics.activePlans)],
			['Iniciativas activas', String(report.metrics.activeInitiatives)],
			['En riesgo', String(report.metrics.atRisk)],
			['Tareas abiertas', String(report.metrics.openTasks)],
			['Equipo', String(report.team)],
			['Documentos', String(report.metrics.documents)],
		];
		cards.forEach(([label, value], index) => {
			const column = index % 3;
			const row = Math.floor(index / 3);
			const x = 42 + column * 170;
			const y = 170 + row * 58;
			document.roundedRect(x, y, 158, 48, 8).fill('#f0f7f5');
			document
				.fillColor('#087366')
				.fontSize(18)
				.text(value, x + 12, y + 9, { width: 134 });
			document
				.fillColor('#60736e')
				.fontSize(8)
				.text(text(label).toUpperCase(), x + 12, y + 31, { width: 134 });
		});
		document.y = 302;
		document.fillColor('#17332d').fontSize(16).text(text('Resumen presupuestario'));
		document.moveDown(0.5);
    document.fillColor('#526a63').fontSize(8).text(text('Importes separados por moneda; no comparables entre monedas.'));
    for (const budget of report.metrics.budgetsByCurrency) document.fontSize(10).text(`${budget.currency} · ${text('Planificado')}: ${number(budget.plannedBudget)} · ${text('Ejecutado')}: ${number(budget.spentBudget)} · ${text('Disponible')}: ${number(budget.availableBudget)}`);
    if (report.metrics.unallocatedBudgetEntries) document.fontSize(8).text(`${text('Registros financieros sin moneda atribuible')}: ${report.metrics.unallocatedBudgetEntries}`);
		document.moveDown(1.2);
		document
			.fillColor('#17332d')
			.fontSize(16)
			.text(text('Programas, campañas e iniciativas'));
		document.moveDown(0.5);
		for (const item of report.initiatives) {
			if (document.y > 735) document.addPage();
			const y = document.y;
			document
				.roundedRect(42, y, 511, 54, 7)
				.fill(item.status === 'AT_RISK' ? '#fff0ef' : '#f8fbfa');
			document
				.fillColor('#15372f')
				.fontSize(10)
				.text(item.title, 54, y + 9, { width: 310 });
			document
				.fillColor('#687b76')
				.fontSize(8)
				.text(
					`${item.ownerName ?? text('Responsable por definir')} · ${item.startsOn} — ${item.endsOn}`,
					54,
					y + 25,
					{ width: 330 },
				);
			document
				.fillColor(item.status === 'AT_RISK' ? '#ad3d44' : '#087366')
				.fontSize(9)
				.text(`${departmentReportStatus(locale, item.status)} · ${item.progress}%`, 410, y + 10, {
					width: 128,
					align: 'right',
				});
			document
				.fillColor('#526a63')
				.fontSize(8)
				.text(
					`${item.currency} ${number(Number(item.spentBudget))} / ${number(Number(item.plannedBudget))}`,
					410,
					y + 28,
					{ width: 128, align: 'right' },
				);
			document.y = y + 62;
		}
		document.moveDown(0.6);
		document
			.fillColor('#6d7e79')
			.fontSize(8)
			.text(
				text('GestionChurch apoya la coordinación y conserva la trazabilidad; no sustituye las decisiones de la junta, la reunión administrativa ni la autoridad pastoral.'),
				42,
				document.y,
				{ width: 511, align: 'center' },
			);
		document.end();
	}

	@Post('plans')
	@AtomicWrite
	async createPlan(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = planSchema.parse(body);
		const { workspace } = await workspaceAccess(
			pool,
			user,
			input.workspaceId,
			'canManage',
		);
		if (input.ownerId)
			await assertTeamMember(pool, workspace.department_id, input.ownerId);
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.annual_plans(workspace_id,title,year,vision,mission,owner_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
			[
				input.workspaceId,
				input.title,
				input.year,
				input.vision,
				input.mission,
				input.ownerId ?? null,
				user.sub,
			],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.plan.created',
			'department_plan',
			result.rows[0]!.id,
			input,
		);
		return { id: result.rows[0]!.id };
	}

	@Post('plans/:id/approve')
	@AtomicWrite
	async approvePlan(
		@Req() request: Request & { user?: AuthPrincipal },
		@Param('id') id: string,
	) {
		const { user, pool } = await this.authorized(request);
		const row = await pool.query<{ workspace_id: string }>(
			`SELECT workspace_id FROM department_operations.annual_plans WHERE id=$1`,
			[id],
		);
		if (!row.rows[0])
			throw Object.assign(new Error('El plan no existe.'), { status: 404 });
		await workspaceAccess(pool, user, row.rows[0].workspace_id, 'canApprove');
		const result = await pool.query(
			`UPDATE department_operations.annual_plans SET status='ACTIVE',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1 RETURNING id,title,status`,
			[id, user.sub],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.plan.approved',
			'department_plan',
			id,
			result.rows[0],
		);
		return result.rows[0];
	}

	@Post('objectives')
	@AtomicWrite
	async createObjective(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = objectiveSchema.parse(body);
		const plan = await pool.query<{
			workspace_id: string;
			department_id: string;
		}>(
			`SELECT p.workspace_id,w.department_id FROM department_operations.annual_plans p JOIN department_operations.workspaces w ON w.id=p.workspace_id WHERE p.id=$1`,
			[input.planId],
		);
		if (!plan.rows[0])
			throw Object.assign(new Error('El plan no existe.'), { status: 404 });
		await workspaceAccess(pool, user, plan.rows[0].workspace_id, 'canManage');
		if (input.ownerId)
			await assertTeamMember(pool, plan.rows[0].department_id, input.ownerId);
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.objectives(plan_id,title,description,target_value,unit,due_on,owner_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
			[
				input.planId,
				input.title,
				input.description,
				input.targetValue,
				input.unit,
				input.dueOn ?? null,
				input.ownerId ?? null,
				user.sub,
			],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.objective.created',
			'department_objective',
			result.rows[0]!.id,
			input,
		);
		return { id: result.rows[0]!.id };
	}

	@Post('initiatives')
	@AtomicWrite
	async createInitiative(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = initiativeSchema.parse(body);
		const { workspace } = await workspaceAccess(
			pool,
			user,
			input.workspaceId,
			'canManage',
		);
		if (input.ownerId)
			await assertTeamMember(pool, workspace.department_id, input.ownerId);
		if (input.planId)
			await assertWorkspaceResource(pool, input.workspaceId, 'PLAN', input.planId);
		if (input.calendarActivityId) {
			const linked = await pool.query(
				`SELECT 1 FROM calendar.activities WHERE id=$1 AND department_id=$2`,
				[input.calendarActivityId, workspace.department_id],
			);
			if (!linked.rowCount)
				throw Object.assign(
					new Error(
						'La actividad de calendario no pertenece a este departamento.',
					),
					{ status: 400 },
				);
		}
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.initiatives(workspace_id,plan_id,calendar_activity_id,initiative_type,title,description,objective,starts_on,ends_on,priority,planned_budget,currency,owner_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
			[
				input.workspaceId,
				input.planId ?? null,
				input.calendarActivityId ?? null,
				input.initiativeType,
				input.title,
				input.description,
				input.objective,
				input.startsOn,
				input.endsOn,
				input.priority,
				input.plannedBudget,
				input.currency.toUpperCase(),
				input.ownerId ?? null,
				user.sub,
			],
		);
		if (input.ownerId)
			await notify(
				pool,
				user.tenantId!,
				[input.ownerId],
				'Nueva iniciativa departamental',
				`${input.title} · ${input.startsOn}`,
				'/ministry-hub',
				'department_operations.initiative',
			);
		await audit(
			pool,
			user.sub,
			'department_operations.initiative.created',
			'department_initiative',
			result.rows[0]!.id,
			input,
		);
		return { id: result.rows[0]!.id };
	}

	@Patch('initiatives/:id')
	@AtomicWrite
	async updateInitiative(
		@Req() request: Request & { user?: AuthPrincipal },
		@Param('id') id: string,
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = initiativeUpdateSchema.parse(body);
		const row = await pool.query<{ workspace_id: string }>(
			`SELECT workspace_id FROM department_operations.initiatives WHERE id=$1`,
			[id],
		);
		if (!row.rows[0])
			throw Object.assign(new Error('La iniciativa no existe.'), {
				status: 404,
			});
		await workspaceAccess(pool, user, row.rows[0].workspace_id, 'canManage');
		const result = await pool.query(
			`UPDATE department_operations.initiatives SET status=COALESCE($2,status),progress=COALESCE($3,progress),outcome=COALESCE($4,outcome),updated_at=now() WHERE id=$1 RETURNING id,title,status,progress,outcome`,
			[id, input.status ?? null, input.progress ?? null, input.outcome ?? null],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.initiative.updated',
			'department_initiative',
			id,
			result.rows[0],
		);
		return result.rows[0];
	}

	@Post('initiatives/:id/assignments')
	@AtomicWrite
	async assign(
		@Req() request: Request & { user?: AuthPrincipal },
		@Param('id') id: string,
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = assignmentSchema.parse(body);
		const row = await pool.query<{
			workspace_id: string;
			department_id: string;
			title: string;
		}>(
			`SELECT i.workspace_id,w.department_id,i.title FROM department_operations.initiatives i JOIN department_operations.workspaces w ON w.id=i.workspace_id WHERE i.id=$1`,
			[id],
		);
		if (!row.rows[0])
			throw Object.assign(new Error('La iniciativa no existe.'), {
				status: 404,
			});
		await workspaceAccess(pool, user, row.rows[0].workspace_id, 'canManage');
		await assertTeamMember(pool, row.rows[0].department_id, input.userId);
		await pool.query(
			`INSERT INTO department_operations.initiative_assignments(initiative_id,user_id,responsibility,status,assigned_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(initiative_id,user_id) DO UPDATE SET responsibility=EXCLUDED.responsibility,status=EXCLUDED.status,assigned_by=EXCLUDED.assigned_by,updated_at=now()`,
			[id, input.userId, input.responsibility, input.status, user.sub],
		);
		await notify(
			pool,
			user.tenantId!,
			[input.userId],
			'Responsabilidad departamental asignada',
			`${row.rows[0].title} · ${input.responsibility}`,
			'/ministry-hub',
			'department_operations.assignment',
		);
		await audit(
			pool,
			user.sub,
			'department_operations.assignment.saved',
			'department_initiative',
			id,
			input,
		);
		return { updated: true };
	}

	@Post('budget')
	@AtomicWrite
	async createBudget(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = budgetSchema.parse(body);
		const { access } = await workspaceAccess(pool, user, input.workspaceId, 'canFinance');
		if (input.initiativeId)
			await assertWorkspaceResource(pool, input.workspaceId, 'INITIATIVE', input.initiativeId);
		const approved = input.status === 'APPROVED' || input.status === 'PAID';
		if (approved) requireRight(access, 'canApprove');
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.budget_entries(workspace_id,initiative_id,entry_type,category,description,amount,occurred_on,status,vendor,reference,created_by,approved_by,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $12::uuid IS NULL THEN NULL ELSE now() END) RETURNING id`,
			[
				input.workspaceId,
				input.initiativeId ?? null,
				input.entryType,
				input.category,
				input.description,
				input.amount,
				input.occurredOn,
				input.status,
				input.vendor,
				input.reference,
				user.sub,
				approved ? user.sub : null,
			],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.budget.created',
			'department_budget',
			result.rows[0]!.id,
			input,
		);
		return { id: result.rows[0]!.id };
	}

	@Patch('budget/:id')
	@AtomicWrite
	async updateBudget(
		@Req() request: Request & { user?: AuthPrincipal },
		@Param('id') id: string,
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = budgetUpdateSchema.parse(body);
		const row = await pool.query<{ workspace_id: string }>(
			`SELECT workspace_id FROM department_operations.budget_entries WHERE id=$1`,
			[id],
		);
		if (!row.rows[0])
			throw Object.assign(new Error('La partida no existe.'), { status: 404 });
		await workspaceAccess(pool, user, row.rows[0].workspace_id, 'canApprove');
		const result = await pool.query(
			`UPDATE department_operations.budget_entries SET status=$2,approved_by=$3,approved_at=now(),updated_at=now() WHERE id=$1 RETURNING id,status`,
			[id, input.status, user.sub],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.budget.reviewed',
			'department_budget',
			id,
			result.rows[0],
		);
		return result.rows[0];
	}

	@Post('tasks')
	@AtomicWrite
	async createTask(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = taskSchema.parse(body);
		const { workspace } = await workspaceAccess(
			pool,
			user,
			input.workspaceId,
			'canManage',
		);
		if (input.assignedTo)
			await assertTeamMember(pool, workspace.department_id, input.assignedTo);
		if (input.initiativeId)
			await assertWorkspaceResource(pool, input.workspaceId, 'INITIATIVE', input.initiativeId);
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.tasks(workspace_id,initiative_id,title,description,assigned_to,due_at,priority,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
			[
				input.workspaceId,
				input.initiativeId ?? null,
				input.title,
				input.description,
				input.assignedTo ?? null,
				input.dueAt ?? null,
				input.priority,
				user.sub,
			],
		);
		if (input.assignedTo)
			await notify(
				pool,
				user.tenantId!,
				[input.assignedTo],
				'Nueva tarea departamental',
				`${input.title}${input.dueAt ? ` · ${new Date(input.dueAt).toLocaleString('es')}` : ''}`,
				'/ministry-hub',
				'department_operations.task',
			);
		await audit(
			pool,
			user.sub,
			'department_operations.task.created',
			'department_task',
			result.rows[0]!.id,
			input,
		);
		return { id: result.rows[0]!.id };
	}

	@Patch('tasks/:id')
	@AtomicWrite
	async updateTask(
		@Req() request: Request & { user?: AuthPrincipal },
		@Param('id') id: string,
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = taskUpdateSchema.parse(body);
		const row = await pool.query<{
			workspace_id: string;
			assigned_to: string | null;
		}>(
			`SELECT workspace_id,assigned_to FROM department_operations.tasks WHERE id=$1`,
			[id],
		);
		if (!row.rows[0])
			throw Object.assign(new Error('La tarea no existe.'), { status: 404 });
		const { access } = await workspaceAccess(
			pool,
			user,
			row.rows[0].workspace_id,
		);
		if (!access.canManage && row.rows[0].assigned_to !== user.sub)
			throw Object.assign(
				new Error(
					'Solo el responsable o la dirección puede actualizar esta tarea.',
				),
				{ status: 403 },
			);
		const result = await pool.query(
			`UPDATE department_operations.tasks SET status=$2,completed_at=CASE WHEN $2='COMPLETED' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING id,title,status`,
			[id, input.status],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.task.updated',
			'department_task',
			id,
			result.rows[0],
		);
		return result.rows[0];
	}

	@Post('meetings')
	@AtomicWrite
	async createMeeting(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = meetingSchema.parse(body);
		const { workspace } = await workspaceAccess(
			pool,
			user,
			input.workspaceId,
			'canManage',
		);
		for (const id of input.participantIds)
			await assertTeamMember(pool, workspace.department_id, id);
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.meetings(workspace_id,title,scheduled_at,ends_at,location,agenda,participant_ids,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
			[
				input.workspaceId,
				input.title,
				input.scheduledAt,
				input.endsAt,
				input.location,
				input.agenda,
				input.participantIds,
				user.sub,
			],
		);
		await notify(
			pool,
			user.tenantId!,
			input.participantIds,
			'Reunión departamental programada',
			`${input.title} · ${new Date(input.scheduledAt).toLocaleString('es')}`,
			'/ministry-hub',
			'department_operations.meeting',
		);
		await audit(
			pool,
			user.sub,
			'department_operations.meeting.created',
			'department_meeting',
			result.rows[0]!.id,
			input,
		);
		return { id: result.rows[0]!.id };
	}

	@Patch('meetings/:id')
	@AtomicWrite
	async updateMeeting(
		@Req() request: Request & { user?: AuthPrincipal },
		@Param('id') id: string,
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = meetingUpdateSchema.parse(body);
		const row = await pool.query<{ workspace_id: string }>(
			`SELECT workspace_id FROM department_operations.meetings WHERE id=$1`,
			[id],
		);
		if (!row.rows[0])
			throw Object.assign(new Error('La reunión no existe.'), { status: 404 });
		await workspaceAccess(pool, user, row.rows[0].workspace_id, 'canManage');
		const result = await pool.query(
			`UPDATE department_operations.meetings SET status=COALESCE($2,status),minutes=COALESCE($3,minutes),updated_at=now() WHERE id=$1 RETURNING id,title,status,minutes`,
			[id, input.status ?? null, input.minutes ?? null],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.meeting.updated',
			'department_meeting',
			id,
			result.rows[0],
		);
		return result.rows[0];
	}

	@Post('decisions')
	@AtomicWrite
	async createDecision(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = decisionSchema.parse(body);
		await workspaceAccess(pool, user, input.workspaceId, 'canApprove');
		if (input.meetingId)
			await assertWorkspaceResource(pool, input.workspaceId, 'MEETING', input.meetingId);
		if (input.initiativeId)
			await assertWorkspaceResource(pool, input.workspaceId, 'INITIATIVE', input.initiativeId);
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.decisions(workspace_id,meeting_id,initiative_id,title,decision_text,authority_type,decided_on,effective_on,evidence_reference,approved_by,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
			[
				input.workspaceId,
				input.meetingId ?? null,
				input.initiativeId ?? null,
				input.title,
				input.decisionText,
				input.authorityType,
				input.decidedOn,
				input.effectiveOn ?? null,
				input.evidenceReference,
				user.sub,
			],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.decision.recorded',
			'department_decision',
			result.rows[0]!.id,
			input,
		);
		return { id: result.rows[0]!.id };
	}

	@Post('comments')
	@AtomicWrite
	async createComment(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = commentSchema.parse(body);
		const { workspace, access } = await workspaceAccess(pool, user, input.workspaceId);
		await assertWorkspaceResource(
			pool,
			input.workspaceId,
			input.resourceType,
			input.resourceId,
		);
		for (const id of input.mentionUserIds)
			await assertTeamMember(pool, workspace.department_id, id);
		let restrictedRecord = false;
		if (input.resourceType === 'RECORD') {
			const record = await pool.query<{ visibility: string; record_type: string }>(
				`SELECT visibility,record_type FROM department_operations.ministry_records WHERE id=$1 AND workspace_id=$2`,
				[input.resourceId, input.workspaceId],
			);
			const visibility = recordVisibility(workspace.ministry_key, record.rows[0]?.record_type ?? '', record.rows[0]?.visibility ?? '');
			if (!canReadMinistryRecord(access, visibility))
				throw Object.assign(new Error('No tiene acceso a este registro departamental.'), {
					status: 403, code: 'MINISTRY_RECORD_ACCESS_DENIED',
				});
			restrictedRecord = visibility !== 'TEAM';
			if (restrictedRecord && input.mentionUserIds.length) {
				const recipients = await pool.query<{ id: string; roles: AuthPrincipal['roles']; role: string }>(
					`SELECT u.id,u.roles,m.role FROM identity.users u JOIN identity.department_memberships m ON m.user_id=u.id AND m.department_id=$1 WHERE u.active AND u.id=ANY($2::uuid[])`,
					[workspace.department_id, input.mentionUserIds],
				);
				const allowed = new Set(recipients.rows
					.filter((recipient) => canReadMinistryRecord(accessFor(recipient, recipient.role), visibility))
					.map((recipient) => recipient.id));
				if (input.mentionUserIds.some((id) => !allowed.has(id)))
					throw Object.assign(new Error('Solo puede mencionar a personas autorizadas a consultar este registro.'), {
						status: 403, code: 'MINISTRY_RECORD_MENTION_DENIED',
					});
			}
		}
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.comments(workspace_id,resource_type,resource_id,body,mention_user_ids,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
			[
				input.workspaceId,
				input.resourceType,
				input.resourceId,
				input.body,
				input.mentionUserIds,
				user.sub,
			],
		);
		await notify(
			pool,
			user.tenantId!,
			input.mentionUserIds,
			'Mención en un espacio departamental',
			// Do not persist confidential content in notifications that can outlive a role grant.
			restrictedRecord
				? 'Tiene una mención en un registro restringido. Consulte el espacio departamental con sus permisos vigentes.'
				: input.body.slice(0, 240),
			'/ministry-hub',
			'department_operations.mention',
		);
		await audit(
			pool,
			user.sub,
			'department_operations.comment.created',
			'department_comment',
			result.rows[0]!.id,
			{ ...input, body: '[registered]' },
		);
		return { id: result.rows[0]!.id };
	}

	@Post('kpis')
	@AtomicWrite
	async createKpi(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = kpiSchema.parse(body);
		await workspaceAccess(pool, user, input.workspaceId, 'canManage');
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.kpis(workspace_id,name,description,target_value,current_value,unit,period_start,period_end,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
			[
				input.workspaceId,
				input.name,
				input.description,
				input.targetValue,
				input.currentValue,
				input.unit,
				input.periodStart,
				input.periodEnd,
				user.sub,
			],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.kpi.created',
			'department_kpi',
			result.rows[0]!.id,
			input,
		);
		return { id: result.rows[0]!.id };
	}

	@Post('records')
	@AtomicWrite
	async createRecord(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const { user, pool } = await this.authorized(request);
		const input = recordSchema.parse(body);
		const { workspace } = await workspaceAccess(
			pool,
			user,
			input.workspaceId,
			'canManage',
		);
		const pack =
			capabilityPacks[workspace.ministry_key] ?? capabilityPacks.GENERAL!;
		const definition = pack.recordTypes.find(
			(item) => item.type === input.recordType,
		);
		if (!definition)
			throw Object.assign(
				new Error('El tipo de registro no corresponde a este ministerio.'),
				{ status: 400, code: 'INVALID_MINISTRY_RECORD' },
			);
		if (input.ownerId)
			await assertTeamMember(pool, workspace.department_id, input.ownerId);
		const visibility =
			effectiveRecordVisibility(input.visibility, definition.privacy);
		const result = await pool.query<{ id: string }>(
			`INSERT INTO department_operations.ministry_records(workspace_id,record_type,title,record_date,visibility,data,owner_id,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING id`,
			[
				input.workspaceId,
				input.recordType,
				input.title,
				input.recordDate,
				visibility,
				JSON.stringify(input.data),
				input.ownerId ?? null,
				user.sub,
			],
		);
		await audit(
			pool,
			user.sub,
			'department_operations.record.created',
			'department_record',
			result.rows[0]!.id,
			{ ...input, data: '[registered]', visibility },
		);
		return { id: result.rows[0]!.id };
	}
}

@Module({
	controllers: [HealthController, DepartmentOperationsController],
	providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
class DepartmentOperationsModule {}

await bootstrapNest(
	DepartmentOperationsModule,
	Number(process.env.DEPARTMENT_OPERATIONS_SERVICE_PORT ?? 4020),
	'department-operations-service',
);

let outboxBusy = false;
async function retryDepartmentNotifications(): Promise<void> {
  if (outboxBusy) return;
  outboxBusy = true;
  try {
    const tenants = await controlPool.query<{ id: string }>("SELECT id FROM control.tenants WHERE status='ACTIVE'");
    for (const tenant of tenants.rows) {
      try {
        const { pool } = await tenantPoolFromId(tenant.id);
        await dispatchDepartmentNotifications(pool, tenant.id);
      } catch {
        console.warn(JSON.stringify({ service: 'department-operations-service', event: 'notification_outbox_tenant_unavailable' }));
      }
    }
  } catch {
    console.warn(JSON.stringify({ service: 'department-operations-service', event: 'notification_outbox_control_unavailable' }));
  } finally { outboxBusy = false; }
}
const outboxTimer = setInterval(() => void retryDepartmentNotifications(), 10_000);
outboxTimer.unref();
void retryDepartmentNotifications();
