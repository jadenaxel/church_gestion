export type ReportLocale = 'es' | 'en' | 'fr';
const intlLocales = { es: 'es-BO', en: 'en-US', fr: 'fr-FR' } as const;
export function formatReportNumber(locale: ReportLocale, value: number, signed = false): string {
  // Helvetica's WinAnsi encoding supports NBSP, but not the narrow NBSP used
  // by French Intl grouping. Keep its nonbreaking meaning and locale notation.
  return new Intl.NumberFormat(intlLocales[locale], { maximumFractionDigits: 20, ...(signed ? { signDisplay: 'exceptZero' as const } : {}) }).format(value).replaceAll('\u202f', '\u00a0');
}
export function formatReportMonth(locale: ReportLocale, month: string): string {
  // This key already represents the tenant's month. UTC prevents reinterpreting
  // its first day in another timezone; no date or aggregation is recalculated.
  return new Intl.DateTimeFormat(intlLocales[locale], { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
}
const singularTemplates: Record<string, { key: string; text: readonly [string, string, string] }> = {
  '{count} actividades': { key: 'count', text: ['{count} actividad', '{count} activity', '{count} activité'] },
  '{count} conflictos': { key: 'count', text: ['{count} conflicto', '{count} conflict', '{count} conflit'] },
  '{count} vencidas': { key: 'count', text: ['{count} vencida', '{count} overdue', '{count} en retard'] },
  '{count} abiertos': { key: 'count', text: ['{count} abierto', '{count} open', '{count} ouvert'] },
  '{count} asistentes': { key: 'count', text: ['{count} asistente', '{count} attendee', '{count} participant'] },
  '{days} días': { key: 'days', text: ['{days} día', '{days} day', '{days} jour'] },
  '{count} actividades ya finalizaron y continúan abiertas.': { key: 'count', text: ['{count} actividad ya finalizó y continúa abierta.', '{count} activity has ended but remains open.', '{count} activité est terminée mais reste ouverte.'] },
  '{count} conflictos todavía requieren resolución de la junta.': { key: 'count', text: ['{count} conflicto todavía requiere resolución de la junta.', '{count} conflict still requires a board decision.', '{count} conflit nécessite encore une décision du conseil.'] },
  'Las actividades se registran con {days} días de anticipación en promedio.': { key: 'days', text: ['Las actividades se registran con {days} día de anticipación en promedio.', 'Activities are registered an average of {days} day in advance.', 'Les activités sont enregistrées en moyenne {days} jour à l’avance.'] },
  'La tasa de cierre cambió {change} puntos frente al período anterior.': { key: 'change', text: ['La tasa de cierre cambió {change} punto frente al período anterior.', 'The completion rate changed by {change} point compared with the previous period.', 'Le taux de réalisation a évolué de {change} point par rapport à la période précédente.'] },
  '{count} actividades sin horario; no se cuentan como planificadas.': { key: 'count', text: ['{count} actividad sin horario; no se cuenta como planificada.', '{count} activity without a schedule; not counted as planned.', '{count} activité sans horaire ; non comptée comme planifiée.'] },
  'Puntualidad observada: {rate} · {count} cierres con evidencia temporal; {unknown} sin evidencia.': { key: 'count', text: ['Puntualidad observada: {rate} · {count} cierre con evidencia temporal; {unknown} sin evidencia.', 'Observed punctuality: {rate} · {count} completion with timing evidence; {unknown} without evidence.', 'Ponctualité observée : {rate} · {count} clôture avec preuves temporelles ; {unknown} sans preuve.'] },
  'Muestra ejecutiva de {sample} de {total} actividades. El CSV contiene el detalle completo.': { key: 'total', text: ['Muestra ejecutiva de {sample} de {total} actividad. El CSV contiene el detalle completo.', 'Executive sample of {sample} of {total} activity. The CSV contains the full detail.', 'Échantillon exécutif de {sample} sur {total} activité. Le CSV contient le détail complet.'] },
};
const translations: Record<string, readonly [string, string]> = {
  '{count} conflictos': ['{count} conflicts', '{count} conflits'],
  'EVIDENCIA INSUFICIENTE': ['INSUFFICIENT EVIDENCE', 'PREUVES INSUFFISANTES'],
  'Cumplimiento estable': ['Stable completion', 'Réalisation stable'],
  'Puntualidad observada: {rate} · {count} cierres con evidencia temporal; {unknown} sin evidencia.': ['Observed punctuality: {rate} · {count} completions with timing evidence; {unknown} without evidence.', 'Ponctualité observée : {rate} · {count} clôtures avec preuves temporelles ; {unknown} sans preuve.'],
  '{count} actividades sin horario; no se cuentan como planificadas.': ['{count} activities without a schedule; not counted as planned.', '{count} activités sans horaire ; non comptées comme planifiées.'],
  'Reporte ejecutivo GestionChurch': ['GestionChurch executive report', 'Rapport exécutif GestionChurch'],
  'Continuación del reporte': ['Report continued', 'Suite du rapport'],
  'GestionChurch - Inteligencia de actividades': ['GestionChurch - Activity insights', 'GestionChurch - Analyse des activités'],
  'GESTIONCHURCH  /  INTELIGENCIA EJECUTIVA': ['GESTIONCHURCH  /  EXECUTIVE INSIGHTS', 'GESTIONCHURCH  /  ANALYSE EXÉCUTIVE'],
  'Reporte de gestión de actividades': ['Activity management report', 'Rapport de gestion des activités'],
  'Inicio histórico': ['Beginning of history', 'Début de l’historique'], 'Actualidad': ['Present', 'Aujourd’hui'],
  'ÍNDICE DE COORDINACIÓN': ['COORDINATION INDEX', 'INDICE DE COORDINATION'],
  'Resumen del período': ['Period summary', 'Résumé de la période'], 'Indicadores esenciales': ['Key indicators', 'Indicateurs essentiels'],
  'Actividades': ['Activities', 'Activités'], 'Cumplimiento': ['Completion', 'Réalisation'], 'Conflictos': ['Conflicts', 'Conflits'],
  'Vencidas': ['Overdue', 'En retard'], 'Asistencia': ['Attendance', 'Participation'], 'Anticipación': ['Lead time', 'Anticipation'],
  'Lectura ejecutiva': ['Executive overview', 'Vue exécutive'], 'Señales que requieren atención': ['Signals requiring attention', 'Signaux nécessitant une attention'],
  'Señales ejecutivas': ['Executive signals', 'Signaux exécutifs'], 'Tendencia y composición': ['Trend and composition', 'Tendance et composition'],
  'Comportamiento mensual y distribución del portafolio': ['Monthly trends and portfolio distribution', 'Tendances mensuelles et répartition du portefeuille'],
  'Evolución mensual': ['Monthly evolution', 'Évolution mensuelle'], 'Planificación, cierres y conflictos': ['Planning, completion and conflicts', 'Planification, clôtures et conflits'],
  'Planificadas': ['Planned', 'Planifiées'], 'Completadas': ['Completed', 'Terminées'], 'Con conflicto': ['With conflicts', 'Avec conflits'],
  'Rendimiento ministerial': ['Ministry performance', 'Performance des ministères'], 'Resultados por departamento': ['Department results', 'Résultats par département'],
  '{count} actividades': ['{count} activities', '{count} activités'], '{conflicts} conflictos / {overdue} vencidas': ['{conflicts} conflicts / {overdue} overdue', '{conflicts} conflits / {overdue} en retard'],
  'Detalle auditable': ['Auditable detail', 'Détail vérifiable'],
  'Muestra ejecutiva de {sample} de {total} actividades. El CSV contiene el detalle completo.': ['Executive sample of {sample} of {total} activities. The CSV contains the full detail.', 'Échantillon exécutif de {sample} sur {total} activités. Le CSV contient le détail complet.'],
  'Código': ['Code', 'Code'], 'Actividad': ['Activity', 'Activité'], 'Departamento': ['Department', 'Département'], 'Estado': ['Status', 'État'], 'Fecha': ['Date', 'Date'],
  'Responsable': ['Responsible person', 'Responsable'], 'Inicio': ['Start', 'Début'], 'Fin': ['End', 'Fin'], 'Lugar': ['Location', 'Lieu'],
  'Asistencia estimada': ['Estimated attendance', 'Participation estimée'], 'Anticipación (días)': ['Lead time (days)', 'Anticipation (jours)'], 'Riesgo': ['Risk', 'Risque'],
  'Continuación del listado de actividades': ['Activity list continued', 'Suite de la liste des activités'], 'Sin fecha': ['No date', 'Sans date'],
  'Conflicto abierto': ['Open conflict', 'Conflit ouvert'], '{count} asistentes': ['{count} attendees', '{count} participants'],
  'Generado': ['Generated', 'Généré'], 'Página {page} de {total}': ['Page {page} of {total}', 'Page {page} sur {total}'],
  'Cierres que requieren intervención': ['Completion requiring intervention', 'Clôtures nécessitant une intervention'],
  '{count} actividades ya finalizaron y continúan abiertas.': ['{count} activities have ended but remain open.', '{count} activités sont terminées mais restent ouvertes.'],
  '{count} vencidas': ['{count} overdue', '{count} en retard'], 'Coordinación pendiente': ['Pending coordination', 'Coordination en attente'],
  '{count} conflictos todavía requieren resolución de la junta.': ['{count} conflicts still require a board decision.', '{count} conflits nécessitent encore une décision du conseil.'],
  '{count} abiertos': ['{count} open', '{count} ouverts'], 'Mejora de cumplimiento': ['Improved completion', 'Amélioration de la réalisation'],
  'Cumplimiento bajo presión': ['Completion under pressure', 'Réalisation sous pression'],
  'La tasa de cierre cambió {change} puntos frente al período anterior.': ['The completion rate changed by {change} points compared with the previous period.', 'Le taux de réalisation a évolué de {change} points par rapport à la période précédente.'],
  'Departamento destacado': ['Leading department', 'Département remarquable'],
  '{name} lidera el período con {rate}% de cumplimiento.': ['{name} leads the period with {rate}% completion.', '{name} mène la période avec {rate}% de réalisation.'],
  'Anticipación de planificación': ['Planning lead time', 'Anticipation de la planification'],
  'Las actividades se registran con {days} días de anticipación en promedio.': ['Activities are registered an average of {days} days in advance.', 'Les activités sont enregistrées en moyenne {days} jours à l’avance.'],
  '{days} días': ['{days} days', '{days} jours'], 'Período en aprendizaje': ['Learning period', 'Période d’apprentissage'],
  'A medida que se registren actividades aparecerán señales operativas accionables.': ['Actionable operational signals will appear as activities are registered.', 'Des signaux opérationnels exploitables apparaîtront au fur et à mesure de l’enregistrement des activités.'],
  'Sin muestra': ['No sample', 'Aucun échantillon'],
  'Borrador': ['Draft', 'Brouillon'], 'Por aprobar': ['Awaiting approval', 'En attente d’approbation'], 'En revisión': ['Under review', 'En révision'],
  'Requiere cambios': ['Changes requested', 'Modifications demandées'], 'Aprobada': ['Approved', 'Approuvée'], 'Rechazada': ['Rejected', 'Rejetée'], 'Cancelada': ['Cancelled', 'Annulée'], 'Completada': ['Completed', 'Terminée'],
  'Alto': ['High', 'Élevé'], 'Seguimiento': ['Watch', 'À surveiller'], 'Saludable': ['Healthy', 'Sain'],
};
export function reportText(locale: ReportLocale, source: string, values: Record<string, string | number> = {}): string {
  if (source === '{conflicts} conflictos / {overdue} vencidas') {
    return `${reportText(locale, '{count} conflictos', { count: values.conflicts ?? '{conflicts}' })} / ${reportText(locale, '{count} vencidas', { count: values.overdue ?? '{overdue}' })}`;
  }
  const singular = singularTemplates[source];
  const count = singular ? values[singular.key] : undefined;
  const useSingular = typeof count === 'number' && new Intl.PluralRules(intlLocales[locale]).select(Math.abs(count)) === 'one';
  const translated = useSingular && singular ? singular.text[locale === 'es' ? 0 : locale === 'en' ? 1 : 2] : locale === 'es' ? source : translations[source]?.[locale === 'en' ? 0 : 1] ?? source;
  return translated.replace(/\{([a-z]+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    return typeof value === 'number' ? formatReportNumber(locale, value, key === 'change') : value ?? placeholder;
  });
}
export function reportStatus(locale: ReportLocale, status: string): string {
  const source = ({ DRAFT: 'Borrador', SUBMITTED: 'Por aprobar', UNDER_REVIEW: 'En revisión', CHANGES_REQUESTED: 'Requiere cambios', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', COMPLETED: 'Completada', HIGH: 'Alto', WATCH: 'Seguimiento', HEALTHY: 'Saludable' } as Record<string, string>)[status];
  return source ? reportText(locale, source) : status;
}
export function assertReportTimezone(timezone: string): void {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date()); }
  catch { throw Object.assign(new Error('La zona horaria del tenant no está configurada correctamente.'), { status: 503, code: 'TENANT_TIMEZONE_INVALID' }); }
}
export function formatReportDate(value: Date | null, locale: ReportLocale, timezone: string, dateOnly = false): string {
  return value ? new Intl.DateTimeFormat(({ es: 'es-BO', en: 'en-US', fr: 'fr-FR' } as const)[locale], { dateStyle: 'short', ...(dateOnly ? {} : { timeStyle: 'short' }), timeZone: timezone }).format(value) : reportText(locale, 'Sin fecha');
}
