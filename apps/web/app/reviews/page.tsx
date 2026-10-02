'use client';

import { Modal } from '@/components/modal';
import { useExperience } from '@/components/experience-provider';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CalendarClock, CalendarPlus2, Check, CheckCircle2, ClipboardCheck, FilePenLine, MapPin, MessageCircle, Play, Plus, Search, Send, ShieldCheck, Sparkles, Square, UserCheck, Users, X, XCircle } from 'lucide-react';
import { Shell } from '@/components/shell';
import { Badge, Empty, Notice, Spinner } from '@/components/ui';
import { api, ApiError, dateTimeLocal, formatDate } from '@/lib/api';
import { currentLocale, localeTag, badgeStatusLabel } from '@/lib/i18n';

type ConflictDetail = { activity_id: string; code: string; title: string; department: string; department_color?: string; responsible_name?: string; submitted_by_name?: string; submitted_at?: string; starts_at: string; ends_at: string; disputed_start?: string; disputed_end?: string; venue?: string | null; reservation_status?: string; same_venue: boolean; same_resource?: boolean; same_responsible?: boolean; scope_conflict?: boolean; shared_resources?: string[]; has_priority?: boolean };
type Alternative = { id: string; label: string; preference: number; status: string; sessions: Array<{ startsAt: string; endsAt: string; setupMinutes?: number; teardownMinutes?: number }> };
type Review = { id: string; activity_id: string; requested_option_id: string; code: string; title: string; department: string; department_color?: string; responsible_name: string; requested_by_name?: string; requested_submitted_at?: string; preference_basis?: string; reason: string; impact: string; coexistence_plan: string; resource_plan: string; alternative: string; status: string; severity: string; postponed_until?: string; details: ConflictDetail[]; sessions: Array<{ startsAt: string; endsAt: string }>; options: Alternative[]; recommendations: Array<{ recommendation: string; notes: string }> };
type Approval = { id: string; code: string; title: string; department: string; responsible_name: string; sessions: Array<{ startsAt: string; endsAt: string }> };
type ReviewSessionParticipant = { userId: string; name: string; email: string; phone?: string; roles: string[]; role: string; attended: boolean; invitationStatus: 'PENDING' | 'CONFIRMED' | 'DECLINED'; respondedAt?: string; whatsappEnabled: boolean; deliveries: Record<string, string> };
type ReviewSession = { id: string; title: string; scheduled_at: string; ends_at: string; location?: string; agenda: string; status: string; minutes: string; cases: number; created_by_name: string; participants: ReviewSessionParticipant[]; review_requests: Array<{ id: string; code: string; title: string; status: string }> };
type EligibleParticipant = { id: string; name: string; email: string; phone?: string; roles: string[]; whatsappEnabled: boolean; whatsappConsentedAt?: string; departments: Array<{ id: string; name: string; role: string }> };
type ActivityChangeRequest = { id: string; activity_id: string; code: string; title: string; department: string; department_color: string; requested_by_name: string; reason: string; status: string; created_at: string; proposed_changes: Record<string, unknown> };
type ReviewCapabilities = { canCreateAlternatives: boolean; canResolve: boolean };
type AlternativeSuggestion = { startsAt: string; endsAt: string; setupMinutes: number; teardownMinutes: number; explanation: string };

