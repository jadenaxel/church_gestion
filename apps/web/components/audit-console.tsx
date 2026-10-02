'use client';

import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock3, Download, FileSearch, Fingerprint, RefreshCw, Search, ShieldCheck, UserRound, X
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_URL, api } from '@/lib/api';
import { localeTag } from '@/lib/i18n';
import { Empty, Notice, Spinner } from '@/components/ui';
import { auditDateRangeError, auditFilterNames, auditQueryString } from './audit-filters';
import { useExperience } from './experience-provider';

export type AuditTenant = { id: string; name: string; slug: string };

type AuditEvent = {
  id: string; actor_id: string | null; actor_name: string; actor_email: string | null;
  action: string; resource_type: string; resource_id: string | null; before_data: unknown;
  after_data: unknown; reason: string | null; correlation_id: string | null; created_at: string;
  outcome: 'SUCCESS' | 'REJECTED' | 'FAILED'; tenant_name?: string; tenant_slug?: string;
};
type AuditResult = {
  items: AuditEvent[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
  summary: { total: number; today: number; lastSevenDays?: number; exceptions: number; uniqueActors: number; lastEventAt: string | null };
  facets?: { actions: Array<{ value: string; count: number }>; resources: Array<{ value: string; count: number }> };
};

const actionLabels: Record<string, string> = {
  'auth.login.succeeded': 'Inicio de sesión correcto',
  'auth.login.rejected': 'Inicio de sesión rechazado',
  'auth.password_reset.requested': 'Restablecimiento solicitado',
  'auth.password_reset.completed': 'Contraseña restablecida',
  'user.created': 'Usuario creado',
  'user.updated': 'Usuario actualizado',
  'department_membership.assigned': 'Cargo departamental asignado',
  'department_membership.removed': 'Cargo departamental retirado',
  'audit.events.viewed': 'Auditoría consultada',
  'audit.events.exported': 'Auditoría exportada',
  'activity.created': 'Actividad creada',
  'activity.updated': 'Actividad actualizada',
  'activity.submitted': 'Actividad enviada a revisión',
  'activity.approved': 'Actividad aprobada',
  'activity.cancelled': 'Actividad cancelada',
  'activity.completed': 'Actividad completada'
};

function humanize(value: string): string {
  if (actionLabels[value]) return actionLabels[value];
  return value.replace(/^api\./, '').replaceAll(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function protectedData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(protectedData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    /(password|secret|token|credential|authorization|cookie)/i.test(key) ? '[PROTEGIDO]' : protectedData(item)
  ]));
}

