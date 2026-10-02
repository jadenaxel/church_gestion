export type DepartmentReportLocale = 'es' | 'en' | 'fr';
export function budgetCurrencyTotals(rows: Array<{ currency: string; plannedBudget: unknown; spentBudget: unknown }>): Array<{ currency: string; plannedBudget: number; spentBudget: number; availableBudget: number }> {
  const totals = new Map<string, { currency: string; plannedBudget: number; spentBudget: number; availableBudget: number }>();
  for (const item of rows) {
    const currency = item.currency.toUpperCase();
    const total = totals.get(currency) ?? { currency, plannedBudget: 0, spentBudget: 0, availableBudget: 0 };
    total.plannedBudget += Number(item.plannedBudget); total.spentBudget += Number(item.spentBudget);
    total.availableBudget = total.plannedBudget - total.spentBudget; totals.set(currency, total);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
const labels: Record<string, readonly [string, string]> = {
  Departamento: ['Department', 'Département'], Generado: ['Generated', 'Généré'], Indicador: ['Indicator', 'Indicateur'], Valor: ['Value', 'Valeur'], Equipo: ['Team', 'Équipe'],
  Moneda: ['Currency', 'Devise'], 'Importes separados por moneda; no comparables entre monedas.': ['Amounts are separated by currency; not comparable across currencies.', 'Les montants sont séparés par devise ; non comparables entre devises.'],
  'Registros financieros sin moneda atribuible': ['Financial entries without an attributable currency', 'Écritures financières sans devise attribuable'],
  'Planes activos': ['Active plans', 'Plans actifs'], 'Iniciativas activas': ['Active initiatives', 'Initiatives actives'], 'Iniciativas en riesgo': ['At-risk initiatives', 'Initiatives à risque'],
  'Tareas abiertas': ['Open tasks', 'Tâches ouvertes'], Reuniones: ['Meetings', 'Réunions'], Acuerdos: ['Decisions', 'Décisions'], Registros: ['Records', 'Registres'], Documentos: ['Documents', 'Documents'],
  'Presupuesto planificado': ['Planned budget', 'Budget prévu'], 'Presupuesto ejecutado': ['Spent budget', 'Budget dépensé'], 'Presupuesto disponible': ['Available budget', 'Budget disponible'],
  Iniciativa: ['Initiative', 'Initiative'], Estado: ['Status', 'État'], Avance: ['Progress', 'Progrès'], Responsable: ['Responsible person', 'Responsable'], Inicio: ['Start', 'Début'], Fin: ['End', 'Fin'], Planificado: ['Planned', 'Prévu'], Ejecutado: ['Spent', 'Dépensé'], Disponible: ['Available', 'Disponible'],
  'Reporte ejecutivo': ['Executive report', 'Rapport exécutif'], 'GESTIONCHURCH · INTELIGENCIA MINISTERIAL': ['GESTIONCHURCH · MINISTRY INSIGHTS', 'GESTIONCHURCH · ANALYSE DES MINISTÈRES'],
  'En riesgo': ['At risk', 'À risque'], 'Resumen presupuestario': ['Budget summary', 'Résumé budgétaire'], 'Programas, campañas e iniciativas': ['Programs, campaigns and initiatives', 'Programmes, campagnes et initiatives'],
  'Responsable por definir': ['Responsible person to be determined', 'Responsable à définir'],
  'GestionChurch apoya la coordinación y conserva la trazabilidad; no sustituye las decisiones de la junta, la reunión administrativa ni la autoridad pastoral.': ['GestionChurch supports coordination and traceability; it does not replace board decisions, the administrative meeting or pastoral authority.', 'GestionChurch facilite la coordination et la traçabilité ; il ne remplace pas les décisions du conseil, de la réunion administrative ou de l’autorité pastorale.'],
};
export function departmentReportText(locale: DepartmentReportLocale, label: string): string { return locale === 'es' ? label : labels[label]?.[locale === 'en' ? 0 : 1] ?? label; }
export function departmentReportStatus(locale: DepartmentReportLocale, status: string): string {
  const translated: Record<string, readonly [string, string, string]> = { DRAFT: ['Borrador', 'Draft', 'Brouillon'], PLANNED: ['Planificada', 'Planned', 'Planifiée'], IN_PROGRESS: ['En progreso', 'In progress', 'En cours'], AT_RISK: ['En riesgo', 'At risk', 'À risque'], COMPLETED: ['Completada', 'Completed', 'Terminée'], CANCELLED: ['Cancelada', 'Cancelled', 'Annulée'], ACTIVE: ['Activa', 'Active', 'Active'], PAUSED: ['Pausada', 'Paused', 'En pause'] };
  return translated[status]?.[locale === 'es' ? 0 : locale === 'en' ? 1 : 2] ?? status;
}
export function departmentReportInstant(instant: string, locale: DepartmentReportLocale, timezone: string): string {
  return new Intl.DateTimeFormat(({ es: 'es-DO', en: 'en-US', fr: 'fr-FR' } as const)[locale], { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(instant));
}
