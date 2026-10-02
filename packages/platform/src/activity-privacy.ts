import type { AuthPrincipal } from '@gc/contracts';
import type { Pool, PoolClient } from 'pg';

type ActivityPrivacy = { visibility: string; created_by: string };

export function canReadLeadershipActivities(user: AuthPrincipal): boolean {
  return user.roles.some((role) => ['TENANT_ADMIN', 'PASTOR', 'BOARD_SECRETARY', 'FIRST_ELDER', 'ELDER', 'REVIEWER', 'DEPARTMENT_LEADER', 'AUDITOR'].includes(role));
}

export function canReadActivityDetails(user: AuthPrincipal, activity: ActivityPrivacy): boolean {
  return activity.visibility !== 'LEADERSHIP' || activity.created_by === user.sub || canReadLeadershipActivities(user);
}

/** Only validated principal UUIDs and fixed SQL aliases may enter this fragment. */
export function activityReadPredicate(user: AuthPrincipal, alias = 'a'): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.sub)) {
    throw new Error('Invalid activity privacy query context.');
  }
  return canReadLeadershipActivities(user) ? 'TRUE' : `(${alias}.visibility <> 'LEADERSHIP' OR ${alias}.created_by='${user.sub}'::uuid)`;
}

export async function assertActivityRead(pool: Pool | PoolClient, user: AuthPrincipal, activityId: string): Promise<void> {
  const result = await pool.query(`SELECT 1 FROM calendar.activities a WHERE a.id=$1 AND ${activityReadPredicate(user)}`, [activityId]);
  // Identical to an absent resource: do not disclose confidential records by UUID.
  if (!result.rowCount) throw Object.assign(new Error('La actividad no existe.'), { status: 404, code: 'ACTIVITY_NOT_FOUND' });
}

/** Keep occupied ranges and priority timestamps, never confidential people/program details. */
export function redactActivityConflict<T extends ActivityPrivacy & Record<string, unknown>>(user: AuthPrincipal, conflict: T): Omit<T, 'visibility' | 'created_by'> {
  const { visibility, created_by, ...details } = conflict;
  if (canReadActivityDetails(user, { visibility, created_by })) return details;
  return { ...details, reservation_id: '', activity_id: '', code: '', title: 'Horario reservado', department_id: '', department: '', department_color: '#6b7280', venue: null,
    responsible_name: '', submitted_by_name: '', activity_created_at: '', same_responsible: false };
}
