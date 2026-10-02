'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, Mail, MessageCircle, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { Shell } from '@/components/shell';
import { Empty, Notice, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { currentLocale, localeTag } from '@/lib/i18n';
import { useExperience } from '@/components/experience-provider';
import { Modal } from '@/components/modal';
import { canRecoverPublications, publicationQueueSources, publicationRetryEndpoint, publicationUnavailableLabel, readPublicationQueues, schedulePublicationRetry, type FailedPublication, type PublicationQueueResult, type PublicationQueueSource } from '@/components/outbox-recovery';
import { localizedDateFormat } from '@/lib/locale-format';
import { sessionRecoveredEvent } from '@/lib/session-recovery';

type Notification = { id: string; title: string; body: string; read_at: string | null; created_at: string; deliveries: Record<string, string> };
type Preferences = { emailEnabled: boolean; whatsappEnabled: boolean; remindersEnabled: boolean; optionalUpdatesEnabled: boolean };
type DeadLetter = { id: string; title: string; channel: string; attempts: number; error: string | null; updated_at: string };

export default function NotificationsPage() {
  const { tr } = useExperience();

  const [items, setItems] = useState<Notification[] | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saved, setSaved] = useState(false);
  const [deadLetters, setDeadLetters] = useState<DeadLetter[] | null>(null);
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canRecover, setCanRecover] = useState(false);
  const [publicationQueues, setPublicationQueues] = useState<PublicationQueueResult[] | null>(null);
  const [publicationsLoading, setPublicationsLoading] = useState(false);
  const [publicationsError, setPublicationsError] = useState('');
  const [publicationMessage, setPublicationMessage] = useState('');
  const [selectedPublication, setSelectedPublication] = useState<(FailedPublication & {source:PublicationQueueSource}) | null>(null);
  const [retryReason, setRetryReason] = useState('');
  const [retryError, setRetryError] = useState('');
  const [retryingPublication, setRetryingPublication] = useState(false);
  const publicationRequest = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    try { const result = await api<{ items: Notification[] }>('/notifications'); setItems(result.items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible cargar las notificaciones.'); }
  }, []);
  const loadDeadLetters = useCallback(async () => {
    try { const result = await api<{ items: DeadLetter[] }>('/notifications/dead-letter'); setDeadLetters(result.items); }
    catch (reason) {
      setDeadLetters(null);
      if (!(reason instanceof ApiError && reason.status === 403)) setError(reason instanceof Error ? reason.message : 'No fue posible cargar las notificaciones.');
    }
  }, []);
  const loadPreferences = useCallback(async () => {
    try { setPreferences(await api<Preferences>('/notifications/preferences')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible cargar las preferencias.'); }
  }, []);
  const loadPublications = useCallback(async () => {
    publicationRequest.current?.abort(); const controller = new AbortController(); publicationRequest.current = controller;
    setPublicationsLoading(true); setPublicationsError('');
    try {
      const { user } = await api<{user:{permissions:string[]}}>('/me',{signal:controller.signal});
      if (controller.signal.aborted) return;
      const allowed = canRecoverPublications(user.permissions); setCanRecover(allowed);
      if (!allowed) { setPublicationQueues(null); setSelectedPublication(null); setRetryReason(''); return; }
      const queues = await readPublicationQueues(path => api<{items:FailedPublication[]}>(path,{signal:controller.signal}));
      if (!controller.signal.aborted) setPublicationQueues(queues);
    } catch (reason) { if (!controller.signal.aborted) { setPublicationQueues(null); setPublicationsError(reason instanceof Error ? reason.message : 'No fue posible cargar la cola de publicaciones.'); } }
    finally { if (!controller.signal.aborted) setPublicationsLoading(false); }
  }, []);
  function reload() { setError(''); void load(); void loadDeadLetters(); void loadPreferences(); void loadPublications(); }
  useEffect(() => { void load(); void loadDeadLetters(); void loadPreferences(); void loadPublications(); }, [load, loadDeadLetters, loadPreferences, loadPublications]);
  useEffect(() => { const recovered = () => { void loadDeadLetters(); void loadPublications(); }; window.addEventListener(sessionRecoveredEvent,recovered); return () => window.removeEventListener(sessionRecoveredEvent,recovered); }, [loadDeadLetters,loadPublications]);
  useEffect(() => () => publicationRequest.current?.abort(), []);
  async function retryPublication(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPublication || !canRecover || retryingPublication) return;
    setRetryingPublication(true); setRetryError(''); setPublicationMessage('');
    try {
      const source = selectedPublication.source;
      await schedulePublicationRetry(selectedPublication, retryReason, (id, body) => api(publicationRetryEndpoint(source,id), {method:'POST',body:JSON.stringify(body)}));
      setSelectedPublication(null); setRetryReason(''); setPublicationMessage(tr('Publicación reprogramada con el mismo identificador. La entrega todavía no está confirmada.')); await loadPublications();
    } catch (reason) { setRetryError(reason instanceof Error ? reason.message : tr('No fue posible reprogramar la publicación.')); }
    finally { setRetryingPublication(false); }
  }
  async function read(id: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { await api(`/notifications/${id}/read`, { method: 'PATCH' }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible actualizar la notificación.'); }
    finally { setBusy(false); }
  }
  async function savePreferences(next: Preferences) {
    if (busy) return;
    setBusy(true); setSaved(false); setError('');
    try {
      await api('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(next) });
      setPreferences(next); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible guardar las preferencias.'); }
    finally { setBusy(false); }
  }
  async function retry(id: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { await api(`/notifications/deliveries/${id}/retry`, { method: 'POST' }); await loadDeadLetters(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible reintentar la entrega.'); }
    finally { setBusy(false); }
  }
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return (items ?? []).filter((item) => {
      const matchesSearch = !query || `${item.title} ${item.body} ${Object.keys(item.deliveries).join(' ')}`.toLocaleLowerCase('es').includes(query);
      const matchesVisibility = visibility === 'ALL' || (visibility === 'UNREAD' ? !item.read_at : Boolean(item.read_at));
      return matchesSearch && matchesVisibility;
    });
  }, [items, search, visibility]);
  return <Shell title={tr("Notificaciones")} eyebrow={tr("Centro de alertas")}>
    {publicationMessage && <Notice tone="success" title={tr('Reintento programado')}>{publicationMessage}</Notice>}
    {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}<button type="button" className="button button-secondary" onClick={reload} disabled={busy}>{tr("Reintentar")}</button></Notice>}
    <section className="panel preference-panel"><div><span className="preference-icon"><SlidersHorizontal /></span><div><h2>{tr("Canales y recordatorios")}</h2><p>{tr("Las alertas críticas permanecen en la aplicación. WhatsApp requiere consentimiento explícito.")}</p></div></div>{preferences && <div className="preference-toggles"><label><input type="checkbox" disabled={busy} checked={preferences.emailEnabled} onChange={(event) => void savePreferences({ ...preferences, emailEnabled: event.target.checked })} /><span>{tr("Correo")}</span></label><label><input type="checkbox" disabled={busy} checked={preferences.whatsappEnabled} onChange={(event) => void savePreferences({ ...preferences, whatsappEnabled: event.target.checked })} /><span>{tr("WhatsApp")}</span></label><label><input type="checkbox" disabled={busy} checked={preferences.remindersEnabled} onChange={(event) => void savePreferences({ ...preferences, remindersEnabled: event.target.checked })} /><span>{tr("Recordatorios")}</span></label><label><input type="checkbox" disabled={busy} checked={preferences.optionalUpdatesEnabled} onChange={(event) => void savePreferences({ ...preferences, optionalUpdatesEnabled: event.target.checked })} /><span>{tr("Actualizaciones opcionales")}</span></label>{saved && <small role="status">{tr("Preferencias guardadas")}</small>}</div>}</section>
    <section className="panel notification-panel"><div className="list-command-bar"><div><span className="eyebrow">{tr("Bandeja inteligente")}</span><h2>{tr("Historial de alertas")}</h2><small>{filteredItems.length}{tr(" de ")}{items?.length ?? 0}{tr(" visibles")}</small></div><label className="premium-search"><Search /><input aria-label={tr("Buscar notificaciones")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Buscar alerta, actividad o canal…")} />{search && <button type="button" onClick={() => setSearch('')} aria-label={tr("Limpiar búsqueda de notificaciones")}><X /></button>}</label><fieldset className="list-filter-pills" aria-label={tr("Filtrar notificaciones")}>{([['ALL','Todas'],['UNREAD','No leídas'],['READ','Leídas']] as const).map(([value,label]) => <button type="button" key={value} className={visibility === value ? 'active' : ''} onClick={() => setVisibility(value)}>{label}</button>)}</fieldset></div>{!items ? error ? null : <Spinner /> : items.length === 0 ? <Empty icon={<Bell />} title={tr("Todo está al día")} text={tr("Las alertas del calendario aparecerán aquí.")} /> : filteredItems.length === 0 ? <div className="list-empty-compact notification-empty"><Search /><strong>{tr("No hay alertas que coincidan")}</strong><span>{tr("Ajusta la búsqueda o el filtro de lectura.")}</span></div> : <div className="notification-list premium-scroll-list">{filteredItems.map((item) => <article className={`notification-row ${item.read_at ? '' : 'unread'}`} key={item.id}><span className="notification-icon"><Bell /></span><div><div className="notification-title"><strong>{item.title}</strong><time>{new Intl.DateTimeFormat(localeTag(currentLocale()), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</time></div><p>{item.body}</p><div className="delivery-tags"><span><Bell size={13} />{tr(" En app")}</span>{item.deliveries.EMAIL && <span><Mail size={13} /> {item.deliveries.EMAIL}</span>}{item.deliveries.WHATSAPP && <span><MessageCircle size={13} /> {item.deliveries.WHATSAPP === 'SIMULATED' ? tr("Simulado") : item.deliveries.WHATSAPP}</span>}</div></div>{!item.read_at && <button type="button" className="icon-button" disabled={busy} onClick={() => void read(item.id)} aria-label={tr("Marcar como leída")} title={tr("Marcar como leída")}><CheckCheck size={19} /></button>}</article>)}</div>}</section>
    {deadLetters && deadLetters.length > 0 && <section className="panel notification-panel"><div className="panel-heading"><div><span className="eyebrow">{tr("Administración")}</span><h2>{tr("Entregas que requieren atención")}</h2></div></div><div className="notification-list premium-scroll-list compact-scroll">{deadLetters.map((item) => <article className="notification-row" key={item.id}><span className="notification-icon"><AlertTriangle /></span><div><strong>{item.title}</strong><p>{item.channel} · {item.attempts}{tr(" intentos · ")}{item.error ?? tr("Proveedor no disponible")}</p></div><button type="button" className="button button-secondary" disabled={busy} onClick={() => void retry(item.id)}><RefreshCw size={16} />{tr(" Reintentar")}</button></article>)}</div></section>}
    {canRecover && <section className="panel notification-panel" aria-label={tr('Cola de publicaciones agotadas')}>
      <div className="panel-heading"><div><span className="eyebrow">{tr('Administración')}</span><h2>{tr('Publicaciones que agotaron sus intentos')}</h2><p>{tr('Solo metadatos operativos. Reprogramar no confirma una entrega ni crea otro evento.')}</p></div><button type="button" className="button button-ghost" disabled={publicationsLoading || retryingPublication} onClick={() => void loadPublications()}><RefreshCw size={16}/>{tr('Actualizar cola')}</button></div>
      {publicationsError && <Notice tone="danger" title={tr('No fue posible cargar la cola de publicaciones')}>{publicationsError}<button type="button" className="button button-ghost" disabled={publicationsLoading} onClick={() => void loadPublications()}>{tr('Reintentar')}</button></Notice>}
      {publicationsLoading ? <Spinner/> : publicationQueues?.map(queue => <section key={queue.source} aria-labelledby={`publication-source-${queue.source}`}>
        <h3 id={`publication-source-${queue.source}`}>{tr('Fuente:')} {tr(publicationQueueSources.find(item=>item.source===queue.source)!.label)}</h3>
        {queue.error ? <Notice tone="danger" title={tr('No fue posible cargar esta cola')}>{queue.error.message}<button type="button" className="button button-ghost" disabled={publicationsLoading} onClick={() => void loadPublications()}>{tr('Reintentar')}</button></Notice> : queue.items && (queue.items.length ? <div className="notification-list premium-scroll-list compact-scroll">{queue.items.map((item) => <article className="notification-row" key={item.id}>
          <span className="notification-icon"><AlertTriangle/></span><div>
            <strong>{tr(publicationUnavailableLabel(item) ?? 'Publicación pendiente')} · {item.eventType}</strong>
            <p>{tr('Evento:')} {item.id} · {tr('Recurso:')} {item.aggregateId}</p>
            <small>{item.attempts} {tr('intentos')} · {localizedDateFormat({dateStyle:'medium',timeStyle:'short'}).format(new Date(item.createdAt))}</small>
            {item.expiresAt && <p>{tr('Válido hasta:')} {localizedDateFormat({dateStyle:'medium',timeStyle:'short'}).format(new Date(item.expiresAt))}</p>}
          </div><button type="button" className="button button-secondary" disabled={retryingPublication || item.retryable === false} onClick={() => { setSelectedPublication({...item,source:queue.source}); setRetryReason(''); setRetryError(''); }}><RefreshCw size={16}/>{tr('Reprogramar publicación')}</button>
        </article>)}</div> : <Empty title={tr('Sin publicaciones agotadas')} text={tr('Esta cola no contiene eventos pendientes con los intentos agotados.')}/>)}
      </section>)}
    </section>}
    {selectedPublication && <Modal busy={retryingPublication} label={tr('Confirmar reprogramación')} onClose={() => setSelectedPublication(null)}><form className="modal-card premium-modal" onSubmit={retryPublication}>
      <button data-dialog-close type="button" className="modal-close" aria-label={tr('Cerrar')} onClick={() => setSelectedPublication(null)}><X/></button><span className="modal-symbol"><RefreshCw/></span><h2>{tr('Confirmar reprogramación')}</h2>
      <p>{tr('Se volverá a intentar la publicación del mismo evento. El procesamiento es asíncrono y la entrega no está garantizada.')}</p><p>{tr('Fuente:')} {tr(publicationQueueSources.find(item=>item.source===selectedPublication.source)!.label)} · {selectedPublication.eventType} · {selectedPublication.id}</p>
      {retryError && <Notice tone="danger" title={tr('No fue posible reprogramar la publicación')}>{retryError}</Notice>}
      <label>{tr('Razón operativa del reintento')}<textarea required minLength={10} maxLength={500} rows={3} value={retryReason} onChange={(event) => setRetryReason(event.target.value)} aria-describedby="publication-retry-help"/></label><small id="publication-retry-help" className="field-help">{tr('Indica una razón operativa de 10 a 500 caracteres, sin datos sensibles.')}</small>
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setSelectedPublication(null)}>{tr('Cancelar')}</button><button type="submit" className="button button-primary" disabled={retryingPublication || retryReason.trim().length < 10}>{retryingPublication ? tr('Guardando…') : tr('Confirmar y reprogramar')}</button></div>
    </form></Modal>}
  </Shell>;
}
