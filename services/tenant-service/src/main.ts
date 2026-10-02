import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import argon2 from 'argon2';
import { Body, Controller, Get, Module, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import { createTenantSchema, type AuthPrincipal } from '@gc/contracts';
import { assertRuntimeDatabaseSecurity, controlPool, databaseNameForTenant, getTenantPool, tenantPoolFromId, withTransaction } from '@gc/database';
import { openTenantBootstrapPool, provisionTenantDatabase } from '@gc/database/migrations';
import { bootstrapNest, currentUser, HEALTH_RESPONSE, JwtAuthGuard, Public, requirePermission, safeCsvCell } from '@gc/platform';
import { enqueueSettingsUpdate, readSettingsState, reconcileDueSettingsUpdates, reconcileSettingsUpdate,
  SettingsUpdateError, type SettingsTenant, updateTenantSettingsSchema } from './settings-reconciliation.js';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_tenant_service';

async function settingsTenantPool(tenant: SettingsTenant) {
  const pool = getTenantPool(tenant);
  await assertRuntimeDatabaseSecurity(pool, process.env, process.env.DATABASE_SERVICE_ROLE);
  return pool;
}

const globalAuditFilterSchema = z.object({
  tenantId: z.uuid().optional(),
  search: z.string().trim().max(120).optional(),
  outcome: z.enum(['SUCCESS', 'REJECTED', 'FAILED', 'EXCEPTIONS']).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(30)
}).superRefine((value, context) => {
  if (value.from && value.to && new Date(value.to) <= new Date(value.from)) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'La fecha final debe ser posterior a la inicial.' });
  }
});

function auditCsvCell(value: unknown): string {
  return safeCsvCell(value);
}

async function globalTenantAuditContext(id: string) {
  const result = await controlPool.query<{
    id: string; slug: string; name: string; timezone: string; database_name: string; status: string;
  }>(`SELECT id,slug,name,timezone,database_name,status FROM control.tenants WHERE id=$1`, [id]);
  const tenant = result.rows[0];
  if (!tenant) throw Object.assign(new Error('El tenant no existe.'), { status: 404 });
  const pool = getTenantPool(tenant);
  await assertRuntimeDatabaseSecurity(pool, process.env, process.env.DATABASE_SERVICE_ROLE);
  return { tenant, pool };
}

@Controller()
class TenantController {
  @Public()
  @Get('health/live')
  health() { return HEALTH_RESPONSE; }

  @Get('global/tenants')
  async list(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    requirePermission(user, 'global.tenants.manage');
    const result = await controlPool.query(
      `SELECT id,slug,name,timezone,status,created_at,updated_at FROM control.tenants ORDER BY created_at DESC`
    );
    return { items: result.rows };
  }

