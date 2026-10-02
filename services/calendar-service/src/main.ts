import 'reflect-metadata';
import type { Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import PDFDocument from 'pdfkit';
import { Body, Controller, Get, Headers, Module, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import {
  createActivitySchema,
  recommendationSchema,
  reviewAlternativeSchema,
  reviewDecisionSchema,
  reviewRequestSchema,
  reviewSessionSchema,
  updateActivitySchema,
  type AuthPrincipal,
} from '@gc/contracts';
import { deriveConflictSeverity, expandRecurrence, heuristicForecastMetadata, suggestFreeIntervals, type ConflictFactor } from '@gc/calendar-domain';
import { controlPool, tenantPoolFromId, withTransaction } from '@gc/database';
import { publishDomainEvent } from '@gc/messaging';
import { activityReadPredicate, assertActivityRead, bootstrapNest, currentUser, HEALTH_RESPONSE, JwtAuthGuard, Public, redactActivityConflict, requirePermission, safeCalendarText, safeCsvCell, sha256 } from '@gc/platform';
import { sendOutboxEvent } from './outbox-transport.js';
import { recoverOutboxEvent } from './outbox-recovery.js';
import { preserveActivityCustomData } from './activity-custom-update.js';
import { fieldCopySourceSchema, invalidSystemFieldCopy, invalidSystemTemplateCopy, systemFieldCopySource, systemTemplateCopySource, templateCopySourceSchema } from './activity-form-provenance.js';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_calendar_service';

type Conflict = {
  visibility: string;
  created_by: string;
  reservation_id: string;
  activity_id: string;
  code: string;
  title: string;
  department_id: string;
  department: string;
  department_color: string;
  venue: string | null;
  responsible_name: string;
  submitted_by_name: string;
  submitted_at: string;
  activity_created_at: string;
  starts_at: string;
  ends_at: string;
  disputed_start: string;
  disputed_end: string;
  reservation_status: string;
  same_venue: boolean;
  same_resource: boolean;
  same_responsible: boolean;
  scope_conflict: boolean;
};

const departmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});
const departmentUpdateSchema = departmentSchema.partial().extend({
  description: departmentSchema.shape.description.removeDefault().optional(),
  active: z.boolean().optional()
});
const activityChangeRequestSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
  changes: updateActivitySchema
});
const activityChangeDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().trim().min(10).max(2000)
});
const venueSchema = z.object({ name: z.string().trim().min(2).max(120), capacity: z.number().int().min(0).max(100000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
const resourceSchema = z.object({ name: z.string().trim().min(2).max(120), exclusive: z.boolean().default(true) });
const settingsSchema = z.object({
  timezone: z.string().trim().min(3).max(80),
  businessDayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  businessDayEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  maxOptions: z.number().int().min(1).max(10),
  suggestionHorizonDays: z.number().int().min(7).max(365),
  provisionalHoldHours: z.number().int().min(1).max(720)
});

const formFieldSourceSchema = z.enum([
  'title', 'description', 'objective', 'departmentId', 'venueId', 'responsibleName', 'contactInfo',
  'estimatedAttendance', 'category', 'modality', 'visibility', 'priority', 'tags', 'internalNotes'
]);
const formFieldSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  kind: z.enum(['builtin', 'custom']),
  source: formFieldSourceSchema.optional(),
  type: z.enum(['text', 'textarea', 'number', 'email', 'tel', 'date', 'select', 'checkbox']),
  label: z.string().trim().min(2).max(120),
  copySource: fieldCopySourceSchema,
  placeholder: z.string().trim().max(240).default(''),
  helpText: z.string().trim().max(400).default(''),
  required: z.boolean().default(false),
  visible: z.boolean().default(true),
  width: z.enum(['half', 'full']).default('half'),
  options: z.array(z.string().trim().min(1).max(100)).max(30).default([])
}).superRefine((field, context) => {
  for (const property of invalidSystemFieldCopy(field)) context.addIssue({ code: 'custom', path: ['copySource', property], message: 'Un texto de sistema debe coincidir con su definición base; marque CUSTOM al personalizar.' });
  if (field.kind === 'builtin' && !field.source) context.addIssue({ code: 'custom', path: ['source'], message: 'El campo base requiere un origen.' });
  if (field.kind === 'custom' && field.source) context.addIssue({ code: 'custom', path: ['source'], message: 'Un campo personalizado no admite origen base.' });
  if (field.kind === 'custom' && field.type === 'select' && field.options.length < 2) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Una lista requiere al menos dos opciones.' });
  }
});
const essentialFormSources = ['title', 'description', 'departmentId', 'responsibleName'] as const;
const activityFormTemplateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(400).default(''),
  submitLabel: z.string().trim().min(2).max(60).default('Crear y enviar'),
  copySource: templateCopySourceSchema,
  fields: z.array(formFieldSchema).min(4).max(40)
}).superRefine((template, context) => {
  for (const property of invalidSystemTemplateCopy(template)) context.addIssue({ code: 'custom', path: ['copySource', property], message: 'Un texto de sistema debe coincidir con su definición base; marque CUSTOM al personalizar.' });
  const ids = new Set<string>();
  const sources = new Set<string>();
  for (const [index, field] of template.fields.entries()) {
    if (ids.has(field.id)) context.addIssue({ code: 'custom', path: ['fields', index, 'id'], message: 'El identificador está repetido.' });
    ids.add(field.id);
    if (field.source) {
      if (sources.has(field.source)) context.addIssue({ code: 'custom', path: ['fields', index, 'source'], message: 'El campo base está repetido.' });
      sources.add(field.source);
    }
  }
  for (const source of essentialFormSources) {
    const field = template.fields.find((candidate) => candidate.source === source);
    if (!field || !field.visible || !field.required) {
      context.addIssue({ code: 'custom', path: ['fields'], message: `El campo esencial ${source} debe permanecer visible y obligatorio.` });
    }
  }
});
const formDraftUpdateSchema = z.object({
  expectedVersion: z.number().int().min(1),
  template: activityFormTemplateSchema
});
const formPublishSchema = z.object({ expectedDraftVersion: z.number().int().min(1) });

const defaultActivityFormTemplate = activityFormTemplateSchema.parse({
  copySource: systemTemplateCopySource,
  title: 'Solicitud de actividad',
  description: 'Completa la información para coordinar, revisar y calendarizar la actividad.',
  submitLabel: 'Crear y enviar',
  fields: [
    { id: 'title', kind: 'builtin', source: 'title', type: 'text', label: 'Nombre de la actividad', placeholder: 'Ej. Encuentro de familias', required: true, visible: true, width: 'full' },
    { id: 'description', kind: 'builtin', source: 'description', type: 'textarea', label: 'Descripción', placeholder: 'Explica brevemente el propósito y dinámica…', required: true, visible: true, width: 'full' },
    { id: 'objective', kind: 'builtin', source: 'objective', type: 'textarea', label: 'Objetivo', placeholder: '¿Qué resultado espera alcanzar?', visible: true, width: 'full' },
    { id: 'department', kind: 'builtin', source: 'departmentId', type: 'select', label: 'Departamento', required: true, visible: true, width: 'half' },
    { id: 'venue', kind: 'builtin', source: 'venueId', type: 'select', label: 'Lugar', visible: true, width: 'half' },
    { id: 'responsible', kind: 'builtin', source: 'responsibleName', type: 'text', label: 'Responsable', placeholder: 'Nombre completo', required: true, visible: true, width: 'half' },
    { id: 'contact', kind: 'builtin', source: 'contactInfo', type: 'text', label: 'Contacto', placeholder: 'Teléfono o correo', visible: true, width: 'half' },
    { id: 'attendance', kind: 'builtin', source: 'estimatedAttendance', type: 'number', label: 'Asistencia estimada', visible: true, width: 'half' },
    { id: 'category', kind: 'builtin', source: 'category', type: 'text', label: 'Categoría', visible: true, width: 'half' },
    { id: 'modality', kind: 'builtin', source: 'modality', type: 'select', label: 'Modalidad', options: ['Presencial', 'Virtual', 'Híbrida'], visible: true, width: 'half' },
    { id: 'visibility', kind: 'builtin', source: 'visibility', type: 'select', label: 'Visibilidad', options: ['Toda la iglesia', 'Solo liderazgo', 'Público'], visible: true, width: 'half' },
    { id: 'priority', kind: 'builtin', source: 'priority', type: 'number', label: 'Prioridad', visible: true, width: 'half' },
    { id: 'tags', kind: 'builtin', source: 'tags', type: 'text', label: 'Etiquetas separadas por coma', placeholder: 'familia, misión, jóvenes', visible: true, width: 'full' },
    { id: 'notes', kind: 'builtin', source: 'internalNotes', type: 'textarea', label: 'Notas internas', visible: true, width: 'full' }
  ].map((field) => ({ ...field, copySource: systemFieldCopySource }))
});

type ActivityFormTemplate = z.infer<typeof activityFormTemplateSchema>;

async function ensureActivityFormTemplate(pool: Pool | PoolClient, userId: string): Promise<void> {
  const serialized = JSON.stringify(defaultActivityFormTemplate);
  await pool.query(
    `INSERT INTO calendar.activity_form_templates(singleton,draft_schema,published_schema,updated_by)
     VALUES(true,$1::jsonb,$1::jsonb,$2) ON CONFLICT(singleton) DO NOTHING`,
    [serialized, userId]
  );
}

function validateCustomData(template: ActivityFormTemplate, customData: Record<string, string | number | boolean | null>): void {
  const fields = template.fields.filter((field) => field.kind === 'custom' && field.visible);
  const allowed = new Map(fields.map((field) => [field.id, field]));
  for (const key of Object.keys(customData)) {
    if (!allowed.has(key)) throw Object.assign(new Error(`El campo personalizado ${key} no está publicado.`), { status: 400, code: 'UNKNOWN_CUSTOM_FIELD' });
  }
  for (const field of fields) {
    const value = customData[field.id];
    if (field.required && (value === undefined || value === null || value === '' || (field.type === 'checkbox' && value !== true))) {
      throw Object.assign(new Error(`Debe completar ${field.label}.`), { status: 400, code: 'CUSTOM_FIELD_REQUIRED' });
    }
    if (value === undefined || value === null || value === '') continue;
    if (field.type === 'number' && typeof value !== 'number') throw Object.assign(new Error(`${field.label} debe ser numérico.`), { status: 400, code: 'CUSTOM_FIELD_TYPE' });
    if (field.type === 'checkbox' && typeof value !== 'boolean') throw Object.assign(new Error(`${field.label} debe ser una confirmación.`), { status: 400, code: 'CUSTOM_FIELD_TYPE' });
    if (!['number', 'checkbox'].includes(field.type) && typeof value !== 'string') throw Object.assign(new Error(`${field.label} tiene un formato inválido.`), { status: 400, code: 'CUSTOM_FIELD_TYPE' });
    if (field.type === 'select' && typeof value === 'string' && !field.options.includes(value)) throw Object.assign(new Error(`${field.label} contiene una opción inválida.`), { status: 400, code: 'CUSTOM_FIELD_OPTION' });
  }
}

function validateActivityCustomUpdate(activity: Record<string, unknown>, customData: Record<string, string | number | boolean | null> | undefined): Record<string, unknown> | undefined {
  if (customData === undefined) return;
  // An existing activity retains the template against which it was recorded.
  // A newer publication must not reinterpret or delete its historical fields.
  const snapshot = activityFormTemplateSchema.safeParse(activity.form_schema_snapshot);
  if (snapshot.success) {
    const visibleIds = new Set(snapshot.data.fields.filter(field => field.kind === 'custom' && field.visible).map(field => field.id));
    const preserved = preserveActivityCustomData(activity.custom_data, customData, visibleIds);
    validateCustomData(snapshot.data, Object.fromEntries(Object.entries(customData).filter(([key]) => visibleIds.has(key))));
    return preserved;
  }
  if (Object.keys(customData).length) {
    throw Object.assign(new Error('El formulario original no permite validar esos campos. Recargue la actividad antes de continuar.'), {
      status: 409, code: 'ACTIVITY_FORM_SNAPSHOT_INVALID'
    });
  }
}

async function poolFor(user: AuthPrincipal): Promise<Pool> {
  if (user.scope !== 'tenant' || !user.tenantId) throw Object.assign(new Error('Se requiere un tenant.'), { status: 403 });
  return (await tenantPoolFromId(user.tenantId)).pool;
}

async function assertDepartmentScope(pool: Pool | PoolClient, user: AuthPrincipal, departmentId: string): Promise<void> {
  if (user.permissions.includes('calendar.manage')) return;
  const allowed = await pool.query(
    `SELECT 1 FROM identity.users u WHERE u.id=$1 AND (
       $2::uuid=ANY(u.department_ids) OR EXISTS(
         SELECT 1 FROM identity.department_memberships m WHERE m.user_id=u.id AND m.department_id=$2
       )
     )`, [user.sub, departmentId]
  );
  if (!allowed.rowCount) throw Object.assign(new Error('No puede administrar actividades de este departamento.'), { status: 403, code: 'DEPARTMENT_SCOPE_DENIED' });
}

type DepartmentAction = 'create' | 'edit' | 'submit' | 'cancel' | 'complete' | 'request-approved-change';
type DepartmentRole = 'DIRECTOR' | 'ASSISTANT_DIRECTOR' | 'DEPARTMENT_SECRETARY' | 'PLANNER' | 'CONTRIBUTOR' | 'VIEWER';

async function departmentRole(pool: Pool | PoolClient, userId: string, departmentId: string): Promise<DepartmentRole | null> {
  const result = await pool.query<{ role: DepartmentRole }>(
    `SELECT role FROM identity.department_memberships WHERE user_id=$1 AND department_id=$2`, [userId, departmentId]
  );
  return result.rows[0]?.role ?? null;
}

async function authorizeDepartmentAction(
  pool: Pool | PoolClient,
  user: AuthPrincipal,
  departmentId: string,
  action: DepartmentAction,
  createdBy?: string
): Promise<DepartmentRole | 'TENANT_ADMIN'> {
  if (user.permissions.includes('calendar.manage')) return 'TENANT_ADMIN';
  const role = await departmentRole(pool, user.sub, departmentId);
  const isOwner = createdBy === user.sub;
  const allowed = role && {
    create: role !== 'VIEWER',
    edit: ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(role) || (isOwner && ['PLANNER', 'CONTRIBUTOR'].includes(role)),
    submit: ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(role) || (isOwner && role === 'PLANNER'),
    cancel: role === 'DIRECTOR' || (isOwner && ['ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY', 'PLANNER', 'CONTRIBUTOR'].includes(role)),
    complete: ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(role) || (isOwner && role === 'PLANNER'),
    'request-approved-change': ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(role)
  }[action];
  if (!allowed) {
    throw Object.assign(new Error('Su rol departamental no permite realizar esta acción.'), {
      status: 403,
      code: 'DEPARTMENT_ROLE_DENIED'
    });
  }
  return role;
}

async function conflictsForRange(
  client: Pool | PoolClient,
  start: string,
  end: string,
  venueId: string | null,
  excludeActivityId?: string,
  candidateResourceIds: string[] = []
): Promise<Conflict[]> {
  const result = await client.query<Conflict>(
    `SELECT r.id reservation_id, a.id activity_id, a.code, a.title,a.visibility,a.created_by,d.id department_id,d.name department,d.color department_color,
            v.name venue,a.responsible_name,COALESCE(submitter.name,creator.name,a.responsible_name) submitted_by_name,
            r.created_at::text submitted_at,a.created_at::text activity_created_at,
            lower(r.reserved_range)::text starts_at,upper(r.reserved_range)::text ends_at,
            greatest(lower(r.reserved_range),$1::timestamptz)::text disputed_start,
            least(upper(r.reserved_range),$2::timestamptz)::text disputed_end,
            r.status reservation_status, ($3::uuid IS NOT NULL AND r.venue_id=$3::uuid) same_venue,
            (EXISTS(
              SELECT 1 FROM calendar.activity_resources candidate
              JOIN calendar.activity_resources occupied ON occupied.resource_id=candidate.resource_id
              JOIN calendar.resources resource ON resource.id=candidate.resource_id AND resource.exclusive
              WHERE candidate.activity_id=$4::uuid AND occupied.activity_id=r.activity_id
            ) OR EXISTS(
              SELECT 1 FROM calendar.activity_resources occupied
              JOIN calendar.resources resource ON resource.id=occupied.resource_id AND resource.exclusive
              WHERE occupied.activity_id=r.activity_id AND occupied.resource_id=ANY($5::uuid[])
            )) same_resource,
            EXISTS(
              SELECT 1 FROM calendar.activities candidate
              WHERE candidate.id=$4::uuid AND candidate.responsible_user_id=a.responsible_user_id
            ) same_responsible,
            EXISTS(
              SELECT 1 FROM calendar.activities candidate
              WHERE candidate.id=$4::uuid AND (lower(candidate.audience) LIKE '%toda%' OR lower(a.audience) LIKE '%toda%')
            ) scope_conflict
       FROM calendar.reservations r
       JOIN calendar.activities a ON a.id=r.activity_id
       JOIN calendar.departments d ON d.id=a.department_id
       LEFT JOIN calendar.venues v ON v.id=r.venue_id
       LEFT JOIN LATERAL (
         SELECT ae.actor_id FROM audit.audit_events ae
          WHERE ae.resource_type='activity' AND ae.resource_id=a.id::text AND ae.action='activity.submitted'
          ORDER BY ae.created_at LIMIT 1
       ) submission ON true
       LEFT JOIN identity.users submitter ON submitter.id=submission.actor_id
       LEFT JOIN identity.users creator ON creator.id=a.created_by
      WHERE r.status IN ('PROVISIONAL','CONFIRMED')
        AND r.reserved_range && tstzrange($1::timestamptz,$2::timestamptz,'[)')
        AND ($4::uuid IS NULL OR r.activity_id <> $4::uuid)
      ORDER BY lower(r.reserved_range)`,
    [start, end, venueId, excludeActivityId ?? null, candidateResourceIds]
  );
  return result.rows;
}

