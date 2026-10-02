'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FilePlus2,
  Gauge,
  Sparkles,
  TimerReset,
  TrendingUp,
  UsersRound,
  Music2
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/shell';
import { Badge, Empty, Notice, Spinner } from '@/components/ui';
import { api, formatDate } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';
import { frontendCapabilities, type FrontendPrincipal } from '@/components/frontend-capabilities';
import { currentLocale, localeTag } from '@/lib/i18n';
import { coordinationDisplay, type CoordinationEvidence } from '@/components/coordination-evidence';

type Dashboard = {
  stats: {
    approved: number; pending: number; conflicts: number; drafts: number; completed: number;
    overdue: number; incomplete: number; due_soon: number; total: number; coordinationScore: number; coordinationEvidence?: CoordinationEvidence;
  };
  departments: Array<{ id: string; name: string; color: string; total: number; completed: number; overdue: number; active: number }>;
  upcoming: Array<{ id: string; code: string; title: string; status: string; department: string; color: string; starts_at: string; ends_at: string; venue: string }>;
  attention: Array<{ id: string; code: string; title: string; status: string; department: string; color: string; starts_at: string | null; ends_at: string | null; kind: string }>;
  trend: Array<{ month: string; planned: number; completed: number; overdue: number }>;
  forecast: {
    outlook: 'FAVORABLE' | 'WATCH' | 'AT_RISK'; probability: number; score?: number; confidence: string; sampleSize: number;
    method?: string; calibrated?: boolean; evidenceLevel?: string;
    conflictRate: number; averageLeadDays: number | null; completionRate: number; headline: string; methodology: string;
    predictions: Array<{ id: string; code: string; title: string; status: string; department: string; color: string; starts_at: string; probability: number; score?: number; risk: 'ON_TRACK' | 'WATCH' | 'AT_RISK'; explanation: string }>;
    recentActivities: Array<{ id: string; code: string; title: string; status: string; department: string; leadDays: number | null; approvalHours: number | null; was_conflicted: boolean; outcomeScore: number }>;
  };
};
type ElderDashboard = {
  rotations: Array<{ id: string; title: string; startsOn: string; endsOn: string; elders: Array<{ id: string; name: string }> }>;
  programs: Array<{ id: string; title: string; serviceAt: string; elderName: string; preacherName: string; singerName: string; hymn: string }>;
  departmentAssignments: Array<{ id: string; elderName: string; departmentName: string }>;
};

const attentionLabels: Record<string, { label: string; tone: string; detail: string }> = {
  OVERDUE: { label: 'Vencida', tone: 'critical', detail: 'Finalizó y todavía no se ha confirmado como completada.' },
  CONFLICT: { label: 'Conflicto', tone: 'critical', detail: 'Requiere una decisión de coordinación.' },
  CHANGES_REQUESTED: { label: 'Cambios', tone: 'warning', detail: 'El departamento debe corregir y reenviar.' },
  PENDING_DECISION: { label: 'En espera', tone: 'pending', detail: 'Lleva más de 48 horas esperando aprobación.' },
  STALE_DRAFT: { label: 'Borrador antiguo', tone: 'draft', detail: 'Lleva más de siete días sin enviarse.' }
};
const forecastLabels = {
  ON_TRACK: { label: 'En curso', className: 'on-track' },
  WATCH: { label: 'Vigilar', className: 'watch' },
  AT_RISK: { label: 'En riesgo', className: 'at-risk' }
};

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(localeTag(currentLocale()), { month: 'short' }).format(new Date(year!, month! - 1, 1)).replace('.', '');
}

function monthLongLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(localeTag(currentLocale()), { month: 'long', year: 'numeric' }).format(new Date(year!, month! - 1, 1));
}

function calendarRangeHref(firstMonth: string, lastMonth: string, attention: 'PLANNED' | 'COMPLETED' | 'OVERDUE', label: string) {
  const [firstYear, first] = firstMonth.split('-').map(Number);
  const [lastYear, last] = lastMonth.split('-').map(Number);
  const from = new Date(firstYear!, first! - 1, 1);
  const to = new Date(lastYear!, last!, 1);
  to.setMilliseconds(-1);
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), attention, label });
  return `/calendar?${params.toString()}`;
}

