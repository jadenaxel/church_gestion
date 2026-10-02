import 'reflect-metadata';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import PDFDocument from 'pdfkit';
import { Controller, Get, Module, Query, Req, Res } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import type { AuthPrincipal } from '@gc/contracts';
import { tenantPoolFromId } from '@gc/database';
import { activityReadPredicate, bootstrapNest, currentUser, HEALTH_RESPONSE, JwtAuthGuard, Public, requirePermission, safeCsvCell } from '@gc/platform';
import { assertReportTimezone, formatReportDate, formatReportMonth, formatReportNumber, reportStatus, reportText, type ReportLocale } from './localization.js';
import { completionTimingEvidence, reportMonthKey } from './report-evidence.js';
import { reportLabelFontSize, reportTrendBars } from './pdf-trend.js';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_reports_service';

const activityStatuses = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'] as const;
const reportFilterSchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  departmentId: z.uuid().optional(),
  status: z.enum(activityStatuses).optional(),
  lang: z.enum(['es', 'en', 'fr']).default('es')
}).superRefine((value, context) => {
  if (value.from && value.to && new Date(value.to) <= new Date(value.from)) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'La fecha final debe ser posterior a la inicial.' });
  }
});

const auditFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  action: z.string().trim().max(240).optional(),
  resourceType: z.string().trim().max(100).optional(),
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

type AuditFilters = z.infer<typeof auditFilterSchema>;

function auditWhere(filters: AuditFilters): { sql: string; values: Array<string | null> } {
  const values = [
    filters.search || null,
    filters.action || null,
    filters.resourceType || null,
    filters.outcome || null,
    filters.from ?? null,
    filters.to ?? null
  ];
  return {
    values,
    sql: `
      WHERE ($1::text IS NULL OR ae.action ILIKE '%' || $1 || '%' OR ae.resource_type ILIKE '%' || $1 || '%'
        OR COALESCE(ae.resource_id,'') ILIKE '%' || $1 || '%' OR COALESCE(ae.reason,'') ILIKE '%' || $1 || '%'
        OR COALESCE(u.name,'') ILIKE '%' || $1 || '%' OR COALESCE(u.email,'') ILIKE '%' || $1 || '%'
        OR COALESCE(ae.correlation_id,'') ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR ae.action=$2)
        AND ($3::text IS NULL OR ae.resource_type=$3)
        AND ($4::text IS NULL OR COALESCE(ae.after_data->>'outcome','SUCCESS')=$4
          OR ($4='EXCEPTIONS' AND COALESCE(ae.after_data->>'outcome','SUCCESS') IN ('REJECTED','FAILED')))
        AND ($5::timestamptz IS NULL OR ae.created_at >= $5::timestamptz)
        AND ($6::timestamptz IS NULL OR ae.created_at < $6::timestamptz)`
  };
}