function conflictRange(conflict: ConflictDetail) {
  const startsAt = new Date(conflict.disputed_start ?? conflict.starts_at);
  const endsAt = new Date(conflict.disputed_end ?? conflict.ends_at);
  const date = new Intl.DateTimeFormat(localeTag(currentLocale()), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(startsAt);
  const time = new Intl.DateTimeFormat(localeTag(currentLocale()), { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time.format(startsAt)}–${time.format(endsAt)}`;
}

function conflictReasons(conflict: ConflictDetail) {
  return [
    'Superposición de horario congregacional',
    conflict.same_venue && `Mismo lugar${conflict.venue ? `: ${conflict.venue}` : ''}`,
    conflict.same_resource && (conflict.shared_resources?.length ? `Recursos exclusivos: ${conflict.shared_resources.join(', ')}` : 'Recurso exclusivo compartido'),
    conflict.same_responsible && 'Mismo responsable',
    conflict.scope_conflict && 'Audiencia de alcance general'
  ].filter(Boolean) as string[];
}

function AlternativePlanner({ review, selectedId, canCreate, onSelect, onCreated, onError }: {
  review: Review;
  selectedId: string;
  canCreate: boolean;
  onSelect: (id: string) => void;
  onCreated: (id: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const { tr } = useExperience();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AlternativeSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ label: 'Alternativa de la junta', startsAt: '', endsAt: '', setupMinutes: 0, teardownMinutes: 0 });
  const alternatives = review.options.filter((option) => option.id !== review.requested_option_id && !['RELEASED', 'REJECTED'].includes(option.status));

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    onError('');
    try {
      const result = await api<{ items: AlternativeSuggestion[] }>(`/review-requests/${review.id}/alternative-suggestions?limit=5`);
      setSuggestions(result.items);
      if (result.items[0] && !draft.startsAt) {
        setDraft((current) => ({
          ...current,
          startsAt: dateTimeLocal(new Date(result.items[0]!.startsAt)),
          endsAt: dateTimeLocal(new Date(result.items[0]!.endsAt)),
          setupMinutes: result.items[0]!.setupMinutes,
          teardownMinutes: result.items[0]!.teardownMinutes
        }));
      }
    } catch (error) {
      onError(error instanceof ApiError ? error.message : 'No fue posible calcular horarios libres.');
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function applySuggestion(suggestion: AlternativeSuggestion, index: number) {
    setDraft({
      label: `Alternativa ${index + 1} · horario libre`,
      startsAt: dateTimeLocal(new Date(suggestion.startsAt)),
      endsAt: dateTimeLocal(new Date(suggestion.endsAt)),
      setupMinutes: suggestion.setupMinutes,
      teardownMinutes: suggestion.teardownMinutes
    });
  }

  async function createAlternative() {
    if (!draft.label.trim() || !draft.startsAt || !draft.endsAt) {
      onError('Complete el nombre, inicio y finalización de la alternativa.');
      return;
    }
    if (new Date(draft.endsAt) <= new Date(draft.startsAt)) {
      onError('La finalización debe ser posterior al inicio.');
      return;
    }
    setSaving(true);
    onError('');
    try {
      const created = await api<Alternative>(`/review-requests/${review.id}/alternatives`, {
        method: 'POST',
        body: JSON.stringify({
          label: draft.label.trim(),
          startsAt: new Date(draft.startsAt).toISOString(),
          endsAt: new Date(draft.endsAt).toISOString(),
          setupMinutes: Number(draft.setupMinutes),
          teardownMinutes: Number(draft.teardownMinutes)
        })
      });
      setBuilderOpen(false);
      await onCreated(created.id);
    } catch (error) {
      onError(error instanceof ApiError ? error.message : 'No fue posible crear la alternativa.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="alternative-workspace" aria-labelledby="alternative-title">
    <div className="alternative-workspace-head">
      <span><CalendarPlus2 /></span>
      <div><small>{tr("Resolución sin colisiones")}</small><h3 id="alternative-title">{tr("Alternativas de calendario")}</h3><p>{tr("Seleccione una opción libre para que la secretaría pueda autorizarla.")}</p></div>
      <b>{alternatives.length}</b>
    </div>
    {alternatives.length > 0 ? <div className="alternative-card-list">{alternatives.map((option) => {
      const session = option.sessions[0];
      const selected = selectedId === option.id;
      return <button type="button" className={`alternative-card ${selected ? 'selected' : ''}`} key={option.id} onClick={() => onSelect(option.id)} aria-pressed={selected}>
        <span className="alternative-radio">{selected ? <Check /> : <i />}</span>
        <div><span><strong>{option.label}</strong><Badge status={option.status} /></span><time>{session ? formatDate(session.startsAt) : tr("Horario pendiente")}</time>{session && <small>{tr("Hasta ")}{new Intl.DateTimeFormat(localeTag(currentLocale()), { hour: 'numeric', minute: '2-digit' }).format(new Date(session.endsAt))}</small>}</div>
        <span className="availability-seal"><ShieldCheck />{tr(" Libre")}</span>
      </button>;
    })}</div> : <div className="alternative-empty"><Sparkles /><div><strong>{tr("Aún no hay alternativas creadas")}</strong><span>{canCreate ? tr("Use horarios inteligentes o defina una opción manualmente.") : tr("El administrador del tenant puede preparar opciones libres para esta decisión.")}</span></div></div>}
    {canCreate && <>
      <button type="button" className="alternative-create-trigger" onClick={() => { const opening = !builderOpen; setBuilderOpen(opening); if (opening && suggestions.length === 0) void loadSuggestions(); }}><Plus /> {builderOpen ? tr("Cerrar creador") : tr("Crear alternativa")}</button>
      {builderOpen && <div className="alternative-builder">
        <div className="alternative-builder-title"><div><span className="eyebrow">{tr("Administrador del tenant")}</span><h4>{tr("Nueva alternativa")}</h4></div><button type="button" className="button button-ghost" disabled={loadingSuggestions} onClick={loadSuggestions}><Sparkles /> {loadingSuggestions ? tr("Calculando…") : tr("Actualizar sugerencias")}</button></div>
        {suggestions.length > 0 && <div className="smart-slots"><small>{tr("Horarios libres recomendados")}</small><div>{suggestions.map((suggestion, index) => <button type="button" key={suggestion.startsAt} onClick={() => applySuggestion(suggestion, index)}><Sparkles /><span><strong>{formatDate(suggestion.startsAt)}</strong><small>{new Intl.DateTimeFormat(localeTag(currentLocale()), { hour: 'numeric', minute: '2-digit' }).format(new Date(suggestion.startsAt))}–{new Intl.DateTimeFormat(localeTag(currentLocale()), { hour: 'numeric', minute: '2-digit' }).format(new Date(suggestion.endsAt))}</small></span></button>)}</div></div>}
        <div className="alternative-form-grid">
          <label className="field-span">{tr("Nombre de la alternativa")}<input value={draft.label} maxLength={120} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder={tr("Ej. Domingo por la tarde")} /></label>
          <label>{tr("Inicio")}<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label>
          <label>{tr("Finalización")}<input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></label>
          <label>{tr("Montaje (min)")}<input type="number" min="0" max="1440" value={draft.setupMinutes} onChange={(event) => setDraft({ ...draft, setupMinutes: Number(event.target.value) })} /></label>
          <label>{tr("Desmontaje (min)")}<input type="number" min="0" max="1440" value={draft.teardownMinutes} onChange={(event) => setDraft({ ...draft, teardownMinutes: Number(event.target.value) })} /></label>
        </div>
        <div className="alternative-builder-footer"><span><ShieldCheck />{tr(" El horario se revalida contra todas las reservas antes de guardarse.")}</span><button type="button" className="button button-primary" disabled={saving || !draft.startsAt || !draft.endsAt} onClick={createAlternative}>{saving ? tr("Validando…") : tr("Guardar alternativa")}</button></div>
      </div>}
    </>}
  </section>;
}

function initialMeetingDraft() {
  const startsAt = new Date(Date.now() + 86_400_000);
  startsAt.setHours(19, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  return {
    title: 'Junta de revisión de actividades',
    startsAt: dateTimeLocal(startsAt),
    endsAt: dateTimeLocal(endsAt),
    location: 'Sala de juntas',
    agenda: 'Revisión de actividades pendientes, análisis de conflictos y registro de acuerdos.',
    reminderMinutes: [1440, 60]
  };
}

function ReviewSessionCenter({ sessions, eligible, cases, canManage, viewerId, initialSessionId, onReload, onError }: {
  sessions: ReviewSession[];
  eligible: EligibleParticipant[];
  cases: Review[];
  canManage: boolean;
  viewerId: string;
  initialSessionId?: string;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { tr } = useExperience();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId ?? '');
  const [draft, setDraft] = useState(initialMeetingDraft);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [minutes, setMinutes] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const activeSessions = sessions.filter((session) => ['SCHEDULED', 'IN_PROGRESS'].includes(session.status));
  const visibleSessions = useMemo(() => {
    const query = sessionSearch.trim().toLocaleLowerCase('es');
    if (!query) return sessions;
    return sessions.filter((session) => `${session.title} ${session.location ?? ''} ${session.status} ${session.participants.map((participant) => participant.name).join(' ')} ${session.review_requests.map((item) => `${item.code} ${item.title}`).join(' ')}`.toLocaleLowerCase('es').includes(query));
  }, [sessionSearch, sessions]);
  const confirmed = selectedSession?.participants.filter((participant) => participant.invitationStatus === 'CONFIRMED').length ?? 0;
  const pending = selectedSession?.participants.filter((participant) => participant.invitationStatus === 'PENDING').length ?? 0;
  const filteredParticipants = eligible.filter((participant) => `${participant.name} ${participant.email} ${participant.departments.map((department) => department.name).join(' ')}`.toLowerCase().includes(participantSearch.toLowerCase()));

  function openCreator() {
    const recommended = eligible.filter((participant) => participant.roles.some((role) => ['TENANT_ADMIN', 'BOARD_SECRETARY', 'PASTOR', 'REVIEWER'].includes(role))).map((participant) => participant.id);
    setDraft(initialMeetingDraft());
    setParticipantIds(recommended.length ? recommended : eligible.slice(0, 2).map((participant) => participant.id));
    setCaseIds(cases.filter((item) => ['PENDING', 'POSTPONED'].includes(item.status)).slice(0, 5).map((item) => item.id));
    setParticipantSearch('');
    setCreatorOpen(true);
  }

  function toggleValue(values: string[], value: string, setter: (next: string[]) => void) {
    setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  async function createSession() {
    if (participantIds.length === 0) return onError('Seleccione al menos un participante con usuario.');
    if (!draft.startsAt || !draft.endsAt || draft.agenda.trim().length < 10) return onError('Complete fecha, horario y agenda de la junta.');
    setSaving(true);
    onError('');
    try {
      const created = await api<{ id: string }>('/review-sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: draft.title,
          scheduledAt: new Date(draft.startsAt).toISOString(),
          endsAt: new Date(draft.endsAt).toISOString(),
          location: draft.location,
          agenda: draft.agenda,
          participantIds,
          reviewRequestIds: caseIds,
          reminderMinutes: draft.reminderMinutes
        })
      });
      setCreatorOpen(false);
      setSelectedSessionId(created.id);
      await onReload();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : 'No fue posible crear la sesión de junta.');
    } finally {
      setSaving(false);
    }
  }

  async function updateSession(status: string, nextMinutes?: string) {
    if (!selectedSession) return;
    setSaving(true);
    onError('');
    try {
      await api(`/review-sessions/${selectedSession.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...(nextMinutes !== undefined ? { minutes: nextMinutes } : {}) })
      });
      await onReload();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : 'No fue posible actualizar la sesión.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAttendance(userId: string) {
    if (!selectedSession) return;
    const attended = selectedSession.participants.filter((participant) => participant.attended).map((participant) => participant.userId);
    const next = attended.includes(userId) ? attended.filter((id) => id !== userId) : [...attended, userId];
    try {
      await api(`/review-sessions/${selectedSession.id}`, { method: 'PATCH', body: JSON.stringify({ attendedParticipantIds: next }) });
      await onReload();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : 'No fue posible registrar la asistencia.');
    }
  }

  async function respond(response: 'CONFIRMED' | 'DECLINED') {
    if (!selectedSession) return;
    try {
      await api(`/review-sessions/${selectedSession.id}/response`, { method: 'PATCH', body: JSON.stringify({ response }) });
      await onReload();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : 'No fue posible responder la convocatoria.');
    }
  }

  return <section className="panel session-command-center" id="session-center">
    <header className="session-command-head">
      <div className="session-command-title"><span><CalendarClock /></span><div><small>{tr("Coordinación y seguimiento")}</small><h2>{tr("Sesiones de junta")}</h2><p>{tr("Convocatorias, calendario personal, WhatsApp, asistencia y actas en un solo lugar.")}</p></div></div>
      <div className="session-metrics"><span><strong>{activeSessions.length}</strong><small>{tr("activas")}</small></span><span><strong>{sessions.reduce((total, session) => total + session.participants.length, 0)}</strong><small>{tr('Invitaciones')}</small></span><span><strong>{sessions.filter((session) => session.status === 'CLOSED').length}</strong><small>{tr('Cerradas')}</small></span></div>
      {canManage && <button type="button" className="button button-primary" onClick={openCreator}><CalendarPlus2 />{tr(" Crear sesión")}</button>}
    </header>
    {sessions.length > 0 && <div className="session-search-bar"><label className="premium-search"><Search /><input aria-label={tr("Buscar sesiones de junta")} value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder={tr("Buscar sesión, participante, lugar o caso…")} />{sessionSearch && <button type="button" onClick={() => setSessionSearch('')} aria-label={tr("Limpiar búsqueda de sesiones")}><X /></button>}</label><span>{tr(`${visibleSessions.length} de ${sessions.length} sesiones`)}</span></div>}
    {sessions.length === 0 ? <div className="session-empty"><CalendarPlus2 /><div><strong>{tr("La agenda de la junta está libre")}</strong><span>{tr("Cree una sesión, convoque usuarios y vincule los casos que serán revisados.")}</span></div>{canManage && <button type="button" className="button button-secondary" onClick={openCreator}>{tr("Programar primera junta")}</button>}</div> : visibleSessions.length === 0 ? <div className="list-empty-compact session-search-empty"><Search /><strong>{tr("No encontramos sesiones")}</strong><span>{tr("Prueba con otro título, participante, lugar o caso.")}</span></div> : <div className="session-card-rail">{visibleSessions.map((session) => <button type="button" key={session.id} className={`session-card ${selectedSessionId === session.id ? 'selected' : ''}`} onClick={() => { setSelectedSessionId(session.id); setMinutes(session.minutes ?? ''); }}><span className="session-date"><strong>{new Date(session.scheduled_at).getDate()}</strong><small>{new Intl.DateTimeFormat(localeTag(currentLocale()), { month: 'short' }).format(new Date(session.scheduled_at))}</small></span><span className="session-card-copy"><strong>{session.title}</strong><small>{new Intl.DateTimeFormat(localeTag(currentLocale()), { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(session.scheduled_at))} · {session.location || tr("Lugar por confirmar")}</small><i>{tr(`${session.participants.filter((participant) => participant.invitationStatus === 'CONFIRMED').length}/${session.participants.length} confirmados · ${session.cases} caso(s)`)}</i></span><span className={`badge badge-${session.status.toLowerCase().replaceAll('_', '-')}`} data-status={session.status} data-no-translate>{tr(badgeStatusLabel(session.status))}</span></button>)}</div>}
    {selectedSession && <div className="session-followup">
      <div className="session-followup-head"><div><span className="eyebrow">{tr("Expediente de sesión")}</span><h3>{selectedSession.title}</h3><p><MapPin /> {selectedSession.location || tr("Lugar por confirmar")} · {formatDate(selectedSession.scheduled_at)}–{new Intl.DateTimeFormat(localeTag(currentLocale()), { hour: 'numeric', minute: '2-digit' }).format(new Date(selectedSession.ends_at))}</p></div><button type="button" className="icon-button" aria-label={tr("Cerrar seguimiento")} onClick={() => setSelectedSessionId('')}><X /></button></div>
      <div className="session-progress"><span><strong>{confirmed}</strong><small>{tr("Confirmados")}</small></span><span><strong>{pending}</strong><small>{tr("Sin responder")}</small></span><span><strong>{selectedSession.participants.filter((participant) => participant.attended).length}</strong><small>{tr("Asistieron")}</small></span><span><strong>{selectedSession.cases}</strong><small>{tr("Casos vinculados")}</small></span></div>
      <div className="session-agenda"><strong>{tr("Agenda")}</strong><p>{selectedSession.agenda}</p>{selectedSession.review_requests.length > 0 && <div>{selectedSession.review_requests.map((item) => <span key={item.id}>{item.code} · {item.title}</span>)}</div>}</div>
      <div className="participant-followup-list">{selectedSession.participants.map((participant) => <article key={participant.userId}><span className="participant-avatar">{participant.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><strong>{participant.name}</strong><small>{participant.email}</small><span><Badge status={participant.invitationStatus} />{participant.whatsappEnabled ? <i className={`delivery-state ${participant.deliveries.WHATSAPP?.toLowerCase() ?? 'queued'}`}><MessageCircle />{tr(" WhatsApp: ")}{participant.deliveries.WHATSAPP ?? tr("EN COLA")}</i> : <i className="delivery-state disabled"><MessageCircle />{tr(" Sin consentimiento WhatsApp")}</i>}</span></div>{canManage && <button type="button" className={`attendance-toggle ${participant.attended ? 'active' : ''}`} onClick={() => toggleAttendance(participant.userId)}><UserCheck /> {participant.attended ? tr("Presente") : tr("Marcar asistencia")}</button>}</article>)}</div>
      {selectedSession.participants.some((participant) => participant.userId === viewerId && participant.invitationStatus === 'PENDING') && <div className="rsvp-actions"><span>{tr("¿Participarás en esta sesión?")}</span><button type="button" className="button button-ghost" onClick={() => respond('DECLINED')}>{tr("No podré asistir")}</button><button type="button" className="button button-primary" onClick={() => respond('CONFIRMED')}><Check />{tr(" Confirmar asistencia")}</button></div>}
      {canManage && <div className="session-closeout"><label>{tr("Acta y acuerdos")}<textarea value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder={tr("Registra participantes, acuerdos, responsables y próximos pasos…")} /></label><div>{selectedSession.status === 'SCHEDULED' && <button type="button" className="button button-secondary" disabled={saving} onClick={() => updateSession('IN_PROGRESS')}><Play />{tr(" Iniciar junta")}</button>}<button type="button" className="button button-danger" disabled={saving || ['CLOSED','CANCELLED'].includes(selectedSession.status)} onClick={() => updateSession('CANCELLED')}>{tr("Cancelar")}</button><button type="button" className="button button-primary" disabled={saving || minutes.trim().length < 10 || selectedSession.status === 'CLOSED'} onClick={() => updateSession('CLOSED', minutes)}><Square />{tr(" Cerrar y guardar acta")}</button></div></div>}
    </div>}
    {creatorOpen && <Modal busy={saving} className="session-modal-overlay" label={tr("Crear sesión de junta")} onClose={() => setCreatorOpen(false)}><div className="session-modal">
      <header><div><span className="eyebrow">{tr("Convocatoria premium")}</span><h2 id="session-create-title">{tr("Crear sesión de junta")}</h2><p>{tr("Cada invitado recibirá el evento en su calendario y alertas según sus preferencias.")}</p></div><button data-dialog-close type="button" className="icon-button" aria-label={tr("Cerrar creador de sesión")} onClick={() => setCreatorOpen(false)}><X /></button></header>
      <div className="session-modal-body"><section className="session-form-main"><div className="session-form-grid"><label className="field-span">{tr("Nombre de la sesión")}<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>{tr("Inicio")}<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label><label>{tr("Finalización")}<input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></label><label className="field-span">{tr("Lugar o enlace")}<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder={tr("Sala pastoral o enlace de videollamada")} /></label><label className="field-span">{tr("Agenda")}<textarea value={draft.agenda} onChange={(event) => setDraft({ ...draft, agenda: event.target.value })} /></label></div><div className="reminder-selector"><strong><BellRing />{tr(" Seguimiento automático")}</strong><div>{[{ value: 1440, label: '24 horas' },{ value: 120, label: '2 horas' },{ value: 60, label: '1 hora' },{ value: 30, label: '30 minutos' }].map((reminder) => <button type="button" className={draft.reminderMinutes.includes(reminder.value) ? 'active' : ''} key={reminder.value} onClick={() => toggleValue(draft.reminderMinutes.map(String), String(reminder.value), (next) => setDraft({ ...draft, reminderMinutes: next.map(Number) }))}><Check /> {reminder.label}</button>)}</div></div></section>
        <aside className="session-invite-panel"><div className="invite-panel-head"><div><strong><Users />{tr(" Participantes")}</strong><span>{participantIds.length}{tr(" seleccionados")}</span></div><input value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} placeholder={tr("Buscar usuario o departamento…")} aria-label={tr("Buscar participante")} /></div><div className="invite-user-list">{filteredParticipants.map((participant) => <label key={participant.id} className={participantIds.includes(participant.id) ? 'selected' : ''}><input type="checkbox" checked={participantIds.includes(participant.id)} onChange={() => toggleValue(participantIds, participant.id, setParticipantIds)} /><span className="participant-avatar">{participant.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><span><strong>{participant.name}</strong><small>{participant.departments.map((department) => department.name).join(', ') || participant.roles.join(', ')}</small><i className={participant.whatsappEnabled ? 'ready' : ''}><MessageCircle /> {participant.whatsappEnabled ? tr("WhatsApp habilitado") : tr("Solo app/correo")}</i></span></label>)}</div></aside>
        <section className="session-case-selector"><div><strong><ClipboardCheck />{tr(" Casos para revisar")}</strong><span>{caseIds.length}{tr(" vinculados")}</span></div><div>{cases.filter((item) => ['PENDING','POSTPONED'].includes(item.status)).map((item) => <label key={item.id} className={caseIds.includes(item.id) ? 'selected' : ''}><input type="checkbox" checked={caseIds.includes(item.id)} onChange={() => toggleValue(caseIds, item.id, setCaseIds)} /><span><small>{item.code} · {item.department}</small><strong>{item.title}</strong></span><Badge status={item.severity} /></label>)}</div></section>
      </div>
      <footer><span><Send />{tr(" Se crearán ")}{participantIds.length}{tr(" invitaciones individuales con seguimiento.")}</span><button data-dialog-close type="button" className="button button-ghost" onClick={() => setCreatorOpen(false)}>{tr("Cancelar")}</button><button type="button" className="button button-primary" disabled={saving || participantIds.length === 0} onClick={createSession}>{saving ? tr("Convocando…") : tr("Crear y enviar convocatoria")}</button></footer>
    </div></Modal>}
  </section>;
}

export default function ReviewsPage() {
  const { tr } = useExperience();

  const [data, setData] = useState<{ items: Review[]; approvals: Approval[]; capabilities: ReviewCapabilities } | null>(null);
  const [selected, setSelected] = useState<Review | null>(null);
  const [notes, setNotes] = useState('');
  const [optionId, setOptionId] = useState('');
  const [postponedUntil, setPostponedUntil] = useState('');
  const [recommendation, setRecommendation] = useState('APPROVE');
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [eligibleParticipants, setEligibleParticipants] = useState<EligibleParticipant[]>([]);
  const [canManageSessions, setCanManageSessions] = useState(false);
  const [viewerId, setViewerId] = useState('');
  const [requestedSessionId, setRequestedSessionId] = useState('');
  const [changeRequests, setChangeRequests] = useState<ActivityChangeRequest[]>([]);
  const [selectedChange, setSelectedChange] = useState<ActivityChangeRequest | null>(null);
  const [changeNotes, setChangeNotes] = useState('');
  const [error, setError] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const load = useCallback(async () => {
    try {
      const me = await api<{ user: { sub: string; permissions: string[] } }>('/me');
      const canReview = me.user.permissions.includes('calendar.review');
      const [reviews, meetings, changes] = await Promise.all([
        canReview
          ? api<{ items: Review[]; approvals: Approval[]; capabilities: ReviewCapabilities }>('/review-requests')
          : Promise.resolve({ items: [] as Review[], approvals: [] as Approval[], capabilities: { canCreateAlternatives: false, canResolve: false } }),
        api<{ items: ReviewSession[]; capabilities: { canManageSessions: boolean } }>('/review-sessions'),
        canReview
          ? api<{ items: ActivityChangeRequest[] }>('/activity-change-requests?status=PENDING')
          : Promise.resolve({ items: [] as ActivityChangeRequest[] })
      ]);
      const eligible = meetings.capabilities.canManageSessions
        ? await api<{ items: EligibleParticipant[] }>('/review-sessions/eligible-participants')
        : { items: [] as EligibleParticipant[] };
      setData(reviews);
      setSessions(meetings.items);
      setEligibleParticipants(eligible.items);
      setCanManageSessions(meetings.capabilities.canManageSessions);
      setViewerId(me.user.sub);
      setChangeRequests(changes.items);
      setSelected((current) => current ? reviews.items.find((item) => item.id === current.id) ?? null : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar la junta de revisión.');
    }
  }, []);
  const queueQuery = queueSearch.trim().toLocaleLowerCase('es');
  const filteredApprovals = useMemo(() => (data?.approvals ?? []).filter((item) =>
    !queueQuery || `${item.code} ${item.title} ${item.department} ${item.responsible_name}`.toLocaleLowerCase('es').includes(queueQuery)
  ), [data?.approvals, queueQuery]);
  const filteredReviews = useMemo(() => (data?.items ?? []).filter((item) =>
    !queueQuery || `${item.code} ${item.title} ${item.department} ${item.responsible_name} ${item.status} ${item.details.map((detail) => `${detail.department} ${detail.title}`).join(' ')}`.toLocaleLowerCase('es').includes(queueQuery)
  ), [data?.items, queueQuery]);
  const filteredChangeRequests = useMemo(() => changeRequests.filter((item) =>
    !queueQuery || `${item.code} ${item.title} ${item.department} ${item.requested_by_name} ${item.reason}`.toLocaleLowerCase('es').includes(queueQuery)
  ), [changeRequests, queueQuery]);
  useEffect(() => {
    void load();
    const sessionId = new URLSearchParams(window.location.search).get('sessionId');
    setRequestedSessionId(sessionId && /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : '');
  }, [load]);
  async function approveNormal(id: string) { setError(''); try { await api(`/activities/${id}/approve`, { method: 'POST' }); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'No fue posible aprobar.'); } }
  async function decide(decision: string) { if (!selected) return; setError(''); try { await api(`/review-requests/${selected.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, notes, ...(decision === 'APPROVE_ALTERNATIVE' ? { optionId } : {}), ...(decision === 'POSTPONE' ? { postponedUntil: new Date(postponedUntil).toISOString() } : {}) }) }); setSelected(null); setNotes(''); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'No fue posible registrar la decisión.'); } }
  async function recommend() { if (!selected) return; setError(''); try { await api(`/review-requests/${selected.id}/recommendations`, { method: 'POST', body: JSON.stringify({ recommendation, notes }) }); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'No fue posible registrar la recomendación.'); } }
  async function alternativeCreated(id: string) { setOptionId(id); await load(); }
  async function decideChange(decision: 'APPROVE' | 'REJECT') { if (!selectedChange) return; setError(''); try { await api(`/activity-change-requests/${selectedChange.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, notes: changeNotes }) }); setSelectedChange(null); setChangeNotes(''); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'No fue posible decidir la solicitud de cambio.'); } }
  return <Shell title={tr("Junta de revisión")} eyebrow={tr("Decisiones y conflictos")}>
    {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
    <ReviewSessionCenter key={requestedSessionId || 'session-center'} sessions={sessions} eligible={eligibleParticipants} cases={data?.items ?? []} canManage={canManageSessions} viewerId={viewerId} initialSessionId={requestedSessionId} onReload={load} onError={setError} />
    {data && <section className="panel review-queue-search"><div><span className="eyebrow">{tr("Búsqueda transversal")}</span><strong>{tr("Localiza cualquier caso o solicitud")}</strong><small>{filteredApprovals.length + filteredReviews.length + filteredChangeRequests.length}{tr(" resultados visibles")}</small></div><label className="premium-search"><Search /><input aria-label={tr("Buscar en la junta de revisión")} value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder={tr("Código, actividad, departamento o responsable…")} />{queueSearch && <button type="button" onClick={() => setQueueSearch('')} aria-label={tr("Limpiar búsqueda de revisión")}><X /></button>}</label></section>}
    <section className="panel approved-changes-panel"><div className="panel-heading"><div><span className="eyebrow">{tr("Actividades protegidas")}</span><h2>{tr("Solicitudes de modificación")}</h2><p>{tr("Cambios propuestos por directores después de la aprobación.")}</p></div><span className="count-pill warning">{filteredChangeRequests.length}</span></div>{filteredChangeRequests.length === 0 ? <div className="approved-changes-empty"><ShieldCheck /><div><strong>{queueSearch ? tr("Sin coincidencias") : tr("Todo bajo control")}</strong><span>{queueSearch ? tr("No hay solicitudes de modificación que coincidan con la búsqueda.") : tr("No hay modificaciones de actividades aprobadas esperando autorización.")}</span></div></div> : <div className="approved-change-list premium-scroll-list compact-scroll">{filteredChangeRequests.map((item) => <article className={`approved-change-row ${selectedChange?.id === item.id ? 'selected' : ''}`} key={item.id}><button type="button" onClick={() => { setSelectedChange(item); setChangeNotes(''); }}><span className="review-icon change"><FilePenLine /></span><div><span><b style={{ background: item.department_color }} /> {item.code} · {item.department}</span><strong>{item.title}</strong><small>{item.requested_by_name} · {formatDate(item.created_at)}</small></div><Badge status={item.status} /></button>{selectedChange?.id === item.id && <div className="approved-change-decision"><div><h3>{tr("Justificación")}</h3><p>{item.reason}</p><h3>{tr("Cambios propuestos")}</h3><div className="change-summary">{Object.entries(item.proposed_changes).filter(([key]) => !['expectedVersion','changeReason'].includes(key)).map(([key, value]) => <span key={key}><small>{({ title: 'Nombre', description: 'Descripción', objective: 'Objetivo', responsibleName: 'Responsable', audience: 'Audiencia', estimatedAttendance: 'Asistencia', category: 'Categoría', venueId: 'Lugar', options: 'Fecha y horario' } as Record<string,string>)[key] ?? key}</small><strong>{key === 'options' ? tr("Nuevo horario propuesto") : typeof value === 'object' ? tr("Información actualizada") : String(value)}</strong></span>)}</div></div><label>{tr("Nota de decisión")}<textarea minLength={10} value={changeNotes} onChange={(event) => setChangeNotes(event.target.value)} placeholder={tr("Documenta el fundamento de la decisión…")} /></label><div><button type="button" className="button button-danger" disabled={changeNotes.length < 10} onClick={() => decideChange('REJECT')}><XCircle size={16} />{tr(" Rechazar")}</button><button type="button" className="button button-primary" disabled={changeNotes.length < 10} onClick={() => decideChange('APPROVE')}><CheckCircle2 size={16} />{tr(" Autorizar y aplicar")}</button></div></div>}</article>)}</div>}</section>
    {!data ? <Spinner /> : <div className="review-layout"><section className="review-main">
      <div className="panel review-section drill-target" id="approvals"><div className="panel-heading"><div><span className="eyebrow">{tr("Sin conflictos")}</span><h2>{tr("Pendientes de aprobación")}</h2></div><span className="count-pill">{filteredApprovals.length}</span></div>{filteredApprovals.length === 0 ? <Empty icon={queueSearch ? <Search /> : <CheckCircle2 />} title={queueSearch ? tr("Sin coincidencias") : tr("No hay aprobaciones pendientes")} text={queueSearch ? tr("No hay aprobaciones que coincidan con la búsqueda.") : tr("Las actividades enviadas sin conflictos aparecerán aquí.")} /> : <div className="review-list premium-scroll-list">{filteredApprovals.map((item) => <article className="approval-row" key={item.id}><span className="review-icon safe"><CheckCircle2 /></span><div><strong>{item.title}</strong><span>{item.department} · {item.responsible_name}</span><small>{item.sessions[0] ? formatDate(item.sessions[0].startsAt) : tr("Sin fecha")}</small></div><button type="button" className="button button-secondary" onClick={() => approveNormal(item.id)}>{tr("Aprobar")}</button></article>)}</div>}</div>
      <div className="panel review-section drill-target" id="conflicts"><div className="panel-heading"><div><span className="eyebrow">{tr("Conflictos")}</span><h2>{tr("Solicitudes de coexistencia")}</h2></div><span className="count-pill warning">{filteredReviews.filter((i) => i.status === 'PENDING').length}</span></div>{filteredReviews.length === 0 ? <Empty icon={queueSearch ? <Search /> : <ClipboardCheck />} title={queueSearch ? tr("Sin coincidencias") : tr("No hay casos pendientes")} text={queueSearch ? tr("No hay conflictos que coincidan con la búsqueda.") : tr("Las solicitudes de revisión aparecerán aquí.")} /> : <div className="review-list premium-scroll-list">{filteredReviews.map((item) => <button type="button" className={`review-row conflict-review-row ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { setSelected(item); setNotes(''); }}><span className="review-icon"><AlertTriangle /></span><div><span><Badge status={item.severity} /> <small>{item.code}</small></span><strong>{item.title}</strong><span>{item.department}{item.details[0] ? [tr(" vs. "), item.details[0].department].join('') : ''}</span><small>{item.details[0] ? conflictRange(item.details[0]) : item.sessions[0] ? formatDate(item.sessions[0].startsAt) : tr("Fecha pendiente")}</small></div><div className="review-row-status"><Badge status={item.status} />{item.details[0] && <small>{tr("Preferencia: ")}{item.details[0].department}</small>}</div></button>)}</div>}</div>
    </section><aside className="review-detail panel">{!selected ? <Empty icon={<CalendarClock />} title={tr("Selecciona un caso")} text={tr("Aquí verás las actividades relacionadas y podrás registrar la decisión.")} /> : <><div className="review-detail-head"><span className="eyebrow">{selected.code}</span><h2>{selected.title}</h2><p>{selected.department}{tr(" · Responsable: ")}{selected.responsible_name}</p></div>{selected.details.length > 0 && <section className="conflict-dossier"><div className="conflict-dossier-title"><span><CalendarClock /></span><div><small>{tr("Fecha y horario exactos en disputa")}</small><strong>{conflictRange(selected.details[0]!)}</strong></div></div><div className="preference-rule"><ShieldCheck /><div><strong>{tr("Regla de preferencia activa")}</strong><span>{tr("La primera solicitud válida conserva prioridad. La coexistencia solo puede aprobarse mediante una decisión documentada.")}</span></div></div>{selected.details.map((conflict) => <article className="conflict-pair" key={`${conflict.activity_id}-${conflict.disputed_start ?? conflict.starts_at}`}><div className="conflict-party-card incumbent"><span className="party-rank">{tr("1ª solicitud · Preferencia")}</span><small>{conflict.code} · {conflict.department}</small><h3>{conflict.title}</h3><p>{tr("Presentó: ")}<strong>{conflict.submitted_by_name ?? conflict.responsible_name ?? tr("Responsable registrado")}</strong></p><p>{tr("Responsable: ")}{conflict.responsible_name ?? tr("No indicado")}</p><time>{conflict.submitted_at ? formatDate(conflict.submitted_at) : tr("Registrada antes")}</time></div><div className="conflict-versus">{tr("VS")}</div><div className="conflict-party-card challenger"><span className="party-rank">{tr("2ª solicitud · En revisión")}</span><small>{selected.code} · {selected.department}</small><h3>{selected.title}</h3><p>{tr("Presentó: ")}<strong>{selected.requested_by_name ?? selected.responsible_name}</strong></p><p>{tr("Responsable: ")}{selected.responsible_name}</p><time>{selected.requested_submitted_at ? formatDate(selected.requested_submitted_at) : tr("Presentada después")}</time></div><div className="conflict-cause-list">{conflictReasons(conflict).map((reason) => <span key={reason}>{reason}</span>)}</div></article>)}</section>}<a className="case-session-link" href="#session-center"><CalendarPlus2 /><span><strong>{tr("Vincular este caso a una sesión")}</strong><small>{tr("Use el centro de sesiones para convocar usuarios, enviar alertas y dar seguimiento.")}</small></span></a><div className="detail-block"><h3>{tr("Solicitud")}</h3><p>{selected.reason}</p></div>{selected.impact && <div className="detail-block"><h3>{tr("Impacto declarado")}</h3><p>{selected.impact}</p></div>}<div className="detail-block"><h3>{tr("Plan de coexistencia")}</h3><p>{selected.coexistence_plan}</p>{selected.resource_plan && <small>{selected.resource_plan}</small>}</div>{selected.recommendations.length > 0 && <div className="detail-block"><h3>{tr("Recomendaciones de revisores")}</h3>{selected.recommendations.map((item, index) => <p key={`${item.recommendation}-${index}`}><Badge status={item.recommendation} /> {item.notes}</p>)}</div>}{['PENDING','POSTPONED'].includes(selected.status) && <><label>{tr("Nota oficial o recomendación")}<textarea minLength={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Registra el fundamento y los acuerdos…")} /></label><div className="review-controls"><label>{tr("Recomendación")}<select value={recommendation} onChange={(event) => setRecommendation(event.target.value)}><option value="APPROVE">{tr("Aprobar")}</option><option value="CHANGES">{tr("Pedir cambios")}</option><option value="REJECT">{tr("Rechazar")}</option><option value="ABSTAIN">{tr("Abstención")}</option></select></label><button type="button" className="button button-ghost" disabled={notes.length < 5} onClick={recommend}>{tr("Guardar recomendación")}</button></div><AlternativePlanner key={selected.id} review={selected} selectedId={optionId} canCreate={data.capabilities.canCreateAlternatives} onSelect={setOptionId} onCreated={alternativeCreated} onError={setError} />{data.capabilities.canResolve ? <><label>{tr("Reconsiderar en")}<input type="datetime-local" value={postponedUntil} onChange={(event) => setPostponedUntil(event.target.value)} /></label><div className="decision-actions"><button type="button" className="button button-danger" disabled={notes.length < 10} onClick={() => decide('REJECT')}><XCircle size={17} />{tr(" Rechazar")}</button><button type="button" className="button button-secondary" disabled={notes.length < 10} onClick={() => decide('REQUEST_CHANGES')}>{tr("Pedir cambios")}</button><button type="button" className="button button-secondary" disabled={notes.length < 10 || !postponedUntil} onClick={() => decide('POSTPONE')}>{tr("Posponer")}</button><button type="button" className="button button-secondary" disabled={notes.length < 10 || !optionId} onClick={() => decide('APPROVE_ALTERNATIVE')}>{tr("Aprobar alternativa")}</button><button type="button" className="button button-primary" disabled={notes.length < 10} onClick={() => decide('APPROVE_COEXISTENCE')}><CheckCircle2 size={17} />{tr(" Autorizar coexistencia")}</button></div></> : <div className="resolver-handoff"><ShieldCheck /><div><strong>{tr("Lista para decisión de secretaría")}</strong><span>{tr("El administrador prepara alternativas y recomendaciones; la aprobación final permanece segregada.")}</span></div></div>}</>}</>}</aside></div>}
  </Shell>;
}
