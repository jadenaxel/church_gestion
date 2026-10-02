import 'reflect-metadata';
import type { Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import type { AuthPrincipal } from '@gc/contracts';
import { tenantPoolFromId, withTransaction } from '@gc/database';
import { bootstrapNest, currentUser, HEALTH_RESPONSE, JwtAuthGuard, Public, requirePermission } from '@gc/platform';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_elders_service';

const rotationSchema = z.object({
  title: z.string().trim().min(3).max(160).default('Ancianos responsables'),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  elderIds: z.array(z.uuid()).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'No repita un mismo anciano.'),
  notes: z.string().trim().max(3000).default('')
}).refine((value) => value.endsOn >= value.startsOn, { path: ['endsOn'], message: 'La fecha final debe ser igual o posterior al inicio.' });

const updateRotationSchema = rotationSchema.partial().extend({
  title: rotationSchema.shape.title.removeDefault().optional(),
  notes: rotationSchema.shape.notes.removeDefault().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional()
});

const annualRotationPlanSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  elderIds: z.array(z.uuid()).min(1).max(20),
  eldersPerWeek: z.number().int().min(1).max(10),
  notes: z.string().trim().max(3000).default('Calendario anual de cobertura pastoral.')
}).superRefine((value, context) => {
  if (new Set(value.elderIds).size !== value.elderIds.length) context.addIssue({ code: 'custom', path: ['elderIds'], message: 'No repita un mismo anciano.' });
  if (value.eldersPerWeek > new Set(value.elderIds).size) context.addIssue({ code: 'custom', path: ['eldersPerWeek'], message: 'La cantidad semanal no puede superar los ancianos seleccionados.' });
});

const departmentAssignmentSchema = z.object({
  elderId: z.uuid(),
  departmentIds: z.array(z.uuid()).min(1).max(50),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  notes: z.string().trim().max(3000).default('')
}).refine((value) => value.endsOn >= value.startsOn, { path: ['endsOn'], message: 'La fecha final debe ser igual o posterior al inicio.' });

const updateDepartmentAssignmentSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  startsOn: z.iso.date().optional(),
  endsOn: z.iso.date().optional(),
  notes: z.string().trim().max(3000).optional()
});

const programSchema = z.object({
  rotationId: z.uuid().nullable().optional(),
  elderId: z.uuid(),
  serviceAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  serviceType: z.enum(['WEDNESDAY', 'SABBATH', 'OTHER']),
  title: z.string().trim().min(3).max(180),
  preacherName: z.string().trim().max(180).default(''),
  singerName: z.string().trim().max(180).default(''),
  hymn: z.string().trim().max(300).default(''),
  bibleReading: z.string().trim().max(300).default(''),
  notes: z.string().trim().max(5000).default(''),
  status: z.enum(['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED']).default('DRAFT')
}).refine((value) => new Date(value.endsAt) > new Date(value.serviceAt), { path: ['endsAt'], message: 'La finalización debe ser posterior al inicio.' });

const updateProgramSchema = programSchema.partial().extend({
  preacherName: programSchema.shape.preacherName.removeDefault().optional(),
  singerName: programSchema.shape.singerName.removeDefault().optional(),
  hymn: programSchema.shape.hymn.removeDefault().optional(),
  bibleReading: programSchema.shape.bibleReading.removeDefault().optional(),
  notes: programSchema.shape.notes.removeDefault().optional(),
  status: programSchema.shape.status.removeDefault().optional()
});
const rangeSchema = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), elderId: z.uuid().optional() });

const participationType = z.enum(['PLATFORM', 'WELCOME', 'INVOCATION', 'PRAISE', 'HYMN', 'PRAYER', 'SCRIPTURE', 'MISSION_STORY', 'OFFERING', 'SPECIAL_MUSIC', 'SERMON', 'ANNOUNCEMENTS', 'BENEDICTION', 'CUSTOM']);
const templateItemSchema = z.object({
  title: z.string().trim().min(2).max(180),
  participationType,
  durationMinutes: z.number().int().min(1).max(180),
  instructions: z.string().trim().max(1000).default(''),
  required: z.boolean().default(true)
});
const serviceTemplateSchema = z.object({
  name: z.string().trim().min(3).max(180),
  serviceType: z.enum(['WEDNESDAY', 'SABBATH', 'OTHER']),
  description: z.string().trim().max(1000).default(''),
  items: z.array(templateItemSchema).min(1).max(50)
});
const platformPlanSchema = z.object({
  platformMembers: z.array(z.object({
    userId: z.uuid().nullable().optional(),
    displayName: z.string().trim().min(2).max(180),
    roleLabel: z.string().trim().min(2).max(120).default('Plataforma'),
    isLead: z.boolean().default(false)
  })).min(1).max(20),
  items: z.array(z.object({
    templateItemId: z.uuid().nullable().optional(),
    title: z.string().trim().min(2).max(180),
    participationType,
    startsAt: z.iso.datetime(),
    durationMinutes: z.number().int().min(1).max(180),
    assigneeUserId: z.uuid().nullable().optional(),
    assigneeName: z.string().trim().max(180).default(''),
    notes: z.string().trim().max(1000).default(''),
    status: z.enum(['PENDING', 'READY', 'COMPLETED', 'SKIPPED']).default('PENDING')
  })).min(1).max(100)
});
const applyTemplateSchema = z.object({ templateId: z.uuid() });

type MediaUpload = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type Access = { full: boolean; publication: boolean; manager: boolean; ownPrograms: boolean };

