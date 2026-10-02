import type { AuthPrincipal } from '@gc/contracts';

export type DepartmentAccess = {
	canRead: boolean;
	canManage: boolean;
	canFinance: boolean;
	canApprove: boolean;
	role: string | null;
};

// Use the same policy for records, their comments, and mention recipients.
export function departmentAccess(
	user: Pick<AuthPrincipal, 'roles'>,
	membershipRole: string | null,
): DepartmentAccess {
	const admin = user.roles.some((role) =>
		['TENANT_ADMIN', 'BOARD_SECRETARY'].includes(role),
	);
	const pastor = user.roles.includes('PASTOR');
	return {
		canRead: admin || pastor || Boolean(membershipRole),
		canManage:
			admin ||
			['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY', 'PLANNER'].includes(
				membershipRole ?? '',
			),
		canFinance:
			admin ||
			['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(
				membershipRole ?? '',
			),
		canApprove: admin || pastor,
		role: membershipRole,
	};
}

export function canReadMinistryRecord(access: DepartmentAccess, visibility: string): boolean {
	if (!access.canRead) return false;
	if (visibility === 'TEAM') return true;
	return ['LEADERSHIP', 'RESTRICTED'].includes(visibility) &&
		(access.canManage || access.canApprove);
}

export function effectiveRecordVisibility(stored: string, declaredMinimum?: 'TEAM' | 'LEADERSHIP' | 'RESTRICTED'): string {
  if (declaredMinimum === 'RESTRICTED') return 'RESTRICTED';
  if (declaredMinimum === 'LEADERSHIP' && stored === 'TEAM') return 'LEADERSHIP';
  return stored;
}
