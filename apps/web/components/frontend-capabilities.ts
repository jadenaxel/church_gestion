export type FrontendPrincipal = {
  roles?: string[];
  permissions?: string[];
  moduleAccess?: string[];
  departmentApps?: Array<{ key: string; name?: string; href?: string }>;
};

/** Presentation only; backend authorization remains authoritative. */
export function frontendCapabilities(user: FrontendPrincipal | null) {
  const allowed = (permission: string) => Boolean(user?.permissions?.includes(permission));
  const module = (key: string) => Boolean(user?.moduleAccess?.includes(key) || user?.departmentApps?.some((app) => app.key === key));
  return {
    canCreateActivity: allowed('calendar.create'),
    canReadCalendar: allowed('calendar.read'),
    canReviewActivities: allowed('calendar.review'),
    canReadReports: allowed('reports.read'),
    canReadElders: module('elders') || module('worship-programs'),
    canManageDepartments: Boolean(user?.roles?.includes('TENANT_ADMIN'))
  };
}

export function optionalItems<T>(result: PromiseSettledResult<{ items: T[] }>): { items: T[]; failed: boolean } {
  if (result.status === 'fulfilled') return { items: result.value.items, failed: false };
  const denied = result.reason && typeof result.reason === 'object' && result.reason.status === 403;
  return { items: [], failed: !denied };
}