async function recordAuditRead(pool: Pool, actorId: string, action: string, correlationId: string | null, details: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO audit.audit_events(actor_id,action,resource_type,after_data,correlation_id)
     VALUES($1,$2,'audit_log',$3::jsonb,$4)`,
    [actorId, action, JSON.stringify({ ...details, outcome: 'SUCCESS' }), correlationId]
  );
}

type ReportFilters = z.infer<typeof reportFilterSchema>;
type ReportRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  department_id: string;
  department: string;
  color: string;
  venue: string | null;
  responsible_name: string;
  estimated_attendance: number;
  created_at: Date;
  starts_at: Date | null;
  ends_at: Date | null;
  submitted_at: Date | null;
  approved_at: Date | null;
  completed_at: Date | null;
  had_conflict: boolean;
  open_conflict: boolean;
  conflict_count: number;
};

const reportRowsSql = (user: AuthPrincipal) => `
  WITH report_rows AS (
    SELECT a.id,a.code,a.title,a.status,a.department_id,d.name department,d.color,
           v.name venue,a.responsible_name,a.estimated_attendance,a.created_at,
           schedule.starts_at,schedule.ends_at,
           (SELECT min(ae.created_at) FROM audit.audit_events ae
             WHERE ae.resource_type='activity' AND ae.resource_id=a.id::text AND ae.action='activity.submitted') submitted_at,
           (SELECT min(ae.created_at) FROM audit.audit_events ae
             WHERE ae.resource_type='activity' AND ae.resource_id=a.id::text AND ae.action IN ('activity.approved','review.decided')) approved_at,
           (SELECT min(ae.created_at) FROM audit.audit_events ae
             WHERE ae.resource_type='activity' AND ae.resource_id=a.id::text AND ae.action='activity.completed') completed_at,
           EXISTS(SELECT 1 FROM calendar.conflict_cases cc WHERE cc.activity_id=a.id) had_conflict,
           EXISTS(SELECT 1 FROM calendar.conflict_cases cc WHERE cc.activity_id=a.id AND cc.status IN ('OPEN','REVIEW_REQUESTED')) open_conflict,
           (SELECT count(*)::int FROM calendar.conflict_cases cc WHERE cc.activity_id=a.id) conflict_count
      FROM calendar.activities a
      JOIN calendar.departments d ON d.id=a.department_id
      LEFT JOIN calendar.venues v ON v.id=a.venue_id
      LEFT JOIN LATERAL (
        SELECT min(s.starts_at) starts_at,max(s.ends_at) ends_at
          FROM calendar.schedule_options o
          JOIN calendar.schedule_sessions s ON s.option_id=o.id
         WHERE o.activity_id=a.id AND (o.is_selected OR o.status<>'RELEASED')
      ) schedule ON true
     WHERE a.status<>'ARCHIVED' AND ${activityReadPredicate(user)}
  )
  SELECT * FROM report_rows
   WHERE ($1::timestamptz IS NULL OR COALESCE(starts_at,created_at)>=$1::timestamptz)
     AND ($2::timestamptz IS NULL OR COALESCE(starts_at,created_at)<$2::timestamptz)
     AND ($3::uuid IS NULL OR department_id=$3::uuid)
     AND ($4::text IS NULL OR status=$4::text)
   ORDER BY COALESCE(starts_at,created_at) DESC,created_at DESC`;

function queryValues(filters: ReportFilters): Array<string | null> {
  return [filters.from ?? null, filters.to ?? null, filters.departmentId ?? null, filters.status ?? null];
}

async function poolFor(user: AuthPrincipal): Promise<Pool> {
  if (user.scope !== 'tenant' || !user.tenantId) throw Object.assign(new Error('Se requiere un tenant.'), { status: 403 });
  return (await tenantPoolFromId(user.tenantId)).pool;
}

function percentage(part: number, total: number): number {
  return total > 0 ? Math.round(part / total * 100) : 0;
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
}

function summarize(rows: ReportRow[]) {
  const now = new Date();
  const operational = rows.filter((row) => !['CANCELLED', 'REJECTED'].includes(row.status));
  const completed = rows.filter((row) => row.status === 'COMPLETED');
  const overdueRows = rows.filter((row) => row.status === 'APPROVED' && row.ends_at && row.ends_at < now);
  const conflicted = rows.filter((row) => row.had_conflict);
  const openConflicts = rows.filter((row) => row.open_conflict);
  const pending = rows.filter((row) => ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'].includes(row.status));
  const closedEligible = rows.filter((row) => row.status === 'COMPLETED' || (row.status === 'APPROVED' && row.ends_at && row.ends_at < now));
  const timingEvidence = completionTimingEvidence(rows);
  const leadDays = rows
    .filter((row) => row.starts_at)
    .map((row) => Math.max(0, (row.starts_at!.getTime() - row.created_at.getTime()) / 86_400_000));
  const approvalHours = rows
    .filter((row) => row.approved_at)
    .map((row) => Math.max(0, (row.approved_at!.getTime() - row.created_at.getTime()) / 3_600_000));
  const completionRate = percentage(completed.length, closedEligible.length || operational.length);
  const conflictRate = percentage(conflicted.length, operational.length);
  const overdueRate = percentage(overdueRows.length, closedEligible.length || operational.length);
  const coordinationScore = Math.max(0, Math.min(100, Math.round(100 - conflictRate * 0.35 - overdueRate * 0.45 - percentage(pending.length, operational.length) * 0.2)));
  const coordinationSample = operational.filter((row) => row.status !== 'DRAFT' && row.starts_at && row.ends_at).length;
  return {
    total: rows.length,
    operational: operational.length,
    completed: completed.length,
    approved: rows.filter((row) => row.status === 'APPROVED').length,
    pending: pending.length,
    drafts: rows.filter((row) => row.status === 'DRAFT').length,
    cancelled: rows.filter((row) => row.status === 'CANCELLED').length,
    overdue: overdueRows.length,
    conflicts: conflicted.length,
    openConflicts: openConflicts.length,
    estimatedAttendance: rows.reduce((sum, row) => sum + Number(row.estimated_attendance ?? 0), 0),
    completionRate,
    conflictRate,
    overdueRate,
    ...timingEvidence,
    averageLeadDays: average(leadDays),
    averageApprovalHours: average(approvalHours),
    // Legacy numeric score remains compatible; consumers must use evidence
    // metadata before presenting it as a meaningful operational signal.
    coordinationScore,
    coordinationEvidence: { sampleSize: coordinationSample, level: coordinationSample < 3 ? 'INSUFFICIENT_HISTORY' as const : 'LIMITED_HISTORY' as const, calibrated: false, method: 'RULE_BASED_HEURISTIC' }
  };
}

function aggregate(rows: ReportRow[], timezone: string) {
  const statusMap = new Map<string, number>();
  const trendMap = new Map<string, { month: string; planned: number; completed: number; conflicts: number; overdue: number; attendance: number; unscheduled: number }>();
  const departmentMap = new Map<string, {
    id: string; name: string; color: string; total: number; completed: number; conflicts: number; overdue: number; attendance: number; leadDays: number[];
  }>();
  const now = new Date();
  for (const row of rows) {
    statusMap.set(row.status, (statusMap.get(row.status) ?? 0) + 1);
    const date = row.starts_at ?? row.created_at;
    const month = reportMonthKey(date, timezone);
    const trend = trendMap.get(month) ?? { month, planned: 0, completed: 0, conflicts: 0, overdue: 0, attendance: 0, unscheduled: 0 };
    trend.planned += row.starts_at ? 1 : 0;
    trend.unscheduled += row.starts_at ? 0 : 1;
    trend.completed += row.status === 'COMPLETED' ? 1 : 0;
    trend.conflicts += row.had_conflict ? 1 : 0;
    trend.overdue += row.status === 'APPROVED' && row.ends_at && row.ends_at < now ? 1 : 0;
    trend.attendance += Number(row.estimated_attendance ?? 0);
    trendMap.set(month, trend);
    const department = departmentMap.get(row.department_id) ?? {
      id: row.department_id, name: row.department, color: row.color, total: 0, completed: 0, conflicts: 0, overdue: 0, attendance: 0, leadDays: []
    };
    department.total += 1;
    department.completed += row.status === 'COMPLETED' ? 1 : 0;
    department.conflicts += row.had_conflict ? 1 : 0;
    department.overdue += row.status === 'APPROVED' && row.ends_at && row.ends_at < now ? 1 : 0;
    department.attendance += Number(row.estimated_attendance ?? 0);
    if (row.starts_at) department.leadDays.push(Math.max(0, (row.starts_at.getTime() - row.created_at.getTime()) / 86_400_000));
    departmentMap.set(row.department_id, department);
  }
  const statuses = [...statusMap.entries()].map(([status, count]) => ({ status, count, percentage: percentage(count, rows.length) })).sort((a, b) => b.count - a.count);
  const departments = [...departmentMap.values()].map(({ leadDays, ...item }) => ({
    ...item,
    completionRate: percentage(item.completed, item.total),
    conflictRate: percentage(item.conflicts, item.total),
    averageLeadDays: average(leadDays)
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { statuses, trend: [...trendMap.values()].sort((a, b) => a.month.localeCompare(b.month)), departments };
}

function delta(current: number, previous: number): number {
  return Math.round((current - previous) * 10) / 10;
}

function previousPeriod(filters: ReportFilters): ReportFilters | null {
  if (!filters.from || !filters.to) return null;
  const from = new Date(filters.from);
  const to = new Date(filters.to);
  const duration = to.getTime() - from.getTime();
  if (duration <= 0) return null;
  return { ...filters, from: new Date(from.getTime() - duration).toISOString(), to: from.toISOString() };
}

function publicRow(row: ReportRow) {
  const leadDays = row.starts_at ? Math.max(0, Math.round((row.starts_at.getTime() - row.created_at.getTime()) / 86_400_000)) : null;
  const approvalHours = row.approved_at ? Math.max(0, Math.round((row.approved_at.getTime() - row.created_at.getTime()) / 3_600_000)) : null;
  const risk = row.open_conflict || (row.status === 'APPROVED' && row.ends_at && row.ends_at < new Date())
    ? 'HIGH'
    : ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'].includes(row.status) ? 'WATCH' : 'HEALTHY';
  return {
    id: row.id, code: row.code, title: row.title, status: row.status, departmentId: row.department_id,
    department: row.department, color: row.color, venue: row.venue, responsibleName: row.responsible_name,
    estimatedAttendance: Number(row.estimated_attendance), createdAt: row.created_at, startsAt: row.starts_at,
    endsAt: row.ends_at, leadDays, approvalHours, hadConflict: row.had_conflict, openConflict: row.open_conflict,
    conflictCount: Number(row.conflict_count), risk
    ,hasSchedule: Boolean(row.starts_at)
  };
}

function buildInsights(summary: ReturnType<typeof summarize>, departments: ReturnType<typeof aggregate>['departments'], comparison: Record<string, number | null>, locale: ReportLocale) {
  const text = (source: string, values?: Record<string, string | number>) => reportText(locale, source, values);
  const insights: Array<{ tone: 'positive' | 'warning' | 'critical' | 'neutral'; title: string; detail: string; metric: string }> = [];
  if (summary.overdue > 0) insights.push({ tone: 'critical', title: text('Cierres que requieren intervención'), detail: text('{count} actividades ya finalizaron y continúan abiertas.', { count: summary.overdue }), metric: text('{count} vencidas', { count: summary.overdue }) });
  if (summary.openConflicts > 0) insights.push({ tone: 'warning', title: text('Coordinación pendiente'), detail: text('{count} conflictos todavía requieren resolución de la junta.', { count: summary.openConflicts }), metric: text('{count} abiertos', { count: summary.openConflicts }) });
  const completionChange = comparison.completionRate;
  if (typeof completionChange === 'number') {
    const change = completionChange;
    insights.push({ tone: change > 0 ? 'positive' : change < 0 ? 'warning' : 'neutral', title: text(change > 0 ? 'Mejora de cumplimiento' : change < 0 ? 'Cumplimiento bajo presión' : 'Cumplimiento estable'), detail: text('La tasa de cierre cambió {change} puntos frente al período anterior.', { change }), metric: `${formatReportNumber(locale, summary.completionRate)}%` });
  }
  const strongest = departments.filter((item) => item.completed > 0).sort((a, b) => b.completionRate - a.completionRate)[0];
  if (strongest) insights.push({ tone: 'positive', title: text('Departamento destacado'), detail: text('{name} lidera el período con {rate}% de cumplimiento.', { name: strongest.name, rate: strongest.completionRate }), metric: `${formatReportNumber(locale, strongest.completed)}/${formatReportNumber(locale, strongest.total)}` });
  if (summary.averageLeadDays !== null) insights.push({ tone: summary.averageLeadDays >= 14 ? 'positive' : 'neutral', title: text('Anticipación de planificación'), detail: text('Las actividades se registran con {days} días de anticipación en promedio.', { days: summary.averageLeadDays }), metric: text('{days} días', { days: summary.averageLeadDays }) });
  if (insights.length === 0) insights.push({ tone: 'neutral', title: text('Período en aprendizaje'), detail: text('A medida que se registren actividades aparecerán señales operativas accionables.'), metric: text('Sin muestra') });
  return insights.slice(0, 5);
}

async function loadReport(pool: Pool, filters: ReportFilters, user: AuthPrincipal, timezone: string) {
  const currentResult = await pool.query<ReportRow>(reportRowsSql(user), queryValues(filters));
  const rows = currentResult.rows;
  const summary = summarize(rows);
  const aggregates = aggregate(rows, timezone);
  const previousFilters = previousPeriod(filters);
  const previousRows = previousFilters ? (await pool.query<ReportRow>(reportRowsSql(user), queryValues(previousFilters))).rows : [];
  const previous = previousFilters ? summarize(previousRows) : null;
  const comparison = {
    total: previous ? delta(summary.total, previous.total) : null,
    completionRate: previous ? delta(summary.completionRate, previous.completionRate) : null,
    conflictRate: previous ? delta(summary.conflictRate, previous.conflictRate) : null,
    overdueRate: previous ? delta(summary.overdueRate, previous.overdueRate) : null,
    estimatedAttendance: previous ? delta(summary.estimatedAttendance, previous.estimatedAttendance) : null
  };
  return {
    generatedAt: new Date().toISOString(),
    locale: filters.lang,
    timezone,
    filters,
    summary,
    comparison,
    ...aggregates,
    insights: buildInsights(summary, aggregates.departments, comparison, filters.lang),
    activities: rows.map(publicRow)
  };
}

function csvCell(value: unknown): string {
  return safeCsvCell(value);
}

function drawExecutivePdf(document: PDFKit.PDFDocument, report: Awaited<ReturnType<typeof loadReport>>) {
  const text = (source: string, values?: Record<string, string | number>) => reportText(report.locale, source, values);
  const date = (value: Date | null, dateOnly = false) => formatReportDate(value, report.locale, report.timezone, dateOnly);
  const green = '#0B5D52';
  const teal = '#16877A';
  const ink = '#172B27';
  const muted = '#687B75';
  const line = '#DCE7E3';
  const amber = '#C78618';
  const red = '#C94848';
  const pageWidth = 595.28;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;

  const addPage = (title: string, subtitle: string) => {
    document.addPage();
    document.fillColor(green).font('Helvetica-Bold').fontSize(17).text(title, margin, 36);
    document.fillColor(muted).font('Helvetica').fontSize(8).text(subtitle, margin, 59);
    document.moveTo(margin, 77).lineTo(pageWidth - margin, 77).strokeColor(line).lineWidth(1).stroke();
    document.y = 94;
  };
  const ensure = (height: number, title = text('Continuación del reporte')) => {
    if (document.y + height > 770) addPage(title, text('GestionChurch - Inteligencia de actividades'));
  };
  const sectionTitle = (eyebrow: string, title: string) => {
    ensure(42);
    document.fillColor(teal).font('Helvetica-Bold').fontSize(7).text(eyebrow.toUpperCase(), margin, document.y, { characterSpacing: 1.2 });
    document.moveDown(0.35).fillColor(ink).fontSize(14).text(title);
    document.moveDown(0.8);
  };

  document.rect(0, 0, pageWidth, 210).fill(green);
  document.fillColor('#AEE2D7').font('Helvetica-Bold').fontSize(8).text(text('GESTIONCHURCH  /  INTELIGENCIA EJECUTIVA'), margin, 38, { characterSpacing: 1.2 });
  document.fillColor('#FFFFFF').fontSize(28).text(text('Reporte de gestión de actividades'), margin, 62, { width: 410 });
  const from = report.filters.from ? date(new Date(report.filters.from), true) : text('Inicio histórico');
  const to = report.filters.to ? date(new Date(report.filters.to), true) : text('Actualidad');
  document.fillColor('#D8EEE9').font('Helvetica').fontSize(10).text(`${from} - ${to}`, margin, 137);
  document.roundedRect(pageWidth - 150, 46, 108, 108, 18).fill('#FFFFFF');
  const hasCoordinationEvidence = report.summary.coordinationEvidence.level !== 'INSUFFICIENT_HISTORY';
  document.fillColor(green).font('Helvetica-Bold').fontSize(31).text(hasCoordinationEvidence ? String(report.summary.coordinationScore) : '—', pageWidth - 150, 72, { width: 108, align: 'center' });
  document.fillColor(muted).fontSize(7).text(text(hasCoordinationEvidence ? 'ÍNDICE DE COORDINACIÓN' : 'EVIDENCIA INSUFICIENTE'), pageWidth - 140, 112, { width: 88, align: 'center' });
  document.y = 237;
  sectionTitle(text('Resumen del período'), text('Indicadores esenciales'));
  const cards = [
    [text('Actividades'), report.summary.total, green],
    [text('Cumplimiento'), `${report.summary.completionRate}%`, teal],
    [text('Conflictos'), report.summary.conflicts, amber],
    [text('Vencidas'), report.summary.overdue, red],
    [text('Asistencia'), report.summary.estimatedAttendance, '#6D48C7'],
    [text('Anticipación'), report.summary.averageLeadDays === null ? '-' : text('{days} días', { days: report.summary.averageLeadDays }), '#2871CC']
  ] as const;
  const cardsY = document.y;
  cards.forEach(([label, value, color], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const width = (contentWidth - 20) / 3;
    const x = margin + column * (width + 10);
    const y = cardsY + row * 75;
    document.roundedRect(x, y, width, 63, 10).fill('#F4F8F7');
    document.rect(x, y, 4, 63).fill(color);
    document.fillColor(muted).font('Helvetica-Bold').fontSize(7).text(label.toUpperCase(), x + 14, y + 13, { characterSpacing: 0.6 });
    document.fillColor(ink).fontSize(19).text(typeof value === 'number' ? formatReportNumber(report.locale, value) : value, x + 14, y + 29);
  });
  document.y = cardsY + 158;
  document.fillColor(muted).font('Helvetica').fontSize(7).text(text('Puntualidad observada: {rate} · {count} cierres con evidencia temporal; {unknown} sin evidencia.', { rate: report.summary.onTimeEvidence.sampleSize ? `${report.summary.onTimeRate}%` : '—', count: report.summary.onTimeEvidence.sampleSize, unknown: report.summary.onTimeEvidence.untimedCompleted }), margin, document.y, { width: contentWidth }).moveDown();
  sectionTitle(text('Lectura ejecutiva'), text('Señales que requieren atención'));
  for (const insight of report.insights) {
    ensure(48, text('Señales ejecutivas'));
    const y = document.y;
    const color = insight.tone === 'critical' ? red : insight.tone === 'warning' ? amber : insight.tone === 'positive' ? teal : muted;
    document.circle(margin + 6, y + 8, 4).fill(color);
    document.fillColor(ink).font('Helvetica-Bold').fontSize(9).text(insight.title, margin + 18, y + 1, { width: 320 });
    document.fillColor(color).fontSize(8).text(insight.metric, pageWidth - 145, y + 1, { width: 100, align: 'right' });
    document.fillColor(muted).font('Helvetica').fontSize(8).text(insight.detail, margin + 18, y + 15, { width: 430 });
    document.y = y + 40;
  }

  addPage(text('Tendencia y composición'), text('Comportamiento mensual y distribución del portafolio'));
  sectionTitle(text('Evolución mensual'), text('Planificación, cierres y conflictos'));
  const chartX = margin;
  const chartY = document.y;
  const chartH = 150;
  const chartW = contentWidth;
  const maxTrend = Math.max(...report.trend.flatMap((item) => [item.planned, item.completed, item.conflicts]), 1);
  document.moveTo(chartX, chartY + chartH).lineTo(chartX + chartW, chartY + chartH).strokeColor(line).stroke();
  report.trend.forEach((item, index) => {
    const slot = chartW / Math.max(report.trend.length, 1);
    const barWidth = Math.min(14, slot / 4);
    const center = chartX + slot * index + slot / 2;
    for (const bar of reportTrendBars(item, center, barWidth, chartY, chartH, maxTrend)) {
      if (bar.height <= 0) continue;
      document.roundedRect(bar.x, bar.y, barWidth, bar.height, 2).fill(({ planned: '#B9DCD4', completed: teal, conflicts: amber } as const)[bar.key]);
      const label = formatReportNumber(report.locale, bar.value);
      document.fillColor(ink).font('Helvetica').fontSize(6);
      const size = reportLabelFontSize(6, barWidth, document.widthOfString(label));
      document.fontSize(size).text(label, bar.x, bar.labelY, { width: barWidth, align: 'center', lineBreak: false });
    }
    const month = formatReportMonth(report.locale, item.month);
    document.fillColor(muted).font('Helvetica').fontSize(6);
    const monthSize = reportLabelFontSize(6, slot, document.widthOfString(month));
    document.fontSize(monthSize).text(month, center - slot / 2, chartY + chartH + 7, { width: slot, align: 'center', lineBreak: false });
  });
  document.y = chartY + chartH + 30;
  const legendY = document.y;
  document.fillColor(muted).fontSize(7).text(text('Planificadas'), margin + 14, legendY);
  document.rect(margin, legendY + 1, 8, 8).fill('#B9DCD4');
  document.fillColor(muted).text(text('Completadas'), margin + 114, legendY);
  document.rect(margin + 100, legendY + 1, 8, 8).fill(teal);
  document.fillColor(muted).text(text('Con conflicto'), margin + 218, legendY);
  document.rect(margin + 204, legendY + 1, 8, 8).fill(amber);
  document.y = legendY + 33;
  const unscheduled = report.trend.reduce((sum, item) => sum + item.unscheduled, 0);
  if (unscheduled) document.fillColor(muted).fontSize(7).text(text('{count} actividades sin horario; no se cuentan como planificadas.', { count: unscheduled }), margin, document.y, { width: contentWidth }).moveDown();
  sectionTitle(text('Rendimiento ministerial'), text('Resultados por departamento'));
  for (const department of report.departments.slice(0, 10)) {
    ensure(41, text('Rendimiento ministerial'));
    const y = document.y;
    document.fillColor(ink).font('Helvetica-Bold').fontSize(8).text(department.name, margin, y, { width: 170 });
    document.fillColor(muted).font('Helvetica').fontSize(7).text(text('{count} actividades', { count: department.total }), margin, y + 13);
    document.roundedRect(margin + 190, y + 4, 210, 7, 4).fill('#E9F0EE');
    document.roundedRect(margin + 190, y + 4, Math.max(4, 210 * department.completionRate / 100), 7, 4).fill(department.color || teal);
    document.fillColor(ink).font('Helvetica-Bold').fontSize(8).text(`${department.completionRate}%`, margin + 410, y + 2, { width: 45, align: 'right' });
    document.fillColor(department.overdue ? red : muted).font('Helvetica').fontSize(7).text(text('{conflicts} conflictos / {overdue} vencidas', { conflicts: department.conflicts, overdue: department.overdue }), margin + 300, y + 17, { width: 155, align: 'right' });
    document.y = y + 36;
  }

  const executiveActivities = report.activities.slice(0, 100);
  addPage(text('Detalle auditable'), text('Muestra ejecutiva de {sample} de {total} actividades. El CSV contiene el detalle completo.', { sample: executiveActivities.length, total: report.activities.length }));
  const columns = { code: margin, activity: margin + 57, department: margin + 247, status: margin + 355, date: margin + 432 };
  const header = () => {
    const y = document.y;
    document.rect(margin, y, contentWidth, 24).fill('#EAF4F1');
    document.fillColor(green).font('Helvetica-Bold').fontSize(7);
    document.text(text('Código').toUpperCase(), columns.code + 5, y + 8);
    document.text(text('Actividad').toUpperCase(), columns.activity + 5, y + 8);
    document.text(text('Departamento').toUpperCase(), columns.department + 5, y + 8);
    document.text(text('Estado').toUpperCase(), columns.status + 5, y + 8);
    document.text(text('Fecha').toUpperCase(), columns.date + 5, y + 8);
    document.y = y + 28;
  };
  header();
  for (const activity of executiveActivities) {
    if (document.y + 34 > 770) {
      addPage(text('Detalle auditable'), text('Continuación del listado de actividades'));
      header();
    }
    const y = document.y;
    document.fillColor(ink).font('Helvetica-Bold').fontSize(7).text(activity.code, columns.code + 5, y + 5, { width: 52 });
    document.text(activity.title, columns.activity + 5, y + 5, { width: 180, ellipsis: true });
    document.fillColor(muted).font('Helvetica').text(activity.department, columns.department + 5, y + 5, { width: 100, ellipsis: true });
    document.text(reportStatus(report.locale, activity.status), columns.status + 5, y + 5, { width: 70 });
    document.text(date(activity.startsAt ? new Date(activity.startsAt) : null, true), columns.date + 5, y + 5, { width: 72 });
    document.fillColor(activity.openConflict ? red : muted).fontSize(6).text(activity.openConflict ? text('Conflicto abierto') : text('{count} asistentes', { count: activity.estimatedAttendance }), columns.activity + 5, y + 18, { width: 180 });
    document.moveTo(margin, y + 30).lineTo(pageWidth - margin, y + 30).strokeColor('#EDF2F0').stroke();
    document.y = y + 32;
  }

  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    document.fillColor('#7A8B86').font('Helvetica').fontSize(7).text(
      `GestionChurch  /  ${text('Generado')} ${date(new Date(report.generatedAt))}`,
      margin, 788, { width: 370, lineBreak: false }
    );
    document.text(text('Página {page} de {total}', { page: page + 1, total: range.count }), pageWidth - 145, 788, { width: 100, align: 'right', lineBreak: false });
  }
}

@Controller()
class ReportsController {
  @Get('health/live')
  @Public()
  live() { return HEALTH_RESPONSE; }

  @Get('reports/overview')
  async overview(@Req() request: Request & { user?: AuthPrincipal }, @Query() query: Record<string, string | undefined>) {
    const user = currentUser(request);
    requirePermission(user, 'reports.read');
    const filters = reportFilterSchema.parse(query);
    const { pool, tenant } = await tenantPoolFromId(user.tenantId!);
    assertReportTimezone(tenant.timezone);
    return loadReport(pool, filters, user, tenant.timezone);
  }

  @Get('reports/activities.csv')
  async csv(
    @Req() request: Request & { user?: AuthPrincipal },
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response
  ) {
    const user = currentUser(request);
    requirePermission(user, 'reports.export');
    const filters = reportFilterSchema.parse(query);
    const { pool, tenant } = await tenantPoolFromId(user.tenantId!);
    assertReportTimezone(tenant.timezone);
    const result = await pool.query<ReportRow>(reportRowsSql(user), queryValues(filters));
    const format = (value: Date | null) => value ? formatReportDate(value, filters.lang, tenant.timezone) : '';
    const lines = [
      ['Código','Actividad','Departamento','Responsable','Estado','Inicio','Fin','Lugar','Asistencia estimada','Anticipación (días)','Conflictos','Riesgo'].map((label) => csvCell(reportText(filters.lang, label))).join(','),
      ...result.rows.map((row) => {
        const activity = publicRow(row);
        return [activity.code,activity.title,activity.department,activity.responsibleName,reportStatus(filters.lang, activity.status),format(row.starts_at),format(row.ends_at),activity.venue,activity.estimatedAttendance,activity.leadDays,activity.conflictCount,reportStatus(filters.lang, activity.risk)].map(csvCell).join(',');
      })
    ];
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader('content-disposition', `attachment; filename="reporte-actividades-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(`\uFEFF${lines.join('\r\n')}`);
  }

  @Get('reports/executive.pdf')
  async pdf(@Req() request: Request & { user?: AuthPrincipal }, @Query() query: Record<string, string | undefined>, @Res() response: Response) {
    const user = currentUser(request);
    requirePermission(user, 'reports.export');
    const filters = reportFilterSchema.parse(query);
    const { pool, tenant } = await tenantPoolFromId(user.tenantId!);
    assertReportTimezone(tenant.timezone);
    const report = await loadReport(pool, filters, user, tenant.timezone);
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('content-disposition', `attachment; filename="reporte-ejecutivo-${new Date().toISOString().slice(0, 10)}.pdf"`);
    const document = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: reportText(filters.lang, 'Reporte ejecutivo GestionChurch'), Author: 'GestionChurch' } });
    document.pipe(response);
    drawExecutivePdf(document, report);
    document.end();
  }

  @Get('audit/events')
  async auditEvents(
    @Req() request: Request & { user?: AuthPrincipal },
    @Query() query: Record<string, string | undefined>
  ) {
    const user = currentUser(request);
    requirePermission(user, 'audit.read');
    const filters = auditFilterSchema.parse(query);
    const pool = await poolFor(user);
    const where = auditWhere(filters);
    const offset = (filters.page - 1) * filters.pageSize;
    const [events, count, summary, actions, resources] = await Promise.all([
      pool.query(
        `SELECT ae.id,ae.actor_id,COALESCE(u.name,'Sistema') actor_name,u.email actor_email,
                ae.action,ae.resource_type,ae.resource_id,ae.before_data,ae.after_data,ae.reason,
                ae.correlation_id,ae.created_at,COALESCE(ae.after_data->>'outcome','SUCCESS') outcome
           FROM audit.audit_events ae
           LEFT JOIN identity.users u ON u.id=ae.actor_id
           ${where.sql}
          ORDER BY ae.created_at DESC,ae.id DESC LIMIT $7 OFFSET $8`,
        [...where.values, filters.pageSize, offset]
      ),
      pool.query<{ total: string }>(
        `SELECT count(*)::text total FROM audit.audit_events ae LEFT JOIN identity.users u ON u.id=ae.actor_id ${where.sql}`,
        where.values
      ),
      pool.query<{
        total: string; today: string; last_seven_days: string; exceptions: string; unique_actors: string; last_event_at: Date | null;
      }>(
        `SELECT count(*)::text total,
                count(*) FILTER (WHERE ae.created_at>=date_trunc('day',now()))::text today,
                count(*) FILTER (WHERE ae.created_at>=now()-interval '7 days')::text last_seven_days,
                count(*) FILTER (WHERE COALESCE(ae.after_data->>'outcome','SUCCESS') IN ('REJECTED','FAILED'))::text exceptions,
                count(DISTINCT ae.actor_id)::text unique_actors,max(ae.created_at) last_event_at
           FROM audit.audit_events ae LEFT JOIN identity.users u ON u.id=ae.actor_id ${where.sql}`,
        where.values
      ),
      pool.query<{ action: string; count: string }>(
        `SELECT ae.action,count(*)::text count FROM audit.audit_events ae LEFT JOIN identity.users u ON u.id=ae.actor_id
          ${where.sql} GROUP BY ae.action ORDER BY count(*) DESC,ae.action LIMIT 12`, where.values
      ),
      pool.query<{ resource_type: string; count: string }>(
        `SELECT ae.resource_type,count(*)::text count FROM audit.audit_events ae LEFT JOIN identity.users u ON u.id=ae.actor_id
          ${where.sql} GROUP BY ae.resource_type ORDER BY count(*) DESC,ae.resource_type LIMIT 12`, where.values
      )
    ]);
    const total = Number(count.rows[0]?.total ?? 0);
    const totals = summary.rows[0];
    await recordAuditRead(
      pool,
      user.sub,
      'audit.events.viewed',
      typeof request.headers['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : null,
      { page: filters.page, pageSize: filters.pageSize, filtered: Boolean(filters.search || filters.action || filters.resourceType || filters.outcome || filters.from || filters.to) }
    );
    return {
      items: events.rows,
      pagination: { page: filters.page, pageSize: filters.pageSize, total, pages: Math.max(1, Math.ceil(total / filters.pageSize)) },
      summary: {
        total: Number(totals?.total ?? 0), today: Number(totals?.today ?? 0),
        lastSevenDays: Number(totals?.last_seven_days ?? 0), exceptions: Number(totals?.exceptions ?? 0),
        uniqueActors: Number(totals?.unique_actors ?? 0), lastEventAt: totals?.last_event_at ?? null
      },
      facets: {
        actions: actions.rows.map((item) => ({ value: item.action, count: Number(item.count) })),
        resources: resources.rows.map((item) => ({ value: item.resource_type, count: Number(item.count) }))
      }
    };
  }

  @Get('audit/events.csv')
  async auditCsv(
    @Req() request: Request & { user?: AuthPrincipal },
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response
  ) {
    const user = currentUser(request);
    requirePermission(user, 'audit.read');
    const filters = auditFilterSchema.parse({ ...query, page: 1, pageSize: 100 });
    const pool = await poolFor(user);
    const where = auditWhere(filters);
    const result = await pool.query(
      `SELECT ae.created_at,COALESCE(u.name,'Sistema') actor,u.email,ae.action,ae.resource_type,ae.resource_id,
              COALESCE(ae.after_data->>'outcome','SUCCESS') outcome,ae.reason,ae.correlation_id
         FROM audit.audit_events ae LEFT JOIN identity.users u ON u.id=ae.actor_id ${where.sql}
        ORDER BY ae.created_at DESC,ae.id DESC LIMIT 10000`, where.values
    );
    const csvCell = safeCsvCell;
    const keys = ['created_at','actor','email','action','resource_type','resource_id','outcome','reason','correlation_id'];
    const lines = [keys.map(csvCell).join(','), ...result.rows.map((row) => keys.map((key) => csvCell(row[key])).join(','))];
    await recordAuditRead(
      pool,
      user.sub,
      'audit.events.exported',
      typeof request.headers['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : null,
      { format: 'CSV', rows: result.rowCount ?? 0 }
    );
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader('content-disposition', `attachment; filename="auditoria-gestionchurch-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(`\uFEFF${lines.join('\r\n')}`);
  }
}

@Module({ controllers: [ReportsController], providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }] })
class ReportsModule {}

await bootstrapNest(ReportsModule, Number(process.env.REPORTS_SERVICE_PORT ?? 4016), 'reports-service');