export default function DashboardPage() {
  const { tr } = useExperience();

  const [data, setData] = useState<Dashboard | null>(null);
  const [elderData, setElderData] = useState<ElderDashboard>({ rotations: [], programs: [], departmentAssignments: [] });
  const [error, setError] = useState('');
  const [user, setUser] = useState<FrontendPrincipal | null>(null);
  const [loading, setLoading] = useState(true);
  const [eldersError, setEldersError] = useState(false);
  const capabilities = frontendCapabilities(user);
  const coordination = coordinationDisplay(data?.stats.coordinationScore, data?.stats.coordinationEvidence);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(''); setEldersError(false);
    try {
      const [dashboard, identity] = await Promise.all([api<Dashboard>('/dashboard', { signal: signal ?? null }), api<{ user: FrontendPrincipal }>('/me', { signal: signal ?? null })]);
      if (signal?.aborted) return;
      setData(dashboard); setUser(identity.user);
      if (frontendCapabilities(identity.user).canReadElders) {
        try { const elders = await api<ElderDashboard>('/elders/dashboard', { signal: signal ?? null }); if (!signal?.aborted) setElderData(elders); }
        catch { if (!signal?.aborted) setEldersError(true); }
      }
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'No fue posible cargar el centro de control'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const maxTrend = useMemo(() => Math.max(...(data?.trend.map((item) => Number(item.planned)) ?? [1]), 1), [data]);
  const semesterHref = data?.trend.length
    ? calendarRangeHref(data.trend[0]!.month, data.trend.at(-1)!.month, 'PLANNED', 'Planificación de los últimos seis meses')
    : '/calendar';
  const heroState = data && (data.stats.overdue > 0 || data.stats.conflicts > 0)
    ? { kicker: 'Atención requerida', title: `${data.stats.overdue + data.stats.conflicts} asuntos necesitan acción.`, text: 'Prioriza vencimientos y conflictos para recuperar el ritmo operativo.' }
    : data && data.stats.pending > 0
      ? { kicker: 'Coordinación activa', title: 'La agenda avanza; hay decisiones pendientes.', text: 'Revisa aprobaciones y mantén la planificación en movimiento.' }
      : { kicker: 'Resumen de la agenda', title: 'Tu calendario y equipos, en un lugar.', text: 'Consulta la agenda y el historial antes de evaluar la coordinación.' };

  return <Shell title={tr("Centro de control")} eyebrow={tr("Inteligencia operativa")} actions={capabilities.canCreateActivity && <Link className="button button-primary desktop-action" href="/activities/new"><FilePlus2 size={17} />{tr(" Nueva actividad")}</Link>}>
    {error && <Notice tone="danger" title={tr("No fue posible cargar el centro de control")}>{tr(error)} <button type="button" className="button button-ghost compact" disabled={loading} onClick={() => void load()}>{tr('Reintentar')}</button></Notice>}
    {!data ? loading ? <Spinner /> : null : <>
      <section className="hero-card control-hero">
        <div><span className="hero-kicker"><Sparkles size={15} /> {tr(heroState.kicker)}</span><h2>{tr(heroState.title)}</h2><p>{tr(heroState.text)}</p><div className="hero-quick-links"><Link href="/calendar?attention=OVERDUE"><AlertTriangle /> {data.stats.overdue}{tr(" vencidas")}</Link>{capabilities.canReviewActivities && <Link href="/reviews"><ClipboardList /> {data.stats.pending + data.stats.conflicts}{tr(" decisiones")}</Link>}<Link href="/calendar?attention=DUE_SOON"><Clock3 /> {data.stats.due_soon}{tr(" esta semana")}</Link></div></div>
        <Link href="/calendar?attention=INCOMPLETE" aria-label={tr(coordination.label)} title={tr(coordination.note)} className="control-score" style={{ '--score': `${(coordination.score ?? 0) * 3.6}deg` } as React.CSSProperties}><div><strong>{coordination.score ?? '—'}</strong><span>{tr(coordination.label)}</span></div></Link>
      </section>

      {capabilities.canReadElders && <section className="panel elders-dashboard-strip">
        <Link href="/elders" className="elders-dashboard-title"><span><UsersRound /></span><div><small>{tr("Cobertura pastoral")}</small><h2>{tr("Ancianos y próximos cultos")}</h2><p>{tr("Asignaciones visibles que acompañan la agenda sin generar conflictos.")}</p></div><ArrowUpRight /></Link>
        {eldersError ? <Notice tone="warning" title={tr('Cobertura pastoral no disponible')}>{tr('No fue posible cargar esta agenda. No se considera una agenda vacía.')} <button type="button" className="button button-ghost compact" disabled={loading} onClick={() => void load()}>{tr('Reintentar')}</button></Notice> : <div className="elders-dashboard-content">
          <Link href="/elders?view=rotations" className="elder-duty-summary">
            <small>{tr("Turno vigente / próximo")}</small>
            {elderData.rotations[0] ? <><strong>{elderData.rotations[0].elders.map((elder) => elder.name).join(' · ')}</strong><span>{new Intl.DateTimeFormat(localeTag(currentLocale()), { day: 'numeric', month: 'short' }).format(new Date(`${elderData.rotations[0].startsOn.slice(0,10)}T12:00:00`))} – {new Intl.DateTimeFormat(localeTag(currentLocale()), { day: 'numeric', month: 'short' }).format(new Date(`${elderData.rotations[0].endsOn.slice(0,10)}T12:00:00`))}</span></> : <><strong>{tr("Por asignar")}</strong><span>{tr("Crea la próxima cobertura semanal")}</span></>}
            <em>{elderData.departmentAssignments.length}{tr(" enlace(s) departamental(es) activo(s)")}</em>
          </Link>
          <div className="elder-service-preview">{elderData.programs.slice(0, 3).map((program) => <Link href={`/elders?programId=${program.id}`} key={program.id}><span><Music2 /></span><div><small>{formatDate(program.serviceAt)}</small><strong>{program.title}</strong><em>{program.preacherName || tr("Predicador por confirmar")} · {program.hymn || tr("Himno por confirmar")}</em></div><ArrowRight /></Link>)}{elderData.programs.length === 0 && <span className="elder-service-empty">{tr("Los próximos programas aparecerán aquí.")}</span>}</div>
        </div>}
      </section>}

      <section className="stat-grid control-stat-grid">
        <Link href="/calendar?attention=COMPLETED&label=Actividades%20completadas" className="stat-card" aria-label={[tr("Ver "), data.stats.completed, tr(" actividades completadas")].join('')}><span className="stat-icon green"><CheckCircle2 /></span><div><small>{tr("Completadas")}</small><strong>{data.stats.completed}</strong><span>{tr("cierre confirmado")}</span></div><ArrowUpRight className="drill-icon" /></Link>
        <Link href="/calendar?attention=INCOMPLETE&label=Actividades%20sin%20completar" className="stat-card" aria-label={[tr("Ver "), data.stats.incomplete, tr(" actividades incompletas")].join('')}><span className="stat-icon blue"><Activity /></span><div><small>{tr("Sin completar")}</small><strong>{data.stats.incomplete}</strong><span>{tr("ciclo aún abierto")}</span></div><ArrowUpRight className="drill-icon" /></Link>
        <Link href="/calendar?attention=OVERDUE&label=Actividades%20vencidas" className="stat-card urgent" aria-label={[tr("Ver "), data.stats.overdue, tr(" actividades vencidas")].join('')}><span className="stat-icon red"><TimerReset /></span><div><small>{tr("Vencidas")}</small><strong>{data.stats.overdue}</strong><span>{tr("requieren cierre")}</span></div><ArrowUpRight className="drill-icon" /></Link>
        <Link href="/calendar?status=APPROVED&label=Actividades%20aprobadas" className="stat-card" aria-label={[tr("Ver "), data.stats.approved, tr(" actividades aprobadas")].join('')}><span className="stat-icon green"><CalendarCheck2 /></span><div><small>{tr("Actividades aprobadas")}</small><strong>{data.stats.approved}</strong><span>{tr("en calendario")}</span></div><ArrowUpRight className="drill-icon" /></Link>
        <Link href="/reviews#approvals" className="stat-card" aria-label={[tr("Ver "), data.stats.pending, tr(" actividades pendientes")].join('')}><span className="stat-icon amber"><Clock3 /></span><div><small>{tr("Por aprobar")}</small><strong>{data.stats.pending}</strong><span>{tr("esperando decisión")}</span></div><ArrowUpRight className="drill-icon" /></Link>
        <Link href="/reviews#conflicts" className="stat-card" aria-label={[tr("Ver "), data.stats.conflicts, tr(" conflictos abiertos")].join('')}><span className="stat-icon violet"><AlertTriangle /></span><div><small>{tr("Conflictos")}</small><strong>{data.stats.conflicts}</strong><span>{tr("requieren coordinación")}</span></div><ArrowUpRight className="drill-icon" /></Link>
      </section>

      <div className="command-grid">
        <section className="panel attention-center">
          <div className="panel-heading"><Link className="heading-drill" href="/calendar?attention=ACTION_REQUIRED&label=Actividades%20que%20requieren%20atenci%C3%B3n"><span className="eyebrow">{tr("Prioridad operativa")}</span><h2>{tr("Lo que requiere atención")}</h2><p>{tr("Ordenado por impacto y antigüedad.")}</p></Link><Link aria-label={[tr("Ver "), data.attention.length, tr(" actividades que requieren atención")].join('')} href="/calendar?attention=ACTION_REQUIRED&label=Actividades%20que%20requieren%20atenci%C3%B3n" className="count-pill warning">{data.attention.length}</Link></div>
          {data.attention.length === 0 ? <Empty icon={<CheckCircle2 />} title={tr("No hay bloqueos operativos")} text={tr("Las actividades vencidas, detenidas o con conflictos aparecerán aquí.")} /> : <div className="attention-list">{data.attention.map((item) => {
            const meta = attentionLabels[item.kind] ?? attentionLabels.STALE_DRAFT!;
            return <Link href={`/activities/${item.id}`} className="attention-row" key={item.id}><span className={`attention-mark ${meta.tone}`}><AlertTriangle /></span><div><span><i style={{ background: item.color }} /> {item.code} · {item.department}</span><strong>{item.title}</strong><small>{tr(meta.detail)}</small></div><div><span className={`badge badge-${meta.tone}`}>{tr(meta.label)}</span>{item.ends_at && <time>{formatDate(item.ends_at)}</time>}<ArrowRight /></div></Link>;
          })}</div>}
        </section>

        <section className="panel forecast-center">
          <div className="forecast-head"><span className="forecast-icon"><TrendingUp /></span><div><span className="eyebrow">{tr("Señal operativa orientativa")}</span><h2>{tr(data.forecast.headline)}</h2></div><Link href="#forecast-history" aria-label={tr("Ver las actividades utilizadas para calcular el pronóstico")} className={`forecast-probability ${data.forecast.outlook.toLowerCase().replace('_','-')}`}><strong>{data.forecast.score ?? data.forecast.probability}/100</strong><span>{tr("puntos orientativos")}</span></Link></div>
          <Link href="#forecast-history" className="forecast-method">{tr('Heurística basada en reglas. No es una probabilidad calibrada ni garantiza un resultado.')} <ArrowRight size={12} /></Link>
          <nav className="forecast-baseline" aria-label={tr("Datos base del pronóstico")}><Link href="#forecast-history"><small>{tr("Muestra")}</small><strong>{data.forecast.sampleSize}{tr("/3 actividades")}</strong></Link><Link href="#forecast-history"><small>{tr("Anticipación media")}</small><strong>{data.forecast.averageLeadDays ?? '—'}{tr(" días")}</strong></Link><Link href="/reviews#conflicts"><small>{tr("Incidencia de conflictos")}</small><strong>{data.forecast.conflictRate}%</strong></Link><Link href="#forecast-history"><small>{tr("Evidencia")}</small><strong>{tr(data.forecast.sampleSize < 3 ? 'Historial insuficiente' : 'Historial limitado')}</strong></Link></nav>
          {data.forecast.predictions.length === 0 ? <div className="forecast-empty"><Gauge /><span><strong>{tr("Pronóstico en aprendizaje")}</strong><small>{tr("Agrega próximas actividades para generar proyecciones individuales.")}</small></span></div> : <div className="prediction-list" id="forecast-predictions">{data.forecast.predictions.slice(0,4).map((item) => {
            const forecast = forecastLabels[item.risk];
            return <Link href={`/activities/${item.id}`} className="prediction-row" key={item.id}><span className="prediction-score" style={{ '--probability': `${item.score ?? item.probability}%`, '--forecast-color': item.color } as React.CSSProperties}><b>{item.score ?? item.probability}</b></span><div><strong>{item.title}</strong><span>{item.department} · {formatDate(item.starts_at)}</span><small>{tr(item.explanation)}</small></div><em className={forecast.className}>{tr(forecast.label)}</em></Link>;
          })}</div>}
        </section>
      </div>

      <div className="performance-grid">
        <section className="panel pulse-panel">
          <Link href={semesterHref} className="panel-heading live-panel-heading"><div><span className="eyebrow">{tr("Pulso semestral")}</span><h2>{tr("Planificación vs. cierre")}</h2></div><span>{tr("Explorar período ")}<BarChart3 /></span></Link>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: A labelled overflow region needs keyboard focus for horizontal scrolling. */}
          <section className="trend-scroll" tabIndex={0} aria-label={tr('Gráfico semestral. Desplaza horizontalmente para explorar los meses.')}><div className="trend-chart">{data.trend.map((item) => {
            const label = monthLongLabel(item.month);
            const plannedHref = calendarRangeHref(item.month, item.month, 'PLANNED', `Actividades planificadas · ${label}`);
            const completedHref = calendarRangeHref(item.month, item.month, 'COMPLETED', `Actividades completadas · ${label}`);
            const overdueHref = calendarRangeHref(item.month, item.month, 'OVERDUE', `Actividades vencidas · ${label}`);
            return <div className="trend-column" key={item.month}><div><Link href={plannedHref} className="trend-bar-link" aria-label={[tr("Ver "), item.planned, tr(" actividades planificadas de "), label].join('')} title={[item.planned, tr(" planificadas")].join('')}><i className="planned" style={{ height: `${(Number(item.planned)/maxTrend)*100}%` }} /></Link><Link href={completedHref} className="trend-bar-link" aria-label={[tr("Ver "), item.completed, tr(" actividades completadas de "), label].join('')} title={[item.completed, tr(" completadas")].join('')}><i className="completed" style={{ height: `${(Number(item.completed)/maxTrend)*100}%` }} /></Link><Link href={overdueHref} className="trend-bar-link" aria-label={[tr("Ver "), item.overdue, tr(" actividades vencidas de "), label].join('')} title={[item.overdue, tr(" vencidas")].join('')}><i className="overdue" style={{ height: `${(Number(item.overdue)/maxTrend)*100}%` }} /></Link></div><Link className="trend-total" href={plannedHref}>{item.planned}</Link><Link className="trend-month" href={plannedHref}>{monthLabel(item.month)}</Link></div>;
          })}</div></section>
          <nav className="chart-legend" aria-label={tr("Filtros del gráfico")}><Link href={semesterHref}><i className="planned" />{tr(" Planificadas")}</Link><Link href={data.trend.length ? calendarRangeHref(data.trend[0]!.month,data.trend.at(-1)!.month,'COMPLETED','Actividades completadas de los últimos seis meses') : '/calendar?attention=COMPLETED'}><i className="completed" />{tr(" Completadas")}</Link><Link href={data.trend.length ? calendarRangeHref(data.trend[0]!.month,data.trend.at(-1)!.month,'OVERDUE','Actividades vencidas de los últimos seis meses') : '/calendar?attention=OVERDUE'}><i className="overdue" />{tr(" Vencidas")}</Link></nav>
        </section>
        <section className="panel recent-pattern-panel" id="forecast-history">
          <div className="panel-heading"><div><span className="eyebrow">{tr("Base del pronóstico")}</span><h2>{tr("Últimas tres actividades")}</h2></div><Gauge /></div>
          {data.forecast.recentActivities.length === 0 ? <Empty title={tr("Aún no hay historial suficiente")} text={tr("El pronóstico mejorará a medida que se gestionen actividades.")} /> : <div className="recent-pattern-list">{data.forecast.recentActivities.map((item) => <Link href={`/activities/${item.id}`} key={item.id}><span className="pattern-score"><strong>{item.outcomeScore}</strong><small>{tr("señal")}</small></span><div><strong>{item.title}</strong><span>{item.department} · {item.leadDays ?? '—'}{tr(" días de anticipación")}</span><small>{item.was_conflicted ? tr("Tuvo conflicto de coordinación") : tr("Sin conflicto registrado")}{item.approvalHours !== null ? [tr(" · aprobada en "), item.approvalHours, tr(" h")].join('') : ''}</small></div><Badge status={item.status} /></Link>)}</div>}
        </section>
      </div>

      <div className="dashboard-grid extended-dashboard-grid">
        <section className="panel upcoming-panel">
          <div className="panel-heading"><div><span className="eyebrow">{tr("Agenda ejecutiva")}</span><h2>{tr("Próximas actividades")}</h2></div><Link href="/calendar">{tr("Ver calendario ")}<ArrowUpRight size={16} /></Link></div>
          {data.upcoming.length === 0 ? <Empty title={tr("Aún no hay actividades próximas")} text={tr("Consulta el calendario para organizar las próximas actividades.")} action={capabilities.canCreateActivity ? <Link className="button button-secondary" href="/activities/new">{tr("Crear actividad")}</Link> : <Link className="button button-secondary" href="/calendar">{tr('Ver calendario')}</Link>} /> : <div className="activity-list">{data.upcoming.map((item) => <Link href={`/activities/${item.id}`} className="activity-row" key={item.id}><div className="date-tile" style={{ '--accent': item.color } as React.CSSProperties}><strong>{new Date(item.starts_at).getDate()}</strong><span>{new Intl.DateTimeFormat(localeTag(currentLocale()), { month: 'short' }).format(new Date(item.starts_at))}</span></div><div className="activity-copy"><strong>{item.title}</strong><span>{item.department} · {item.venue || tr("Lugar por definir")}</span><small>{formatDate(item.starts_at)}</small></div><Badge status={item.status} /></Link>)}</div>}
        </section>
        <section className="panel department-panel">
          <div className="panel-heading"><div><span className="eyebrow">{tr("Carga ministerial")}</span><h2>{tr("Por departamento")}</h2></div>{capabilities.canManageDepartments ? <Link href="/settings/departments">{tr("Gestionar ")}<ArrowUpRight size={16} /></Link> : <Link href="/calendar">{tr('Ver calendario')}<ArrowUpRight size={16} /></Link>}</div>
          <div className="bar-chart">{data.departments.map((department) => {
            const max = Math.max(...data.departments.map((item) => Number(item.active)), 1);
            return <Link className="bar-row department-workload-row" href={`/calendar?departmentId=${encodeURIComponent(department.id)}&department=${encodeURIComponent(department.name)}`} aria-label={[tr("Ver "), department.total, tr(" actividades de "), department.name].join('')} key={department.id}><div><span>{department.name}</span><strong>{department.active}{tr(" activas")}</strong></div><span className="bar-track"><i style={{ width: `${(Number(department.active) / max) * 100}%`, background: department.color }} /></span><small>{department.completed}{tr(" completadas")}{department.overdue ? [" · ", department.overdue, tr(" vencidas")].join('') : ''}</small><ArrowUpRight className="bar-drill-icon" /></Link>;
          })}</div>
        </section>
      </div>
    </>}
  </Shell>;
}
