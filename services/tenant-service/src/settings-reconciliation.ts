import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { createTenantSchema } from '@gc/contracts';
import { databaseNameForTenant, withTransaction } from '@gc/database';

// Zod4 applies defaults inside optional properties: do not reuse creation's
// timezone default for PATCH. Absence is a real instruction to preserve it.
export const updateTenantSettingsSchema = z.object({
  name: createTenantSchema.shape.name.optional(),
  timezone: createTenantSchema.shape.timezone.removeDefault().optional(),
  expectedVersion: z.number().int().min(0).max(2_147_483_646).optional(),
  idempotencyKey: z.uuid().optional()
}).refine((value) => value.name !== undefined || value.timezone !== undefined, 'Indica al menos un ajuste.');

type SettingsInput = z.infer<typeof updateTenantSettingsSchema>;
export type SettingsTenant = { id: string; slug: string; name: string; timezone: string; status: string; database_name: string; updated_at: Date };
type JobState = 'PENDING' | 'COMPLETED' | 'CONFLICT' | 'SUPERSEDED';
export type SettingsJob = {
  id: string; tenant_id: string; version: number; actor_id: string; request_hash: string; database_name: string;
  before_name: string; before_timezone: string; source_tenant_timezone: string; desired_name: string;
  desired_timezone: string; changes_timezone: boolean; correlation_id: string | null; state: JobState;
  attempts: number; lease_token: string | null; lease_until: Date | null; next_attempt_at: Date;
  last_error_code: string | null; completed_at: Date | null;
};
export type TenantPoolResolver = (tenant: SettingsTenant) => Promise<Pool>;

export class SettingsUpdateError extends Error {
  constructor(readonly code: string, message: string, readonly status: number,
    readonly operationId?: string, readonly version?: number) { super(message); }
}
function fail(code: string, message: string, status = 409, job?: SettingsJob): never {
  throw new SettingsUpdateError(code, message, status, job?.id, job?.version);
}
function assertRoute(tenant: SettingsTenant, database?: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(tenant.id)
    || tenant.database_name !== databaseNameForTenant(tenant.id) || (database && database !== tenant.database_name)) {
    fail('TENANT_SETTINGS_ROUTE_CHANGED', 'La ruta de configuración requiere revisión.');
  }
}
export function settingsRequestHash(tenantId: string, actorId: string, input: SettingsInput): string {
  return createHash('sha256').update(JSON.stringify({ tenantId, actorId, name: input.name ?? null, timezone: input.timezone ?? null })).digest('hex');
}
async function jobById(pool: Pool | PoolClient, id: string) {
  return (await pool.query<SettingsJob>('SELECT * FROM control.tenant_settings_updates WHERE id=$1', [id])).rows[0];
}
async function lockTenant(client: PoolClient, tenantId: string): Promise<SettingsTenant> {
  const tenant = (await client.query<SettingsTenant>('SELECT id,slug,name,timezone,status,database_name,updated_at FROM control.tenants WHERE id=$1 FOR UPDATE', [tenantId])).rows[0];
  if (!tenant) fail('TENANT_SETTINGS_TENANT_MISSING', 'La iglesia no está disponible.', 404);
  assertRoute(tenant); return tenant;
}