async function poolFor(user: AuthPrincipal): Promise<Pool> {
  if (user.scope !== 'tenant' || !user.tenantId) throw Object.assign(new Error('Se requiere una iglesia.'), { status: 403 });
  return (await tenantPoolFromId(user.tenantId)).pool;
}

async function accessFor(pool: Pool, user: AuthPrincipal): Promise<Access> {
  const membership = await pool.query<{ publication: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM identity.department_memberships m
       JOIN calendar.departments d ON d.id=m.department_id
       WHERE m.user_id=$1 AND d.active
         AND lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(publicidad|comunicaci|adoraci|musica)'
     ) publication`, [user.sub]
  );
  return {
    full: user.permissions.includes('elders.read'),
    publication: membership.rows[0]?.publication ?? false,
    manager: user.permissions.includes('elders.manage'),
    ownPrograms: user.permissions.includes('elders.program.manage')
  };
}

function requireModuleAccess(access: Access): void {
  if (!access.full && !access.publication) throw Object.assign(new Error('El módulo está reservado para Ancianos, Secretaría, Administración, Publicidad y Adoración.'), { status: 403, code: 'ELDERS_ACCESS_DENIED' });
}

async function elders(pool: Pool) {
  const result = await pool.query(
    `SELECT id,name,email,phone,roles,active
       FROM identity.users
      WHERE active AND roles && ARRAY['ELDER','FIRST_ELDER']::text[]
      ORDER BY CASE WHEN 'FIRST_ELDER'=ANY(roles) THEN 0 ELSE 1 END,name`
  );
  return result.rows;
}

async function activeUsers(pool: Pool) {
  const result = await pool.query(
    `SELECT id,name,email,phone,roles FROM identity.users WHERE active ORDER BY name`
  );
  return result.rows;
}

async function listServiceTemplates(pool: Pool) {
  const result = await pool.query(
    `SELECT t.id,t.name,t.service_type "serviceType",t.description,t.is_system "isSystem",t.created_by "createdBy",
            COALESCE(jsonb_agg(jsonb_build_object(
              'id',i.id,'title',i.title,'participationType',i.participation_type,
              'durationMinutes',i.default_duration_minutes,'instructions',i.instructions,'required',i.required,'sequence',i.sequence
            ) ORDER BY i.sequence) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) items
       FROM elders.service_templates t
       LEFT JOIN elders.service_template_items i ON i.template_id=t.id
      WHERE t.active
      GROUP BY t.id
      ORDER BY t.is_system DESC,t.service_type,t.name`
  );
  return result.rows;
}

async function platformPlan(pool: Pool, programId: string) {
  const [program, members, items] = await Promise.all([
    pool.query(
      `SELECT p.id,p.title,p.elder_id "elderId",p.service_at "serviceAt",p.ends_at "endsAt",p.service_type "serviceType",u.name "elderName"
         FROM elders.programs p JOIN identity.users u ON u.id=p.elder_id WHERE p.id=$1`, [programId]
    ),
    pool.query(
      `SELECT m.id,m.user_id "userId",m.display_name "displayName",m.role_label "roleLabel",m.is_lead "isLead",m.sequence
         FROM elders.program_platform_members m WHERE m.program_id=$1 ORDER BY m.sequence`, [programId]
    ),
    pool.query(
      `SELECT i.id,i.template_item_id "templateItemId",i.title,i.participation_type "participationType",
              i.starts_at "startsAt",i.duration_minutes "durationMinutes",i.assignee_user_id "assigneeUserId",
              i.assignee_name "assigneeName",i.notes,i.status,i.sequence
         FROM elders.program_service_items i WHERE i.program_id=$1 ORDER BY i.sequence`, [programId]
    )
  ]);
  if (!program.rows[0]) throw Object.assign(new Error('Programa no encontrado.'), { status: 404 });
  return { program: program.rows[0], platformMembers: members.rows, items: items.rows };
}

async function assertProgramEditor(pool: Pool, user: AuthPrincipal, programId: string) {
  const result = await pool.query<{ elder_id: string; service_at: string | Date; ends_at: string | Date }>(
    `SELECT elder_id,service_at,ends_at FROM elders.programs WHERE id=$1`, [programId]
  );
  const program = result.rows[0];
  if (!program) throw Object.assign(new Error('Programa no encontrado.'), { status: 404 });
  if (!user.permissions.includes('elders.manage') && program.elder_id !== user.sub) {
    throw Object.assign(new Error('Solo puede administrar la plataforma de su propia agenda.'), { status: 403 });
  }
  return program;
}

const rotationSql = `
  SELECT r.id,r.title,r.starts_on "startsOn",r.ends_on "endsOn",r.notes,r.status,
         r.created_at "createdAt",r.updated_at "updatedAt",
         COALESCE(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'email',u.email,'phone',u.phone,'roles',u.roles)
           ORDER BY u.name) FILTER (WHERE u.id IS NOT NULL),'[]'::jsonb) elders
    FROM elders.rotations r
    LEFT JOIN elders.rotation_members rm ON rm.rotation_id=r.id
    LEFT JOIN identity.users u ON u.id=rm.elder_id
   WHERE ($1::date IS NULL OR r.ends_on >= $1::date)
     AND ($2::date IS NULL OR r.starts_on <= $2::date)
   GROUP BY r.id ORDER BY r.starts_on,r.created_at`;

const programSql = `
  SELECT p.id,p.rotation_id "rotationId",p.elder_id "elderId",u.name "elderName",
         p.service_at "serviceAt",p.ends_at "endsAt",p.service_type "serviceType",p.title,
         p.preacher_name "preacherName",p.singer_name "singerName",p.hymn,p.bible_reading "bibleReading",
         p.notes,p.status,p.created_at "createdAt",p.updated_at "updatedAt",
         preacher.id "preacherPhotoId",artist.id "artistPhotoId",
         COALESCE(collision_info.items,'[]'::jsonb) "overlaps"
    FROM elders.programs p
    JOIN identity.users u ON u.id=p.elder_id
    LEFT JOIN elders.media preacher ON preacher.program_id=p.id AND preacher.kind='PREACHER'
    LEFT JOIN elders.media artist ON artist.program_id=p.id AND artist.kind='ARTIST'
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id',a.id,'code',a.code,'title',a.title,'department',d.name,
        'startsAt',s.starts_at,'endsAt',s.ends_at
      )) items
      FROM calendar.activities a
      JOIN calendar.departments d ON d.id=a.department_id
      JOIN calendar.schedule_options o ON o.activity_id=a.id AND (o.is_selected OR o.status IN ('PROVISIONAL_HOLD','CONFIRMED'))
      JOIN calendar.schedule_sessions s ON s.option_id=o.id
      WHERE a.status NOT IN ('CANCELLED','REJECTED')
        AND tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(p.service_at,p.ends_at,'[)')
    ) collision_info ON true
   WHERE ($1::timestamptz IS NULL OR p.ends_at >= $1::timestamptz)
     AND ($2::timestamptz IS NULL OR p.service_at <= $2::timestamptz)
     AND ($3::uuid IS NULL OR p.elder_id=$3::uuid)
   ORDER BY p.service_at,p.created_at`;

async function listRotations(pool: Pool, from?: string, to?: string) {
  const result = await pool.query(rotationSql, [from?.slice(0, 10) ?? null, to?.slice(0, 10) ?? null]);
  return result.rows;
}

async function listPrograms(pool: Pool, from?: string, to?: string, elderId?: string) {
  const result = await pool.query(programSql, [from ?? null, to ?? null, elderId ?? null]);
  return result.rows;
}

async function listDepartmentAssignments(pool: Pool, from?: string, to?: string) {
  const result = await pool.query(
    `SELECT a.id,a.elder_id "elderId",u.name "elderName",u.email "elderEmail",
            a.department_id "departmentId",d.name "departmentName",d.color "departmentColor",
            a.starts_on "startsOn",a.ends_on "endsOn",a.notes,a.status,
            a.created_at "createdAt",a.updated_at "updatedAt"
       FROM elders.department_assignments a
       JOIN identity.users u ON u.id=a.elder_id
       JOIN calendar.departments d ON d.id=a.department_id
      WHERE ($1::date IS NULL OR a.ends_on >= $1::date)
        AND ($2::date IS NULL OR a.starts_on <= $2::date)
      ORDER BY d.name,u.name,a.starts_on`,
    [from?.slice(0, 10) ?? null, to?.slice(0, 10) ?? null]
  );
  return result.rows;
}

async function activeDepartments(pool: Pool) {
  const result = await pool.query(
    `SELECT id,name,color,description
       FROM calendar.departments
      WHERE active AND lower(translate(name,'áéíóúüñ','aeiouun')) <> 'ancianos'
      ORDER BY name`
  );
  return result.rows;
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

async function notify(client: PoolClient, userIds: string[], eventType: string, title: string, body: string, link = '/elders') {
  if (!userIds.length) return;
  await client.query(
    `INSERT INTO notifications.notifications(event_id,event_type,user_id,title,body,link)
     SELECT gen_random_uuid(),$2,id,$3,$4,$5 FROM unnest($1::uuid[]) id`,
    [userIds, eventType, title, body, link]
  );
}

async function audit(client: PoolClient, userId: string, action: string, resourceType: string, resourceId: string, after: unknown) {
  await client.query(
    `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
     VALUES($1,$2,$3,$4,$5::jsonb)`, [userId, action, resourceType, resourceId, JSON.stringify(after)]
  );
}

@Controller()
class HealthController {
  @Public()
  @Get('health/live')
  health() { return HEALTH_RESPONSE; }
}

@Controller('elders')
export class EldersController {
  @Get('context')
  async context(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    const pool = await poolFor(user);
    const access = await accessFor(pool, user);
    requireModuleAccess(access);
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
    const yearEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString();
    const [people, participants, departments, departmentAssignments, rotations, programs, templates] = await Promise.all([
      access.full ? elders(pool) : Promise.resolve([]),
      access.full ? activeUsers(pool) : Promise.resolve([]),
      access.full ? activeDepartments(pool) : Promise.resolve([]),
      access.full ? listDepartmentAssignments(pool, yearStart, yearEnd) : Promise.resolve([]),
      access.full ? listRotations(pool, yearStart, yearEnd) : Promise.resolve([]),
      listPrograms(pool, yearStart, yearEnd),
      access.full ? listServiceTemplates(pool) : Promise.resolve([])
    ]);
    return {
      access,
      currentUserId: user.sub,
      people,
      participants,
      departments,
      departmentAssignments,
      rotations,
      programs: access.publication && !access.full ? programs.filter((item) => item.status === 'PUBLISHED') : programs,
      templates
    };
  }

  @Get('department-assignments')
  async departmentAssignments(@Req() request: Request & { user?: AuthPrincipal }, @Query() query: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.read');
    const range = rangeSchema.parse(query);
    return { items: await listDepartmentAssignments(await poolFor(user), range.from, range.to) };
  }

  @Post('department-assignments')
  async createDepartmentAssignments(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.manage');
    const input = departmentAssignmentSchema.parse(body);
    const pool = await poolFor(user);
    const [elder, departments] = await Promise.all([
      pool.query(`SELECT 1 FROM identity.users WHERE id=$1 AND active AND roles && ARRAY['ELDER','FIRST_ELDER']::text[]`, [input.elderId]),
      pool.query<{ id: string }>(
        `SELECT id FROM calendar.departments
          WHERE active AND id=ANY($1::uuid[])
            AND lower(translate(name,'áéíóúüñ','aeiouun')) <> 'ancianos'`,
        [input.departmentIds]
      )
    ]);
    if (!elder.rowCount) throw new BadRequestException('El responsable seleccionado no es un anciano activo.');
    if (departments.rowCount !== new Set(input.departmentIds).size) throw new BadRequestException('Seleccione departamentos activos válidos.');
    const created = await withTransaction(pool, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO elders.department_assignments(elder_id,department_id,starts_on,ends_on,notes,created_by)
         SELECT $1,id,$3,$4,$5,$6 FROM unnest($2::uuid[]) id
         ON CONFLICT(elder_id,department_id,starts_on,ends_on)
         DO UPDATE SET notes=EXCLUDED.notes,status='ACTIVE',updated_at=now()
         RETURNING id`,
        [input.elderId, [...new Set(input.departmentIds)], input.startsOn, input.endsOn, input.notes, user.sub]
      );
      await notify(client, [input.elderId], 'elders.department_assigned', 'Nueva cobertura departamental', `Se te asignaron ${result.rowCount} departamento(s) del ${input.startsOn} al ${input.endsOn}.`, '/elders?view=coverage');
      await audit(client, user.sub, 'elders.department_assignment.created', 'elder_department_assignment', result.rows[0]!.id, input);
      return result;
    });
    return { ids: created.rows.map((item) => item.id), message: 'Cobertura departamental publicada y notificada.' };
  }

  @Patch('department-assignments/:id')
  async updateDepartmentAssignment(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.manage');
    const input = updateDepartmentAssignmentSchema.parse(body);
    const pool = await poolFor(user);
    const current = await pool.query<{ starts_on: string; ends_on: string }>(`SELECT starts_on,ends_on FROM elders.department_assignments WHERE id=$1`, [id]);
    if (!current.rows[0]) throw Object.assign(new Error('Cobertura departamental no encontrada.'), { status: 404 });
    const startsOn = input.startsOn ?? dateOnly(current.rows[0].starts_on);
    const endsOn = input.endsOn ?? dateOnly(current.rows[0].ends_on);
    if (endsOn < startsOn) throw new BadRequestException('La fecha final debe ser igual o posterior al inicio.');
    await withTransaction(pool, async (client) => {
      await client.query(
        `UPDATE elders.department_assignments
            SET starts_on=$2,ends_on=$3,notes=COALESCE($4,notes),status=COALESCE($5,status),updated_at=now()
          WHERE id=$1`,
        [id, startsOn, endsOn, input.notes ?? null, input.status ?? null]
      );
      await audit(client, user.sub, 'elders.department_assignment.updated', 'elder_department_assignment', id, input);
    });
    return { updated: true };
  }

  @Get('rotations')
  async rotations(@Req() request: Request & { user?: AuthPrincipal }, @Query() query: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.read');
    const range = rangeSchema.parse(query);
    return { items: await listRotations(await poolFor(user), range.from, range.to) };
  }

  @Post('rotations/annual-plan')
  async createAnnualRotationPlan(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.manage');
    const input = annualRotationPlanSchema.parse(body);
    const pool = await poolFor(user);
    const valid = await pool.query<{ id: string }>(
      `SELECT id FROM identity.users WHERE active AND id=ANY($1::uuid[]) AND roles && ARRAY['ELDER','FIRST_ELDER']::text[]`, [input.elderIds]
    );
    if (valid.rowCount !== input.elderIds.length) throw new BadRequestException('Todos los responsables deben tener un perfil de Anciano activo.');

    const firstDay = new Date(Date.UTC(input.year, 0, 1));
    firstDay.setUTCDate(firstDay.getUTCDate() - firstDay.getUTCDay());
    const lastDay = new Date(Date.UTC(input.year, 11, 31));
    const weeks: Array<{ startsOn: string; endsOn: string; elderIds: string[] }> = [];
    for (let cursor = new Date(firstDay), index = 0; cursor <= lastDay; cursor.setUTCDate(cursor.getUTCDate() + 7), index++) {
      const end = new Date(cursor); end.setUTCDate(end.getUTCDate() + 6);
      const assigned = Array.from({ length: input.eldersPerWeek }, (_, offset) => input.elderIds[(index * input.eldersPerWeek + offset) % input.elderIds.length]!);
      weeks.push({ startsOn: cursor.toISOString().slice(0, 10), endsOn: end.toISOString().slice(0, 10), elderIds: assigned });
    }
    const existing = await pool.query<{ starts_on: string | Date; ends_on: string | Date }>(
      `SELECT starts_on,ends_on FROM elders.rotations
        WHERE status='ACTIVE' AND daterange(starts_on,ends_on,'[]') && daterange($1::date,$2::date,'[]')`,
      [weeks[0]!.startsOn, weeks.at(-1)!.endsOn]
    );
    const availableWeeks = weeks.filter((week) => !existing.rows.some((item) => dateOnly(item.starts_on) <= week.endsOn && dateOnly(item.ends_on) >= week.startsOn));
    const createdIds = await withTransaction(pool, async (client) => {
      const ids: string[] = [];
      for (const week of availableWeeks) {
        const startLabel = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${week.startsOn}T12:00:00Z`));
        const endLabel = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${week.endsOn}T12:00:00Z`));
        const created = await client.query<{ id: string }>(
          `INSERT INTO elders.rotations(title,starts_on,ends_on,notes,created_by)
           VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [`Turno pastoral · ${startLabel}–${endLabel}`, week.startsOn, week.endsOn, input.notes, user.sub]
        );
        await client.query(
          `INSERT INTO elders.rotation_members(rotation_id,elder_id) SELECT $1,id FROM unnest($2::uuid[]) id`,
          [created.rows[0]!.id, week.elderIds]
        );
        ids.push(created.rows[0]!.id);
      }
      for (const elderId of input.elderIds) {
        const assignmentCount = availableWeeks.filter((week) => week.elderIds.includes(elderId)).length;
        if (assignmentCount) await notify(client, [elderId], 'elders.annual_plan_assigned', `Calendario de ancianos ${input.year}`, `Tienes ${assignmentCount} semana(s) asignada(s). Consulta las fechas en tu agenda.`, '/elders?view=rotations');
      }
      await audit(client, user.sub, 'elders.annual_plan.created', 'elder_annual_plan', String(input.year), { ...input, createdCount: ids.length, skippedCount: weeks.length - ids.length });
      return ids;
    });
    return {
      year: input.year,
      createdIds,
      createdCount: createdIds.length,
      skippedCount: weeks.length - createdIds.length,
      totalWeeks: weeks.length,
      informationalOnly: true,
      message: `Calendario ${input.year} publicado sin generar conflictos con actividades departamentales.`
    };
  }

  @Post('rotations')
  async createRotation(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.manage');
    const input = rotationSchema.parse(body);
    const pool = await poolFor(user);
    const valid = await pool.query<{ id: string }>(
      `SELECT id FROM identity.users WHERE active AND id=ANY($1::uuid[]) AND roles && ARRAY['ELDER','FIRST_ELDER']::text[]`, [input.elderIds]
    );
    if (valid.rowCount !== new Set(input.elderIds).size) throw new BadRequestException('Todos los responsables deben tener un perfil de Anciano activo.');
    const rotation = await withTransaction(pool, async (client) => {
      const created = await client.query<{ id: string }>(
        `INSERT INTO elders.rotations(title,starts_on,ends_on,notes,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [input.title, input.startsOn, input.endsOn, input.notes, user.sub]
      );
      await client.query(
        `INSERT INTO elders.rotation_members(rotation_id,elder_id) SELECT $1,id FROM unnest($2::uuid[]) id ON CONFLICT DO NOTHING`,
        [created.rows[0]!.id, input.elderIds]
      );
      await notify(client, input.elderIds, 'elders.rotation_assigned', 'Nuevo turno de ancianos', `${input.title}: ${input.startsOn} al ${input.endsOn}.`);
      await audit(client, user.sub, 'elders.rotation.created', 'elder_rotation', created.rows[0]!.id, input);
      return created.rows[0]!;
    });
    return { id: rotation.id, warnings: [], message: 'Turno publicado sin generar conflictos con actividades departamentales.' };
  }

  @Patch('rotations/:id')
  async updateRotation(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.manage');
    const input = updateRotationSchema.parse(body);
    const pool = await poolFor(user);
    const current = await pool.query<{ title: string; starts_on: string; ends_on: string; notes: string; status: string }>(`SELECT * FROM elders.rotations WHERE id=$1`, [id]);
    if (!current.rows[0]) throw Object.assign(new Error('Turno no encontrado.'), { status: 404 });
    const startsOn = input.startsOn ?? dateOnly(current.rows[0].starts_on);
    const endsOn = input.endsOn ?? dateOnly(current.rows[0].ends_on);
    if (endsOn < startsOn) throw new BadRequestException('La fecha final debe ser igual o posterior al inicio.');
    if (input.elderIds) {
      const valid = await pool.query(`SELECT id FROM identity.users WHERE active AND id=ANY($1::uuid[]) AND roles && ARRAY['ELDER','FIRST_ELDER']::text[]`, [input.elderIds]);
      if (valid.rowCount !== input.elderIds.length) throw new BadRequestException('Todos los responsables deben tener un perfil de Anciano activo.');
    }
    const next = { ...current.rows[0], ...input };
    await withTransaction(pool, async (client) => {
      await client.query(
        `UPDATE elders.rotations SET title=$2,starts_on=$3,ends_on=$4,notes=$5,status=$6,updated_at=now() WHERE id=$1`,
        [id, input.title ?? current.rows[0]!.title, startsOn, endsOn, input.notes ?? current.rows[0]!.notes, input.status ?? current.rows[0]!.status]
      );
      if (input.elderIds) {
        await client.query(`DELETE FROM elders.rotation_members WHERE rotation_id=$1`, [id]);
        await client.query(`INSERT INTO elders.rotation_members(rotation_id,elder_id) SELECT $1,id FROM unnest($2::uuid[]) id`, [id, input.elderIds]);
      }
      await audit(client, user.sub, 'elders.rotation.updated', 'elder_rotation', id, next);
    });
    return { updated: true };
  }

  @Get('platform/templates')
  async serviceTemplates(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request); requirePermission(user, 'elders.read');
    return { items: await listServiceTemplates(await poolFor(user)) };
  }

  @Post('platform/templates')
  async createServiceTemplate(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.program.manage');
    const input = serviceTemplateSchema.parse(body);
    const pool = await poolFor(user);
    const templateId = await withTransaction(pool, async (client) => {
      const created = await client.query<{ id: string }>(
        `INSERT INTO elders.service_templates(name,service_type,description,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
        [input.name, input.serviceType, input.description, user.sub]
      );
      for (const [index, item] of input.items.entries()) {
        await client.query(
          `INSERT INTO elders.service_template_items(template_id,sequence,title,participation_type,default_duration_minutes,instructions,required)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [created.rows[0]!.id, index + 1, item.title, item.participationType, item.durationMinutes, item.instructions, item.required]
        );
      }
      await audit(client, user.sub, 'elders.platform_template.created', 'elder_service_template', created.rows[0]!.id, input);
      return created.rows[0]!.id;
    });
    return { id: templateId, message: 'Plantilla creada y disponible para los próximos cultos.' };
  }

  @Get('programs/:id/platform')
  async getPlatform(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string) {
    const user = currentUser(request); requirePermission(user, 'elders.read');
    const pool = await poolFor(user);
    const plan = await platformPlan(pool, id);
    if (!user.permissions.includes('elders.manage') && plan.program.elderId !== user.sub) {
      throw Object.assign(new Error('Solo puede consultar la plataforma de su propia agenda.'), { status: 403 });
    }
    return plan;
  }

  @Post('programs/:id/platform/apply-template')
  async applyPlatformTemplate(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.program.manage');
    const input = applyTemplateSchema.parse(body);
    const pool = await poolFor(user);
    const program = await assertProgramEditor(pool, user, id);
    const template = await pool.query<{
      id: string; title: string; participation_type: string; default_duration_minutes: number; instructions: string;
    }>(
      `SELECT i.id,i.title,i.participation_type,i.default_duration_minutes,i.instructions
         FROM elders.service_templates t JOIN elders.service_template_items i ON i.template_id=t.id
        WHERE t.id=$1 AND t.active ORDER BY i.sequence`, [input.templateId]
    );
    if (!template.rowCount) throw new BadRequestException('La plantilla seleccionada no está disponible.');
    const availableMinutes = Math.floor((new Date(program.ends_at).getTime() - new Date(program.service_at).getTime()) / 60_000);
    const requiredMinutes = template.rows.reduce((total, item) => total + item.default_duration_minutes, 0);
    if (requiredMinutes > availableMinutes) {
      throw new BadRequestException(`La plantilla requiere ${requiredMinutes} minutos y el culto dispone de ${availableMinutes}. Ajuste la duración del programa o cree una plantilla más breve.`);
    }
    await withTransaction(pool, async (client) => {
      await client.query(`DELETE FROM elders.program_service_items WHERE program_id=$1`, [id]);
      let cursor = new Date(program.service_at);
      for (const [index, item] of template.rows.entries()) {
        await client.query(
          `INSERT INTO elders.program_service_items(program_id,template_item_id,sequence,title,participation_type,starts_at,duration_minutes,notes)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, item.id, index + 1, item.title, item.participation_type, cursor.toISOString(), item.default_duration_minutes, item.instructions]
        );
        cursor = new Date(cursor.getTime() + item.default_duration_minutes * 60_000);
      }
      await audit(client, user.sub, 'elders.platform_template.applied', 'elder_program', id, { templateId: input.templateId, requiredMinutes });
    });
    return platformPlan(pool, id);
  }

  @Patch('programs/:id/platform')
  async savePlatform(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.program.manage');
    const input = platformPlanSchema.parse(body);
    const pool = await poolFor(user);
    const program = await assertProgramEditor(pool, user, id);
    if (input.platformMembers.filter((member) => member.isLead).length > 1) throw new BadRequestException('Seleccione una sola persona como director principal de plataforma.');
    const platformMembers = input.platformMembers.map((member, index) => ({ ...member, isLead: input.platformMembers.some((item) => item.isLead) ? member.isLead : index === 0 }));
    const knownUserIds = [...new Set([
      ...platformMembers.flatMap((member) => member.userId ? [member.userId] : []),
      ...input.items.flatMap((item) => item.assigneeUserId ? [item.assigneeUserId] : [])
    ])];
    if (knownUserIds.length) {
      const active = await pool.query<{ id: string }>(`SELECT id FROM identity.users WHERE active AND id=ANY($1::uuid[])`, [knownUserIds]);
      if (active.rowCount !== knownUserIds.length) throw new BadRequestException('Uno de los participantes seleccionados ya no está activo.');
    }
    const programStart = new Date(program.service_at).getTime();
    const programEnd = new Date(program.ends_at).getTime();
    let priorEnd = programStart;
    for (const item of input.items) {
      const startsAt = new Date(item.startsAt).getTime();
      const endsAt = startsAt + item.durationMinutes * 60_000;
      if (startsAt < programStart || endsAt > programEnd) throw new BadRequestException(`La participación “${item.title}” queda fuera del horario del culto.`);
      if (startsAt < priorEnd) throw new BadRequestException(`La participación “${item.title}” se superpone con el bloque anterior.`);
      priorEnd = endsAt;
    }
    await withTransaction(pool, async (client) => {
      await client.query(`DELETE FROM elders.program_platform_members WHERE program_id=$1`, [id]);
      await client.query(`DELETE FROM elders.program_service_items WHERE program_id=$1`, [id]);
      for (const [index, member] of platformMembers.entries()) {
        await client.query(
          `INSERT INTO elders.program_platform_members(program_id,user_id,display_name,role_label,is_lead,sequence,added_by)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [id, member.userId ?? null, member.displayName, member.roleLabel, member.isLead, index + 1, user.sub]
        );
      }
      for (const [index, item] of input.items.entries()) {
        await client.query(
          `INSERT INTO elders.program_service_items(program_id,template_item_id,sequence,title,participation_type,starts_at,duration_minutes,assignee_user_id,assignee_name,notes,status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [id, item.templateItemId ?? null, index + 1, item.title, item.participationType, item.startsAt, item.durationMinutes, item.assigneeUserId ?? null, item.assigneeName, item.notes, item.status]
        );
      }
      await notify(client, knownUserIds, 'elders.platform_assigned', 'Participación en plataforma asignada', 'Consulta tu participación y el orden minuto a minuto del próximo culto.', `/elders?view=platform&programId=${id}`);
      await audit(client, user.sub, 'elders.platform.updated', 'elder_program', id, { platformMembers, items: input.items });
    });
    return { ...(await platformPlan(pool, id)), message: 'Plataforma y orden del culto guardados con trazabilidad completa.' };
  }

  @Get('programs')
  async programs(@Req() request: Request & { user?: AuthPrincipal }, @Query() query: unknown) {
    const user = currentUser(request);
    const pool = await poolFor(user);
    const access = await accessFor(pool, user); requireModuleAccess(access);
    const range = rangeSchema.parse(query);
    const items = await listPrograms(pool, range.from, range.to, range.elderId);
    return { items: access.publication && !access.full ? items.filter((item) => item.status === 'PUBLISHED') : items };
  }

  @Post('programs')
  async createProgram(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.program.manage');
    const input = programSchema.parse(body);
    const pool = await poolFor(user);
    if (!user.permissions.includes('elders.manage') && input.elderId !== user.sub) throw Object.assign(new Error('Solo puede administrar su propia agenda.'), { status: 403 });
    const target = await pool.query(`SELECT 1 FROM identity.users WHERE id=$1 AND active AND roles && ARRAY['ELDER','FIRST_ELDER']::text[]`, [input.elderId]);
    if (!target.rowCount) throw new BadRequestException('El responsable seleccionado no es un anciano activo.');
    const created = await withTransaction(pool, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO elders.programs(rotation_id,elder_id,service_at,ends_at,service_type,title,preacher_name,singer_name,hymn,bible_reading,notes,status,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [input.rotationId ?? null, input.elderId, input.serviceAt, input.endsAt, input.serviceType, input.title, input.preacherName, input.singerName, input.hymn, input.bibleReading, input.notes, input.status, user.sub]
      );
      if (input.status === 'PUBLISHED') await this.notifyPublication(client, input.title);
      await audit(client, user.sub, 'elders.program.created', 'elder_program', result.rows[0]!.id, input);
      return result;
    });
    return { id: created.rows[0]!.id, informationalOnly: true, message: 'Programa guardado y visible sin abrir un conflicto de calendario.' };
  }

  @Patch('programs/:id')
  async updateProgram(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Body() body: unknown) {
    const user = currentUser(request); requirePermission(user, 'elders.program.manage');
    const input = updateProgramSchema.parse(body);
    const pool = await poolFor(user);
    const result = await pool.query<{ elder_id: string; status: string; service_at: Date; ends_at: Date }>(`SELECT elder_id,status,service_at,ends_at FROM elders.programs WHERE id=$1`, [id]);
    const current = result.rows[0];
    if (!current) throw Object.assign(new Error('Programa no encontrado.'), { status: 404 });
    if (!user.permissions.includes('elders.manage') && current.elder_id !== user.sub) throw Object.assign(new Error('Solo puede administrar su propia agenda.'), { status: 403 });
    if (!user.permissions.includes('elders.manage') && input.elderId && input.elderId !== user.sub) throw Object.assign(new Error('No puede transferir su agenda a otro usuario.'), { status: 403 });
    if (input.elderId) {
      const target = await pool.query(`SELECT 1 FROM identity.users WHERE id=$1 AND active AND roles && ARRAY['ELDER','FIRST_ELDER']::text[]`, [input.elderId]);
      if (!target.rowCount) throw new BadRequestException('El responsable seleccionado no es un anciano activo.');
    }
    if (new Date(input.endsAt ?? current.ends_at) <= new Date(input.serviceAt ?? current.service_at)) {
      throw new BadRequestException('La finalización debe ser posterior al inicio.');
    }
    await withTransaction(pool, async (client) => {
      await client.query(
        `UPDATE elders.programs SET
          rotation_id=COALESCE($2,rotation_id),elder_id=COALESCE($3,elder_id),service_at=COALESCE($4,service_at),ends_at=COALESCE($5,ends_at),
          service_type=COALESCE($6,service_type),title=COALESCE($7,title),preacher_name=COALESCE($8,preacher_name),
          singer_name=COALESCE($9,singer_name),hymn=COALESCE($10,hymn),bible_reading=COALESCE($11,bible_reading),
          notes=COALESCE($12,notes),status=COALESCE($13,status),updated_at=now() WHERE id=$1`,
        [id, input.rotationId ?? null, input.elderId ?? null, input.serviceAt ?? null, input.endsAt ?? null, input.serviceType ?? null, input.title ?? null, input.preacherName ?? null, input.singerName ?? null, input.hymn ?? null, input.bibleReading ?? null, input.notes ?? null, input.status ?? null]
      );
      if (input.status === 'PUBLISHED' && current.status !== 'PUBLISHED') await this.notifyPublication(client, input.title ?? 'Programa de ancianos');
      await audit(client, user.sub, 'elders.program.updated', 'elder_program', id, input);
    });
    return { updated: true, informationalOnly: true };
  }

  @Post('programs/:id/media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async uploadMedia(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Query('kind') rawKind: string, @UploadedFile() file?: MediaUpload) {
    const user = currentUser(request); requirePermission(user, 'elders.program.manage');
    const kind = z.enum(['PREACHER', 'ARTIST']).parse(rawKind);
    if (!file) throw new BadRequestException('Seleccione una fotografía.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw new BadRequestException('Use una imagen JPG, PNG o WebP.');
    const pool = await poolFor(user);
    const program = await pool.query<{ elder_id: string }>(`SELECT elder_id FROM elders.programs WHERE id=$1`, [id]);
    if (!program.rows[0]) throw Object.assign(new Error('Programa no encontrado.'), { status: 404 });
    if (!user.permissions.includes('elders.manage') && program.rows[0].elder_id !== user.sub) throw Object.assign(new Error('Solo puede administrar su propia agenda.'), { status: 403 });
    const saved = await withTransaction(pool, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO elders.media(program_id,kind,original_name,media_type,size_bytes,content,uploaded_by)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(program_id,kind) DO UPDATE SET original_name=EXCLUDED.original_name,media_type=EXCLUDED.media_type,
           size_bytes=EXCLUDED.size_bytes,content=EXCLUDED.content,uploaded_by=EXCLUDED.uploaded_by,created_at=now()
         RETURNING id`, [id, kind, file.originalname.slice(0, 240), file.mimetype, file.size, file.buffer, user.sub]
      );
      await audit(client, user.sub, 'elders.program_media.uploaded', 'elder_program', id, {
        mediaId: result.rows[0]!.id, kind, mediaType: file.mimetype, sizeBytes: file.size,
      });
      return result;
    });
    return { id: saved.rows[0]!.id };
  }

  @Get('media/:id')
  async media(@Req() request: Request & { user?: AuthPrincipal }, @Param('id') id: string, @Res() response: Response) {
    const user = currentUser(request);
    const pool = await poolFor(user);
    const access = await accessFor(pool, user); requireModuleAccess(access);
    const result = await pool.query<{ original_name: string; media_type: string; content: Buffer }>(
      `SELECT original_name,media_type,content FROM elders.media WHERE id=$1`, [id]
    );
    const media = result.rows[0];
    if (!media) return response.status(404).json({ status: 404, detail: 'Fotografía no encontrada.' });
    response.setHeader('content-type', media.media_type);
    response.setHeader('content-disposition', `inline; filename="${media.original_name.replaceAll('"', '')}"`);
    return response.send(media.content);
  }

  @Get('calendar')
  async calendar(@Req() request: Request & { user?: AuthPrincipal }, @Query() query: unknown) {
    const user = currentUser(request); requirePermission(user, 'calendar.read');
    const range = rangeSchema.parse(query);
    const pool = await poolFor(user);
    const [rotations, programs] = await Promise.all([listRotations(pool, range.from, range.to), listPrograms(pool, range.from, range.to)]);
    return {
      items: [
        ...rotations.filter((item) => item.status !== 'CANCELLED').map((item) => ({
          id: item.id, title: item.title, status: 'ELDER_ASSIGNMENT', department: `Ancianos · ${item.elders.map((elder: { name: string }) => elder.name).join(', ')}`,
          department_color: '#b58a33', venue: null, kind: 'ELDER_ROTATION', informational: true,
          sessions: [{ id: `elder-rotation-${item.id}`, startsAt: `${dateOnly(item.startsOn)}T00:00:00-04:00`, endsAt: `${dateOnly(item.endsOn)}T23:59:59-04:00` }]
        })),
        ...programs.filter((item) => item.status === 'PUBLISHED').map((item) => ({
          id: item.id, title: item.title, status: 'ELDER_PROGRAM', department: `Ancianos · ${item.elderName}`,
          department_color: '#886a25', venue: null, kind: 'ELDER_PROGRAM', informational: true,
          sessions: [{ id: `elder-program-${item.id}`, startsAt: item.serviceAt, endsAt: item.endsAt }]
        }))
      ]
    };
  }

  @Get('dashboard')
  async dashboard(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request); requirePermission(user, 'dashboard.read');
    const pool = await poolFor(user);
    const from = new Date(); from.setDate(from.getDate() - 7);
    const to = new Date(); to.setDate(to.getDate() + 45);
    const [rotations, programs, departmentAssignments] = await Promise.all([
      listRotations(pool, from.toISOString(), to.toISOString()),
      listPrograms(pool, from.toISOString(), to.toISOString()),
      listDepartmentAssignments(pool, from.toISOString(), to.toISOString())
    ]);
    return {
      rotations: rotations.filter((item) => item.status === 'ACTIVE'),
      programs: programs.filter((item) => item.status === 'PUBLISHED').slice(0, 8),
      departmentAssignments: departmentAssignments.filter((item) => item.status === 'ACTIVE')
    };
  }

  private async notifyPublication(client: PoolClient, title: string) {
    const recipients = await client.query<{ id: string }>(
      `SELECT DISTINCT u.id FROM identity.users u
       JOIN identity.department_memberships m ON m.user_id=u.id
       JOIN calendar.departments d ON d.id=m.department_id
       WHERE u.active AND lower(d.name) ~ '(publicidad|comunicaci|adoraci|música|musica)'`
    );
    await notify(client, recipients.rows.map((item) => item.id), 'elders.program_published', 'Material para culto disponible', `${title}: ya puedes consultar predicador, música, himno y fotografías.`);
  }
}

@Module({
  controllers: [HealthController, EldersController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }]
})
class EldersModule {}

await bootstrapNest(EldersModule, Number(process.env.ELDERS_SERVICE_PORT ?? 4017), 'elders-service');
