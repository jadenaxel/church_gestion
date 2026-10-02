export type AuditFilters = {
  search: string; outcome: string; action: string; resourceType: string;
  tenantId: string; from: string; to: string;
};

export function auditFilterNames(tr: (spanish: string) => string) {
  return {
    tenantId: tr('Ámbito'), outcome: tr('Resultado'), from: tr('Desde'), to: tr('Hasta'),
    action: tr('Acción'), resourceType: tr('Recurso')
  };
}

function localDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  const [year, month, day] = value.split('-').map(Number);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? date : null;
}

export function auditDateRangeError(filters: Pick<AuditFilters, 'from' | 'to'>): string {
  if ((filters.from && !localDate(filters.from)) || (filters.to && !localDate(filters.to))) return 'Introduce fechas válidas para consultar la auditoría.';
  if (filters.from && filters.to && filters.to < filters.from) return 'La fecha final debe ser igual o posterior a la fecha inicial.';
  return '';
}

export function auditQueryString(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams({ page: String(page), pageSize: '30' });
  for (const key of ['search', 'outcome', 'action', 'resourceType', 'tenantId'] as const) if (filters[key]) params.set(key, filters[key]);
  const from = localDate(filters.from);
  const to = localDate(filters.to);
  if (from) params.set('from', from.toISOString());
  if (to) {
    // The inclusive end date ends at the next local midnight, including DST changes.
    to.setDate(to.getDate() + 1);
    params.set('to', to.toISOString());
  }
  return params.toString();
}
