import type { Pool, PoolClient } from 'pg';
import type { AuthPrincipal } from '@gc/contracts';

/** Must run inside the transaction that makes a stored file AVAILABLE. */
export async function assertUploadQuota(client: PoolClient, bytes: number, quota = Number(process.env.TENANT_UPLOAD_QUOTA_BYTES ?? 1024 * 1024 * 1024)): Promise<void> {
  if (!Number.isSafeInteger(quota) || quota <= 0 || !Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid upload quota configuration.');
  // Database-local lock shared by activity attachments, documents and member photos.
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('gestionchurch:file-storage-quota'))`);
  const usage = await client.query<{ total: string }>(`SELECT COALESCE(sum(size_bytes),0)::text total FROM files.file_objects WHERE deleted_at IS NULL AND status='AVAILABLE'`);
  if (BigInt(usage.rows[0]?.total ?? '0') + BigInt(bytes) > BigInt(quota)) {
    throw Object.assign(new Error('La cuota de archivos de la iglesia fue alcanzada.'), { status: 413, code: 'TENANT_FILE_QUOTA_EXCEEDED' });
  }
}

export function canWriteActivityAttachment(user: AuthPrincipal, activity: { status: string; created_by: string }, departmentRole: string | null, _deleting = false): boolean {
  if (['CANCELLED', 'COMPLETED', 'ARCHIVED'].includes(activity.status)) return false;
  if (user.permissions.includes('calendar.manage') || user.permissions.includes('documents.manage')) return true;
  if (activity.status === 'APPROVED') return false;
  if (!departmentRole) return false;
  return ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(departmentRole)
    || (activity.created_by === user.sub && ['PLANNER', 'CONTRIBUTOR'].includes(departmentRole));
}

export async function assertActivityAttachmentWrite(pool: Pool | PoolClient, user: AuthPrincipal, activityId: string, deleting = false, lock = false): Promise<void> {
  const result = await pool.query<{ department_id: string; status: string; created_by: string }>(
    lock ? `SELECT * FROM files.lock_activity_for_attachment($1::uuid)` : `SELECT department_id,status,created_by FROM calendar.activities WHERE id=$1`, [activityId]
  );
  const activity = result.rows[0];
  if (!activity) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
  const membership = await pool.query<{ role: string }>(
    `SELECT role FROM identity.department_memberships WHERE user_id=$1 AND department_id=$2`, [user.sub, activity.department_id]
  );
  if (!canWriteActivityAttachment(user, activity, membership.rows[0]?.role ?? null, deleting)) {
    throw Object.assign(new Error('No puede modificar los archivos de esta actividad. Las actividades aprobadas requieren autorización.'), { status: 403, code: 'ACTIVITY_FILE_WRITE_DENIED' });
  }
}

export async function assertMemberPhotoRead(pool: Pool, user: AuthPrincipal, memberId: string): Promise<void> {
  if (user.permissions.includes('users.manage')) return;
  const result = await pool.query(
    `SELECT 1 FROM identity.church_members c WHERE c.id=$2 AND c.sex='FEMALE' AND (
       $3::boolean OR EXISTS(SELECT 1 FROM identity.department_memberships m
         JOIN calendar.departments d ON d.id=m.department_id
         WHERE m.user_id=$1 AND d.active AND lower(translate(d.name,'áéíóúüñ','aeiouun')) ~ '(ministerio(s)? de la mujer|women.?s ministr)')
     )`, [user.sub, memberId, user.roles.some((role) => ['TENANT_ADMIN', 'BOARD_SECRETARY', 'PASTOR'].includes(role))]
  );
  if (!result.rowCount) throw Object.assign(new Error('No tiene permiso para consultar esta fotografía del padrón.'), { status: 403, code: 'MEMBER_PHOTO_READ_DENIED' });
}