  @Post('global/tenants')
  async create(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown) {
    const user = currentUser(request);
    requirePermission(user, 'global.tenants.manage');
    const input = createTenantSchema.parse(body);
    const id = randomUUID();
    const provisioningJobId = randomUUID();
    const databaseName = databaseNameForTenant(id);
    await withTransaction(controlPool, async (client) => {
    await client.query(
      `INSERT INTO control.tenants(id,slug,name,timezone,database_name,status)
       VALUES($1,$2,$3,$4,$5,'PROVISIONING')`,
      [id, input.slug, input.name, input.timezone, databaseName]
    );
    await client.query(
      `INSERT INTO control.tenant_provisioning_jobs(id,tenant_id,status,started_at)
       VALUES($1,$2,'RUNNING',now())`, [provisioningJobId, id]
    );
    });
    try {
      if (process.env.NODE_ENV === 'production' && !process.env.POSTGRES_ADMIN_URL) {
        throw new Error('Production provisioning requires an explicit administrative database connection.');
      }
      const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
      const provisionedDatabase = await provisionTenantDatabase(adminUrl, id, { requireNew: true });
      // Keep login/read routing closed until the whole bootstrap is committed.
      // This short-lived administrative pool is never cached/routed as runtime.
      const pool = openTenantBootstrapPool(adminUrl, id, provisionedDatabase);
      try {
      const hash = await argon2.hash(input.adminPassword, { type: argon2.argon2id });
      await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO identity.users(email,name,password_hash,roles) VALUES($1,$2,$3,ARRAY['TENANT_ADMIN'])`,
        [input.adminEmail, input.adminName, hash]
      );
      const admin = await client.query<{ id: string }>(`SELECT id FROM identity.users WHERE email=$1`, [input.adminEmail]);
      await client.query(
        `INSERT INTO identity.credentials(user_id,password_hash)
         VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
        [admin.rows[0]?.id, hash]
      );
      await client.query(`UPDATE calendar.tenant_calendar_settings SET timezone=$1,updated_at=now() WHERE singleton`, [input.timezone]);
      await client.query(
        `INSERT INTO calendar.departments(name,color) VALUES
           ('Administración','#0f766e'),
           ('Ministerios Personales','#2563eb'),
           ('Jóvenes Adventistas','#7c3aed'),
           ('Ministerio Infantil','#db2777'),
           ('Mayordomía','#d97706')
         ON CONFLICT (name) DO NOTHING`
      );
      await client.query(
        `INSERT INTO calendar.venues(name,capacity,color) VALUES
           ('Templo principal',250,'#c49a45'),
           ('Salón multiuso',80,'#0f766e'),
           ('Aula de reuniones',30,'#2563eb')
         ON CONFLICT (name) DO NOTHING`
      );
      await client.query(
        `INSERT INTO calendar.resources(name,exclusive) VALUES
           ('Equipo de sonido',true),
           ('Proyector',true)
         ON CONFLICT (name) DO NOTHING`
      );
      });
      } finally { await pool.end(); }
      await withTransaction(controlPool, async (client) => {
      await client.query(
        `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
         VALUES($1,'tenant.created','tenant',$2,jsonb_build_object('slug',$3::text))`,
        [user.sub, id, input.slug]
      );
      await client.query(
        `INSERT INTO control.tenant_domains(tenant_id,domain,verified_at)
         VALUES($1,$2,now()) ON CONFLICT(domain) DO NOTHING`,
        [id, `${input.slug}.${process.env.BASE_DOMAIN ?? 'gestionchurch.com'}`]
      );
      await client.query(
        `INSERT INTO control.tenant_database_registry(tenant_id,database_name)
         VALUES($1,$2) ON CONFLICT(tenant_id) DO UPDATE SET database_name=EXCLUDED.database_name`,
        [id, databaseName]
      );
      await client.query(
        `UPDATE control.tenant_provisioning_jobs SET status='COMPLETED',completed_at=now() WHERE id=$1`,
        [provisioningJobId]
      );
      const activated = await client.query(`UPDATE control.tenants SET status='ACTIVE',updated_at=now() WHERE id=$1 AND status='PROVISIONING'`, [id]);
      if (activated.rowCount !== 1) throw Object.assign(new Error('El tenant cambió durante el provisionamiento.'), { status: 409, code: 'TENANT_PROVISIONING_STATE_CHANGED' });
      });
      return { id, slug: input.slug, name: input.name, timezone: input.timezone, status: 'ACTIVE' };
    } catch (error) {
      // A lost COMMIT acknowledgement is not evidence that provisioning failed.
      // Reconcile the exact owned operation before changing its durable state.
      const completed = await controlPool.query(
        `SELECT 1 FROM control.tenants t JOIN control.tenant_provisioning_jobs j ON j.tenant_id=t.id
         WHERE t.id=$1 AND t.slug=$2 AND t.database_name=$3 AND t.status='ACTIVE'
           AND j.id=$4 AND j.status='COMPLETED'`, [id, input.slug, databaseName, provisioningJobId]
      );
      if (completed.rowCount === 1) return { id, slug: input.slug, name: input.name, timezone: input.timezone, status: 'ACTIVE' };
      await withTransaction(controlPool, async (client) => {
      await client.query(`UPDATE control.tenants SET status='FAILED',updated_at=now() WHERE id=$1 AND status='PROVISIONING'`, [id]);
      await client.query(
        `UPDATE control.tenant_provisioning_jobs SET status='FAILED',error=$2,completed_at=now() WHERE id=$1`,
        [provisioningJobId, 'PROVISIONING_FAILED: inspect restricted operator diagnostics']
      );
      });
      throw error;
    }
  }

  @Get('tenant/settings')
  async settings(@Req() request: Request & { user?: AuthPrincipal }) {
    const user = currentUser(request);
    const tenantId = z.uuid().parse(user.tenantId);
    const { pool } = await tenantPoolFromId(tenantId);
    return readSettingsState(controlPool, pool, tenantId);
  }

  @Patch('tenant/settings')
  async updateSettings(@Req() request: Request & { user?: AuthPrincipal }, @Body() body: unknown,
    @Res({ passthrough: true }) response: Response) {
    const user = currentUser(request);
    requirePermission(user, 'tenant.settings.manage');
    const input = updateTenantSettingsSchema.parse(body);
    const tenantId = z.uuid().parse(user.tenantId);
    const { pool } = await tenantPoolFromId(tenantId); // Outside every control TX.
    try {
      const correlation = request.headers['x-correlation-id'];
      const job = await enqueueSettingsUpdate(controlPool, pool, tenantId, user.sub, input,
        typeof correlation === 'string' ? correlation : null);
      const reconciled = await reconcileSettingsUpdate(controlPool, settingsTenantPool, job.id, true);
      const state = await readSettingsState(controlPool, pool, tenantId);
      if (reconciled?.state !== 'COMPLETED' || !state.settingsCoherent) {
        const conflict = reconciled?.state === 'CONFLICT' || state.reconciliationStatus === 'CONFLICT';
        throw new SettingsUpdateError(conflict ? 'TENANT_SETTINGS_RECONCILIATION_CONFLICT' : 'TENANT_SETTINGS_RECONCILIATION_PENDING',
          conflict ? 'La solicitud requiere revisión porque otra configuración cambió. Consulte su estado antes de reenviar.'
            : 'La solicitud está registrada, pero aún no se confirmó en ambas bases. Consulte su estado antes de reenviar.',
          conflict ? 409 : 503, job.id, job.version);
      }
      return state;
    } catch (error) {
      if (!(error instanceof SettingsUpdateError)) throw error;
      // The shared ProblemDetails filter intentionally omits arbitrary error
      // properties. Return this safe receipt explicitly so pending is neither
      // an empty500 nor a misleading2xx accepted by the existing frontend.
      response.status(error.status);
      return { type: 'about:blank', title: error.status === 409 ? 'Configuración en conflicto' : 'Actualización sin confirmar',
        status: error.status, code: error.code, detail: error.message, operationId: error.operationId,
        settingsVersion: error.version, outcome: error.status === 409 ? 'CONFLICT' : 'PENDING' };
    }
  }

  @Patch('global/tenants/:id/status')
  async updateStatus(
    @Req() request: Request & { user?: AuthPrincipal },
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const user = currentUser(request);
    requirePermission(user, 'global.tenants.manage');
    const { status } = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }).parse(body);
    return withTransaction(controlPool, async (client) => {
    const updated = await client.query(
      `UPDATE control.tenants SET status=$2,updated_at=now() WHERE id=$1 AND status IN ('ACTIVE','SUSPENDED')
       RETURNING id,slug,name,timezone,status,updated_at`, [id, status]
    );
    if (!updated.rowCount) throw Object.assign(new Error('El tenant no existe o no puede cambiarse.'), { status: 404 });
    await client.query(
      `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
       VALUES($1,'tenant.status_changed','tenant',$2,jsonb_build_object('status',$3::text))`, [user.sub, id, status]
    );
    return updated.rows[0];
    });
  }

  @Get('global/audit/events')
  async globalAudit(
    @Req() request: Request & { user?: AuthPrincipal },
    @Query() query: Record<string, string | undefined>
  ) {
    const user = currentUser(request);
    requirePermission(user, 'global.audit.read');
    const filters = globalAuditFilterSchema.parse(query);
    const offset = (filters.page - 1) * filters.pageSize;
    let items: unknown[];
    let total: number;
    let summary: { total: number; today: number; exceptions: number; uniqueActors: number; lastEventAt: Date | null };
    if (filters.tenantId) {
      const { tenant, pool } = await globalTenantAuditContext(filters.tenantId);
      const values = [filters.search || null, filters.outcome || null, filters.from ?? null, filters.to ?? null];
      const where = `WHERE ($1::text IS NULL OR ae.action ILIKE '%' || $1 || '%' OR ae.resource_type ILIKE '%' || $1 || '%'
          OR COALESCE(ae.resource_id,'') ILIKE '%' || $1 || '%' OR COALESCE(ae.reason,'') ILIKE '%' || $1 || '%'
          OR COALESCE(u.name,'') ILIKE '%' || $1 || '%' OR COALESCE(u.email,'') ILIKE '%' || $1 || '%'
          OR COALESCE(ae.correlation_id,'') ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR COALESCE(ae.after_data->>'outcome','SUCCESS')=$2
          OR ($2='EXCEPTIONS' AND COALESCE(ae.after_data->>'outcome','SUCCESS') IN ('REJECTED','FAILED')))
        AND ($3::timestamptz IS NULL OR ae.created_at >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR ae.created_at < $4::timestamptz)`;
      const [events, count, totals] = await Promise.all([
        pool.query(
          `SELECT ae.id,ae.actor_id,COALESCE(u.name,'Sistema') actor_name,u.email actor_email,ae.action,ae.resource_type,
                  ae.resource_id,ae.before_data,ae.after_data,ae.reason,ae.correlation_id,ae.created_at,
                  COALESCE(ae.after_data->>'outcome','SUCCESS') outcome,$7::text tenant_name,$8::text tenant_slug
             FROM audit.audit_events ae LEFT JOIN identity.users u ON u.id=ae.actor_id ${where}
            ORDER BY ae.created_at DESC,ae.id DESC LIMIT $5 OFFSET $6`,
          [...values, filters.pageSize, offset, tenant.name, tenant.slug]
        ),
        pool.query<{ total: string }>(`SELECT count(*)::text total FROM audit.audit_events ae LEFT JOIN identity.users u ON u.id=ae.actor_id ${where}`, values),
        pool.query<{ total: string; today: string; exceptions: string; unique_actors: string; last_event_at: Date | null }>(
          `SELECT count(*)::text total,count(*) FILTER (WHERE ae.created_at>=date_trunc('day',now()))::text today,
                  count(*) FILTER (WHERE COALESCE(ae.after_data->>'outcome','SUCCESS') IN ('REJECTED','FAILED'))::text exceptions,
                  count(DISTINCT ae.actor_id)::text unique_actors,max(ae.created_at) last_event_at
             FROM audit.audit_events ae LEFT JOIN identity.users u ON u.id=ae.actor_id ${where}`, values
        )
      ]);
      items = events.rows;
      total = Number(count.rows[0]?.total ?? 0);
      const row = totals.rows[0];
      summary = { total: Number(row?.total ?? 0), today: Number(row?.today ?? 0), exceptions: Number(row?.exceptions ?? 0), uniqueActors: Number(row?.unique_actors ?? 0), lastEventAt: row?.last_event_at ?? null };
    } else {
      const values = [filters.search || null, filters.outcome || null, filters.from ?? null, filters.to ?? null];
      const where = `WHERE ($1::text IS NULL OR al.action ILIKE '%' || $1 || '%' OR al.resource_type ILIKE '%' || $1 || '%'
          OR COALESCE(al.resource_id,'') ILIKE '%' || $1 || '%' OR COALESCE(gu.name,'') ILIKE '%' || $1 || '%'
          OR COALESCE(gu.email,'') ILIKE '%' || $1 || '%' OR COALESCE(al.metadata->>'correlationId','') ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR COALESCE(al.metadata->>'outcome','SUCCESS')=$2
          OR ($2='EXCEPTIONS' AND COALESCE(al.metadata->>'outcome','SUCCESS') IN ('REJECTED','FAILED')))
        AND ($3::timestamptz IS NULL OR al.created_at >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR al.created_at < $4::timestamptz)`;
      const [events, count, totals] = await Promise.all([
        controlPool.query(
          `SELECT al.id,al.actor_id,COALESCE(gu.name,'Sistema') actor_name,gu.email actor_email,al.action,al.resource_type,
                  al.resource_id,NULL::jsonb before_data,al.metadata after_data,NULL::text reason,
                  al.metadata->>'correlationId' correlation_id,al.created_at,
                  COALESCE(al.metadata->>'outcome','SUCCESS') outcome,'Plataforma GestionChurch' tenant_name,'global' tenant_slug
             FROM control.audit_log al LEFT JOIN control.global_users gu ON gu.id=al.actor_id ${where}
            ORDER BY al.created_at DESC,al.id DESC LIMIT $5 OFFSET $6`, [...values, filters.pageSize, offset]
        ),
        controlPool.query<{ total: string }>(`SELECT count(*)::text total FROM control.audit_log al LEFT JOIN control.global_users gu ON gu.id=al.actor_id ${where}`, values),
        controlPool.query<{ total: string; today: string; exceptions: string; unique_actors: string; last_event_at: Date | null }>(
          `SELECT count(*)::text total,count(*) FILTER (WHERE al.created_at>=date_trunc('day',now()))::text today,
                  count(*) FILTER (WHERE COALESCE(al.metadata->>'outcome','SUCCESS') IN ('REJECTED','FAILED'))::text exceptions,
                  count(DISTINCT al.actor_id)::text unique_actors,max(al.created_at) last_event_at
             FROM control.audit_log al LEFT JOIN control.global_users gu ON gu.id=al.actor_id ${where}`, values
        )
      ]);
      items = events.rows;
      total = Number(count.rows[0]?.total ?? 0);
      const row = totals.rows[0];
      summary = { total: Number(row?.total ?? 0), today: Number(row?.today ?? 0), exceptions: Number(row?.exceptions ?? 0), uniqueActors: Number(row?.unique_actors ?? 0), lastEventAt: row?.last_event_at ?? null };
    }
    await controlPool.query(
      `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
       VALUES($1,'audit.events.viewed','audit_log',$2,jsonb_build_object('scope',$3::text,'outcome','SUCCESS','correlationId',$4::text))`,
      [user.sub, filters.tenantId ?? null, filters.tenantId ? 'tenant' : 'global', request.headers['x-correlation-id'] ?? null]
    );
    return { items, summary, pagination: { page: filters.page, pageSize: filters.pageSize, total, pages: Math.max(1, Math.ceil(total / filters.pageSize)) } };
  }

  @Get('global/audit/events.csv')
  async globalAuditCsv(
    @Req() request: Request & { user?: AuthPrincipal },
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response
  ) {
    const user = currentUser(request);
    requirePermission(user, 'global.audit.read');
    const filters = globalAuditFilterSchema.parse({ ...query, page: 1, pageSize: 100 });
    let rows: Array<Record<string, unknown>>;
    if (filters.tenantId) {
      const { tenant, pool } = await globalTenantAuditContext(filters.tenantId);
      const result = await pool.query(
        `SELECT ae.created_at,$5::text scope,COALESCE(u.name,'Sistema') actor,u.email,ae.action,ae.resource_type,
                ae.resource_id,COALESCE(ae.after_data->>'outcome','SUCCESS') outcome,ae.reason,ae.correlation_id
           FROM audit.audit_events ae LEFT JOIN identity.users u ON u.id=ae.actor_id
          WHERE ($1::text IS NULL OR ae.action ILIKE '%' || $1 || '%' OR ae.resource_type ILIKE '%' || $1 || '%'
            OR COALESCE(u.name,'') ILIKE '%' || $1 || '%')
            AND ($2::text IS NULL OR COALESCE(ae.after_data->>'outcome','SUCCESS')=$2
              OR ($2='EXCEPTIONS' AND COALESCE(ae.after_data->>'outcome','SUCCESS') IN ('REJECTED','FAILED')))
            AND ($3::timestamptz IS NULL OR ae.created_at >= $3::timestamptz)
            AND ($4::timestamptz IS NULL OR ae.created_at < $4::timestamptz)
          ORDER BY ae.created_at DESC,ae.id DESC LIMIT 10000`, [filters.search || null, filters.outcome || null, filters.from ?? null, filters.to ?? null, tenant.name]
      );
      rows = result.rows;
    } else {
      const result = await controlPool.query(
        `SELECT al.created_at,'Plataforma GestionChurch'::text scope,COALESCE(gu.name,'Sistema') actor,gu.email,
                al.action,al.resource_type,al.resource_id,COALESCE(al.metadata->>'outcome','SUCCESS') outcome,
                NULL::text reason,al.metadata->>'correlationId' correlation_id
           FROM control.audit_log al LEFT JOIN control.global_users gu ON gu.id=al.actor_id
          WHERE ($1::text IS NULL OR al.action ILIKE '%' || $1 || '%' OR al.resource_type ILIKE '%' || $1 || '%'
            OR COALESCE(gu.name,'') ILIKE '%' || $1 || '%')
            AND ($2::text IS NULL OR COALESCE(al.metadata->>'outcome','SUCCESS')=$2
              OR ($2='EXCEPTIONS' AND COALESCE(al.metadata->>'outcome','SUCCESS') IN ('REJECTED','FAILED')))
            AND ($3::timestamptz IS NULL OR al.created_at >= $3::timestamptz)
            AND ($4::timestamptz IS NULL OR al.created_at < $4::timestamptz)
          ORDER BY al.created_at DESC,al.id DESC LIMIT 10000`, [filters.search || null, filters.outcome || null, filters.from ?? null, filters.to ?? null]
      );
      rows = result.rows;
    }
    await controlPool.query(
      `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
       VALUES($1,'audit.events.exported','audit_log',$2,jsonb_build_object('format','CSV','rows',$3::int,'outcome','SUCCESS'))`,
      [user.sub, filters.tenantId ?? null, rows.length]
    );
    const keys = ['created_at','scope','actor','email','action','resource_type','resource_id','outcome','reason','correlation_id'];
    const lines = [keys.map(auditCsvCell).join(','), ...rows.map((row) => keys.map((key) => auditCsvCell(row[key])).join(','))];
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader('content-disposition', `attachment; filename="auditoria-global-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(`\uFEFF${lines.join('\r\n')}`);
  }
}

@Module({ controllers: [TenantController], providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }] })
class TenantModule {}

await bootstrapNest(TenantModule, 4012, 'tenant-service');

let settingsWorkerBusy = false;
async function processSettingsUpdates() {
  if (settingsWorkerBusy) return;
  settingsWorkerBusy = true;
  try {
    await assertRuntimeDatabaseSecurity(controlPool);
    await reconcileDueSettingsUpdates(controlPool, settingsTenantPool);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    console.error(JSON.stringify({ level: 'warn', service: 'tenant-service', event: 'settings_reconciliation_deferred',
      code: typeof code === 'string' && /^[A-Z0-9_]{3,80}$/.test(code) ? code : 'UNAVAILABLE' }));
  } finally { settingsWorkerBusy = false; }
}
const settingsWorker = setInterval(() => void processSettingsUpdates(), 30_000);
settingsWorker.unref();
void processSettingsUpdates();
