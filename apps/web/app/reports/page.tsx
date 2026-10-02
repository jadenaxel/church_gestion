'use client';

import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Download,
  FileDown,
  Filter,
  Gauge,
  PieChart,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UsersRound,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shell } from '@/components/shell';
import { Badge, Empty, Notice, Spinner } from '@/components/ui';
import { API_URL, api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';
import { currentLocale, localeTag } from '@/lib/i18n';
import { localizedDateFormat } from '@/lib/locale-format';
import { coordinationDisplay, type CoordinationEvidence } from '@/components/coordination-evidence';
import { timelinessDisplay, type OnTimeEvidence } from '@/components/timeliness-evidence';
import { sessionRecoveredEvent } from '@/lib/session-recovery';

type Department = { id: string; name: string; color: string };
type Filters = { from: string; to: string; departmentId: string; status: string };
type Report = {
  generatedAt: string;
  summary: {
    total: number; operational: number; completed: number; approved: number; pending: number; drafts: number; cancelled: number;
    overdue: number; conflicts: number; openConflicts: number; estimatedAttendance: number; completionRate: number;
    conflictRate: number; overdueRate: number; onTimeRate: number; onTimeEvidence?: OnTimeEvidence; averageLeadDays: number | null; averageApprovalHours: number | null; coordinationScore: number; coordinationEvidence?: CoordinationEvidence;
  };
  comparison: { total: number | null; completionRate: number | null; conflictRate: number | null; overdueRate: number | null; estimatedAttendance: number | null };
  trend: Array<{ month: string; planned: number; completed: number; conflicts: number; overdue: number; attendance: number; unscheduled?: number }>;
  statuses: Array<{ status: string; count: number; percentage: number }>;
  departments: Array<{ id: string; name: string; color: string; total: number; completed: number; conflicts: number; overdue: number; attendance: number; completionRate: number; conflictRate: number; averageLeadDays: number | null }>;
  insights: Array<{ tone: 'positive' | 'warning' | 'critical' | 'neutral'; title: string; detail: string; metric: string }>;
  activities: Array<{
    id: string; code: string; title: string; status: string; departmentId: string; department: string; color: string; venue: string | null;
    responsibleName: string; estimatedAttendance: number; createdAt: string; startsAt: string | null; endsAt: string | null;
    leadDays: number | null; approvalHours: number | null; hadConflict: boolean; openConflict: boolean; conflictCount: number; risk: 'HIGH' | 'WATCH' | 'HEALTHY';
  }>;
};

const statuses = [
  ['', 'Todos los estados'], ['DRAFT', 'Borrador'], ['SUBMITTED', 'Por aprobar'], ['UNDER_REVIEW', 'En revisión'],
  ['CHANGES_REQUESTED', 'Requiere cambios'], ['APPROVED', 'Aprobada'], ['COMPLETED', 'Completada'], ['CANCELLED', 'Cancelada'], ['REJECTED', 'Rechazada']
] as const;
const statusColors: Record<string, string> = {
  COMPLETED: '#16877a', APPROVED: '#5eb89d', SUBMITTED: '#d09a2d', UNDER_REVIEW: '#8b5cf6',
  CHANGES_REQUESTED: '#df7c38', DRAFT: '#a7b7b1', CANCELLED: '#697a74', REJECTED: '#d45353'
};

function inputDate(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function initialFilters(): Filters {
  const now = new Date();
  return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31`, departmentId: '', status: '' };
}

function monthName(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(localeTag(currentLocale()), { month: 'short', year: '2-digit' }).format(new Date(year!, month! - 1, 1)).replace('.', '');
}

function reportParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set('to', new Date(new Date(`${filters.to}T00:00:00`).getTime() + 86_400_000).toISOString());
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.status) params.set('status', filters.status);
  return params;
}

function calendarHref(filters: Filters, extras: Record<string, string> = {}): string {
  const params = reportParams(filters);
  for (const [key, value] of Object.entries(extras)) params.set(key, value);
  return `/calendar?${params.toString()}`;
}

function Comparison({ value, inverse = false, suffix = '' }: { value: number | null; inverse?: boolean; suffix?: string }) {
  const { tr } = useExperience();

  if (value === null) return <span className="report-comparison neutral">{tr("Sin período comparable")}</span>;
  const positive = inverse ? value <= 0 : value >= 0;
  const Icon = value === 0 ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`report-comparison ${positive ? 'positive' : 'negative'}`}><Icon /> {value > 0 ? '+' : ''}{value}{suffix}{tr(" vs. período anterior")}</span>;
}

export default function ReportsPage() {
  const { tr, locale } = useExperience();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [draft, setDraft] = useState<Filters>(initialFilters);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | ''>('');
  const [canExport, setCanExport] = useState(false);
  const reportRequest = useRef<AbortController | null>(null);
  const coordination = coordinationDisplay(data?.summary.coordinationScore, data?.summary.coordinationEvidence);
  const timeliness = timelinessDisplay(data?.summary.onTimeRate,data?.summary.onTimeEvidence);

  const load = useCallback(async () => {
    reportRequest.current?.abort(); const controller = new AbortController(); reportRequest.current = controller;
    setLoading(true); setError('');
    try {
      const query = reportParams(filters); query.set('lang', locale);
      const result = await api<Report>(`/reports/overview?${query.toString()}`, { signal: controller.signal });
      if (!controller.signal.aborted) setData(result);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No fue posible generar el reporte.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [filters, locale]);

  useEffect(() => {
    void api<{ items: Department[] }>('/departments').then((result) => setDepartments(result.items)).catch(() => undefined);
    const refreshPermissions = () => { void api<{ user: { permissions: string[] } }>('/me').then(({ user }) => setCanExport(user.permissions.includes('reports.export'))).catch(() => setCanExport(false)); };
    refreshPermissions(); window.addEventListener(sessionRecoveredEvent,refreshPermissions);
    return () => window.removeEventListener(sessionRecoveredEvent,refreshPermissions);
  }, []);
  useEffect(() => { void load(); return () => reportRequest.current?.abort(); }, [load]);

  const visibleActivities = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    if (!query) return data?.activities ?? [];
    return (data?.activities ?? []).filter((activity) =>
      `${activity.code} ${activity.title} ${activity.department} ${activity.responsibleName} ${activity.venue ?? ''} ${activity.status}`.toLocaleLowerCase('es').includes(query)
    );
  }, [data, search]);
  const maxTrend = Math.max(...(data?.trend.flatMap((item) => [item.planned, item.completed, item.conflicts]) ?? [1]), 1);
  const maxDepartment = Math.max(...(data?.departments.map((item) => item.total) ?? [1]), 1);
  const statusConic = data?.statuses.length
    ? data.statuses.reduce<{ value: string; cursor: number }>((state, item) => {
      const end = state.cursor + item.percentage;
      const segment = `${statusColors[item.status] ?? '#6d7f79'} ${state.cursor}% ${end}%`;
      return { value: state.value ? `${state.value},${segment}` : segment, cursor: end };
    }, { value: '', cursor: 0 }).value
    : '#e6efec 0 100%';

  function applyPreset(kind: '30' | '90' | 'year') {
    const today = new Date();
    const from = kind === 'year' ? new Date(today.getFullYear(), 0, 1) : new Date(today.getTime() - Number(kind) * 86_400_000);
    const next = { ...draft, from: inputDate(from), to: inputDate(today) };
    setDraft(next); setFilters(next);
  }

  async function download(kind: 'pdf' | 'csv') {
    if (!canExport || downloading) return;
    setDownloading(kind); setError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const path = kind === 'pdf' ? '/reports/executive.pdf' : '/reports/activities.csv';
      const query = reportParams(filters); query.set('lang', locale);
      const response = await fetch(`${API_URL}${path}?${query.toString()}`, { credentials: 'include', signal: controller.signal });
      if (!response.ok) throw new Error('No fue posible preparar la exportación.');
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `reporte-gestionchurch.${kind}`;
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href; anchor.download = filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 1_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible descargar el reporte.');
    } finally { clearTimeout(timeout); setDownloading(''); }
  }

  return <Shell title={tr("Reportes")} eyebrow={tr("Inteligencia y rendimiento")} actions={canExport ? <button type="button" className="button button-primary desktop-action" onClick={() => void download('pdf')} disabled={downloading !== ''}><FileDown size={17} />{tr(" Reporte ejecutivo")}</button> : undefined}>
    {error && <Notice tone="danger" title={tr("No fue posible completar el reporte")}>{error}</Notice>}

    <section className="report-hero">
      <div><span className="hero-kicker"><Sparkles />{tr(" Centro de inteligencia")}</span><h2>{tr("Decisiones claras, respaldadas por datos.")}</h2><p>{tr("Convierte la planificación, el cumplimiento y los conflictos en una lectura ejecutiva accionable para la iglesia.")}</p></div>
      <div className="report-health"><span style={{ '--score': `${(coordination.score ?? 0) * 3.6}deg` } as React.CSSProperties}><b>{coordination.score ?? '—'}</b></span><div><small>{tr(coordination.label)}</small><strong>{tr(coordination.note)}</strong><em>{tr("Actualizado ")}{data ? localizedDateFormat({ hour: '2-digit', minute: '2-digit' }).format(new Date(data.generatedAt)) : '—'}</em></div></div>
    </section>

    {data && <p className="muted">{tr('Puntualidad observada')}: {timeliness.value} · {timeliness.sampleSize}{tr(' cierres con evidencia temporal; ')}{timeliness.untimedCompleted}{tr(' sin evidencia temporal.')}</p>}

    <section className="panel report-filter-panel">
      <div className="report-filter-heading"><span><Filter /><span><small>{tr("ALCANCE DEL REPORTE")}</small><strong>{tr("Filtros ejecutivos")}</strong></span></span><div className="report-presets"><button type="button" onClick={() => applyPreset('30')}>{tr("30 días")}</button><button type="button" onClick={() => applyPreset('90')}>{tr("90 días")}</button><button type="button" onClick={() => applyPreset('year')}>{tr("Año actual")}</button></div></div>
      <div className="report-filter-grid">
        <label>{tr("Desde")}<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
        <label>{tr("Hasta")}<input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
        <label>{tr("Departamento")}<select value={draft.departmentId} onChange={(event) => setDraft({ ...draft, departmentId: event.target.value })}><option value="">{tr("Todos los departamentos")}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        <label>{tr("Estado")}<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{statuses.map(([value, label]) => <option key={value || 'all'} value={value}>{tr(label)}</option>)}</select></label>
        <button type="button" className="button button-primary" onClick={() => setFilters(draft)} disabled={loading}><BarChart3 />{tr(" Generar reporte")}</button>
      </div>
      <div className="report-export-row"><span><ShieldCheck />{tr(" Datos aislados del tenant y generados en tiempo real")}</span><div>{canExport && <><button type="button" className="button button-secondary" onClick={() => void download('csv')} disabled={downloading !== ''}><Download /> {downloading === 'csv' ? tr("Preparando…") : tr("Exportar CSV")}</button><button type="button" className="button button-secondary" onClick={() => void download('pdf')} disabled={downloading !== ''}><FileDown /> {downloading === 'pdf' ? tr("Diseñando PDF…") : tr("Reporte PDF")}</button></>}<button type="button" className="icon-button" onClick={() => void load()} aria-label={tr("Actualizar reporte")}><RefreshCw /></button></div></div>
    </section>

    {loading ? <Spinner /> : !data ? null : <>
      <section className="report-kpi-grid">
        <Link href={calendarHref(filters)} className="report-kpi"><span className="report-kpi-icon teal"><Activity /></span><div><small>{tr("Actividades")}</small><strong>{data.summary.total}</strong><Comparison value={data.comparison.total} /></div><ArrowUpRight /></Link>
        <Link href={calendarHref(filters, { attention: 'COMPLETED', label: 'Actividades completadas del reporte' })} className="report-kpi"><span className="report-kpi-icon green"><Target /></span><div><small>{tr("Cumplimiento")}</small><strong>{data.summary.completionRate}%</strong><Comparison value={data.comparison.completionRate} suffix=" pts" /></div><ArrowUpRight /></Link>
        <Link href="/reviews#conflicts" className={`report-kpi ${data.summary.openConflicts ? 'attention' : ''}`}><span className="report-kpi-icon amber"><AlertTriangle /></span><div><small>{tr("Incidencia de conflictos")}</small><strong>{data.summary.conflictRate}%</strong><Comparison value={data.comparison.conflictRate} inverse suffix=" pts" /></div><ArrowUpRight /></Link>
        <Link href={calendarHref(filters, { attention: 'OVERDUE', label: 'Actividades vencidas del reporte' })} className={`report-kpi ${data.summary.overdue ? 'critical' : ''}`}><span className="report-kpi-icon red"><Clock3 /></span><div><small>{tr("Vencidas")}</small><strong>{data.summary.overdue}</strong><Comparison value={data.comparison.overdueRate} inverse suffix=" pts" /></div><ArrowUpRight /></Link>
        <Link href={calendarHref(filters)} className="report-kpi"><span className="report-kpi-icon violet"><UsersRound /></span><div><small>{tr("Asistencia proyectada")}</small><strong>{data.summary.estimatedAttendance.toLocaleString('es-BO')}</strong><Comparison value={data.comparison.estimatedAttendance} /></div><ArrowUpRight /></Link>
        <Link href="#activity-detail" className="report-kpi"><span className="report-kpi-icon blue"><CalendarRange /></span><div><small>{tr("Anticipación media")}</small><strong>{data.summary.averageLeadDays ?? '—'} <em>{tr("días")}</em></strong><span className="report-comparison neutral">{tr("Aprobación: ")}{data.summary.averageApprovalHours ?? '—'}{tr(" h")}</span></div><ArrowUpRight /></Link>
      </section>

      <div className="report-intelligence-grid">
        <section className="panel report-trend-panel">
          <div className="panel-heading"><div><span className="eyebrow">{tr("Evolución temporal")}</span><h2>{tr("Planificación y resultados")}</h2><p>{tr("Compara volumen, cierres y fricción por mes.")}</p></div><TrendingUp /></div>
          {data.trend.length === 0 ? <Empty icon={<BarChart3 />} title={tr("Sin datos para este período")} text={tr("Amplía las fechas o selecciona otro alcance.")} /> : <div className="report-trend-chart">{data.trend.map((item) => <Link href={calendarHref(filters, { from: new Date(`${item.month}-01T00:00:00`).toISOString(), label: `Actividades de ${monthName(item.month)}` })} className="report-trend-column" key={item.month} aria-label={[tr("Abrir "), item.planned, tr(" actividades de "), monthName(item.month)].join('')}><div className="report-bars"><i className="planned" style={{ height: `${Math.max(item.planned ? 7 : 0, item.planned / maxTrend * 100)}%` }}><span>{item.planned}</span></i><i className="completed" style={{ height: `${Math.max(item.completed ? 7 : 0, item.completed / maxTrend * 100)}%` }}><span>{item.completed}</span></i><i className="conflicted" style={{ height: `${Math.max(item.conflicts ? 7 : 0, item.conflicts / maxTrend * 100)}%` }}><span>{item.conflicts}</span></i></div><strong>{monthName(item.month)}</strong><small>{item.attendance}{tr(" asistentes")}</small></Link>)}</div>}
          <nav className="report-chart-legend"><Link href={calendarHref(filters)}><i className="planned" />{tr(" Planificadas")}</Link><Link href={calendarHref(filters, { attention: 'COMPLETED' })}><i className="completed" />{tr(" Completadas")}</Link><Link href="/reviews#conflicts"><i className="conflicted" />{tr(" Con conflicto")}</Link></nav>
        </section>

        <section className="panel report-status-panel">
          <div className="panel-heading"><div><span className="eyebrow">{tr("Composición")}</span><h2>{tr("Estado del portafolio")}</h2><p>{tr("Ciclo de vida de las actividades.")}</p></div><PieChart /></div>
          <div className="report-donut-layout"><Link href={calendarHref(filters)} className="report-donut" style={{ background: `conic-gradient(${statusConic})` }} aria-label={[tr("Explorar las "), data.summary.total, tr(" actividades")].join('')}><span><strong>{data.summary.total}</strong><small>{tr("actividades")}</small></span></Link><div className="report-status-list">{data.statuses.map((item) => <Link href={calendarHref(filters, { status: item.status, label: statuses.find(([value]) => value === item.status)?.[1] ?? item.status })} key={item.status}><i style={{ background: statusColors[item.status] ?? '#6d7f79' }} /><span><strong>{statuses.find(([value]) => value === item.status)?.[1] ?? item.status}</strong><small>{item.percentage}{tr("% del total")}</small></span><b>{item.count}</b><ArrowUpRight /></Link>)}</div></div>
        </section>
      </div>

      <div className="report-insight-grid">
        <section className="panel report-insights">
          <div className="panel-heading"><div><span className="eyebrow">{tr("Lectura ejecutiva")}</span><h2>{tr("Hallazgos accionables")}</h2><p>{tr("Señales calculadas con los datos del período.")}</p></div><Sparkles /></div>
          <div>{data.insights.map((insight) => <article className={insight.tone} key={`${insight.title}-${insight.metric}`}><span>{insight.tone === 'critical' ? <AlertTriangle /> : insight.tone === 'warning' ? <Gauge /> : insight.tone === 'positive' ? <CheckCircle2 /> : <Activity />}</span><div><strong>{insight.title}</strong><p>{insight.detail}</p></div><b>{insight.metric}</b></article>)}</div>
        </section>

        <section className="panel report-department-panel">
          <div className="panel-heading"><div><span className="eyebrow">{tr("Rendimiento ministerial")}</span><h2>{tr("Desempeño por departamento")}</h2><p>{tr("Volumen, cumplimiento y riesgos.")}</p></div><Link href="/settings/departments">{tr("Gestionar ")}<ArrowUpRight /></Link></div>
          {data.departments.length === 0 ? <Empty title={tr("Sin departamentos en el período")} text={tr("Selecciona un rango diferente para comparar rendimiento.")} /> : <div className="report-department-list premium-scroll-list">{data.departments.map((department) => <Link href={calendarHref({ ...filters, departmentId: department.id }, { label: `Reporte de ${department.name}` })} key={department.id}><span className="department-rank" style={{ background: department.color }}>{department.name.slice(0, 1)}</span><div><strong>{department.name}</strong><span className="report-department-track"><i style={{ width: `${department.total / maxDepartment * 100}%`, background: department.color }} /></span><small>{department.total}{tr(" actividades · ")}{department.attendance}{tr(" asistentes")}</small></div><span className="department-score"><b>{department.completionRate}%</b><small>{tr("cumplimiento")}</small></span><span className={department.overdue || department.conflicts ? 'risk' : 'healthy'}>{department.conflicts}{tr(" conflictos · ")}{department.overdue}{tr(" vencidas")}</span><ArrowUpRight /></Link>)}</div>}
        </section>
      </div>

      <section className="panel report-detail-panel" id="activity-detail">
        <div className="report-detail-head"><div><span className="eyebrow">{tr("Detalle auditable")}</span><h2>{tr("Actividades incluidas")}</h2><p>{tr("Cada fila abre el expediente original para validar la información.")}</p></div><label className="premium-search"><Search /><input aria-label={tr("Buscar en el reporte")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Código, actividad, departamento, responsable…")} />{search && <button type="button" onClick={() => setSearch('')} aria-label={tr("Limpiar búsqueda del reporte")}><X /></button>}</label><span>{visibleActivities.length}{tr(" de ")}{data.activities.length}</span></div>
        {visibleActivities.length === 0 ? <Empty icon={<Search />} title={tr("Sin coincidencias")} text={tr("Prueba con otro código, actividad, departamento o responsable.")} /> : <div className="report-table-wrap premium-scroll-list"><table className="report-table"><thead><tr><th>{tr("Actividad")}</th><th>{tr("Departamento")}</th><th>{tr("Fecha")}</th><th>{tr("Resultado")}</th><th>{tr("Riesgo")}</th><th>{tr("Asistencia")}</th><th aria-label={tr("Abrir")} /></tr></thead><tbody>{visibleActivities.map((activity) => <tr key={activity.id}><td><Link href={`/activities/${activity.id}`}><small>{activity.code}</small><strong>{activity.title}</strong><span>{activity.responsibleName}</span></Link></td><td><Link href={calendarHref({ ...filters, departmentId: activity.departmentId })}><i style={{ background: activity.color }} /> {activity.department}</Link></td><td><Link href={`/activities/${activity.id}`}>{activity.startsAt ? new Intl.DateTimeFormat(localeTag(currentLocale()), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activity.startsAt)) : tr("Sin fecha")}<small>{activity.leadDays === null ? tr("Sin anticipación calculable") : [activity.leadDays, tr(" días de anticipación")].join('')}</small></Link></td><td><Link href={`/activities/${activity.id}`}><Badge status={activity.status} /></Link></td><td><Link href={activity.openConflict ? '/reviews#conflicts' : `/activities/${activity.id}`} className={`report-risk ${activity.risk.toLowerCase()}`}>{activity.risk === 'HIGH' ? <TrendingDown /> : activity.risk === 'WATCH' ? <Gauge /> : <CheckCircle2 />}{activity.risk === 'HIGH' ? tr("Alto") : activity.risk === 'WATCH' ? tr("Vigilar") : tr("Saludable")}</Link></td><td><Link href={`/activities/${activity.id}`}>{activity.estimatedAttendance}</Link></td><td><Link href={`/activities/${activity.id}`} aria-label={[tr("Abrir "), activity.title].join('')}><ArrowUpRight /></Link></td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </Shell>;
}