export function AuditConsole({ global = false, tenants = [] }: { global?: boolean; tenants?: AuditTenant[] }) {
  const { locale, tr } = useExperience();
  const filterNames = auditFilterNames(tr);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filters, setFilters] = useState({ search: '', outcome: '', action: '', resourceType: '', tenantId: '', from: '', to: '' });
  const requestRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const endpoint = global ? '/global/audit/events' : '/audit/events';
  const dateError = auditDateRangeError(filters);
  const params = useMemo(() => dateError ? '' : auditQueryString(filters, page), [dateError, filters, page]);

  const load = useCallback(async () => {
    if (dateError) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setError('');
    try {
      const next = await api<AuditResult>(`${endpoint}?${params}`, { signal: controller.signal });
      if (!controller.signal.aborted && requestRef.current === controller) setResult(next);
    }
    catch (reason) { if (!controller.signal.aborted && requestRef.current === controller) setError(reason instanceof Error ? reason.message : 'No fue posible cargar la auditoría.'); }
    finally { if (!controller.signal.aborted && requestRef.current === controller) setLoading(false); }
  }, [dateError, endpoint, params]);

  useEffect(() => {
    setLoading(!dateError);
    setExpanded(null);
    if (dateError) return;
    const timer = window.setTimeout(() => void load(), 220);
    return () => { window.clearTimeout(timer); requestRef.current?.abort(); };
  }, [dateError, load]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function exportCsv() {
    if (dateError || exporting) return;
    setExporting(true); setError('');
    try {
      const exportParams = auditQueryString(filters, 1);
      const response = await fetch(`${API_URL}${endpoint}.csv?${exportParams}`, { credentials: 'include', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error('No fue posible exportar la auditoría.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `auditoria-gestionchurch-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible exportar la auditoría.'); }
    finally { setExporting(false); }
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const summary = result?.summary;
  return <div className="audit-console">
    <section className="audit-command panel">
      <div className="audit-command-copy"><span className="audit-command-icon"><ShieldCheck /></span><div><span className="eyebrow">{tr("Trazabilidad inmutable")}</span><h2>{tr("Centro de auditoría")}</h2><p>{tr("Cada decisión y operación sensible queda asociada a su actor, resultado, recurso y correlación técnica.")}</p></div></div>
      <div className="audit-command-actions"><button className="button button-ghost" type="button" onClick={() => void load()} disabled={loading || Boolean(dateError)}><RefreshCw className={loading ? 'spin' : ''} size={16} aria-hidden="true" />{tr(" Actualizar")}</button><button className="button button-primary" type="button" onClick={() => void exportCsv()} disabled={exporting || Boolean(dateError)} aria-busy={exporting}><Download size={16} aria-hidden="true" /> {exporting ? tr("Exportando…") : tr("Exportar CSV")}</button></div>
    </section>

    {error && <Notice tone="danger" title={tr("Auditoría no disponible")}>{error}</Notice>}
    {dateError && <Notice tone="warning" title={tr("Revisa las fechas")}>{dateError}</Notice>}

    <section className="audit-kpis" aria-label={tr("Resumen de auditoría")}>
      <button type="button" className="audit-kpi" onClick={() => updateFilter('outcome', '')}><Activity /><span><small>{tr("Eventos registrados")}</small><strong>{summary?.total ?? '—'}</strong><em>{tr("trazabilidad completa")}</em></span></button>
      <button type="button" className="audit-kpi" onClick={() => updateFilter('outcome', '')}><Clock3 /><span><small>{tr("Actividad de hoy")}</small><strong>{summary?.today ?? '—'}</strong><em>{summary?.lastSevenDays !== undefined ? [summary.lastSevenDays, tr(" en 7 días")].join('') : tr("en el período actual")}</em></span></button>
      <button type="button" className={`audit-kpi ${summary?.exceptions ? 'warning' : ''}`} onClick={() => updateFilter('outcome', 'EXCEPTIONS')}><AlertTriangle /><span><small>{tr("Excepciones")}</small><strong>{summary?.exceptions ?? '—'}</strong><em>{tr("rechazos o fallos")}</em></span></button>
      <button type="button" className="audit-kpi" onClick={() => updateFilter('outcome', '')}><UserRound /><span><small>{tr("Actores únicos")}</small><strong>{summary?.uniqueActors ?? '—'}</strong><em>{tr("responsables identificados")}</em></span></button>
    </section>

    <section className="audit-ledger panel" aria-busy={loading}>
      <div className="audit-toolbar">
        <search className="premium-search" aria-label={tr("Buscar en auditoría")}><Search aria-hidden="true" /><input ref={searchRef} aria-label={tr("Buscar en auditoría")} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder={tr("Buscar actor, acción, recurso, ID o correlación…")} />{filters.search && <button type="button" onClick={() => { updateFilter('search', ''); searchRef.current?.focus(); }} aria-label={tr("Limpiar búsqueda")}><X aria-hidden="true" /></button>}</search>
        {global && <label className="audit-select"><span>{filterNames.tenantId}</span><select aria-label={filterNames.tenantId} value={filters.tenantId} onChange={(event) => updateFilter('tenantId', event.target.value)}><option value="">{tr("Plataforma global")}</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>}
        <label className="audit-select"><span>{filterNames.outcome}</span><select aria-label={filterNames.outcome} value={filters.outcome} onChange={(event) => updateFilter('outcome', event.target.value)}><option value="">{tr("Todos")}</option><option value="SUCCESS">{tr("Correctos")}</option><option value="EXCEPTIONS">{tr("Excepciones")}</option><option value="REJECTED">{tr("Rechazados")}</option><option value="FAILED">{tr("Fallidos")}</option></select></label>
        <label className="audit-select"><span>{filterNames.from}</span><input type="date" aria-label={filterNames.from} value={filters.from} max={filters.to || undefined} aria-invalid={Boolean(dateError)} onChange={(event) => updateFilter('from', event.target.value)} /></label>
        <label className="audit-select"><span>{filterNames.to}</span><input type="date" aria-label={filterNames.to} value={filters.to} min={filters.from || undefined} aria-invalid={Boolean(dateError)} onChange={(event) => updateFilter('to', event.target.value)} /></label>
        {!global && <><label className="audit-select"><span>{filterNames.action}</span><select aria-label={filterNames.action} value={filters.action} onChange={(event) => updateFilter('action', event.target.value)}><option value="">{tr("Todas")}</option>{result?.facets?.actions.map((item) => <option key={item.value} value={item.value}>{humanize(item.value)} ({item.count})</option>)}</select></label><label className="audit-select"><span>{filterNames.resourceType}</span><select aria-label={filterNames.resourceType} value={filters.resourceType} onChange={(event) => updateFilter('resourceType', event.target.value)}><option value="">{tr("Todos")}</option>{result?.facets?.resources.map((item) => <option key={item.value} value={item.value}>{humanize(item.value)} ({item.count})</option>)}</select></label></>}
        {hasFilters && <button type="button" className="button button-ghost compact" onClick={() => { setFilters({ search: '', outcome: '', action: '', resourceType: '', tenantId: '', from: '', to: '' }); setPage(1); }}><X size={15} />{tr(" Limpiar")}</button>}
      </div>

      {loading && result && <p className="sr-only" role="status">{tr("Actualizando auditoría…")}</p>}
      {!result && (error || dateError) ? null : loading && !result ? <Spinner /> : !result?.items.length ? <Empty icon={<FileSearch />} title={tr("No hay eventos para estos filtros")} text={tr("Ajusta la búsqueda o el ámbito para consultar la trazabilidad.")} /> : <div className="audit-table-wrap premium-scroll-list">
        <table className="audit-table"><thead><tr><th>{tr("Fecha y hora")}</th><th>{tr("Actor")}</th><th>{tr("Acción")}</th><th>{tr("Recurso")}</th><th>{tr("Resultado")}</th><th aria-label={tr("Detalles")} /></tr></thead><tbody>{result.items.map((event) => {
          const open = expanded === event.id;
          return <Fragment key={event.id}>
            <tr className={open ? 'expanded' : ''} onClick={() => setExpanded(open ? null : event.id)}>
              <td><strong>{new Intl.DateTimeFormat(localeTag(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.created_at))}</strong><small>{event.tenant_name ?? ''}</small></td>
              <td><strong data-no-translate>{event.actor_name}</strong><small data-no-translate={event.actor_email ? true : undefined}>{event.actor_email ?? tr("Proceso del sistema")}</small></td>
              <td><strong id={`audit-event-${event.id}`}>{humanize(event.action)}</strong><small data-no-translate>{event.action}</small></td>
              <td><strong>{humanize(event.resource_type)}</strong><small data-no-translate={event.resource_id ? true : undefined}>{event.resource_id ?? tr("Sin identificador")}</small></td>
              <td><span className={`audit-outcome ${event.outcome.toLowerCase()}`}>{event.outcome === 'SUCCESS' ? <CheckCircle2 /> : <AlertTriangle />}{event.outcome === 'SUCCESS' ? tr("Correcto") : event.outcome === 'REJECTED' ? tr("Rechazado") : tr("Fallido")}</span></td>
              <td><button type="button" className="icon-button" aria-label={open ? tr("Ocultar detalles") : tr("Ver detalles")} aria-describedby={`audit-event-${event.id}`} aria-expanded={open} aria-controls={`audit-detail-${event.id}`} onClick={(clickEvent) => { clickEvent.stopPropagation(); setExpanded(open ? null : event.id); }}><ChevronDown className={open ? 'open' : ''} aria-hidden="true" /></button></td>
            </tr>
            {open && <tr className="audit-detail" id={`audit-detail-${event.id}`}><td colSpan={6}><div className="audit-detail-grid"><div><span>{tr("Correlación")}</span><strong data-no-translate={event.correlation_id ? true : undefined}><Fingerprint aria-hidden="true" /> {event.correlation_id ?? tr("No aplica")}</strong></div><div><span>{tr("Motivo registrado")}</span><strong>{event.reason ?? tr("Sin observaciones adicionales")}</strong></div><div className="audit-payload"><span>{tr("Contexto seguro")}</span><pre data-no-translate>{JSON.stringify(protectedData(event.after_data ?? event.before_data ?? {}), null, 2)}</pre></div></div></td></tr>}
          </Fragment>;
        })}</tbody></table>
      </div>}

      {result && <footer className="audit-pagination"><span role="status">{tr("Mostrando ")}{result.items.length}{tr(" de ")}{result.pagination.total}{tr(" eventos · Página ")}{result.pagination.page}{tr(" de ")}{result.pagination.pages}</span><div><button type="button" className="icon-button" aria-label={tr("Página anterior")} disabled={page <= 1 || loading || Boolean(dateError)} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft aria-hidden="true" /></button><button type="button" className="icon-button" aria-label={tr("Página siguiente")} disabled={page >= result.pagination.pages || loading || Boolean(dateError)} onClick={() => setPage((current) => current + 1)}><ChevronRight aria-hidden="true" /></button></div></footer>}
    </section>
  </div>;
}