/** Record an authorized intent only; control's visible settings stay unchanged. */
export async function enqueueSettingsUpdate(control: Pool, tenantPool: Pool, tenantId: string, actorId: string,
  input: SettingsInput, correlationId: string | null): Promise<SettingsJob> {
  const operationId = input.idempotencyKey ?? randomUUID();
  const hash = settingsRequestHash(tenantId, actorId, input);
  // Resolve/read routing before borrowing control. Never wait for a second
  // control connection while retaining a control transaction's locks.
  const source = await tenantPool.query<{ timezone: string; database: string }>('SELECT timezone,current_database() AS database FROM calendar.tenant_calendar_settings WHERE singleton');
  if (source.rowCount !== 1) fail('TENANT_SETTINGS_SOURCE_MISSING', 'No se pudo confirmar la configuración de calendario.', 503);
  try {
    return await withTransaction(control, async (client) => {
      const tenant = await lockTenant(client, tenantId); assertRoute(tenant, source.rows[0]!.database);
      if (tenant.status !== 'ACTIVE') fail('TENANT_SETTINGS_TENANT_INACTIVE', 'La iglesia no está activa.');
      const existingKey = await jobById(client, operationId);
      if (existingKey) {
        if (existingKey.tenant_id !== tenantId || existingKey.actor_id !== actorId || existingKey.request_hash !== hash)
          fail('TENANT_SETTINGS_KEY_REUSED', 'La clave de esta operación ya fue utilizada con otro contenido.');
        return existingKey;
      }
      const latest = (await client.query<SettingsJob>('SELECT * FROM control.tenant_settings_updates WHERE tenant_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE', [tenantId])).rows[0];
      const currentVersion = latest?.version ?? 0;
      if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion)
        fail('TENANT_SETTINGS_VERSION_CONFLICT', 'La configuración cambió. Recárguela antes de guardar.', 409, latest);
      if (latest?.state === 'PENDING' || latest?.state === 'CONFLICT') {
        const explicitConflictReplacement = latest.state === 'CONFLICT'
          && input.expectedVersion !== undefined && input.timezone !== undefined;
        if (latest.actor_id === actorId && latest.request_hash === hash && !explicitConflictReplacement) return latest;
        // A conflicting intent is retained in history. Replacing it is an
        // explicit versioned command, never automatic synchronization.
        if (latest.state !== 'CONFLICT' || input.expectedVersion === undefined || input.timezone === undefined)
          fail('TENANT_SETTINGS_UPDATE_PENDING', 'Hay una actualización pendiente. Revise su estado antes de enviar otra.', 409, latest);
        await client.query("UPDATE control.tenant_settings_updates SET state='SUPERSEDED',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1", [latest.id]);
      }
      if (input.timezone === undefined && source.rows[0]!.timezone !== tenant.timezone)
        fail('TENANT_SETTINGS_SOURCE_CONFLICT', 'Calendario y administración difieren. Elija explícitamente la zona horaria antes de guardar.', 409, latest);
      if (currentVersion >= 2_147_483_646) fail('TENANT_SETTINGS_VERSION_EXHAUSTED', 'La versión de configuración requiere revisión.');
      const job = (await client.query<SettingsJob>(`INSERT INTO control.tenant_settings_updates
        (id,tenant_id,version,actor_id,request_hash,database_name,before_name,before_timezone,source_tenant_timezone,
         desired_name,desired_timezone,changes_timezone,correlation_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [operationId, tenantId, currentVersion + 1, actorId, hash, tenant.database_name, tenant.name, tenant.timezone,
        source.rows[0]!.timezone, input.name ?? tenant.name, input.timezone ?? tenant.timezone, input.timezone !== undefined,
        correlationId?.slice(0, 200) ?? null])).rows[0]!;
      await client.query(`INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
        VALUES($1,'tenant.settings.update_requested','tenant',$2,$3::jsonb)`,
      [actorId, tenantId, JSON.stringify({ outcome: 'PENDING', operationId, version: job.version,
        ...(latest?.state === 'CONFLICT' ? { supersedesOperationId: latest.id } : {}) })]);
      return job;
    });
  } catch (error) {
    if (error instanceof SettingsUpdateError) throw error;
    // A lost control COMMIT acknowledgement may have persisted the intent.
    // Read its exact receipt, never blindly insert or acknowledge a write.
    try {
      const durable = await jobById(control, operationId);
      if (durable?.tenant_id === tenantId && durable.actor_id === actorId && durable.request_hash === hash) return durable;
    } catch { /* Reception is uncertain; preserve the explicit operation ID. */ }
    throw new SettingsUpdateError('TENANT_SETTINGS_INTENT_UNCERTAIN', 'No se pudo confirmar la recepción. Consulte el estado antes de reenviar.', 503, operationId);
  }
}

async function claimSettingsUpdate(control: Pool, operationId: string, force: boolean) {
  const lookup = await jobById(control, operationId);
  if (!lookup) return null;
  return withTransaction(control, async (client) => {
    const tenant = await lockTenant(client, lookup.tenant_id);
    const job = (await client.query<SettingsJob>('SELECT * FROM control.tenant_settings_updates WHERE id=$1 FOR UPDATE', [operationId])).rows[0]!;
    if (job.state !== 'PENDING' || (job.lease_until && job.lease_until > new Date())
      || (!force && job.next_attempt_at > new Date())) return null;
    assertRoute(tenant, job.database_name);
    if (tenant.status !== 'ACTIVE') return null;
    const claimed = (await client.query<SettingsJob>(`UPDATE control.tenant_settings_updates
      SET lease_token=$2,lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
      WHERE id=$1 RETURNING *`, [operationId, randomUUID()])).rows[0]!;
    return { job: claimed, tenant };
  });
}

async function tenantReceipt(client: PoolClient, job: SettingsJob) {
  const receipts = await client.query<{ after_data: Record<string, unknown> }>(`SELECT after_data FROM audit.audit_events
    WHERE action='tenant.settings.updated' AND resource_type='tenant' AND resource_id=$1
      AND after_data->>'settingsUpdateId'=$2 ORDER BY id`, [job.tenant_id, job.id]);
  if (receipts.rowCount === 0) return false;
  if (receipts.rowCount !== 1) fail('TENANT_SETTINGS_RECEIPT_CONFLICT', 'El recibo de configuración requiere revisión.', 409, job);
  const receipt = receipts.rows[0]!.after_data;
  if (receipt.requestHash !== job.request_hash || receipt.version !== job.version || receipt.name !== job.desired_name
    || receipt.timezone !== job.desired_timezone) fail('TENANT_SETTINGS_RECEIPT_CONFLICT', 'El recibo de configuración requiere revisión.', 409, job);
  return true;
}
async function lockedCalendarSettings(client: PoolClient, job: SettingsJob) {
  await client.query("SET LOCAL statement_timeout='15s'"); await client.query("SET LOCAL lock_timeout='5s'");
  const settings = await client.query<{ timezone: string; database: string }>('SELECT timezone,current_database() AS database FROM calendar.tenant_calendar_settings WHERE singleton FOR UPDATE');
  if (settings.rowCount !== 1 || settings.rows[0]!.database !== job.database_name)
    fail('TENANT_SETTINGS_ROUTE_CHANGED', 'No se pudo confirmar la ruta de configuración.', 409, job);
  return settings.rows[0]!;
}

/** Each stage is durable separately. No cross-database atomicity is claimed. */
export async function reconcileSettingsUpdate(control: Pool, resolvePool: TenantPoolResolver, operationId: string,
  force = false): Promise<SettingsJob | undefined> {
  let claimed: Awaited<ReturnType<typeof claimSettingsUpdate>>;
  try { claimed = await claimSettingsUpdate(control, operationId, force); }
  catch { return jobById(control, operationId); } // A lost lease ACK expires/retries; never invent success.
  if (!claimed) return jobById(control, operationId);
  const { job, tenant } = claimed;
  try {
    const pool = await resolvePool(tenant); // No control transaction is held for routing/security checks.
    await withTransaction(pool, async (client) => {
      const settings = await lockedCalendarSettings(client, job);
      const applied = await tenantReceipt(client, job);
      if (applied) {
        if (settings.timezone !== job.desired_timezone)
          fail('TENANT_SETTINGS_SOURCE_CONFLICT', 'Calendario cambió después de aplicar la intención. Revise la configuración.', 409, job);
        return;
      }
      if (settings.timezone !== job.source_tenant_timezone)
        fail('TENANT_SETTINGS_SOURCE_CONFLICT', 'Calendario cambió mientras la actualización estaba pendiente.', 409, job);
      if (job.changes_timezone) await client.query('UPDATE calendar.tenant_calendar_settings SET timezone=$1,updated_at=now() WHERE singleton', [job.desired_timezone]);
      await client.query(`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,before_data,after_data,correlation_id)
        VALUES($1,'tenant.settings.updated','tenant',$2,$3::jsonb,$4::jsonb,$5)`,
      [job.actor_id, job.tenant_id, JSON.stringify({ name: job.before_name, timezone: job.before_timezone }),
        JSON.stringify({ name: job.desired_name, timezone: job.desired_timezone, settingsUpdateId: job.id,
          requestHash: job.request_hash, version: job.version, outcome: 'PENDING', reconciliationStatus: 'TENANT_APPLIED_CONTROL_PENDING' }), job.correlation_id]);
    });
    // Tenant data/receipt already committed. This second tenant TX only holds
    // the singleton lock across control finalization: its rollback cannot undo
    // the durable tenant stage. Calendar uses the same row lock on UPDATE.
    await withTransaction(pool, async (tenantClient) => {
      const settings = await lockedCalendarSettings(tenantClient, job);
      if (settings.timezone !== job.desired_timezone || !await tenantReceipt(tenantClient, job))
        fail('TENANT_SETTINGS_SOURCE_CONFLICT', 'La configuración cambió antes de completar la reconciliación.', 409, job);
      await withTransaction(control, async (client) => {
        const current = await lockTenant(client, job.tenant_id);
        const active = (await client.query<SettingsJob>('SELECT * FROM control.tenant_settings_updates WHERE id=$1 FOR UPDATE', [job.id])).rows[0]!;
        if (active.state === 'COMPLETED') return;
        if (active.state !== 'PENDING' || active.lease_token !== job.lease_token)
          fail('TENANT_SETTINGS_LEASE_CHANGED', 'Otra ejecución está reconciliando esta intención.', 503, job);
        assertRoute(current, job.database_name);
        if (current.status !== 'ACTIVE' || current.name !== job.before_name || current.timezone !== job.before_timezone)
          fail('TENANT_SETTINGS_CONTROL_CONFLICT', 'La configuración de administración cambió mientras estaba pendiente.', 409, job);
        await client.query('UPDATE control.tenants SET name=$2,timezone=$3,updated_at=now() WHERE id=$1', [job.tenant_id, job.desired_name, job.desired_timezone]);
        await client.query(`INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
          VALUES($1,'tenant.settings.updated','tenant',$2,$3::jsonb)`,
        [job.actor_id, job.tenant_id, JSON.stringify({ outcome: 'SUCCESS', settingsUpdateId: job.id, version: job.version,
          before: { name: job.before_name, timezone: job.before_timezone }, after: { name: job.desired_name, timezone: job.desired_timezone } })]);
        await client.query("UPDATE control.tenant_settings_updates SET state='COMPLETED',completed_at=now(),lease_token=NULL,lease_until=NULL,last_error_code=NULL,updated_at=now() WHERE id=$1", [job.id]);
      });
    });
  } catch (error) {
    // COMMIT may have completed either durable stage. First consult the exact
    // control receipt; tenant replays consult their immutable receipt above.
    const durable = await jobById(control, job.id);
    if (durable?.state === 'COMPLETED') return durable;
    const conflict = error instanceof SettingsUpdateError && error.status === 409;
    const code = error instanceof SettingsUpdateError ? error.code : 'TENANT_SETTINGS_RECONCILIATION_DEFERRED';
    await control.query(`UPDATE control.tenant_settings_updates SET state=$3,last_error_code=$4,
      lease_token=NULL,lease_until=NULL,next_attempt_at=now()+interval '15 seconds',updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND state='PENDING'`, [job.id, job.lease_token, conflict ? 'CONFLICT' : 'PENDING', code]);
  }
  return jobById(control, job.id);
}

export async function readSettingsState(control: Pool, tenantPool: Pool, tenantId: string) {
  // Name/zone and the optimistic version must belong to one control snapshot.
  // Separate reads could pair an older name with a newer completed version.
  const tenant = (await control.query<SettingsTenant & { settings_job: SettingsJob | null }>(`SELECT t.id,t.slug,t.name,t.timezone,t.status,t.database_name,t.updated_at,to_jsonb(j) AS settings_job
    FROM control.tenants t LEFT JOIN LATERAL (
      SELECT u.* FROM control.tenant_settings_updates u WHERE u.tenant_id=t.id ORDER BY u.version DESC LIMIT 1
    ) j ON true WHERE t.id=$1`, [tenantId])).rows[0];
  if (!tenant) fail('TENANT_SETTINGS_TENANT_MISSING', 'La iglesia no está disponible.', 404);
  assertRoute(tenant);
  const latest = tenant.settings_job ?? undefined;
  const settings = await tenantPool.query<{ timezone: string; database: string }>('SELECT timezone,current_database() AS database FROM calendar.tenant_calendar_settings WHERE singleton');
  if (settings.rowCount !== 1 || settings.rows[0]!.database !== tenant.database_name)
    fail('TENANT_SETTINGS_SOURCE_MISSING', 'No se pudo confirmar la configuración de calendario.', 503, latest);
  const open = latest?.state === 'PENDING' || latest?.state === 'CONFLICT';
  const coherent = !open && tenant.timezone === settings.rows[0]!.timezone;
  return { id: tenant.id, slug: tenant.slug, name: tenant.name, timezone: tenant.timezone, status: tenant.status,
    updated_at: tenant.updated_at, settingsVersion: latest?.version ?? 0, settingsCoherent: coherent,
    reconciliationStatus: open ? latest.state : coherent ? 'COMPLETED' : 'CONFLICT',
    calendarTimezone: settings.rows[0]!.timezone,
    settingsUpdate: latest ? { id: latest.id, version: latest.version, state: latest.state,
      attempts: latest.attempts, errorCode: latest.last_error_code, nextAttemptAt: latest.next_attempt_at } : null };
}

export async function reconcileDueSettingsUpdates(control: Pool, resolvePool: TenantPoolResolver, limit = 10) {
  const due = await control.query<{ id: string }>(`SELECT u.id FROM control.tenant_settings_updates u
    JOIN control.tenants t ON t.id=u.tenant_id
    WHERE t.status='ACTIVE' AND u.state='PENDING' AND u.next_attempt_at<=now() AND (u.lease_until IS NULL OR u.lease_until<=now())
    ORDER BY u.next_attempt_at,u.created_at LIMIT $1`, [Math.max(1, Math.min(20, limit))]);
  for (const job of due.rows) await reconcileSettingsUpdate(control, resolvePool, job.id);
  return due.rowCount;
}