async function optionSessions(client: Pool | PoolClient, optionId: string) {
  const result = await client.query<{
    id: string; starts_at: Date; ends_at: Date; effective_start: Date; effective_end: Date;
  }>(
    `SELECT id,starts_at,ends_at,lower(effective_range) effective_start,upper(effective_range) effective_end
       FROM calendar.schedule_sessions WHERE option_id=$1 ORDER BY starts_at`,
    [optionId]
  );
  return result.rows;
}

async function lockSessions(client: PoolClient, sessions: Array<{ effective_start: Date }>): Promise<void> {
  const keys = [...new Set(sessions.map((session) => session.effective_start.toISOString().slice(0, 10)))].sort();
  for (const key of keys) await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [key]);
}

function requireReviewSessionCoordinator(user: AuthPrincipal): void {
  if (!user.permissions.includes('calendar.manage') && !user.permissions.includes('calendar.conflict.resolve')) {
    throw Object.assign(new Error('Solo el administrador del tenant o la secretaría de junta pueden gestionar sesiones.'), {
      status: 403,
      code: 'REVIEW_SESSION_PERMISSION_REQUIRED'
    });
  }
}

function factorsFor(conflict: Conflict): ConflictFactor[] {
  const factors: ConflictFactor[] = ['GENERAL', conflict.reservation_status === 'CONFIRMED' ? 'CONFIRMED' : 'PROVISIONAL'];
  if (conflict.same_venue) factors.push('VENUE');
  if (conflict.same_resource) factors.push('RESOURCE');
  if (conflict.same_responsible) factors.push('RESPONSIBLE');
  if (conflict.scope_conflict) factors.push('SCOPE');
  return factors;
}

async function audit(
  client: PoolClient,
  actor: AuthPrincipal,
  action: string,
  resourceType: string,
  resourceId: string,
  afterData: unknown,
  request: Request
) {
  await client.query(
    `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
     VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
    [actor.sub, action, resourceType, resourceId, JSON.stringify(afterData), request.headers['x-correlation-id'] ?? null]
  );
}

async function outbox(client: PoolClient, eventType: string, aggregateId: string, payload: unknown) {
  await client.query(
    `INSERT INTO calendar.outbox_events(event_type,aggregate_id,payload) VALUES($1,$2,$3::jsonb)`,
    [eventType, aggregateId, JSON.stringify(payload)]
  );
}

async function dispatchOutbox(pool: Pool, tenantId: string): Promise<void> {
  try {
  const pending = await pool.query<{ id: string; event_type: string; aggregate_id: string; payload: unknown }>(
    `SELECT id,event_type,aggregate_id,payload FROM calendar.outbox_events
      WHERE delivered_at IS NULL AND attempts < 8 ORDER BY created_at LIMIT 20`
  );
  for (const event of pending.rows) {
    try {
      const envelope = { id: event.id, tenantId, type: event.event_type, aggregateId: event.aggregate_id, payload: event.payload };
      const published = await publishDomainEvent(envelope);
      if (!published) {
        await sendOutboxEvent(`${process.env.NOTIFICATION_SERVICE_URL ?? 'http://127.0.0.1:4015'}/events`, tenantId, process.env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret', envelope);
      }
      await pool.query(`UPDATE calendar.outbox_events SET delivered_at=now() WHERE id=$1`, [event.id]);
    } catch {
      await pool.query(`UPDATE calendar.outbox_events SET attempts=attempts+1 WHERE id=$1`, [event.id]);
    }
  }
  } catch (error) {
    // A tenant can disappear during fixture cleanup or become unavailable. This
    // background task must not reject into the process; committed outbox rows
    // stay pending for the next retry when the database is available again.
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    console.error(JSON.stringify({ level: 'warn', service: 'calendar-service', event: 'outbox_dispatch_deferred', code: typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'UNKNOWN' }));
  }
}

@Controller()
class CalendarController {
  @Public()
  @Get('health/live')
  health() { return HEALTH_RESPONSE; }

  @Get('calendar/outbox/dead-letter')
  async deadLetterOutbox(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'users.manage');
    const pool = await poolFor(user);
    const result = await pool.query(`SELECT id,event_type "eventType",aggregate_id "aggregateId",attempts,created_at "createdAt" FROM calendar.outbox_events WHERE delivered_at IS NULL AND attempts>=8 ORDER BY created_at LIMIT 200`);
    return { items: result.rows };
  }

  @Post('calendar/outbox/:id/retry')
  async retryOutbox(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Body() body: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'users.manage');
    const eventId = z.uuid().parse(id);
    const { reason } = z.object({ reason: z.string().trim().min(10).max(500) }).parse(body);
    const pool = await poolFor(user);
    return recoverOutboxEvent(pool, eventId, (client, event) => audit(client, user, 'calendar.outbox_retry_requested', 'calendar_outbox_event', eventId, { reason, eventType: event.event_type, aggregateId: event.aggregate_id, previousAttempts: event.attempts }, request));
  }

  @Get('departments')
  async departments(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const pool = await poolFor(user);
    const result = await pool.query(
      `SELECT d.id,d.name,d.description,d.color,d.active,d.created_at,d.updated_at,
              (SELECT count(*)::int FROM identity.department_memberships m WHERE m.department_id=d.id) member_count,
              (SELECT count(*)::int FROM calendar.activities a WHERE a.department_id=d.id AND a.status<>'CANCELLED' AND ${activityReadPredicate(user)}) activity_count,
              (SELECT u.name FROM identity.department_memberships m JOIN identity.users u ON u.id=m.user_id
                WHERE m.department_id=d.id AND m.role='DIRECTOR' AND u.active ORDER BY m.created_at LIMIT 1) director_name
         FROM calendar.departments d
        WHERE d.active OR $1::boolean
        ORDER BY d.active DESC,d.name`,
      [user.permissions.includes('calendar.manage')]
    );
    return { items: result.rows };
  }

  @Post('departments')
  async createDepartment(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.manage');
    const input = departmentSchema.parse(body);
    const pool = await poolFor(user);
    return withTransaction(pool, async (client) => {
      const result = await client.query(
        `INSERT INTO calendar.departments(name,description,color) VALUES($1,$2,$3)
         RETURNING id,name,description,color,active,created_at,updated_at`,
        [input.name, input.description, input.color]
      );
      const department = result.rows[0]!;
      await audit(client, user, 'department.created', 'department', department.id, department, request);
      return department;
    });
  }

  @Patch('departments/:id')
  async updateDepartment(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.manage');
    const input = departmentUpdateSchema.parse(body);
    return withTransaction(await poolFor(user), async (client) => {
      const result = await client.query(
        `UPDATE calendar.departments SET name=COALESCE($2,name),description=COALESCE($3,description),
           color=COALESCE($4,color),active=COALESCE($5,active),updated_at=now()
         WHERE id=$1 RETURNING id,name,description,color,active,created_at,updated_at`,
        [id, input.name ?? null, input.description ?? null, input.color ?? null, input.active ?? null]
      );
      if (!result.rowCount) throw Object.assign(new Error('El departamento no existe.'), { status: 404, code: 'DEPARTMENT_NOT_FOUND' });
      await audit(client, user, 'department.updated', 'department', id, result.rows[0], request);
      return result.rows[0];
    });
  }

  @Get('venues')
  async venues(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const result = await (await poolFor(user)).query(`SELECT id,name,capacity,color,active FROM calendar.venues WHERE active ORDER BY name`);
    return { items: result.rows };
  }

  @Post('venues')
  async createVenue(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.manage');
    const input = venueSchema.parse(body);
    return withTransaction(await poolFor(user), async (client) => {
      const result = await client.query(
        `INSERT INTO calendar.venues(name,capacity,color) VALUES($1,$2,$3) RETURNING id,name,capacity,color,active`,
        [input.name, input.capacity, input.color]
      );
      const venue = result.rows[0]!;
      await audit(client, user, 'venue.created', 'venue', venue.id, venue, request);
      return venue;
    });
  }

  @Get('resources')
  async resources(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const result = await (await poolFor(user)).query(`SELECT id,name,exclusive,active FROM calendar.resources WHERE active ORDER BY name`);
    return { items: result.rows };
  }

  @Post('resources')
  async createResource(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.manage');
    const input = resourceSchema.parse(body);
    return withTransaction(await poolFor(user), async (client) => {
      const result = await client.query(
        `INSERT INTO calendar.resources(name,exclusive) VALUES($1,$2)
         RETURNING id,name,exclusive,active`, [input.name, input.exclusive]
      );
      const resource = result.rows[0]!;
      await audit(client, user, 'resource.created', 'resource', resource.id, resource, request);
      return resource;
    });
  }

  @Get('calendar/settings')
  async calendarSettings(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const result = await (await poolFor(user)).query(
      `SELECT timezone,business_day_start,business_day_end,max_options,suggestion_horizon_days,
              provisional_hold_hours,updated_at FROM calendar.tenant_calendar_settings WHERE singleton`
    );
    return result.rows[0];
  }

  @Patch('calendar/settings')
  async updateCalendarSettings(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.manage');
    const input = settingsSchema.parse(body);
    return withTransaction(await poolFor(user), async (client) => {
      const result = await client.query(
        `UPDATE calendar.tenant_calendar_settings SET timezone=$1,business_day_start=$2,business_day_end=$3,
           max_options=$4,suggestion_horizon_days=$5,provisional_hold_hours=$6,updated_at=now()
         WHERE singleton RETURNING *`,
        [input.timezone, input.businessDayStart, input.businessDayEnd, input.maxOptions,
          input.suggestionHorizonDays, input.provisionalHoldHours]
      );
      await audit(client, user, 'calendar.settings.updated', 'calendar_settings', 'singleton', result.rows[0], request);
      return result.rows[0];
    });
  }

  @Get('activity-form/template')
  async activityFormTemplate(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const pool = await poolFor(user);
    await ensureActivityFormTemplate(pool, user.sub);
    const result = await pool.query<{
      draft_schema: ActivityFormTemplate;
      published_schema: ActivityFormTemplate;
      draft_version: number;
      published_version: number;
      updated_at: Date;
      published_at: Date;
      has_unpublished_changes: boolean;
    }>(
      `SELECT draft_schema,published_schema,draft_version,published_version,updated_at,published_at,
              (draft_schema <> published_schema) has_unpublished_changes
         FROM calendar.activity_form_templates WHERE singleton`
    );
    const row = result.rows[0]!;
    const canManage = user.permissions.includes('calendar.manage');
    return {
      published: activityFormTemplateSchema.parse(row.published_schema),
      publishedVersion: row.published_version,
      publishedAt: row.published_at,
      canManage,
      ...(canManage ? {
        draft: activityFormTemplateSchema.parse(row.draft_schema),
        draftVersion: row.draft_version,
        updatedAt: row.updated_at,
        hasUnpublishedChanges: row.has_unpublished_changes
      } : {})
    };
  }

  @Patch('activity-form/template/draft')
  async updateActivityFormDraft(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.manage');
    const input = formDraftUpdateSchema.parse(body);
    const pool = await poolFor(user);
    await ensureActivityFormTemplate(pool, user.sub);
    return withTransaction(pool, async (client) => {
      const result = await client.query<{ draft_version: number; updated_at: Date }>(
        `UPDATE calendar.activity_form_templates
            SET draft_schema=$1::jsonb,draft_version=draft_version+1,updated_by=$2,updated_at=now()
          WHERE singleton AND draft_version=$3
          RETURNING draft_version,updated_at`,
        [JSON.stringify(input.template), user.sub, input.expectedVersion]
      );
      const updated = result.rows[0];
      if (!updated) throw Object.assign(new Error('El formulario fue modificado en otra sesión. Recargue antes de guardar.'), { status: 412, code: 'FORM_VERSION_MISMATCH' });
      await audit(client, user, 'activity-form.draft.updated', 'activity-form', 'singleton', input.template, request);
      return { draft: input.template, draftVersion: updated.draft_version, updatedAt: updated.updated_at, hasUnpublishedChanges: true };
    });
  }

  @Post('activity-form/template/publish')
  async publishActivityForm(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.manage');
    const input = formPublishSchema.parse(body);
    const pool = await poolFor(user);
    await ensureActivityFormTemplate(pool, user.sub);
    return withTransaction(pool, async (client) => {
      const result = await client.query<{
        published_schema: ActivityFormTemplate;
        published_version: number;
        published_at: Date;
      }>(
        `UPDATE calendar.activity_form_templates
            SET published_schema=draft_schema,published_version=published_version+1,
                updated_by=$1,published_at=now(),updated_at=now()
          WHERE singleton AND draft_version=$2
          RETURNING published_schema,published_version,published_at`,
        [user.sub, input.expectedDraftVersion]
      );
      const published = result.rows[0];
      if (!published) throw Object.assign(new Error('El borrador cambió antes de publicarse. Revise la versión más reciente.'), { status: 412, code: 'FORM_VERSION_MISMATCH' });
      await audit(client, user, 'activity-form.published', 'activity-form', 'singleton', published.published_schema, request);
      return {
        published: activityFormTemplateSchema.parse(published.published_schema),
        publishedVersion: published.published_version,
        publishedAt: published.published_at,
        hasUnpublishedChanges: false
      };
    });
  }

  @Get('activities')
  async activities(
    @Req() request: Request & { user?: AuthPrincipal },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('venueId') venueId?: string,
    @Query('q') query?: string,
    @Query('attention') attention?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const pool = await poolFor(user);
    const filters = z.object({
      from: z.iso.datetime().optional(), to: z.iso.datetime().optional(),
      status: z.enum(['DRAFT','SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED','CANCELLED','COMPLETED','ARCHIVED']).optional(),
      departmentId: z.uuid().optional(), venueId: z.uuid().optional(), q: z.string().trim().max(120).optional(),
      attention: z.enum(['OVERDUE','INCOMPLETE','COMPLETED','DUE_SOON','ACTION_REQUIRED','PLANNED']).optional(),
      cursor: z.iso.datetime().optional(), limit: z.coerce.number().int().min(1).max(200).default(100)
    }).parse({ from: from || undefined, to: to || undefined, status: status || undefined,
      departmentId: departmentId || undefined, venueId: venueId || undefined, q: query || undefined,
      attention: attention || undefined, cursor: cursor || undefined, limit: limitRaw });
    const result = await pool.query(
      `SELECT a.id,a.code,a.title,a.description,a.objective,a.status,a.version,a.responsible_name,
              a.audience,a.estimated_attendance,a.created_at,a.updated_at,
              d.id department_id,d.name department,d.color department_color,
              v.id venue_id,v.name venue,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'id',s.id,'optionId',o.id,'optionLabel',o.label,'optionStatus',o.status,
                'startsAt',s.starts_at,'endsAt',s.ends_at,'setupMinutes',s.setup_minutes,
                'teardownMinutes',s.teardown_minutes
              )) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb) sessions
         FROM calendar.activities a
         JOIN calendar.departments d ON d.id=a.department_id
         LEFT JOIN calendar.venues v ON v.id=a.venue_id
         LEFT JOIN calendar.schedule_options o ON o.activity_id=a.id
         LEFT JOIN calendar.schedule_sessions s ON s.option_id=o.id
        WHERE ($1::timestamptz IS NULL OR s.ends_at >= $1::timestamptz)
          AND ($2::timestamptz IS NULL OR s.starts_at <= $2::timestamptz)
          AND ($3::text IS NULL OR a.status=$3)
          AND ($4::uuid IS NULL OR a.department_id=$4)
          AND ($5::uuid IS NULL OR a.venue_id=$5)
          AND ($6::text IS NULL OR a.title ILIKE '%'||$6||'%' OR a.code ILIKE '%'||$6||'%')
          AND ($7::timestamptz IS NULL OR a.created_at<$7)
          AND ${activityReadPredicate(user)}
          AND ($8::text IS NULL
            OR ($8='OVERDUE' AND a.status='APPROVED' AND EXISTS(
              SELECT 1 FROM calendar.schedule_options selected_option
              JOIN calendar.schedule_sessions selected_session ON selected_session.option_id=selected_option.id
              WHERE selected_option.activity_id=a.id AND selected_option.is_selected
              GROUP BY selected_option.activity_id HAVING max(selected_session.ends_at)<now()
            ))
            OR ($8='INCOMPLETE' AND a.status NOT IN ('COMPLETED','CANCELLED','ARCHIVED'))
            OR ($8='COMPLETED' AND a.status='COMPLETED')
            OR ($8='PLANNED' AND a.status NOT IN ('CANCELLED','ARCHIVED'))
            OR ($8='DUE_SOON' AND a.status='APPROVED' AND EXISTS(
              SELECT 1 FROM calendar.schedule_options selected_option
              JOIN calendar.schedule_sessions selected_session ON selected_session.option_id=selected_option.id
              WHERE selected_option.activity_id=a.id AND selected_option.is_selected
                AND selected_session.starts_at BETWEEN now() AND now()+interval '7 days'
            ))
            OR ($8='ACTION_REQUIRED' AND (
              (a.status='APPROVED' AND EXISTS(
                SELECT 1 FROM calendar.schedule_options selected_option
                JOIN calendar.schedule_sessions selected_session ON selected_session.option_id=selected_option.id
                WHERE selected_option.activity_id=a.id AND selected_option.is_selected
                GROUP BY selected_option.activity_id HAVING max(selected_session.ends_at)<now()
              ))
              OR a.status IN ('UNDER_REVIEW','CHANGES_REQUESTED')
              OR (a.status='SUBMITTED' AND a.created_at<now()-interval '2 days')
              OR (a.status='DRAFT' AND a.created_at<now()-interval '7 days')
            )))
        GROUP BY a.id,d.id,d.name,d.color,v.id,v.name
        ORDER BY min(s.starts_at) NULLS LAST, a.created_at DESC
        LIMIT $9`,
      [filters.from ?? null, filters.to ?? null, filters.status ?? null, filters.departmentId ?? null,
        filters.venueId ?? null, filters.q ?? null, filters.cursor ?? null, filters.attention ?? null, filters.limit]
    );
    const last = result.rows.at(-1) as { created_at?: Date | string } | undefined;
    return { items: result.rows, nextCursor: result.rows.length === filters.limit && last?.created_at ? new Date(last.created_at).toISOString() : null };
  }

  @Get('activities/:id')
  async activity(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const pool = await poolFor(user);
    const activity = await pool.query(
      `SELECT a.*,d.name department,d.color department_color,v.name venue
       FROM calendar.activities a JOIN calendar.departments d ON d.id=a.department_id
       LEFT JOIN calendar.venues v ON v.id=a.venue_id WHERE a.id=$1 AND ${activityReadPredicate(user)}`, [id]
    );
    if (!activity.rows[0]) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
    const options = await pool.query(
      `SELECT o.id,o.label,o.preference,o.status,o.is_selected,
        COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'startsAt',s.starts_at,'endsAt',s.ends_at,
          'setupMinutes',s.setup_minutes,'teardownMinutes',s.teardown_minutes) ORDER BY s.starts_at), '[]'::jsonb) sessions
       FROM calendar.schedule_options o LEFT JOIN calendar.schedule_sessions s ON s.option_id=o.id
       WHERE o.activity_id=$1 GROUP BY o.id ORDER BY o.preference`, [id]
    );
    if (!activity.rows[0]) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
    const [resources, collaborators, revisions, lifecycle] = await Promise.all([
      pool.query(`SELECT r.id,r.name,r.exclusive FROM calendar.activity_resources ar JOIN calendar.resources r ON r.id=ar.resource_id WHERE ar.activity_id=$1`, [id]),
      pool.query(`SELECT d.id,d.name,d.color FROM calendar.activity_collaborators ac JOIN calendar.departments d ON d.id=ac.department_id WHERE ac.activity_id=$1`, [id]),
      pool.query(`SELECT version,change_reason,changed_by,created_at FROM calendar.activity_revisions WHERE activity_id=$1 ORDER BY version DESC LIMIT 20`, [id]),
      pool.query<{ ends_at: Date | null }>(
        `SELECT max(s.ends_at) ends_at FROM calendar.schedule_options o
         JOIN calendar.schedule_sessions s ON s.option_id=o.id WHERE o.activity_id=$1 AND o.is_selected`, [id]
      )
    ]);
    response.setHeader('etag', `"${activity.rows[0].version}"`);
    const record = activity.rows[0] as { department_id: string; created_by: string; status: string };
    const role = user.permissions.includes('calendar.manage') ? 'TENANT_ADMIN' : await departmentRole(pool, user.sub, record.department_id);
    const isOwner = record.created_by === user.sub;
    const terminal = ['CANCELLED', 'COMPLETED', 'ARCHIVED'].includes(record.status);
    const canManageDepartment = role !== null && ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(role);
    const canEditDraft = !terminal && record.status !== 'APPROVED' && (
      role === 'TENANT_ADMIN' || canManageDepartment || (isOwner && ['PLANNER', 'CONTRIBUTOR'].includes(role ?? ''))
    );
    const capabilities = {
      canEdit: canEditDraft || (!terminal && record.status === 'APPROVED' && role === 'TENANT_ADMIN'),
      canSubmit: !terminal && ['DRAFT', 'CHANGES_REQUESTED'].includes(record.status) && (
        role === 'TENANT_ADMIN' || canManageDepartment || (isOwner && role === 'PLANNER')
      ),
      canCancel: !terminal && (record.status === 'APPROVED'
        ? user.permissions.includes('calendar.manage') || user.permissions.includes('calendar.conflict.resolve')
        : role === 'TENANT_ADMIN' || role === 'DIRECTOR' || (isOwner && ['ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY', 'PLANNER', 'CONTRIBUTOR'].includes(role ?? ''))),
      canRequestChange: record.status === 'APPROVED' && canManageDepartment,
      canComplete: record.status === 'APPROVED' && Boolean(lifecycle.rows[0]?.ends_at && lifecycle.rows[0].ends_at <= new Date()) && (
        role === 'TENANT_ADMIN' || canManageDepartment || (isOwner && role === 'PLANNER')
      ),
      departmentRole: role
    };
    return { ...activity.rows[0], options: options.rows, resources: resources.rows, collaborators: collaborators.rows, revisions: revisions.rows,
      lifecycle: { endsAt: lifecycle.rows[0]?.ends_at ?? null, overdue: record.status === 'APPROVED' && Boolean(lifecycle.rows[0]?.ends_at && lifecycle.rows[0].ends_at < new Date()) }, capabilities };
  }

  @Post('activities')
  async createActivity(
    @Req() request: Request & { user?: AuthPrincipal },
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    const input = createActivitySchema.parse(body);
    const pool = await poolFor(user);
    await authorizeDepartmentAction(pool, user, input.departmentId, 'create');
    await ensureActivityFormTemplate(pool, user.sub);
    const requestHash = sha256(JSON.stringify(input));
    // '/' cannot occur in a valid caller key, so this namespace cannot collide
    // with legacy unscoped records or a different actor's client key.
    const scopedIdempotencyKey = idempotencyKey ? `actor/${user.sub}/${idempotencyKey}` : undefined;
    const created = await withTransaction(pool, async (client) => {
      if (idempotencyKey) {
        if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
          throw Object.assign(new Error('Idempotency-Key no es válida.'), { status: 400, code: 'INVALID_IDEMPOTENCY_KEY' });
        }
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`calendar.create:${user.sub}:${idempotencyKey}`]);
        const replay = await client.query<{ request_hash: string; response_body: { id: string; code: string; status: string } }>(
          `SELECT request_hash,response_body FROM calendar.idempotency_keys
           WHERE idempotency_key IN ($1,$3) AND user_id=$2 AND expires_at>now()
           ORDER BY (idempotency_key=$3) DESC LIMIT 1`, [idempotencyKey, user.sub, scopedIdempotencyKey]
        );
        if (replay.rows[0]) {
          if (replay.rows[0].request_hash !== requestHash) {
            throw Object.assign(new Error('La misma Idempotency-Key fue usada con otro contenido.'), { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
          }
          return { ...replay.rows[0].response_body, replayed: true };
        }
        await client.query(
          `DELETE FROM calendar.idempotency_keys
            WHERE idempotency_key IN ($1,$3) AND user_id=$2 AND expires_at<=now()`,
          [idempotencyKey, user.sub, scopedIdempotencyKey]
        );
      }
      const formTemplateResult = await client.query<{ published_schema: ActivityFormTemplate; published_version: number }>(
        `SELECT published_schema,published_version FROM calendar.activity_form_templates WHERE singleton`
      );
      const publishedTemplate = activityFormTemplateSchema.parse(formTemplateResult.rows[0]!.published_schema);
      validateCustomData(publishedTemplate, input.customData);
      const activityResult = await client.query<{ id: string; code: string }>(
        `INSERT INTO calendar.activities(title,description,objective,department_id,venue_id,responsible_name,
          responsible_user_id,audience,estimated_attendance,category,tags,secondary_responsibles,contact_info,
          modality,visibility,priority,internal_notes,timezone,created_by,custom_data,form_schema_snapshot,form_template_version)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12::jsonb,$13,$14,$15,$16,$17,$18,$7,$19::jsonb,$20::jsonb,$21)
         RETURNING id,code`,
        [input.title, input.description, input.objective, input.departmentId, input.venueId ?? null,
          input.responsibleName, user.sub, input.audience, input.estimatedAttendance, input.category, input.tags,
          JSON.stringify(input.secondaryResponsibles), input.contactInfo ?? null, input.modality, input.visibility,
          input.priority, input.internalNotes, input.timezone, JSON.stringify(input.customData),
          JSON.stringify(publishedTemplate), formTemplateResult.rows[0]!.published_version]
      );
      const activity = activityResult.rows[0]!;
      for (const departmentId of new Set(input.collaboratorDepartmentIds)) {
        if (departmentId !== input.departmentId) {
          await client.query(`INSERT INTO calendar.activity_collaborators(activity_id,department_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [activity.id, departmentId]);
        }
      }
      for (const resourceId of new Set(input.resourceIds)) {
        await client.query(`INSERT INTO calendar.activity_resources(activity_id,resource_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [activity.id, resourceId]);
      }
      for (const option of input.options) {
        const optionResult = await client.query<{ id: string }>(
          `INSERT INTO calendar.schedule_options(activity_id,label,preference) VALUES($1,$2,$3) RETURNING id`,
          [activity.id, option.label, option.preference]
        );
        for (const session of option.sessions) {
          const occurrences = input.recurrence
            ? expandRecurrence(
                new Date(session.startsAt), new Date(session.endsAt),
                { frequency: input.recurrence.frequency, interval: input.recurrence.interval,
                  ...(input.recurrence.count ? { count: input.recurrence.count } : {}),
                  ...(input.recurrence.until ? { until: new Date(input.recurrence.until) } : {}) },
                new Date(new Date(session.startsAt).getTime() + 365 * 86_400_000)
              )
            : [{ start: new Date(session.startsAt), end: new Date(session.endsAt) }];
          for (const occurrence of occurrences) {
            await client.query(
              `INSERT INTO calendar.schedule_sessions(option_id,starts_at,ends_at,setup_minutes,teardown_minutes,effective_range)
               VALUES($1,$2,$3,$4,$5,tstzrange($2::timestamptz - make_interval(mins=>$4),$3::timestamptz + make_interval(mins=>$5),'[)'))`,
              [optionResult.rows[0]!.id, occurrence.start.toISOString(), occurrence.end.toISOString(), session.setupMinutes, session.teardownMinutes]
            );
          }
        }
      }
      if (input.recurrence) {
        await client.query(
          `INSERT INTO calendar.recurrence_rules(activity_id,frequency,interval_count,count,until_at,weekdays,original_rule,timezone)
           VALUES($1,$2,$3,$4,$5,$6::integer[],$7,$8)`,
          [activity.id, input.recurrence.frequency, input.recurrence.interval, input.recurrence.count ?? null,
            input.recurrence.until ?? null, input.recurrence.weekdays, JSON.stringify(input.recurrence), input.timezone]
        );
      }
      await client.query(
        `INSERT INTO calendar.activity_revisions(activity_id,version,snapshot,changed_by,change_reason)
         VALUES($1,1,$2::jsonb,$3,'Creación inicial')`, [activity.id, JSON.stringify(input), user.sub]
      );
      await audit(client, user, 'activity.created', 'activity', activity.id, { title: input.title }, request);
      const responseBody = { ...activity, status: 'DRAFT' };
      if (idempotencyKey) {
        await client.query(
          `INSERT INTO calendar.idempotency_keys(idempotency_key,user_id,request_hash,response_status,response_body)
           VALUES($1,$2,$3,201,$4::jsonb)`, [scopedIdempotencyKey, user.sub, requestHash, JSON.stringify(responseBody)]
        );
      }
      return responseBody;
    });
    return created;
  }

  @Patch('activities/:id')
  async updateActivity(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    const parsed = updateActivitySchema.parse({
      ...(body as Record<string, unknown>),
      expectedVersion: (body as Record<string, unknown>)?.expectedVersion ?? Number(ifMatch?.replaceAll('"', ''))
    });
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const existingResult = await client.query<Record<string, unknown> & { department_id: string; version: number; status: string; created_by: string }>(
        `SELECT * FROM calendar.activities WHERE id=$1 FOR UPDATE`, [id]
      );
      const existing = existingResult.rows[0];
      if (!existing) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
      if (existing.version !== parsed.expectedVersion) {
        throw Object.assign(new Error('La actividad cambió desde que fue abierta. Recargue antes de guardar.'), { status: 412, code: 'VERSION_MISMATCH' });
      }
      if (existing.status === 'APPROVED' && !user.permissions.includes('calendar.manage')) {
        throw Object.assign(new Error('Una actividad aprobada solo puede cambiar mediante una solicitud autorizada por el administrador o secretario.'), {
          status: 409,
          code: 'APPROVED_ACTIVITY_REQUIRES_AUTHORIZATION'
        });
      }
      await authorizeDepartmentAction(client, user, existing.department_id, 'edit', existing.created_by);
      if (parsed.departmentId && parsed.departmentId !== existing.department_id) {
        await authorizeDepartmentAction(client, user, parsed.departmentId, 'create');
      }
      if (['CANCELLED', 'COMPLETED', 'ARCHIVED'].includes(existing.status)) {
        throw Object.assign(new Error('La actividad no admite modificaciones en su estado actual.'), { status: 409, code: 'INVALID_STATE' });
      }
      const customData = validateActivityCustomUpdate(existing, parsed.customData);
      const scheduleChanged = parsed.options !== undefined || parsed.venueId !== undefined || parsed.resourceIds !== undefined;
      const nextStatus = scheduleChanged ? 'DRAFT' : existing.status;
      const updated = await client.query<{ id: string; version: number; status: string; title: string; responsible_user_id: string }>(
        `UPDATE calendar.activities SET
           title=COALESCE($2,title),description=COALESCE($3,description),objective=COALESCE($4,objective),
           department_id=COALESCE($5,department_id),venue_id=CASE WHEN $6::boolean THEN $7::uuid ELSE venue_id END,
           responsible_name=COALESCE($8,responsible_name),audience=COALESCE($9,audience),
           estimated_attendance=COALESCE($10,estimated_attendance),category=COALESCE($11,category),
           tags=COALESCE($12::text[],tags),secondary_responsibles=COALESCE($13::jsonb,secondary_responsibles),
           contact_info=CASE WHEN $14::boolean THEN $15 ELSE contact_info END,modality=COALESCE($16,modality),
           visibility=COALESCE($17,visibility),priority=COALESCE($18,priority),internal_notes=COALESCE($19,internal_notes),
           timezone=COALESCE($20,timezone),custom_data=COALESCE($22::jsonb,custom_data),status=$21,version=version+1,updated_at=now()
         WHERE id=$1 RETURNING id,version,status,title,responsible_user_id`,
        [id, parsed.title ?? null, parsed.description ?? null, parsed.objective ?? null, parsed.departmentId ?? null,
          parsed.venueId !== undefined, parsed.venueId ?? null, parsed.responsibleName ?? null, parsed.audience ?? null,
          parsed.estimatedAttendance ?? null, parsed.category ?? null, parsed.tags ?? null,
          parsed.secondaryResponsibles ? JSON.stringify(parsed.secondaryResponsibles) : null,
          parsed.contactInfo !== undefined, parsed.contactInfo ?? null, parsed.modality ?? null, parsed.visibility ?? null,
          parsed.priority ?? null, parsed.internalNotes ?? null, parsed.timezone ?? null, nextStatus,
          customData === undefined ? null : JSON.stringify(customData)]
      );
      if (parsed.collaboratorDepartmentIds) {
        await client.query(`DELETE FROM calendar.activity_collaborators WHERE activity_id=$1`, [id]);
        for (const departmentId of new Set(parsed.collaboratorDepartmentIds)) {
          if (departmentId !== (parsed.departmentId ?? existing.department_id)) {
            await client.query(`INSERT INTO calendar.activity_collaborators(activity_id,department_id) VALUES($1,$2)`, [id, departmentId]);
          }
        }
      }
      if (parsed.resourceIds) {
        await client.query(`DELETE FROM calendar.activity_resources WHERE activity_id=$1`, [id]);
        for (const resourceId of new Set(parsed.resourceIds)) {
          await client.query(`INSERT INTO calendar.activity_resources(activity_id,resource_id) VALUES($1,$2)`, [id, resourceId]);
        }
      }
      if (parsed.options) {
        await client.query(
          `WITH offset_value AS (
             SELECT COALESCE(max(preference),0)+100 shift FROM calendar.schedule_options WHERE activity_id=$1
           )
           UPDATE calendar.schedule_options o SET status='RELEASED',is_selected=false,preference=o.preference+offset_value.shift
           FROM offset_value WHERE o.activity_id=$1 AND o.status<>'RELEASED'`, [id]
        );
        for (const option of parsed.options) {
          const createdOption = await client.query<{ id: string }>(
            `INSERT INTO calendar.schedule_options(activity_id,label,preference) VALUES($1,$2,$3) RETURNING id`,
            [id, option.label, option.preference]
          );
          for (const session of option.sessions) {
            await client.query(
              `INSERT INTO calendar.schedule_sessions(option_id,starts_at,ends_at,setup_minutes,teardown_minutes,effective_range)
               VALUES($1,$2,$3,$4,$5,tstzrange($2::timestamptz-make_interval(mins=>$4),$3::timestamptz+make_interval(mins=>$5),'[)'))`,
              [createdOption.rows[0]?.id, session.startsAt, session.endsAt, session.setupMinutes, session.teardownMinutes]
            );
          }
        }
      }
      if (scheduleChanged) {
        await client.query(`UPDATE calendar.reservations SET status='RELEASED' WHERE activity_id=$1 AND status<>'RELEASED'`, [id]);
        await client.query(`UPDATE calendar.conflict_cases SET status='DISMISSED',updated_at=now() WHERE activity_id=$1 AND status<>'RESOLVED'`, [id]);
      }
      await client.query(
        `INSERT INTO calendar.activity_revisions(activity_id,version,snapshot,changed_by,change_reason)
         VALUES($1,$2,$3::jsonb,$4,$5)`, [id, updated.rows[0]?.version, JSON.stringify({ before: existing, changes: parsed }), user.sub, parsed.changeReason]
      );
      await outbox(client, 'activity.changed', id, { title: updated.rows[0]?.title, userId: updated.rows[0]?.responsible_user_id, scheduleChanged });
      await audit(client, user, 'activity.updated', 'activity', id, { version: updated.rows[0]?.version, scheduleChanged }, request);
      return updated.rows[0];
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Post('activities/:id/submit')
  async submit(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const activityResult = await client.query<{ id: string; title: string; venue_id: string | null; status: string; department_id: string; created_by: string }>(
        `SELECT id,title,venue_id,status,department_id,created_by FROM calendar.activities WHERE id=$1 FOR UPDATE`, [id]
      );
      const activity = activityResult.rows[0];
      if (!activity || !['DRAFT','CHANGES_REQUESTED'].includes(activity.status)) {
        throw Object.assign(new Error('La actividad no puede enviarse desde su estado actual.'), { status: 409, code: 'INVALID_STATE' });
      }
      await authorizeDepartmentAction(client, user, activity.department_id, 'submit', activity.created_by);
      const options = await client.query<{ id: string; label: string; preference: number }>(
        `SELECT id,label,preference FROM calendar.schedule_options WHERE activity_id=$1 ORDER BY preference`, [id]
      );
      let selected: { id: string; label: string; sessions: Awaited<ReturnType<typeof optionSessions>> } | null = null;
      let availableAlternative: { id: string; label: string; sessions: Awaited<ReturnType<typeof optionSessions>> } | null = null;
      let firstConflict: { optionId: string; label: string; conflicts: Conflict[] } | null = null;
      for (const [index, option] of options.rows.entries()) {
        const sessions = await optionSessions(client, option.id);
        await lockSessions(client, sessions);
        const conflicts: Conflict[] = [];
        for (const session of sessions) {
          conflicts.push(...await conflictsForRange(client, session.effective_start.toISOString(), session.effective_end.toISOString(), activity.venue_id, id));
        }
        if (conflicts.length === 0 && index === 0) selected = { ...option, sessions };
        if (conflicts.length === 0 && index > 0 && !availableAlternative) availableAlternative = { ...option, sessions };
        if (conflicts.length > 0 && !firstConflict) firstConflict = { optionId: option.id, label: option.label, conflicts };
      }
      if (selected) {
        for (const session of selected.sessions) {
          await client.query(
            `INSERT INTO calendar.reservations(activity_id,option_id,session_id,venue_id,reserved_range,status)
             VALUES($1,$2,$3,$4,tstzrange($5,$6,'[)'),'PROVISIONAL')`,
            [id, selected.id, session.id, activity.venue_id, session.effective_start, session.effective_end]
          );
        }
        await client.query(`UPDATE calendar.schedule_options SET status='PROVISIONAL_HOLD',is_selected=true WHERE id=$1`, [selected.id]);
        await client.query(`UPDATE calendar.activities SET status='SUBMITTED',version=version+1,updated_at=now() WHERE id=$1`, [id]);
        await outbox(client, 'activity.submitted', id, { title: activity.title, userId: user.sub });
        await outbox(client, 'reservation.provisional_created', id, { title: activity.title, userId: user.sub, optionId: selected.id });
        await audit(client, user, 'activity.submitted', 'activity', id, { optionId: selected.id }, request);
        return { status: 'SUBMITTED', selectedOption: selected.id, conflict: null };
      }
      if (!firstConflict) throw new Error('La actividad no tiene sesiones válidas.');
      const severity = deriveConflictSeverity(firstConflict.conflicts.flatMap(factorsFor));
      const conflictCase = await client.query<{ id: string }>(
        `INSERT INTO calendar.conflict_cases(activity_id,requested_option_id,severity,details,submitted_by,submitted_at)
         VALUES($1,$2,$3,$4::jsonb,$5,now()) RETURNING id`,
        [id, firstConflict.optionId, severity, JSON.stringify(firstConflict.conflicts), user.sub]
      );
      for (const conflict of firstConflict.conflicts) {
        for (const conflictType of factorsFor(conflict)) {
          await client.query(
            `INSERT INTO calendar.conflict_links(conflict_case_id,conflicting_activity_id,conflict_type,details)
             VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,
            [conflictCase.rows[0]?.id, conflict.activity_id, conflictType, JSON.stringify(conflict)]
          );
        }
      }
      await client.query(`UPDATE calendar.schedule_options SET status='CONFLICTED' WHERE id=$1`, [firstConflict.optionId]);
      if (availableAlternative) {
        await outbox(client, 'activity.alternative_available', id, { title: activity.title, userId: user.sub, optionId: availableAlternative.id });
        await audit(client, user, 'activity.alternative_suggested', 'activity', id, { optionId: availableAlternative.id }, request);
        return {
          status: 'ALTERNATIVE_AVAILABLE',
          alternative: { id: availableAlternative.id, label: availableAlternative.label,
            sessions: availableAlternative.sessions.map((session) => ({ startsAt: session.starts_at, endsAt: session.ends_at })) },
          conflict: { id: conflictCase.rows[0]?.id, severity, details: firstConflict.conflicts.map((conflict) => redactActivityConflict(user, conflict)) }
        };
      }
      await client.query(`UPDATE calendar.activities SET status='UNDER_REVIEW',version=version+1,updated_at=now() WHERE id=$1`, [id]);
      await outbox(client, 'activity.conflict_detected', id, { title: activity.title, severity, userId: user.sub });
      await audit(client, user, 'activity.conflict_detected', 'activity', id, { caseId: conflictCase.rows[0]!.id, severity }, request);
      return { status: 'CONFLICTED', conflict: { id: conflictCase.rows[0]!.id, severity, details: firstConflict.conflicts.map((conflict) => redactActivityConflict(user, conflict)) } };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Post('activities/:id/options/:optionId/confirm')
  async confirmAlternative(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Param('optionId') optionId: string
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const activityResult = await client.query<{
        id: string; title: string; venue_id: string | null; status: string; responsible_user_id: string; department_id: string; created_by: string;
      }>(`SELECT id,title,venue_id,status,responsible_user_id,department_id,created_by FROM calendar.activities WHERE id=$1 FOR UPDATE`, [id]);
      const activity = activityResult.rows[0];
      if (!activity) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
      await authorizeDepartmentAction(client, user, activity.department_id, 'submit', activity.created_by);
      if (!['DRAFT', 'UNDER_REVIEW', 'CHANGES_REQUESTED'].includes(activity.status)) {
        throw Object.assign(new Error('No se puede confirmar una alternativa desde el estado actual.'), { status: 409, code: 'INVALID_STATE' });
      }
      const option = await client.query<{ id: string }>(
        `SELECT id FROM calendar.schedule_options WHERE id=$1 AND activity_id=$2 AND status<>'RELEASED'`, [optionId, id]
      );
      if (!option.rowCount) throw Object.assign(new Error('La alternativa no pertenece a la actividad.'), { status: 404, code: 'OPTION_NOT_FOUND' });
      const sessions = await optionSessions(client, optionId);
      await lockSessions(client, sessions);
      const conflicts: Conflict[] = [];
      for (const session of sessions) {
        conflicts.push(...await conflictsForRange(client, session.effective_start.toISOString(), session.effective_end.toISOString(), activity.venue_id, id));
      }
      if (conflicts.length) {
        throw Object.assign(new Error('La alternativa dejó de estar disponible.'), {
          status: 409, code: 'ALTERNATIVE_NO_LONGER_AVAILABLE', conflicts: conflicts.map((conflict) => redactActivityConflict(user, conflict))
        });
      }
      await client.query(`UPDATE calendar.reservations SET status='RELEASED' WHERE activity_id=$1 AND status<>'RELEASED'`, [id]);
      for (const session of sessions) {
        await client.query(
          `INSERT INTO calendar.reservations(activity_id,option_id,session_id,venue_id,reserved_range,status)
           VALUES($1,$2,$3,$4,tstzrange($5,$6,'[)'),'PROVISIONAL')`,
          [id, optionId, session.id, activity.venue_id, session.effective_start, session.effective_end]
        );
      }
      await client.query(`UPDATE calendar.schedule_options SET is_selected=false WHERE activity_id=$1`, [id]);
      await client.query(`UPDATE calendar.schedule_options SET status='PROVISIONAL_HOLD',is_selected=true WHERE id=$1`, [optionId]);
      await client.query(`UPDATE calendar.conflict_cases SET status='DISMISSED',updated_at=now() WHERE activity_id=$1 AND status<>'RESOLVED'`, [id]);
      await client.query(`UPDATE calendar.activities SET status='SUBMITTED',version=version+1,updated_at=now() WHERE id=$1`, [id]);
      await outbox(client, 'activity.submitted', id, { title: activity.title, userId: activity.responsible_user_id, alternativeConfirmed: true });
      await audit(client, user, 'activity.alternative_confirmed', 'activity', id, { optionId }, request);
      return { id, status: 'SUBMITTED', selectedOption: optionId };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Post('activities/:id/approve')
  async approve(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.conflict.resolve');
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const context = await client.query<{ title: string; responsible_user_id: string; venue_id: string | null; option_id: string }>(
        `SELECT a.title,a.responsible_user_id,a.venue_id,o.id option_id
         FROM calendar.activities a JOIN calendar.schedule_options o ON o.activity_id=a.id AND o.is_selected
         WHERE a.id=$1 AND a.status='SUBMITTED' FOR UPDATE OF a`, [id]
      );
      const candidate = context.rows[0];
      if (!candidate) throw Object.assign(new Error('La actividad no está pendiente de aprobación.'), { status: 409 });
      const sessions = await optionSessions(client, candidate.option_id);
      await lockSessions(client, sessions);
      const conflicts: Conflict[] = [];
      for (const session of sessions) {
        conflicts.push(...await conflictsForRange(client, session.effective_start.toISOString(), session.effective_end.toISOString(), candidate.venue_id, id));
      }
      if (conflicts.length) {
        const conflictCase = await client.query<{ id: string }>(
          `INSERT INTO calendar.conflict_cases(activity_id,requested_option_id,severity,details,submitted_by,submitted_at)
           VALUES($1,$2,$3,$4::jsonb,$5,now()) RETURNING id`,
          [id, candidate.option_id, deriveConflictSeverity(conflicts.flatMap(factorsFor)), JSON.stringify(conflicts), user.sub]
        );
        await client.query(`UPDATE calendar.activities SET status='UNDER_REVIEW',version=version+1,updated_at=now() WHERE id=$1`, [id]);
        await audit(client, user, 'activity.approval_revalidation_failed', 'activity', id, { conflictCaseId: conflictCase.rows[0]?.id }, request);
        return { id, status: 'UNDER_REVIEW', conflictCaseId: conflictCase.rows[0]?.id };
      }
      const updated = await client.query<{ title: string; responsible_user_id: string }>(
        `UPDATE calendar.activities SET status='APPROVED',version=version+1,updated_at=now()
         WHERE id=$1 AND status='SUBMITTED' RETURNING title,responsible_user_id`, [id]
      );
      if (!updated.rowCount) throw Object.assign(new Error('La actividad no está pendiente de aprobación.'), { status: 409 });
      await client.query(`UPDATE calendar.reservations SET status='CONFIRMED' WHERE activity_id=$1 AND status='PROVISIONAL'`, [id]);
      await client.query(`UPDATE calendar.schedule_options SET status='CONFIRMED' WHERE activity_id=$1 AND is_selected`, [id]);
      await outbox(client, 'activity.approved', id, { title: updated.rows[0]!.title, userId: updated.rows[0]!.responsible_user_id });
      await audit(client, user, 'activity.approved', 'activity', id, {}, request);
      return { id, status: 'APPROVED' };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Post('activities/:id/cancel')
  async cancel(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const activityResult = await client.query<{ status: string; department_id: string; created_by: string }>(
        `SELECT status,department_id,created_by FROM calendar.activities WHERE id=$1 FOR UPDATE`, [id]
      );
      const activity = activityResult.rows[0];
      if (!activity) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
      if (activity.status === 'APPROVED' && !user.permissions.includes('calendar.manage')) {
        throw Object.assign(new Error('El director no puede eliminar ni cancelar una actividad ya aprobada.'), {
          status: 409,
          code: 'APPROVED_ACTIVITY_LOCKED'
        });
      }
      await authorizeDepartmentAction(client, user, activity.department_id, 'cancel', activity.created_by);
      const updated = await client.query<{ title: string; responsible_user_id: string }>(
        `UPDATE calendar.activities SET status='CANCELLED',version=version+1,updated_at=now()
         WHERE id=$1 AND status NOT IN ('CANCELLED','ARCHIVED') RETURNING title,responsible_user_id`, [id]
      );
      if (!updated.rowCount) throw Object.assign(new Error('La actividad ya está cancelada o no existe.'), { status: 409 });
      await client.query(`UPDATE calendar.reservations SET status='RELEASED' WHERE activity_id=$1`, [id]);
      await client.query(`UPDATE calendar.schedule_options SET status='RELEASED' WHERE activity_id=$1 AND is_selected`, [id]);
      await outbox(client, 'activity.cancelled', id, { title: updated.rows[0]!.title, userId: updated.rows[0]!.responsible_user_id });
      await audit(client, user, 'activity.cancelled', 'activity', id, {}, request);
      return { id, status: 'CANCELLED' };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Post('activities/:id/complete')
  async complete(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const activityResult = await client.query<{
        status: string; department_id: string; created_by: string; title: string; responsible_user_id: string; ends_at: Date | null;
      }>(
        `SELECT a.status,a.department_id,a.created_by,a.title,a.responsible_user_id,
                (SELECT max(s.ends_at) FROM calendar.schedule_options o
                  JOIN calendar.schedule_sessions s ON s.option_id=o.id
                 WHERE o.activity_id=a.id AND o.is_selected) ends_at
           FROM calendar.activities a WHERE a.id=$1 FOR UPDATE`, [id]
      );
      const activity = activityResult.rows[0];
      if (!activity) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
      if (activity.status !== 'APPROVED') {
        throw Object.assign(new Error('Solo una actividad aprobada puede marcarse como completada.'), { status: 409, code: 'INVALID_STATE' });
      }
      if (!activity.ends_at || activity.ends_at > new Date()) {
        throw Object.assign(new Error('La actividad todavía no ha finalizado.'), { status: 409, code: 'ACTIVITY_NOT_ENDED' });
      }
      await authorizeDepartmentAction(client, user, activity.department_id, 'complete', activity.created_by);
      await client.query(`UPDATE calendar.activities SET status='COMPLETED',version=version+1,updated_at=now() WHERE id=$1`, [id]);
      await outbox(client, 'activity.completed', id, { title: activity.title, userId: activity.responsible_user_id });
      await audit(client, user, 'activity.completed', 'activity', id, { endsAt: activity.ends_at }, request);
      return { id, status: 'COMPLETED', completedAt: new Date().toISOString() };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Post('activities/:id/change-requests')
  async requestApprovedActivityChange(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    const input = activityChangeRequestSchema.parse(body);
    const pool = await poolFor(user);
    return withTransaction(pool, async (client) => {
      const activityResult = await client.query<Record<string, unknown> & { version: number; status: string; department_id: string; created_by: string; title: string }>(
        `SELECT version,status,department_id,created_by,title,form_schema_snapshot,custom_data FROM calendar.activities WHERE id=$1 FOR UPDATE`, [id]
      );
      const activity = activityResult.rows[0];
      if (!activity) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
      if (activity.status !== 'APPROVED') {
        throw Object.assign(new Error('Las solicitudes de cambio solo aplican a actividades aprobadas.'), { status: 409, code: 'INVALID_STATE' });
      }
      await authorizeDepartmentAction(client, user, activity.department_id, 'request-approved-change', activity.created_by);
      if (input.changes.departmentId && input.changes.departmentId !== activity.department_id) {
        throw Object.assign(new Error('El departamento de una actividad aprobada no puede trasladarse mediante esta solicitud.'), {
          status: 400,
          code: 'APPROVED_DEPARTMENT_IMMUTABLE'
        });
      }
      if (input.changes.expectedVersion !== activity.version) {
        throw Object.assign(new Error('La actividad cambió desde que fue abierta. Recargue antes de solicitar.'), { status: 412, code: 'VERSION_MISMATCH' });
      }
      validateActivityCustomUpdate(activity, input.changes.customData);
      const created = await client.query(
        `INSERT INTO calendar.activity_change_requests(activity_id,requested_by,proposed_changes,reason,expected_version)
         VALUES($1,$2,$3::jsonb,$4,$5)
         ON CONFLICT(activity_id,requested_by) WHERE status='PENDING' DO UPDATE
           SET proposed_changes=EXCLUDED.proposed_changes,reason=EXCLUDED.reason,expected_version=EXCLUDED.expected_version,created_at=now()
         RETURNING id,activity_id,status,reason,expected_version,created_at`,
        [id, user.sub, JSON.stringify(input.changes), input.reason, input.changes.expectedVersion]
      );
      await outbox(client, 'activity.change_requested', id, { title: activity.title, requestedBy: user.sub });
      await audit(client, user, 'activity.change_requested', 'activity', id, { changeRequestId: created.rows[0]?.id }, request);
      return created.rows[0];
    });
  }

  @Get('activity-change-requests')
  async activityChangeRequests(@Req() request: Request & { user?: AuthPrincipal }, @Query('status') status?: string) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.review');
    const parsedStatus = z.enum(['PENDING', 'APPLIED', 'REJECTED']).optional().parse(status || undefined);
    const result = await (await poolFor(user)).query(
      `SELECT cr.id,cr.activity_id,cr.requested_by,cr.proposed_changes,cr.reason,cr.expected_version,
              cr.status,cr.decision_notes,cr.created_at,cr.decided_at,cr.applied_at,
              a.code,a.title,a.version current_version,d.name department,d.color department_color,
              requester.name requested_by_name,decider.name decided_by_name
         FROM calendar.activity_change_requests cr
         JOIN calendar.activities a ON a.id=cr.activity_id
         JOIN calendar.departments d ON d.id=a.department_id
         JOIN identity.users requester ON requester.id=cr.requested_by
         LEFT JOIN identity.users decider ON decider.id=cr.decided_by
        WHERE ($1::text IS NULL OR cr.status=$1)
        ORDER BY CASE cr.status WHEN 'PENDING' THEN 0 ELSE 1 END,cr.created_at DESC`,
      [parsedStatus ?? null]
    );
    return { items: result.rows };
  }

  @Post('activity-change-requests/:id/decision')
  async decideActivityChange(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    if (!user.permissions.includes('calendar.manage') && !user.permissions.includes('calendar.conflict.resolve')) {
      throw Object.assign(new Error('Solo el administrador o secretario puede decidir esta solicitud.'), { status: 403, code: 'PERMISSION_DENIED' });
    }
    const input = activityChangeDecisionSchema.parse(body);
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const requestResult = await client.query<{
        activity_id: string; requested_by: string; proposed_changes: unknown; expected_version: number; status: string;
      }>(`SELECT activity_id,requested_by,proposed_changes,expected_version,status
            FROM calendar.activity_change_requests WHERE id=$1 FOR UPDATE`, [id]);
      const changeRequest = requestResult.rows[0];
      if (!changeRequest) throw Object.assign(new Error('La solicitud de cambio no existe.'), { status: 404, code: 'CHANGE_REQUEST_NOT_FOUND' });
      if (changeRequest.status !== 'PENDING') {
        throw Object.assign(new Error('La solicitud ya fue decidida.'), { status: 409, code: 'CHANGE_REQUEST_DECIDED' });
      }
      if (input.decision === 'REJECT') {
        await client.query(
          `UPDATE calendar.activity_change_requests SET status='REJECTED',decided_by=$2,decision_notes=$3,decided_at=now()
           WHERE id=$1`, [id, user.sub, input.notes]
        );
        await audit(client, user, 'activity.change_rejected', 'activity', changeRequest.activity_id, { changeRequestId: id }, request);
        return { id, activityId: changeRequest.activity_id, status: 'REJECTED' };
      }

      const parsed = updateActivitySchema.parse(changeRequest.proposed_changes);
      const activityResult = await client.query<Record<string, unknown> & {
        id: string; version: number; status: string; department_id: string; venue_id: string | null;
        title: string; responsible_user_id: string;
      }>(`SELECT * FROM calendar.activities WHERE id=$1 FOR UPDATE`, [changeRequest.activity_id]);
      const activity = activityResult.rows[0];
      if (!activity || activity.status !== 'APPROVED') {
        throw Object.assign(new Error('La actividad ya no está aprobada o no existe.'), { status: 409, code: 'INVALID_STATE' });
      }
      if (activity.version !== changeRequest.expected_version || parsed.expectedVersion !== activity.version) {
        throw Object.assign(new Error('La actividad cambió después de la solicitud. Debe crear una nueva solicitud.'), { status: 412, code: 'VERSION_MISMATCH' });
      }
      const customData = validateActivityCustomUpdate(activity, parsed.customData);

      const scheduleChanged = parsed.options !== undefined || parsed.venueId !== undefined || parsed.resourceIds !== undefined;
      if (parsed.resourceIds) {
        await client.query(`DELETE FROM calendar.activity_resources WHERE activity_id=$1`, [activity.id]);
        for (const resourceId of new Set(parsed.resourceIds)) {
          await client.query(`INSERT INTO calendar.activity_resources(activity_id,resource_id) VALUES($1,$2)`, [activity.id, resourceId]);
        }
      }
      let selectedOptionId: string | null = null;
      if (parsed.options) {
        await client.query(
          `WITH offset_value AS (SELECT COALESCE(max(preference),0)+100 shift FROM calendar.schedule_options WHERE activity_id=$1)
           UPDATE calendar.schedule_options o SET status='RELEASED',is_selected=false,preference=o.preference+offset_value.shift
           FROM offset_value WHERE o.activity_id=$1 AND o.status<>'RELEASED'`, [activity.id]
        );
        const orderedOptions = [...parsed.options].sort((left, right) => left.preference - right.preference);
        for (const [index, option] of orderedOptions.entries()) {
          const createdOption = await client.query<{ id: string }>(
            `INSERT INTO calendar.schedule_options(activity_id,label,preference,status,is_selected)
             VALUES($1,$2,$3,$4,$5) RETURNING id`,
            [activity.id, option.label, option.preference, index === 0 ? 'CONFIRMED' : 'AVAILABLE', index === 0]
          );
          if (index === 0) selectedOptionId = createdOption.rows[0]!.id;
          for (const session of option.sessions) {
            await client.query(
              `INSERT INTO calendar.schedule_sessions(option_id,starts_at,ends_at,setup_minutes,teardown_minutes,effective_range)
               VALUES($1,$2,$3,$4,$5,tstzrange($2::timestamptz-make_interval(mins=>$4),$3::timestamptz+make_interval(mins=>$5),'[)'))`,
              [createdOption.rows[0]!.id, session.startsAt, session.endsAt, session.setupMinutes, session.teardownMinutes]
            );
          }
        }
      } else if (scheduleChanged) {
        const selected = await client.query<{ id: string }>(
          `SELECT id FROM calendar.schedule_options WHERE activity_id=$1 AND is_selected AND status<>'RELEASED' LIMIT 1`, [activity.id]
        );
        selectedOptionId = selected.rows[0]?.id ?? null;
      }

      if (scheduleChanged && selectedOptionId) {
        const sessions = await optionSessions(client, selectedOptionId);
        await lockSessions(client, sessions);
        const conflicts: Conflict[] = [];
        for (const session of sessions) {
          conflicts.push(...await conflictsForRange(
            client,
            session.effective_start.toISOString(),
            session.effective_end.toISOString(),
            parsed.venueId !== undefined ? parsed.venueId : activity.venue_id,
            activity.id
          ));
        }
        if (conflicts.length) {
          throw Object.assign(new Error('La modificación propuesta produce conflictos de calendario y no puede aprobarse.'), {
            status: 409,
            code: 'APPROVED_CHANGE_CONFLICT',
            conflicts
          });
        }
        await client.query(`UPDATE calendar.reservations SET status='RELEASED' WHERE activity_id=$1 AND status<>'RELEASED'`, [activity.id]);
        for (const session of sessions) {
          await client.query(
            `INSERT INTO calendar.reservations(activity_id,option_id,session_id,venue_id,reserved_range,status)
             VALUES($1,$2,$3,$4,tstzrange($5,$6,'[)'),'CONFIRMED')`,
            [activity.id, selectedOptionId, session.id, parsed.venueId !== undefined ? parsed.venueId : activity.venue_id,
              session.effective_start, session.effective_end]
          );
        }
      }

      const updated = await client.query<{ version: number; title: string; responsible_user_id: string }>(
        `UPDATE calendar.activities SET title=COALESCE($2,title),description=COALESCE($3,description),
           objective=COALESCE($4,objective),venue_id=CASE WHEN $5::boolean THEN $6::uuid ELSE venue_id END,
           responsible_name=COALESCE($7,responsible_name),audience=COALESCE($8,audience),
           estimated_attendance=COALESCE($9,estimated_attendance),category=COALESCE($10,category),
           tags=COALESCE($11::text[],tags),secondary_responsibles=COALESCE($12::jsonb,secondary_responsibles),
           contact_info=CASE WHEN $13::boolean THEN $14 ELSE contact_info END,modality=COALESCE($15,modality),
           visibility=COALESCE($16,visibility),priority=COALESCE($17,priority),internal_notes=COALESCE($18,internal_notes),
           timezone=COALESCE($19,timezone),custom_data=COALESCE($20::jsonb,custom_data),version=version+1,updated_at=now()
         WHERE id=$1 RETURNING version,title,responsible_user_id`,
        [activity.id, parsed.title ?? null, parsed.description ?? null, parsed.objective ?? null,
          parsed.venueId !== undefined, parsed.venueId ?? null, parsed.responsibleName ?? null, parsed.audience ?? null,
          parsed.estimatedAttendance ?? null, parsed.category ?? null, parsed.tags ?? null,
          parsed.secondaryResponsibles ? JSON.stringify(parsed.secondaryResponsibles) : null,
          parsed.contactInfo !== undefined, parsed.contactInfo ?? null, parsed.modality ?? null, parsed.visibility ?? null,
          parsed.priority ?? null, parsed.internalNotes ?? null, parsed.timezone ?? null,
          customData === undefined ? null : JSON.stringify(customData)]
      );
      if (parsed.collaboratorDepartmentIds) {
        await client.query(`DELETE FROM calendar.activity_collaborators WHERE activity_id=$1`, [activity.id]);
        for (const departmentId of new Set(parsed.collaboratorDepartmentIds)) {
          if (departmentId !== activity.department_id) {
            await client.query(`INSERT INTO calendar.activity_collaborators(activity_id,department_id) VALUES($1,$2)`, [activity.id, departmentId]);
          }
        }
      }
      await client.query(
        `INSERT INTO calendar.activity_revisions(activity_id,version,snapshot,changed_by,change_reason)
         VALUES($1,$2,$3::jsonb,$4,$5)`,
        [activity.id, updated.rows[0]!.version, JSON.stringify({ before: activity, approvedChanges: parsed, changeRequestId: id }), user.sub, parsed.changeReason]
      );
      await client.query(
        `UPDATE calendar.activity_change_requests SET status='APPLIED',decided_by=$2,decision_notes=$3,decided_at=now(),applied_at=now()
         WHERE id=$1`, [id, user.sub, input.notes]
      );
      await outbox(client, 'activity.change_approved', activity.id, {
        title: updated.rows[0]!.title,
        userId: updated.rows[0]!.responsible_user_id,
        requestedBy: changeRequest.requested_by
      });
      await audit(client, user, 'activity.change_approved', 'activity', activity.id, { changeRequestId: id, scheduleChanged }, request);
      return { id, activityId: activity.id, status: 'APPLIED', version: updated.rows[0]!.version };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Get('availability')
  async availability(
    @Req() request: Request & { user?: AuthPrincipal },
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('venueId') venueId?: string,
    @Query('activityId') activityId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('resourceIds') resourceIdsRaw?: string
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const resourceIds = resourceIdsRaw ? resourceIdsRaw.split(',').filter(Boolean) : [];
    z.object({
      start: z.iso.datetime(), end: z.iso.datetime(), venueId: z.uuid().optional(), activityId: z.uuid().optional(),
      departmentId: z.uuid().optional(), resourceIds: z.array(z.uuid()).max(50)
    }).refine((value) => new Date(value.end) > new Date(value.start)).parse({ start, end, venueId, activityId, departmentId, resourceIds });
    const pool = await poolFor(user);
    if (activityId) await assertActivityRead(pool, user, activityId);
    const conflicts = await conflictsForRange(pool, start, end, venueId ?? null, activityId, resourceIds);
    const factors = [...new Set(conflicts.flatMap(factorsFor))];
    const requestedDepartment = departmentId
      ? (await pool.query<{ id: string; name: string; color: string }>(`SELECT id,name,color FROM calendar.departments WHERE id=$1`, [departmentId])).rows[0] ?? null
      : null;
    return {
      available: conflicts.length === 0,
      severity: conflicts.length ? deriveConflictSeverity(factors) : null,
      factors,
      conflicts: conflicts.map((conflict) => redactActivityConflict(user, conflict)),
      requested: { department: requestedDepartment, startsAt: start, endsAt: end }
    };
  }

  @Get('availability/suggestions')
  async availabilitySuggestions(
    @Req() request: Request & { user?: AuthPrincipal },
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('venueId') venueId?: string,
    @Query('limit') limitRaw?: string
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const input = z.object({
      start: z.iso.datetime(), end: z.iso.datetime(), venueId: z.uuid().optional(),
      limit: z.coerce.number().int().min(1).max(10).default(5)
    }).refine((value) => new Date(value.end) > new Date(value.start), { path: ['end'], message: 'El final debe ser posterior al inicio.' })
      .parse({ start, end, venueId, limit: limitRaw });
    const pool = await poolFor(user);
    const settings = await pool.query<{ suggestion_horizon_days: number; business_day_start: string; business_day_end: string }>(
      `SELECT suggestion_horizon_days,business_day_start::text,business_day_end::text FROM calendar.tenant_calendar_settings WHERE singleton`
    );
    const config = settings.rows[0] ?? { suggestion_horizon_days: 60, business_day_start: '06:00:00', business_day_end: '23:00:00' };
    const horizonEnd = new Date(new Date(start).getTime() + config.suggestion_horizon_days * 86_400_000);
    const occupied = await pool.query<{ starts_at: Date; ends_at: Date }>(
      `SELECT lower(reserved_range) starts_at,upper(reserved_range) ends_at FROM calendar.reservations
       WHERE status IN ('PROVISIONAL','CONFIRMED')
         AND reserved_range && tstzrange($1::timestamptz,$2::timestamptz,'[)')
         AND ($3::uuid IS NULL OR venue_id=$3::uuid)
       ORDER BY lower(reserved_range)`, [start, horizonEnd.toISOString(), venueId ?? null]
    );
    return {
      items: suggestFreeIntervals(new Date(start), new Date(end), occupied.rows.map((item) => ({ start: item.starts_at, end: item.ends_at })), {
        horizonDays: config.suggestion_horizon_days,
        limit: input.limit,
        businessStartHour: Number(config.business_day_start.slice(0, 2)),
        businessEndHour: Number(config.business_day_end.slice(0, 2))
      })
    };
  }

  @Post('activities/:id/request-review')
  async requestReview(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') activityId: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.create');
    const input = reviewRequestSchema.parse(body);
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const activity = await client.query<{ department_id: string; created_by: string; status: string }>(
        `SELECT department_id,created_by,status FROM calendar.activities WHERE id=$1 FOR UPDATE`, [activityId]
      );
      if (!activity.rows[0]) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
      await authorizeDepartmentAction(client, user, activity.rows[0].department_id, 'submit', activity.rows[0].created_by);
      if (!['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'UNDER_REVIEW'].includes(activity.rows[0].status)) {
        throw Object.assign(new Error('La actividad no admite una nueva solicitud de revisión.'), { status: 409, code: 'ACTIVITY_STATUS_INVALID' });
      }
      const conflict = await client.query<{ id: string; requested_option_id: string }>(
        `SELECT id,requested_option_id FROM calendar.conflict_cases WHERE activity_id=$1 AND status='OPEN'
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [activityId]
      );
      if (!conflict.rowCount) throw Object.assign(new Error('No existe un conflicto abierto para esta actividad.'), { status: 409 });
      const review = await client.query<{ id: string }>(
        `INSERT INTO calendar.review_requests(conflict_case_id,requested_by,reason,impact,coexistence_plan,resource_plan,alternative)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [conflict.rows[0]!.id, user.sub, input.reason, input.impact, input.coexistencePlan, input.resourcePlan, input.alternative]
      );
      await client.query(`UPDATE calendar.conflict_cases SET status='REVIEW_REQUESTED',updated_at=now() WHERE id=$1`, [conflict.rows[0]!.id]);
      await client.query(`UPDATE calendar.schedule_options SET status='EXCEPTION_REQUESTED' WHERE id=$1`, [conflict.rows[0]!.requested_option_id]);
      await client.query(`UPDATE calendar.activities SET status='UNDER_REVIEW',version=version+1,updated_at=now() WHERE id=$1 AND status<>'UNDER_REVIEW'`, [activityId]);
      await outbox(client, 'review.requested', activityId, { title: 'Solicitud de revisión', reviewId: review.rows[0]!.id });
      await audit(client, user, 'review.requested', 'activity', activityId, { reviewId: review.rows[0]!.id }, request);
      return { id: review.rows[0]!.id, status: 'PENDING' };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Get('review-requests')
  async reviews(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.review');
    const pool = await poolFor(user);
    const reviews = await pool.query<{
      conflict_case_id: string; details: Conflict[]; [key: string]: unknown;
    }>(
      `SELECT rr.id,rr.reason,rr.impact,rr.coexistence_plan,rr.resource_plan,rr.alternative,rr.status,rr.created_at,
              rr.review_session_id,rr.postponed_until,
              cc.id conflict_case_id,cc.severity,cc.details,cc.requested_option_id,
              COALESCE(cc.submitted_at,cc.created_at) requested_submitted_at,
              COALESCE(request_submitter.name,creator.name,a.responsible_name) requested_by_name,
              'FIRST_VALID_SUBMISSION' preference_basis,
              a.id activity_id,a.code,a.title,a.responsible_name,d.name department,d.color department_color,
              o.label option_label,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'recommendation',r.recommendation,'notes',r.notes,
                         'reviewerId',r.reviewer_id,'createdAt',r.created_at) ORDER BY r.created_at)
                        FROM calendar.review_recommendations r WHERE r.review_request_id=rr.id),'[]'::jsonb) recommendations,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id',so.id,'label',so.label,'preference',so.preference,
                         'status',so.status,'sessions',(SELECT jsonb_agg(jsonb_build_object('startsAt',ss.starts_at,'endsAt',ss.ends_at)
                           ORDER BY ss.starts_at) FROM calendar.schedule_sessions ss WHERE ss.option_id=so.id)) ORDER BY so.preference)
                        FROM calendar.schedule_options so WHERE so.activity_id=a.id),'[]'::jsonb) options,
              COALESCE(jsonb_agg(jsonb_build_object('startsAt',s.starts_at,'endsAt',s.ends_at)
                ORDER BY s.starts_at) FILTER(WHERE s.id IS NOT NULL),'[]'::jsonb) sessions
       FROM calendar.review_requests rr
       JOIN calendar.conflict_cases cc ON cc.id=rr.conflict_case_id
       JOIN calendar.activities a ON a.id=cc.activity_id
       JOIN calendar.departments d ON d.id=a.department_id
       JOIN calendar.schedule_options o ON o.id=cc.requested_option_id
       LEFT JOIN identity.users request_submitter ON request_submitter.id=cc.submitted_by
       LEFT JOIN identity.users creator ON creator.id=a.created_by
       LEFT JOIN calendar.schedule_sessions s ON s.option_id=o.id
       GROUP BY rr.id,cc.id,a.id,d.id,o.id,request_submitter.id,creator.id
       ORDER BY CASE rr.status WHEN 'PENDING' THEN 0 ELSE 1 END, rr.created_at`,
    );
    const reviewCaseIds = reviews.rows.map((row) => row.conflict_case_id);
    const liveConflictDetails = reviewCaseIds.length ? await pool.query<Conflict & {
      conflict_case_id: string; conflict_types: string[]; shared_resources: string[]; has_priority: boolean;
    }>(
      `SELECT cc.id conflict_case_id,r.id reservation_id,occupied.id activity_id,occupied.code,occupied.title,
              occupied_department.id department_id,occupied_department.name department,occupied_department.color department_color,
              venue.name venue,occupied.responsible_name,
              COALESCE(submitter.name,creator.name,occupied.responsible_name) submitted_by_name,
              r.created_at::text submitted_at,occupied.created_at::text activity_created_at,
              lower(r.reserved_range)::text starts_at,upper(r.reserved_range)::text ends_at,
              greatest(lower(r.reserved_range),lower(requested_session.effective_range))::text disputed_start,
              least(upper(r.reserved_range),upper(requested_session.effective_range))::text disputed_end,
              r.status reservation_status,
              (requested.venue_id IS NOT NULL AND requested.venue_id=r.venue_id) same_venue,
              bool_or(cl.conflict_type='RESOURCE') same_resource,
              bool_or(cl.conflict_type='RESPONSIBLE') same_responsible,
              bool_or(cl.conflict_type='SCOPE') scope_conflict,
              array_agg(DISTINCT cl.conflict_type ORDER BY cl.conflict_type) conflict_types,
              ARRAY(SELECT resource.name FROM calendar.activity_resources requested_resource
                    JOIN calendar.activity_resources occupied_resource ON occupied_resource.resource_id=requested_resource.resource_id
                    JOIN calendar.resources resource ON resource.id=requested_resource.resource_id
                    WHERE requested_resource.activity_id=requested.id AND occupied_resource.activity_id=occupied.id AND resource.exclusive
                    ORDER BY resource.name) shared_resources,
              true has_priority
         FROM calendar.conflict_cases cc
         JOIN calendar.activities requested ON requested.id=cc.activity_id
         JOIN calendar.conflict_links cl ON cl.conflict_case_id=cc.id
         JOIN calendar.activities occupied ON occupied.id=cl.conflicting_activity_id
         JOIN calendar.departments occupied_department ON occupied_department.id=occupied.department_id
         JOIN calendar.reservations r ON r.id::text=cl.details->>'reservation_id'
         JOIN calendar.schedule_sessions requested_session ON requested_session.option_id=cc.requested_option_id
              AND requested_session.effective_range && r.reserved_range
         LEFT JOIN calendar.venues venue ON venue.id=r.venue_id
         LEFT JOIN LATERAL (
           SELECT ae.actor_id FROM audit.audit_events ae
            WHERE ae.resource_type='activity' AND ae.resource_id=occupied.id::text AND ae.action='activity.submitted'
            ORDER BY ae.created_at LIMIT 1
         ) submission ON true
         LEFT JOIN identity.users submitter ON submitter.id=submission.actor_id
         LEFT JOIN identity.users creator ON creator.id=occupied.created_by
        WHERE cc.id=ANY($1::uuid[])
        GROUP BY cc.id,r.id,occupied.id,occupied_department.id,venue.id,requested.id,requested_session.id,submitter.id,creator.id
        ORDER BY disputed_start,r.created_at`,
      [reviewCaseIds]
    ) : { rows: [] as Array<Conflict & { conflict_case_id: string; conflict_types: string[]; shared_resources: string[]; has_priority: boolean }> };
    const detailsByCase = new Map<string, typeof liveConflictDetails.rows>();
    for (const detail of liveConflictDetails.rows) {
      const current = detailsByCase.get(detail.conflict_case_id) ?? [];
      current.push(detail);
      detailsByCase.set(detail.conflict_case_id, current);
    }
    const approvals = await pool.query(
      `SELECT a.id,a.code,a.title,a.responsible_name,a.created_at,d.name department,
        COALESCE(jsonb_agg(jsonb_build_object('startsAt',s.starts_at,'endsAt',s.ends_at) ORDER BY s.starts_at),'[]'::jsonb) sessions
       FROM calendar.activities a JOIN calendar.departments d ON d.id=a.department_id
       JOIN calendar.schedule_options o ON o.activity_id=a.id AND o.is_selected
       JOIN calendar.schedule_sessions s ON s.option_id=o.id
       WHERE a.status='SUBMITTED' GROUP BY a.id,d.name ORDER BY a.created_at`
    );
    return {
      items: reviews.rows.map((row) => ({ ...row, details: detailsByCase.get(row.conflict_case_id) ?? row.details })),
      approvals: approvals.rows,
      capabilities: {
        canCreateAlternatives: user.permissions.includes('calendar.manage'),
        canResolve: user.permissions.includes('calendar.conflict.resolve')
      }
    };
  }

  @Get('review-requests/:id/alternative-suggestions')
  async reviewAlternativeSuggestions(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') reviewId: string,
    @Query('limit') limitRaw?: string
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.manage');
    const limit = z.coerce.number().int().min(1).max(8).default(5).parse(limitRaw);
    const pool = await poolFor(user);
    const contextResult = await pool.query<{
      status: string; activity_id: string; venue_id: string | null; starts_at: Date; ends_at: Date;
      setup_minutes: number; teardown_minutes: number;
    }>(
      `SELECT rr.status,a.id activity_id,a.venue_id,s.starts_at,s.ends_at,s.setup_minutes,s.teardown_minutes
         FROM calendar.review_requests rr
         JOIN calendar.conflict_cases cc ON cc.id=rr.conflict_case_id
         JOIN calendar.activities a ON a.id=cc.activity_id
         JOIN calendar.schedule_sessions s ON s.option_id=cc.requested_option_id
        WHERE rr.id=$1
        ORDER BY s.starts_at LIMIT 1`,
      [reviewId]
    );
    const context = contextResult.rows[0];
    if (!context) throw Object.assign(new Error('La solicitud de revisión no existe.'), { status: 404 });
    if (!['PENDING', 'POSTPONED'].includes(context.status)) {
      throw Object.assign(new Error('La solicitud ya fue resuelta.'), { status: 409, code: 'REVIEW_ALREADY_RESOLVED' });
    }
    const settings = await pool.query<{ suggestion_horizon_days: number; business_day_start: string; business_day_end: string }>(
      `SELECT suggestion_horizon_days,business_day_start::text,business_day_end::text
         FROM calendar.tenant_calendar_settings WHERE singleton`
    );
    const config = settings.rows[0] ?? { suggestion_horizon_days: 60, business_day_start: '06:00:00', business_day_end: '23:00:00' };
    const effectiveStart = new Date(context.starts_at.getTime() - context.setup_minutes * 60_000);
    const effectiveEnd = new Date(context.ends_at.getTime() + context.teardown_minutes * 60_000);
    const horizonEnd = new Date(effectiveStart.getTime() + config.suggestion_horizon_days * 86_400_000);
    const occupied = await pool.query<{ starts_at: Date; ends_at: Date }>(
      `SELECT lower(reserved_range) starts_at,upper(reserved_range) ends_at
         FROM calendar.reservations
        WHERE status IN ('PROVISIONAL','CONFIRMED')
          AND activity_id<>$3
          AND reserved_range && tstzrange($1::timestamptz,$2::timestamptz,'[)')
        ORDER BY lower(reserved_range)`,
      [effectiveStart.toISOString(), horizonEnd.toISOString(), context.activity_id]
    );
    const suggestions = suggestFreeIntervals(
      effectiveStart,
      effectiveEnd,
      occupied.rows.map((item) => ({ start: item.starts_at, end: item.ends_at })),
      {
        horizonDays: config.suggestion_horizon_days,
        limit,
        businessStartHour: Number(config.business_day_start.slice(0, 2)),
        businessEndHour: Number(config.business_day_end.slice(0, 2))
      }
    );
    return {
      items: suggestions.map((suggestion) => ({
        startsAt: new Date(suggestion.start.getTime() + context.setup_minutes * 60_000).toISOString(),
        endsAt: new Date(suggestion.end.getTime() - context.teardown_minutes * 60_000).toISOString(),
        setupMinutes: context.setup_minutes,
        teardownMinutes: context.teardown_minutes,
        explanation: suggestion.explanation
      }))
    };
  }

  @Post('review-requests/:id/alternatives')
  async createReviewAlternative(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') reviewId: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.manage');
    const input = reviewAlternativeSchema.parse(body);
    const pool = await poolFor(user);
    const created = await withTransaction(pool, async (client) => {
      const contextResult = await client.query<{
        status: string; activity_id: string; title: string; venue_id: string | null; responsible_user_id: string;
      }>(
        `SELECT rr.status,a.id activity_id,a.title,a.venue_id,a.responsible_user_id
           FROM calendar.review_requests rr
           JOIN calendar.conflict_cases cc ON cc.id=rr.conflict_case_id
           JOIN calendar.activities a ON a.id=cc.activity_id
          WHERE rr.id=$1 FOR UPDATE OF rr`,
        [reviewId]
      );
      const context = contextResult.rows[0];
      if (!context) throw Object.assign(new Error('La solicitud de revisión no existe.'), { status: 404 });
      if (!['PENDING', 'POSTPONED'].includes(context.status)) {
        throw Object.assign(new Error('La solicitud ya fue resuelta.'), { status: 409, code: 'REVIEW_ALREADY_RESOLVED' });
      }
      const optionLimit = await client.query<{ max_options: number; option_count: number; next_preference: number }>(
        `SELECT settings.max_options,
                (SELECT count(*)::int FROM calendar.schedule_options WHERE activity_id=$1) option_count,
                (SELECT COALESCE(max(preference),0)+1 FROM calendar.schedule_options WHERE activity_id=$1) next_preference
           FROM calendar.tenant_calendar_settings settings WHERE settings.singleton`,
        [context.activity_id]
      );
      const limits = optionLimit.rows[0] ?? { max_options: 5, option_count: 0, next_preference: 1 };
      if (limits.option_count >= limits.max_options) {
        throw Object.assign(new Error(`Este tenant permite un máximo de ${limits.max_options} alternativas por actividad.`), {
          status: 409,
          code: 'ALTERNATIVE_LIMIT_REACHED'
        });
      }
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);
      const effectiveStart = new Date(startsAt.getTime() - input.setupMinutes * 60_000);
      const effectiveEnd = new Date(endsAt.getTime() + input.teardownMinutes * 60_000);
      await lockSessions(client, [{ effective_start: effectiveStart }]);
      const conflicts = await conflictsForRange(
        client,
        effectiveStart.toISOString(),
        effectiveEnd.toISOString(),
        context.venue_id,
        context.activity_id
      );
      if (conflicts.length) {
        throw Object.assign(new Error('La alternativa propuesta coincide con otra reserva activa. Seleccione uno de los horarios libres sugeridos.'), {
          status: 409,
          code: 'ALTERNATIVE_CONFLICT',
          conflicts
        });
      }
      const option = await client.query<{ id: string; label: string; preference: number; status: string }>(
        `INSERT INTO calendar.schedule_options(activity_id,label,preference,status,is_selected)
         VALUES($1,$2,$3,'PROPOSED',false)
         RETURNING id,label,preference,status`,
        [context.activity_id, input.label, limits.next_preference]
      );
      const optionRow = option.rows[0]!;
      await client.query(
        `INSERT INTO calendar.schedule_sessions(option_id,starts_at,ends_at,setup_minutes,teardown_minutes,effective_range)
         VALUES($1,$2,$3,$4,$5,tstzrange($6,$7,'[)'))`,
        [optionRow.id, startsAt, endsAt, input.setupMinutes, input.teardownMinutes, effectiveStart, effectiveEnd]
      );
      await outbox(client, 'review.alternative_created', context.activity_id, {
        title: context.title,
        reviewId,
        optionId: optionRow.id,
        userId: context.responsible_user_id
      });
      await audit(client, user, 'review.alternative_created', 'review_request', reviewId, {
        optionId: optionRow.id,
        label: input.label,
        startsAt: input.startsAt,
        endsAt: input.endsAt
      }, request);
      return {
        ...optionRow,
        sessions: [{ startsAt: input.startsAt, endsAt: input.endsAt, setupMinutes: input.setupMinutes, teardownMinutes: input.teardownMinutes }]
      };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return created;
  }

  @Post('review-requests/:id/recommendations')
  async recommend(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') reviewId: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.review');
    const input = recommendationSchema.parse(body);
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const context = await client.query<{ activity_id: string; title: string; responsible_user_id: string }>(
        `SELECT a.id activity_id,a.title,a.responsible_user_id
         FROM calendar.review_requests rr JOIN calendar.conflict_cases cc ON cc.id=rr.conflict_case_id
         JOIN calendar.activities a ON a.id=cc.activity_id WHERE rr.id=$1`, [reviewId]
      );
      const activity = context.rows[0];
      if (!activity) throw Object.assign(new Error('La solicitud de revisión no existe.'), { status: 404 });
      const recommendation = await client.query(
        `INSERT INTO calendar.review_recommendations(review_request_id,reviewer_id,recommendation,notes)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(review_request_id,reviewer_id) DO UPDATE
         SET recommendation=EXCLUDED.recommendation,notes=EXCLUDED.notes,created_at=now()
         RETURNING id,review_request_id,recommendation,notes,created_at`,
        [reviewId, user.sub, input.recommendation, input.notes]
      );
      await outbox(client, 'review.recommendation_added', activity.activity_id, {
        title: activity.title, userId: activity.responsible_user_id, recommendation: input.recommendation
      });
      await audit(client, user, 'review.recommendation_added', 'review_request', reviewId, { recommendation: input.recommendation }, request);
      return recommendation.rows[0];
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Get('review-sessions/eligible-participants')
  async eligibleReviewParticipants(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requireReviewSessionCoordinator(user);
    const result = await (await poolFor(user)).query(
      `SELECT u.id,u.name,u.email,u.phone,u.roles,
              COALESCE(pref.whatsapp_enabled,false) "whatsappEnabled",
              pref.consented_at "whatsappConsentedAt",
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'role',membership.role) ORDER BY d.name)
                          FROM identity.department_memberships membership
                          JOIN calendar.departments d ON d.id=membership.department_id
                         WHERE membership.user_id=u.id),'[]'::jsonb) departments
         FROM identity.users u
         LEFT JOIN notifications.preferences pref ON pref.user_id=u.id
        WHERE u.active ORDER BY
          CASE WHEN 'BOARD_SECRETARY'=ANY(u.roles) THEN 0 WHEN 'TENANT_ADMIN'=ANY(u.roles) THEN 1 ELSE 2 END,u.name`
    );
    return { items: result.rows };
  }

  @Get('review-sessions/my-agenda')
  async myReviewAgenda(
    @Req() request: Request & { user?: AuthPrincipal },
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const range = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }).parse({
      from: from || undefined,
      to: to || undefined
    });
    const result = await (await poolFor(user)).query(
      `SELECT session.id,session.title,session.scheduled_at "startsAt",session.ends_at "endsAt",
              session.location,session.agenda,session.status,participant.invitation_status "invitationStatus",
              participant.attended,
              COALESCE((SELECT count(*) FROM calendar.review_requests request WHERE request.review_session_id=session.id),0)::int "caseCount"
         FROM calendar.review_session_participants participant
         JOIN calendar.review_sessions session ON session.id=participant.review_session_id
        WHERE participant.user_id=$1
          AND ($2::timestamptz IS NULL OR session.ends_at>=$2::timestamptz)
          AND ($3::timestamptz IS NULL OR session.scheduled_at<=$3::timestamptz)
          AND session.status<>'CANCELLED'
        ORDER BY session.scheduled_at`,
      [user.sub, range.from ?? null, range.to ?? null]
    );
    return { items: result.rows };
  }

  @Get('review-sessions')
  async reviewSessions(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const canReview = user.permissions.includes('calendar.review');
    const pool = await poolFor(user);
    const result = await pool.query(
      `SELECT session.*,creator.name created_by_name,
              COALESCE((SELECT count(*) FROM calendar.review_requests request WHERE request.review_session_id=session.id),0)::int cases,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id',request.id,'code',activity.code,'title',activity.title,'status',request.status) ORDER BY activity.code)
                          FROM calendar.review_requests request
                          JOIN calendar.conflict_cases conflict ON conflict.id=request.conflict_case_id
                          JOIN calendar.activities activity ON activity.id=conflict.activity_id
                         WHERE request.review_session_id=session.id),'[]'::jsonb) review_requests,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'userId',participant.user_id,'name',invited.name,'email',invited.email,'phone',invited.phone,
                         'roles',invited.roles,'role',participant.role,'attended',participant.attended,
                         'invitationStatus',participant.invitation_status,'respondedAt',participant.responded_at,
                         'whatsappEnabled',COALESCE(preference.whatsapp_enabled,false),
                         'deliveries',COALESCE(delivery.states,'{}'::jsonb)) ORDER BY invited.name)
                          FROM calendar.review_session_participants participant
                          JOIN identity.users invited ON invited.id=participant.user_id
                          LEFT JOIN notifications.preferences preference ON preference.user_id=participant.user_id
                          LEFT JOIN LATERAL (
                            SELECT jsonb_object_agg(sent.channel,sent.status) states
                              FROM calendar.outbox_events invitation
                              JOIN notifications.notifications notice ON notice.event_id=invitation.id AND notice.user_id=participant.user_id
                              JOIN notifications.deliveries sent ON sent.notification_id=notice.id
                             WHERE invitation.aggregate_id=session.id AND invitation.event_type='review.session_invited'
                          ) delivery ON true
                         WHERE participant.review_session_id=session.id),'[]'::jsonb) participants
         FROM calendar.review_sessions session
         LEFT JOIN identity.users creator ON creator.id=session.created_by
        WHERE $1::boolean OR EXISTS (
          SELECT 1 FROM calendar.review_session_participants viewer
           WHERE viewer.review_session_id=session.id AND viewer.user_id=$2
        )
        ORDER BY CASE session.status WHEN 'SCHEDULED' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END,session.scheduled_at DESC`
      , [canReview, user.sub]
    );
    return {
      items: result.rows,
      capabilities: { canManageSessions: user.permissions.includes('calendar.manage') || user.permissions.includes('calendar.conflict.resolve') }
    };
  }

  @Post('review-sessions')
  async createReviewSession(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request);
    requireReviewSessionCoordinator(user);
    const input = reviewSessionSchema.parse(body);
    const participantIds = [...new Set(input.participantIds)];
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const activeParticipants = await client.query<{ id: string }>(
        `SELECT id FROM identity.users WHERE active AND id=ANY($1::uuid[])`, [participantIds]
      );
      if (activeParticipants.rowCount !== participantIds.length) {
        throw Object.assign(new Error('Uno o más participantes no existen o están inactivos.'), { status: 409, code: 'INVALID_REVIEW_PARTICIPANT' });
      }
      const created = await client.query<{ id: string }>(
        `INSERT INTO calendar.review_sessions(title,scheduled_at,ends_at,location,agenda,reminder_minutes,created_by)
         VALUES($1,$2,$3,$4,$5,$6::integer[],$7) RETURNING id`,
        [input.title, input.scheduledAt, input.endsAt, input.location ?? null, input.agenda, [...new Set(input.reminderMinutes)], user.sub]
      );
      const id = created.rows[0]!.id;
      const reminderKinds = new Map([[1440, '24_HOURS'], [120, '2_HOURS'], [60, '1_HOUR'], [30, '30_MINUTES'], [15, '15_MINUTES']]);
      const scheduledAt = new Date(input.scheduledAt);
      const when = scheduledAt.toISOString();
      for (const participantId of participantIds) {
        await client.query(
          `INSERT INTO calendar.review_session_participants(review_session_id,user_id,role)
           VALUES($1,$2,$3)`, [id, participantId, participantId === user.sub ? 'ORGANIZER' : 'MEMBER']
        );
        for (const minutes of new Set(input.reminderMinutes)) {
          const remindAt = new Date(scheduledAt.getTime() - minutes * 60_000);
          if (remindAt > new Date()) {
            await client.query(
              `INSERT INTO calendar.review_session_reminders(review_session_id,user_id,remind_at,kind)
               VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
              [id, participantId, remindAt, reminderKinds.get(minutes)]
            );
          }
        }
        await outbox(client, 'review.session_invited', id, {
          title: input.title,
          when,
          location: input.location ?? '',
          agenda: input.agenda,
          userId: participantId
        });
      }
      if (input.reviewRequestIds.length) {
        const linked = await client.query(
          `UPDATE calendar.review_requests SET review_session_id=$1,updated_at=now()
            WHERE id=ANY($2::uuid[]) AND status IN ('PENDING','POSTPONED') RETURNING id`,
          [id, [...new Set(input.reviewRequestIds)]]
        );
        if (linked.rowCount !== new Set(input.reviewRequestIds).size) {
          throw Object.assign(new Error('Uno o más casos no están disponibles para esta junta.'), { status: 409, code: 'REVIEW_CASE_NOT_AVAILABLE' });
        }
      }
      await audit(client, user, 'review_session.created', 'review_session', id, input, request);
      return { id, status: 'SCHEDULED', invited: participantIds.length, cases: input.reviewRequestIds.length };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Patch('review-sessions/:id/response')
  async respondToReviewSession(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    const input = z.object({ response: z.enum(['CONFIRMED', 'DECLINED']) }).parse(body);
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const sessionResult = await client.query<{ title: string; created_by: string }>(
        `SELECT title,created_by FROM calendar.review_sessions WHERE id=$1 AND status='SCHEDULED'`, [id]
      );
      const session = sessionResult.rows[0];
      if (!session) throw Object.assign(new Error('La sesión no está disponible para responder.'), { status: 409 });
      const updated = await client.query(
        `UPDATE calendar.review_session_participants
            SET invitation_status=$3,responded_at=now()
          WHERE review_session_id=$1 AND user_id=$2
          RETURNING invitation_status "invitationStatus",responded_at "respondedAt"`,
        [id, user.sub, input.response]
      );
      if (!updated.rowCount) throw Object.assign(new Error('No forma parte de esta sesión de junta.'), { status: 403 });
      await outbox(client, 'review.session_response', id, {
        title: session.title,
        participant: user.name,
        response: input.response,
        userId: session.created_by
      });
      await audit(client, user, 'review_session.responded', 'review_session', id, input, request);
      return updated.rows[0];
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Patch('review-sessions/:id')
  async updateReviewSession(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    requireReviewSessionCoordinator(user);
    const input = z.object({
      status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'CLOSED', 'CANCELLED']).optional(),
      minutes: z.string().max(20_000).optional(),
      attendedParticipantIds: z.array(z.uuid()).max(100).optional()
    }).refine((value) => Object.keys(value).length > 0, 'Indique al menos un cambio.').parse(body);
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const current = await client.query<{ title: string; status: string; scheduled_at: Date; location: string | null }>(
        `SELECT title,status,scheduled_at,location FROM calendar.review_sessions WHERE id=$1 FOR UPDATE`, [id]
      );
      if (!current.rowCount) throw Object.assign(new Error('La sesión de junta no existe.'), { status: 404 });
      const updated = await client.query(
        `UPDATE calendar.review_sessions SET status=COALESCE($2,status),minutes=COALESCE($3,minutes),updated_at=now()
         WHERE id=$1 RETURNING *`, [id, input.status ?? null, input.minutes ?? null]
      );
      if (input.attendedParticipantIds) {
        await client.query(`UPDATE calendar.review_session_participants SET attended=false WHERE review_session_id=$1`, [id]);
        if (input.attendedParticipantIds.length) {
          await client.query(
            `UPDATE calendar.review_session_participants SET attended=true
             WHERE review_session_id=$1 AND user_id=ANY($2::uuid[])`, [id, input.attendedParticipantIds]
          );
        }
      }
      if (input.status === 'CANCELLED') {
        await client.query(`UPDATE calendar.review_session_reminders SET status='CANCELLED' WHERE review_session_id=$1 AND status='PENDING'`, [id]);
      }
      if (input.status && input.status !== current.rows[0]!.status) {
        const participants = await client.query<{ user_id: string }>(
          `SELECT user_id FROM calendar.review_session_participants WHERE review_session_id=$1`, [id]
        );
        const eventType = input.status === 'CANCELLED' ? 'review.session_cancelled' : 'review.session_updated';
        const when = current.rows[0]!.scheduled_at.toISOString();
        for (const participant of participants.rows) {
          await outbox(client, eventType, id, {
            title: current.rows[0]!.title,
            when,
            location: current.rows[0]!.location ?? '',
            status: input.status,
            userId: participant.user_id
          });
        }
      }
      await audit(client, user, 'review_session.updated', 'review_session', id, input, request);
      return updated.rows[0];
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Post('review-requests/:id/decision')
  async decide(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') reviewId: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.conflict.resolve');
    const input = reviewDecisionSchema.parse(body);
    const pool = await poolFor(user);
    const result = await withTransaction(pool, async (client) => {
      const contextResult = await client.query<{
        id: string; status: string; conflict_case_id: string; activity_id: string; title: string; requested_option_id: string; venue_id: string | null; responsible_user_id: string;
      }>(
        `SELECT rr.id,rr.status,cc.id conflict_case_id,cc.activity_id,a.title,cc.requested_option_id,a.venue_id,a.responsible_user_id
         FROM calendar.review_requests rr JOIN calendar.conflict_cases cc ON cc.id=rr.conflict_case_id
         JOIN calendar.activities a ON a.id=cc.activity_id WHERE rr.id=$1 FOR UPDATE`, [reviewId]
      );
      const context = contextResult.rows[0];
      if (!context || !['PENDING', 'POSTPONED'].includes(context.status)) throw Object.assign(new Error('La solicitud ya fue resuelta o no existe.'), { status: 409 });
      if (input.decision === 'APPROVE_COEXISTENCE') {
        const sessions = await optionSessions(client, context.requested_option_id);
        await lockSessions(client, sessions);
        const currentConflicts: Conflict[] = [];
        for (const session of sessions) {
          currentConflicts.push(...await conflictsForRange(
            client, session.effective_start.toISOString(), session.effective_end.toISOString(), context.venue_id, context.activity_id
          ));
        }
        const known = await client.query<{ conflicting_activity_id: string }>(
          `SELECT DISTINCT conflicting_activity_id FROM calendar.conflict_links WHERE conflict_case_id=$1`, [context.conflict_case_id]
        );
        const knownIds = new Set(known.rows.map((row) => row.conflicting_activity_id));
        const newConflicts = currentConflicts.filter((conflict) => !knownIds.has(conflict.activity_id));
        if (newConflicts.length) {
          await client.query(
            `UPDATE calendar.conflict_cases SET details=$2::jsonb,severity=$3,updated_at=now() WHERE id=$1`,
            [context.conflict_case_id, JSON.stringify(currentConflicts), deriveConflictSeverity(currentConflicts.flatMap(factorsFor))]
          );
          for (const conflict of newConflicts) {
            for (const conflictType of factorsFor(conflict)) {
              await client.query(
                `INSERT INTO calendar.conflict_links(conflict_case_id,conflicting_activity_id,conflict_type,details)
                 VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,
                [context.conflict_case_id, conflict.activity_id, conflictType, JSON.stringify(conflict)]
              );
            }
          }
          await audit(client, user, 'review.revalidation_required', 'review_request', reviewId, { newConflicts }, request);
          return { id: reviewId, status: 'REVALIDATION_REQUIRED', newConflicts };
        }
      }
      await client.query(
        `INSERT INTO calendar.review_decisions(review_request_id,decision,notes,decided_by,participants,postponed_until)
         VALUES($1,$2,$3,$4,$5::uuid[],$6)`,
        [reviewId, input.decision, input.notes, user.sub, input.participants, input.postponedUntil ?? null]
      );
      if (input.decision === 'APPROVE_COEXISTENCE') {
        const sessions = await optionSessions(client, context.requested_option_id);
        const waiver = await client.query<{ id: string }>(
          `INSERT INTO calendar.conflict_waivers(review_request_id,activity_id,option_id,notes,authorized_by)
           VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [reviewId, context.activity_id, context.requested_option_id, input.notes, user.sub]
        );
        for (const session of sessions) {
          await client.query(
            `INSERT INTO calendar.reservations(activity_id,option_id,session_id,venue_id,reserved_range,status,waiver_id)
             VALUES($1,$2,$3,$4,tstzrange($5,$6,'[)'),'CONFIRMED',$7)`,
            [context.activity_id, context.requested_option_id, session.id, context.venue_id,
              session.effective_start, session.effective_end, waiver.rows[0]!.id]
          );
        }
        await client.query(`UPDATE calendar.schedule_options SET status='CONFIRMED',is_selected=true WHERE id=$1`, [context.requested_option_id]);
        await client.query(`UPDATE calendar.activities SET status='APPROVED',version=version+1,updated_at=now() WHERE id=$1`, [context.activity_id]);
        await client.query(`UPDATE calendar.review_requests SET status='APPROVED',updated_at=now() WHERE id=$1`, [reviewId]);
      } else if (input.decision === 'APPROVE_ALTERNATIVE') {
        const optionId = input.optionId!;
        const selected = await client.query(`SELECT 1 FROM calendar.schedule_options WHERE id=$1 AND activity_id=$2 AND status<>'RELEASED'`, [optionId, context.activity_id]);
        if (!selected.rowCount) throw Object.assign(new Error('La alternativa no pertenece a la actividad.'), { status: 404, code: 'OPTION_NOT_FOUND' });
        const sessions = await optionSessions(client, optionId);
        await lockSessions(client, sessions);
        const conflicts: Conflict[] = [];
        for (const session of sessions) {
          conflicts.push(...await conflictsForRange(client, session.effective_start.toISOString(), session.effective_end.toISOString(), context.venue_id, context.activity_id));
        }
        if (conflicts.length) throw Object.assign(new Error('La alternativa seleccionada ya no está disponible.'), { status: 409, code: 'ALTERNATIVE_NO_LONGER_AVAILABLE', conflicts });
        await client.query(`UPDATE calendar.reservations SET status='RELEASED' WHERE activity_id=$1 AND status<>'RELEASED'`, [context.activity_id]);
        for (const session of sessions) {
          await client.query(
            `INSERT INTO calendar.reservations(activity_id,option_id,session_id,venue_id,reserved_range,status)
             VALUES($1,$2,$3,$4,tstzrange($5,$6,'[)'),'CONFIRMED')`,
            [context.activity_id, optionId, session.id, context.venue_id, session.effective_start, session.effective_end]
          );
        }
        await client.query(`UPDATE calendar.schedule_options SET is_selected=false WHERE activity_id=$1`, [context.activity_id]);
        await client.query(`UPDATE calendar.schedule_options SET status='CONFIRMED',is_selected=true WHERE id=$1`, [optionId]);
        await client.query(`UPDATE calendar.activities SET status='APPROVED',version=version+1,updated_at=now() WHERE id=$1`, [context.activity_id]);
        await client.query(`UPDATE calendar.review_requests SET status='APPROVED',updated_at=now() WHERE id=$1`, [reviewId]);
      } else if (input.decision === 'REQUEST_CHANGES') {
        await client.query(`UPDATE calendar.reservations SET status='RELEASED' WHERE activity_id=$1 AND status<>'RELEASED'`, [context.activity_id]);
        await client.query(`UPDATE calendar.activities SET status='CHANGES_REQUESTED',version=version+1,updated_at=now() WHERE id=$1`, [context.activity_id]);
        await client.query(`UPDATE calendar.review_requests SET status='CHANGES_REQUESTED',updated_at=now() WHERE id=$1`, [reviewId]);
      } else if (input.decision === 'REJECT') {
        await client.query(`UPDATE calendar.reservations SET status='RELEASED' WHERE activity_id=$1 AND status<>'RELEASED'`, [context.activity_id]);
        await client.query(`UPDATE calendar.activities SET status='REJECTED',version=version+1,updated_at=now() WHERE id=$1`, [context.activity_id]);
        await client.query(`UPDATE calendar.review_requests SET status='REJECTED',updated_at=now() WHERE id=$1`, [reviewId]);
      } else if (input.decision === 'POSTPONE') {
        await client.query(
          `UPDATE calendar.review_requests SET status='POSTPONED',postponed_until=$2,updated_at=now() WHERE id=$1`,
          [reviewId, input.postponedUntil]
        );
      }
      if (input.decision !== 'POSTPONE') {
        await client.query(
          `UPDATE calendar.conflict_cases SET status='RESOLVED',updated_at=now()
           WHERE id=(SELECT conflict_case_id FROM calendar.review_requests WHERE id=$1)`, [reviewId]
        );
      }
      await outbox(client, 'review.decided', context.activity_id, { title: context.title, decision: input.decision, userId: context.responsible_user_id });
      await audit(client, user, 'review.decided', 'review_request', reviewId, input, request);
      return { id: reviewId, decision: input.decision };
    });
    void dispatchOutbox(pool, user.tenantId!);
    return result;
  }

  @Get('dashboard')
  async dashboard(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'dashboard.read');
    const pool = await poolFor(user);
    const [stats, departments, upcoming, attention, trend, recentHistory, forecastCandidates] = await Promise.all([
      pool.query(
        `WITH lifecycle AS (
           SELECT a.id,a.status,a.created_at,
                  min(s.starts_at) FILTER(WHERE o.is_selected) starts_at,
                  max(s.ends_at) FILTER(WHERE o.is_selected) ends_at
             FROM calendar.activities a
             LEFT JOIN calendar.schedule_options o ON o.activity_id=a.id
             LEFT JOIN calendar.schedule_sessions s ON s.option_id=o.id
            WHERE ${activityReadPredicate(user)}
            GROUP BY a.id
         )
         SELECT count(*) FILTER(WHERE status='APPROVED')::int approved,
                count(*) FILTER(WHERE status='SUBMITTED')::int pending,
                count(*) FILTER(WHERE status='UNDER_REVIEW')::int conflicts,
                count(*) FILTER(WHERE status='DRAFT')::int drafts,
                count(*) FILTER(WHERE status='COMPLETED')::int completed,
                count(*) FILTER(WHERE status NOT IN ('DRAFT','CANCELLED','ARCHIVED') AND starts_at IS NOT NULL AND ends_at IS NOT NULL)::int coordination_sample,
                count(*) FILTER(WHERE status='APPROVED' AND ends_at<now())::int overdue,
                count(*) FILTER(WHERE status NOT IN ('COMPLETED','CANCELLED','ARCHIVED'))::int incomplete,
                count(*) FILTER(WHERE status='APPROVED' AND starts_at BETWEEN now() AND now()+interval '7 days')::int due_soon,
                count(*) FILTER(WHERE status NOT IN ('CANCELLED','ARCHIVED'))::int total
           FROM lifecycle`
      ),
      pool.query(
        `WITH lifecycle AS (
           SELECT a.id,a.department_id,a.status,max(s.ends_at) FILTER(WHERE o.is_selected) ends_at
             FROM calendar.activities a
             LEFT JOIN calendar.schedule_options o ON o.activity_id=a.id
             LEFT JOIN calendar.schedule_sessions s ON s.option_id=o.id
            WHERE ${activityReadPredicate(user)}
            GROUP BY a.id
         )
         SELECT d.id,d.name,d.color,
                count(l.id) FILTER(WHERE l.status NOT IN ('CANCELLED','ARCHIVED'))::int total,
                count(l.id) FILTER(WHERE l.status='COMPLETED')::int completed,
                count(l.id) FILTER(WHERE l.status='APPROVED' AND l.ends_at<now())::int overdue,
                count(l.id) FILTER(WHERE l.status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED'))::int active
           FROM calendar.departments d LEFT JOIN lifecycle l ON l.department_id=d.id
          WHERE d.active
          GROUP BY d.id ORDER BY active DESC,total DESC,d.name`
      ),
      pool.query(
        `SELECT a.id,a.code,a.title,a.status,d.name department,d.color,
                min(s.starts_at) starts_at,max(s.ends_at) ends_at,v.name venue
         FROM calendar.activities a JOIN calendar.departments d ON d.id=a.department_id
         JOIN calendar.schedule_options o ON o.activity_id=a.id AND o.is_selected
         JOIN calendar.schedule_sessions s ON s.option_id=o.id
         LEFT JOIN calendar.venues v ON v.id=a.venue_id
         WHERE a.status IN ('APPROVED','SUBMITTED') AND s.ends_at >= now() AND ${activityReadPredicate(user)}
         GROUP BY a.id,d.name,d.color,v.name ORDER BY min(s.starts_at) LIMIT 8`
      ),
      pool.query(
        `SELECT a.id,a.code,a.title,a.status,a.created_at,d.name department,d.color,
                schedule.starts_at,schedule.ends_at,
                CASE
                  WHEN a.status='APPROVED' AND schedule.ends_at<now() THEN 'OVERDUE'
                  WHEN a.status='UNDER_REVIEW' THEN 'CONFLICT'
                  WHEN a.status='CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
                  WHEN a.status='SUBMITTED' AND a.created_at<now()-interval '2 days' THEN 'PENDING_DECISION'
                  ELSE 'STALE_DRAFT'
                END kind
           FROM calendar.activities a
           JOIN calendar.departments d ON d.id=a.department_id
           LEFT JOIN LATERAL (
             SELECT min(s.starts_at) starts_at,max(s.ends_at) ends_at
               FROM calendar.schedule_options o JOIN calendar.schedule_sessions s ON s.option_id=o.id
              WHERE o.activity_id=a.id AND o.status<>'RELEASED'
           ) schedule ON true
          WHERE ${activityReadPredicate(user)} AND ((a.status='APPROVED' AND schedule.ends_at<now())
             OR a.status IN ('UNDER_REVIEW','CHANGES_REQUESTED')
             OR (a.status='SUBMITTED' AND a.created_at<now()-interval '2 days')
             OR (a.status='DRAFT' AND a.created_at<now()-interval '7 days'))
          ORDER BY CASE
            WHEN a.status='APPROVED' AND schedule.ends_at<now() THEN 0
            WHEN a.status='UNDER_REVIEW' THEN 1
            WHEN a.status='CHANGES_REQUESTED' THEN 2
            WHEN a.status='SUBMITTED' THEN 3 ELSE 4 END,
            COALESCE(schedule.ends_at,a.created_at) LIMIT 10`
      ),
      pool.query(
        `WITH months AS (
           SELECT generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') AS bucket_month
         ), lifecycle AS (
           SELECT a.id,a.status,min(s.starts_at) FILTER(WHERE o.is_selected) starts_at,
                  max(s.ends_at) FILTER(WHERE o.is_selected) ends_at
             FROM calendar.activities a
             LEFT JOIN calendar.schedule_options o ON o.activity_id=a.id
             LEFT JOIN calendar.schedule_sessions s ON s.option_id=o.id
            WHERE ${activityReadPredicate(user)}
            GROUP BY a.id
         )
         SELECT to_char(m.bucket_month,'YYYY-MM') AS "month",
                count(l.id) FILTER(WHERE l.status NOT IN ('CANCELLED','ARCHIVED'))::int planned,
                count(l.id) FILTER(WHERE l.status='COMPLETED')::int completed,
                count(l.id) FILTER(WHERE l.status='APPROVED' AND l.ends_at<now())::int overdue
           FROM months m LEFT JOIN lifecycle l ON date_trunc('month',l.starts_at)=m.bucket_month
          GROUP BY m.bucket_month ORDER BY m.bucket_month`
      ),
      pool.query<{
        id: string; code: string; title: string; status: string; department: string; created_at: Date;
        starts_at: Date | null; ends_at: Date | null; was_conflicted: boolean; approved_at: Date | null;
      }>(
        `SELECT a.id,a.code,a.title,a.status,d.name department,a.created_at,
                schedule.starts_at,schedule.ends_at,
                EXISTS(SELECT 1 FROM calendar.conflict_cases cc WHERE cc.activity_id=a.id) was_conflicted,
                (SELECT min(ae.created_at) FROM audit.audit_events ae
                  WHERE ae.resource_type='activity' AND ae.resource_id=a.id::text AND ae.action IN ('activity.approved','review.decided')) approved_at
           FROM calendar.activities a JOIN calendar.departments d ON d.id=a.department_id
           LEFT JOIN LATERAL (
             SELECT min(s.starts_at) starts_at,max(s.ends_at) ends_at
               FROM calendar.schedule_options o JOIN calendar.schedule_sessions s ON s.option_id=o.id
              WHERE o.activity_id=a.id AND o.status<>'RELEASED'
           ) schedule ON true
          WHERE a.status NOT IN ('DRAFT','CANCELLED','ARCHIVED') AND ${activityReadPredicate(user)}
          ORDER BY COALESCE(schedule.ends_at,a.updated_at) DESC LIMIT 3`
      ),
      pool.query<{
        id: string; code: string; title: string; status: string; department: string; color: string;
        created_at: Date; starts_at: Date; ends_at: Date;
      }>(
        `SELECT a.id,a.code,a.title,a.status,d.name department,d.color,a.created_at,
                schedule.starts_at,schedule.ends_at
           FROM calendar.activities a JOIN calendar.departments d ON d.id=a.department_id
           JOIN LATERAL (
             SELECT min(s.starts_at) starts_at,max(s.ends_at) ends_at
               FROM calendar.schedule_options o JOIN calendar.schedule_sessions s ON s.option_id=o.id
              WHERE o.activity_id=a.id AND o.status<>'RELEASED'
           ) schedule ON true
          WHERE a.status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED')
            AND schedule.starts_at>=now() AND ${activityReadPredicate(user)}
          ORDER BY schedule.starts_at LIMIT 6`
      )
    ]);
    const statRow = stats.rows[0] as Record<string, number>;
    const scoreForStatus = (row: { status: string; ends_at: Date | null }) => {
      if (row.status === 'COMPLETED') return 1;
      if (row.status === 'REJECTED') return 0.08;
      if (row.status === 'UNDER_REVIEW') return 0.36;
      if (row.status === 'CHANGES_REQUESTED') return 0.42;
      if (row.status === 'SUBMITTED') return 0.67;
      if (row.status === 'APPROVED' && row.ends_at && row.ends_at < new Date()) return 0.34;
      if (row.status === 'APPROVED') return 0.9;
      return 0.55;
    };
    const history = recentHistory.rows.map((row) => ({
      ...row,
      leadDays: row.starts_at ? Math.max(0, Math.round((row.starts_at.getTime() - row.created_at.getTime()) / 86_400_000)) : null,
      approvalHours: row.approved_at ? Math.max(0, Math.round((row.approved_at.getTime() - row.created_at.getTime()) / 3_600_000)) : null,
      outcomeScore: Math.round(scoreForStatus(row) * 100)
    }));
    const sampleScore = history.length ? history.reduce((sum, row) => sum + row.outcomeScore, 0) / history.length : 65;
    const conflictRate = history.length ? history.filter((row) => row.was_conflicted).length / history.length : 0;
    const leadSamples = history.map((row) => row.leadDays).filter((value): value is number => value !== null);
    const averageLeadDays = leadSamples.length ? leadSamples.reduce((sum, value) => sum + value, 0) / leadSamples.length : null;
    const clamp = (value: number) => Math.max(12, Math.min(97, Math.round(value)));
    const statusAdjustment: Record<string, number> = { APPROVED: 14, SUBMITTED: 2, DRAFT: -17, UNDER_REVIEW: -27, CHANGES_REQUESTED: -21 };
    const predictions = forecastCandidates.rows.map((candidate) => {
      const leadDays = Math.max(0, (candidate.starts_at.getTime() - candidate.created_at.getTime()) / 86_400_000);
      const leadAdjustment = averageLeadDays === null ? 0 : leadDays >= averageLeadDays ? 6 : leadDays < averageLeadDays * 0.55 ? -11 : -3;
      const probability = clamp(sampleScore + (statusAdjustment[candidate.status] ?? 0) + leadAdjustment - conflictRate * 8);
      const risk = probability >= 75 ? 'ON_TRACK' : probability >= 55 ? 'WATCH' : 'AT_RISK';
      const reasons = [
        candidate.status === 'APPROVED' ? 'ya cuenta con aprobación' : candidate.status === 'UNDER_REVIEW' ? 'mantiene un conflicto abierto' : candidate.status === 'DRAFT' ? 'continúa como borrador' : candidate.status === 'CHANGES_REQUESTED' ? 'espera correcciones' : 'espera decisión',
        averageLeadDays !== null && leadDays < averageLeadDays * 0.55 ? 'tiene menos anticipación que el patrón reciente' : 'conserva una anticipación saludable',
        conflictRate >= 0.34 ? 'las últimas actividades muestran fricción de coordinación' : 'el historial reciente muestra coordinación estable'
      ];
      return { ...candidate, score: probability, probability, risk, explanation: reasons.join('; ') };
    });
    const forecastAverage = predictions.length
      ? Math.round(predictions.reduce((sum, item) => sum + item.probability, 0) / predictions.length)
      : Math.round(sampleScore);
    const coordinationScore = clamp(100
      - Number(statRow.overdue ?? 0) * 12
      - Number(statRow.conflicts ?? 0) * 9
      - Number(statRow.pending ?? 0) * 3
      - Math.min(Number(statRow.drafts ?? 0) * 2, 12));
    return {
      stats: { ...statRow, coordinationScore, coordinationEvidence: {
        sampleSize: Number(statRow.coordination_sample ?? 0),
        level: Number(statRow.coordination_sample ?? 0) < 3 ? 'INSUFFICIENT_HISTORY' : 'LIMITED_HISTORY',
        method: 'RULE_BASED_HEURISTIC', calibrated: false
      } },
      departments: departments.rows,
      upcoming: upcoming.rows,
      attention: attention.rows,
      trend: trend.rows,
      forecast: {
        ...heuristicForecastMetadata(forecastAverage, history.length),
        outlook: forecastAverage >= 75 ? 'FAVORABLE' : forecastAverage >= 55 ? 'WATCH' : 'AT_RISK',
        // Legacy aliases remain for existing consumers; new UI uses score and
        // evidenceLevel, never this field name as a statistical guarantee.
        probability: forecastAverage,
        confidence: history.length === 3 ? 'MEDIA' : history.length === 2 ? 'BAJA' : 'INICIAL',
        sampleSize: history.length,
        conflictRate: Math.round(conflictRate * 100),
        averageLeadDays: averageLeadDays === null ? null : Math.round(averageLeadDays),
        completionRate: history.length ? Math.round(history.filter((row) => row.status === 'COMPLETED').length / history.length * 100) : 0,
        headline: forecastAverage >= 75
          ? 'La programación próxima mantiene una trayectoria favorable.'
          : forecastAverage >= 55
            ? 'La programación es viable, pero requiere seguimiento cercano.'
            : 'La programación próxima muestra señales que requieren intervención.',
        methodology: 'Estimación explicable basada en estado, conflictos y anticipación de las tres actividades gestionadas más recientemente.',
        predictions,
        recentActivities: history
      }
    };
  }

  @Get('exports/calendar.ics')
  async exportCalendar(@Req() request: Request & { user?: AuthPrincipal }, @Res() response: Response) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const pool = await poolFor(user);
    const events = await pool.query<{ id: string; title: string; description: string; starts_at: Date; ends_at: Date; venue: string | null }>(
      `SELECT a.id,a.title,a.description,s.starts_at,s.ends_at,v.name venue
       FROM calendar.activities a JOIN calendar.schedule_options o ON o.activity_id=a.id AND o.is_selected
       JOIN calendar.schedule_sessions s ON s.option_id=o.id LEFT JOIN calendar.venues v ON v.id=a.venue_id
       WHERE a.status='APPROVED' AND ${activityReadPredicate(user)} ORDER BY s.starts_at`
    );
    const esc = safeCalendarText;
    const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GestionChurch//Calendario//ES', 'CALSCALE:GREGORIAN'];
    for (const event of events.rows) {
      lines.push('BEGIN:VEVENT', `UID:${event.id}@gestionchurch.com`, `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(event.starts_at)}`, `DTEND:${stamp(event.ends_at)}`, `SUMMARY:${esc(event.title)}`,
        `DESCRIPTION:${esc(event.description)}`, `LOCATION:${esc(event.venue ?? '')}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    response.setHeader('content-type', 'text/calendar; charset=utf-8');
    response.setHeader('content-disposition', 'attachment; filename="gestionchurch.ics"');
    response.send(lines.join('\r\n'));
  }

  @Get('exports/calendar.csv')
  async exportCalendarCsv(@Req() request: Request & { user?: AuthPrincipal }, @Res() response: Response) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const pool = await poolFor(user);
    const events = await pool.query<{ code: string; title: string; department: string; venue: string | null; starts_at: Date; ends_at: Date; status: string }>(
      `SELECT a.code,a.title,d.name department,v.name venue,s.starts_at,s.ends_at,a.status
       FROM calendar.activities a JOIN calendar.departments d ON d.id=a.department_id
       JOIN calendar.schedule_options o ON o.activity_id=a.id AND o.is_selected
       JOIN calendar.schedule_sessions s ON s.option_id=o.id LEFT JOIN calendar.venues v ON v.id=a.venue_id
       WHERE a.status NOT IN ('ARCHIVED') AND ${activityReadPredicate(user)} ORDER BY s.starts_at`
    );
    const csvCell = safeCsvCell;
    const lines = [
      ['Código','Actividad','Departamento','Lugar','Inicio','Fin','Estado'].map(csvCell).join(','),
      ...events.rows.map((event) => [event.code,event.title,event.department,event.venue,event.starts_at.toISOString(),event.ends_at.toISOString(),event.status].map(csvCell).join(','))
    ];
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader('content-disposition', 'attachment; filename="calendario-gestionchurch.csv"');
    response.send(`\uFEFF${lines.join('\r\n')}`);
  }

  @Get('exports/calendar.pdf')
  async exportCalendarPdf(@Req() request: Request & { user?: AuthPrincipal }, @Res() response: Response) {
    const user = currentUser(request);
    requirePermission(user, 'calendar.read');
    const pool = await poolFor(user);
    const events = await pool.query<{ code: string; title: string; department: string; starts_at: Date; venue: string | null }>(
      `SELECT a.code,a.title,d.name department,min(s.starts_at) starts_at,v.name venue
       FROM calendar.activities a JOIN calendar.departments d ON d.id=a.department_id
       JOIN calendar.schedule_options o ON o.activity_id=a.id AND o.is_selected
       JOIN calendar.schedule_sessions s ON s.option_id=o.id LEFT JOIN calendar.venues v ON v.id=a.venue_id
       WHERE a.status='APPROVED' AND ${activityReadPredicate(user)} GROUP BY a.id,d.name,v.name ORDER BY min(s.starts_at)`
    );
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('content-disposition', 'attachment; filename="calendario-gestionchurch.pdf"');
    const document = new PDFDocument({ size: 'A4', margin: 46, info: { Title: 'Calendario GestionChurch' } });
    document.pipe(response);
    document.fillColor('#0B5D52').fontSize(22).text('GestionChurch');
    document.fillColor('#17232C').fontSize(15).text('Calendario oficial de actividades');
    document.moveDown().fontSize(9).fillColor('#667085').text(`Generado: ${new Date().toLocaleString('es-DO')}`);
    document.moveDown();
    for (const event of events.rows) {
      if (document.y > 740) document.addPage();
      document.fillColor('#17232C').fontSize(11).text(`${event.code} · ${event.title}`, { continued: false });
      document.fillColor('#667085').fontSize(9).text(`${event.starts_at.toLocaleString('es-DO')} · ${event.department}${event.venue ? ` · ${event.venue}` : ''}`);
      document.moveDown(0.55);
    }
    document.end();
  }

  @Get('exports/audit.csv')
  async exportAuditCsv(@Req() request: Request & { user?: AuthPrincipal }, @Res() response: Response) {
    const user = currentUser(request);
    requirePermission(user, 'audit.read');
    const pool = await poolFor(user);
    const rows = await pool.query(
      `SELECT created_at,actor_id,action,resource_type,resource_id,reason,correlation_id
       FROM audit.audit_events ORDER BY created_at DESC LIMIT 10000`
    );
    const cell = safeCsvCell;
    const keys = ['created_at','actor_id','action','resource_type','resource_id','reason','correlation_id'];
    const lines = [keys.map(cell).join(','), ...rows.rows.map((row) => keys.map((key) => cell(row[key])).join(','))];
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader('content-disposition', 'attachment; filename="auditoria-gestionchurch.csv"');
    response.send(`\uFEFF${lines.join('\r\n')}`);
  }
}

@Module({ controllers: [CalendarController], providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }] })
class CalendarModule {}

await bootstrapNest(CalendarModule, 4013, 'calendar-service');

let outboxBusy = false;
async function retryPendingOutboxes(): Promise<void> {
  if (outboxBusy) return;
  outboxBusy = true;
  try {
    const tenants = await controlPool.query<{ id: string }>(`SELECT id FROM control.tenants WHERE status='ACTIVE'`);
    for (const tenant of tenants.rows) {
      const { pool } = await tenantPoolFromId(tenant.id);
      await dispatchOutbox(pool, tenant.id);
    }
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', service: 'calendar-service', event: 'outbox_retry_failed', error: error instanceof Error ? error.message : String(error) }));
  } finally {
    outboxBusy = false;
  }
}
const outboxTimer = setInterval(() => void retryPendingOutboxes(), 10_000);
outboxTimer.unref();
void retryPendingOutboxes();
