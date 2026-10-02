'use client';

import { Modal } from '@/components/modal';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cloneElement, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { AlertTriangle, ArrowLeft, CalendarPlus, Check, Clock3, FileUp, Plus, Save, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { Shell } from '@/components/shell';
import { Notice, Spinner } from '@/components/ui';
import { api, ApiError, dateTimeLocal, formatDate } from '@/lib/api';
import { activityFieldText, activityTemplateText, type ActivityFormField, type ActivityFormTemplate, type ActivityFormTemplateResponse } from '@/lib/activity-form';
import { newActivitySubmissionProgress, runActivityDraftSave, runActivitySubmission } from '@/components/activity-submission';
import { useExperience } from '@/components/experience-provider';
import { useUnsavedChanges } from '@/components/unsaved-changes-provider';
import { activeRequest } from '@/components/active-request';
import { localizedDateFormat } from '@/lib/locale-format';

type Department = { id: string; name: string; color: string };
type Venue = { id: string; name: string; capacity: number };
type Resource = { id: string; name: string; exclusive: boolean };
type Option = { label: string; start: string; end: string; setupMinutes: number; teardownMinutes: number };
type ConflictDetail = {
  activity_id: string; code: string; title: string; department: string; department_color?: string;
  responsible_name?: string; submitted_by_name?: string; submitted_at?: string;
  starts_at: string; ends_at: string; disputed_start?: string; disputed_end?: string;
  venue?: string | null; reservation_status?: string; same_venue?: boolean; same_resource?: boolean;
  same_responsible?: boolean; scope_conflict?: boolean; shared_resources?: string[];
};
type Availability = {
  available: boolean; conflicts: ConflictDetail[]; severity: string | null;
  requested?: { department?: Department | null; startsAt: string; endsAt: string };
};

function disputedRange(conflict: ConflictDetail) {
  const startsAt = new Date(conflict.disputed_start ?? conflict.starts_at);
  const endsAt = new Date(conflict.disputed_end ?? conflict.ends_at);
  const date = localizedDateFormat({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(startsAt);
  const time = localizedDateFormat({ hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time.format(startsAt)}–${time.format(endsAt)}`;
}

function conflictReasons(conflict: ConflictDetail, tr: (value: string) => string) {
  return [
    tr('Horario congregacional superpuesto'),
    conflict.same_venue && `${tr('Mismo lugar')}${conflict.venue ? `: ${conflict.venue}` : ''}`,
    conflict.same_resource && (conflict.shared_resources?.length ? `${tr('Recursos:')} ${conflict.shared_resources.join(', ')}` : tr('Recurso exclusivo compartido')),
    conflict.same_responsible && tr('Mismo responsable'),
    conflict.scope_conflict && tr('Audiencia de alcance general')
  ].filter(Boolean) as string[];
}

function ConflictPreview({ conflicts, requestedDepartment, requestedBy, requestedStart, requestedEnd }: {
  conflicts: ConflictDetail[]; requestedDepartment: string; requestedBy: string; requestedStart?: string | undefined; requestedEnd?: string | undefined;
}) {
  const { tr } = useExperience();

  if (!conflicts.length) return null;
  return <section className="live-conflict-card" aria-label={tr("Detalle del conflicto detectado")}>
    <div className="live-conflict-head"><span><AlertTriangle /></span><div><small>{tr("Conflicto que requiere resolución")}</small><strong>{requestedDepartment}{tr(" disputa ")}{conflicts.length === 1 ? tr("un horario") : [conflicts.length, tr(" horarios")].join('')}</strong></div></div>
    <div className="conflict-requested-slot"><Clock3 /><div><small>{tr("Fecha y horario en disputa")}</small><strong>{disputedRange(conflicts[0]!)}</strong></div></div>
    <div className="conflict-comparison-list">{conflicts.map((conflict) => <article key={`${conflict.activity_id}-${conflict.disputed_start ?? conflict.starts_at}`}>
      <div className="priority-owner"><span><ShieldCheck />{tr(" Primera solicitud · tiene preferencia")}</span><small>{conflict.submitted_at ? [tr("Presentada "), formatDate(conflict.submitted_at)].join('') : tr("Reserva registrada primero")}</small></div>
      <div className="conflict-party"><i style={{ background: conflict.department_color ?? '#0f766e' }} /><div><small>{conflict.code} · {conflict.department}</small><strong>{conflict.title}</strong><span>{tr("Presentó: ")}{conflict.submitted_by_name ?? conflict.responsible_name ?? tr("Responsable registrado")}{conflict.responsible_name ? [tr(" · Responsable: "), conflict.responsible_name].join('') : ''}</span></div></div>
      <div className="conflict-reasons">{conflictReasons(conflict, tr).map((reason) => <span key={reason}>{reason}</span>)}</div>
    </article>)}</div>
    <div className="later-request"><span>{tr("Solicitud posterior · debe revisarse")}</span><div><strong>{requestedDepartment}</strong><small>{tr("Presenta: ")}{requestedBy || tr("Responsable por indicar")}{requestedStart && requestedEnd ? ` · ${disputedRange({ ...conflicts[0]!, disputed_start: requestedStart, disputed_end: requestedEnd })}` : ''}</small></div></div>
  </section>;
}

export default function NewActivityPage() {
  const { tr } = useExperience();
  const router = useRouter();

  const future = new Date(); future.setDate(future.getDate() + 7); future.setHours(18, 0, 0, 0);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [template, setTemplate] = useState<ActivityFormTemplate | null>(null);
  const [customData, setCustomData] = useState<Record<string, string | number | boolean | null>>({});
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [form, setForm] = useState({ title: '', description: '', objective: '', departmentId: '', venueId: '', responsibleName: '', audience: 'Congregación', estimatedAttendance: 0, category: 'General', tags: '', contactInfo: '', modality: 'PRESENTIAL', visibility: 'INTERNAL', priority: 0, internalNotes: '' });
  const [options, setOptions] = useState<Option[]>([{ label: 'Fecha preferida', start: dateTimeLocal(future), end: dateTimeLocal(new Date(future.getTime() + 2 * 3600000)), setupMinutes: 0, teardownMinutes: 0 }]);
  const [file, setFile] = useState<File | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityError, setAvailabilityError] = useState('');
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; status: string; alternative?: { id: string; label: string; sessions: Array<{ startsAt: string; endsAt: string }> }; conflict?: { id: string; details: ConflictDetail[] } } | null>(null);
  const [review, setReview] = useState({ reason: '', impact: '', coexistencePlan: '', resourcePlan: '', alternative: '' });
  const [reviewSent, setReviewSent] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [fieldsLocked, setFieldsLocked] = useState(false);
  const submissionProgress = useRef(newActivitySubmissionProgress());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [initialDraft, setInitialDraft] = useState('');
  const draftSnapshot = JSON.stringify({ form, options, resourceIds, customData, file: file ? [file.name, file.size, file.lastModified] : null });
  const { clear } = useUnsavedChanges(!result && Boolean(initialDraft && initialDraft !== draftSnapshot));
  useEffect(() => { if (!initialLoading && template && !initialDraft) setInitialDraft(draftSnapshot); }, [draftSnapshot, initialDraft, initialLoading, template]);

  const loadForm = useCallback(async (signal?: AbortSignal) => {
    setInitialLoading(true); setInitialError('');
    try {
      const options = signal ? { signal } : {};
      const [d, v, r, configuredForm] = await Promise.all([api<{ items: Department[] }>('/departments', options), api<{ items: Venue[] }>('/venues', options), api<{ items: Resource[] }>('/resources', options), api<ActivityFormTemplateResponse>('/activity-form/template', options)]);
      if (signal?.aborted) return;
      setDepartments(d.items); setVenues(v.items); setResources(r.items);
      setTemplate(configuredForm.published);
      const requestedDepartmentId = new URLSearchParams(window.location.search).get('departmentId');
      const initialDepartmentId = d.items.some((item) => item.id === requestedDepartmentId)
        ? requestedDepartmentId!
        : d.items[0]?.id ?? '';
      setForm((current) => ({ ...current, departmentId: current.departmentId || initialDepartmentId, venueId: current.venueId || v.items[0]?.id || '' }));
      if (!d.items.length) setInitialError('No hay departamentos disponibles para crear una actividad. Solicita la asignación de un departamento.');
    } catch (reason) {
      if (!signal?.aborted) setInitialError(reason instanceof Error ? reason.message : 'No fue posible cargar el formulario de actividad.');
    } finally { if (!signal?.aborted) setInitialLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadForm(controller.signal);
    return () => controller.abort();
  }, [loadForm]);

  function updateOption(index: number, patch: Partial<Option>) { setOptions((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item)); setAvailability(null); }

  const availabilityPath = useCallback(() => {
    const primary = options[0];
    if (!primary?.start || !primary.end) return null;
    const startsAt = new Date(primary.start);
    const endsAt = new Date(primary.end);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return null;
    const params = new URLSearchParams({ start: startsAt.toISOString(), end: endsAt.toISOString() });
    if (form.venueId) params.set('venueId', form.venueId);
    if (form.departmentId) params.set('departmentId', form.departmentId);
    if (resourceIds.length) params.set('resourceIds', resourceIds.join(','));
    return `/availability?${params.toString()}`;
  }, [options, form.venueId, form.departmentId, resourceIds]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retrying explicitly invalidates the current availability request.
  useEffect(() => {
    const path = availabilityPath();
    setAvailability(null); setAvailabilityError(''); setCheckingAvailability(false);
    if (!path || !departments.length) return;
    const controller = new AbortController();
    setCheckingAvailability(true);
    const timer = window.setTimeout(() => {
      void activeRequest(controller.signal, () => api<Availability>(path, { signal: controller.signal }), (value) => { setAvailability(value); setCheckingAvailability(false); }, () => { setAvailabilityError('No fue posible verificar la disponibilidad. La fecha se validará al enviar.'); setCheckingAvailability(false); });
    }, 550);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [availabilityPath, availabilityRetry, departments.length]);

  async function checkAvailability() {
    const path = availabilityPath(); if (!path) return;
    setError('');
    try {
      setAvailability(await api<Availability>(path));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible verificar la fecha.'); }
  }

  async function submit(event: React.FormEvent) {
    if (submissionProgress.current.running) { event.preventDefault(); return; }
    const saveDraft = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-intent') === 'draft';
    setSavingDraft(saveDraft);
    event.preventDefault(); setSaving(true); setError('');
    try {
      const payload = submissionProgress.current.payload ?? JSON.stringify({
        ...form, venueId: form.venueId || null, estimatedAttendance: Number(form.estimatedAttendance), priority: Number(form.priority),
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean), resourceIds, customData,
        options: options.map((option, index) => ({ label: option.label, preference: index + 1, sessions: [{ startsAt: new Date(option.start).toISOString(), endsAt: new Date(option.end).toISOString(), setupMinutes: Number(option.setupMinutes), teardownMinutes: Number(option.teardownMinutes) }] }))
      });
      setFieldsLocked(true);
      const operations = {
        create: (body: string, key: string) => api<{ id: string }>('/activities', { method: 'POST', headers: { 'idempotency-key': key }, body }),
        upload: async (id: string, selectedFile: File, key: string) => { const data = new FormData(); data.append('file', selectedFile); await api(`/files/activity/${id}`, { method: 'POST', headers: { 'idempotency-key': key }, body: data }); },
        submit: (id: string) => api<{ status: string; alternative?: { id: string; label: string; sessions: Array<{ startsAt: string; endsAt: string }> }; conflict?: { id: string; details: ConflictDetail[] } }>(`/activities/${id}/submit`, { method: 'POST' }),
        onCreated: setDraftId,
        createKey: () => `activity-${crypto.randomUUID()}`
      };
      if (saveDraft) {
        const saved = await runActivityDraftSave(submissionProgress.current, payload, file, operations);
        if (saved && mounted.current) {
          // Both the activity and any selected program are acknowledged before leaving.
          setInitialDraft(draftSnapshot); clear(); router.push(`/activities/${encodeURIComponent(saved.id)}`);
        }
      } else {
        const completed = await runActivitySubmission(submissionProgress.current, payload, file, operations);
        if (completed) { clear(); setResult({ id: completed.id, ...completed.result }); }
      }
    } catch (reason) {
      if (!submissionProgress.current.draftId && reason instanceof ApiError && [400, 403, 404, 422].includes(reason.status)) {
        submissionProgress.current = newActivitySubmissionProgress();
        setFieldsLocked(false);
      }
      setError(reason instanceof Error ? reason.message : tr(saveDraft ? 'No fue posible guardar el borrador.' : 'No fue posible crear la actividad.'));
    }
    finally { setSaving(false); setSavingDraft(false); }
  }

  async function sendReview(event: React.FormEvent) {
    event.preventDefault(); if (!result) return; setSaving(true); setError('');
    try { await api(`/activities/${result.id}/request-review`, { method: 'POST', body: JSON.stringify(review) }); setReviewSent(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible enviar la solicitud.'); }
    finally { setSaving(false); }
  }

  async function confirmAlternative() {
    if (!result?.alternative) return;
    setSaving(true); setError('');
    try {
      await api(`/activities/${result.id}/options/${result.alternative.id}/confirm`, { method: 'POST' });
      setResult({ ...result, status: 'SUBMITTED' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'La alternativa dejó de estar disponible.'); }
    finally { setSaving(false); }
  }

  function renderConfiguredField(field: ActivityFormField) {
    field = { ...field, label: activityFieldText(field, 'label', tr), placeholder: activityFieldText(field, 'placeholder', tr), helpText: activityFieldText(field, 'helpText', tr) };
    const className = field.width === 'full' ? 'field-span' : undefined;
    const inputId = `activity-field-${field.id}`;
    const help = field.helpText && <small className="form-field-help">{field.helpText}</small>;
    const label = <>{field.label}{field.required && <b className="required-mark"> *</b>}</>;
    const wrap = (control: ReactElement<{ id?: string }>) => <label htmlFor={inputId} className={className} key={field.id}>{label}{cloneElement(control, { id: inputId })}{help}</label>;

    switch (field.source) {
      case 'title': return wrap(<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={field.placeholder} required={field.required} minLength={3} />);
      case 'description': return wrap(<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={field.placeholder} required={field.required} />);
      case 'objective': return wrap(<textarea value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder={field.placeholder} required={field.required} />);
      case 'departmentId': return wrap(<select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} required={field.required}>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>);
      case 'venueId': return wrap(<select value={form.venueId} onChange={(e) => { setForm({ ...form, venueId: e.target.value }); setAvailability(null); }} required={field.required}><option value="">{tr("Sin lugar exclusivo")}</option>{venues.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.capacity}{tr(" pers.")}</option>)}</select>);
      case 'responsibleName': return wrap(<input value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} placeholder={field.placeholder} required={field.required} />);
      case 'contactInfo': return wrap(<input value={form.contactInfo} onChange={(e) => setForm({ ...form, contactInfo: e.target.value })} placeholder={field.placeholder} required={field.required} />);
      case 'estimatedAttendance': return wrap(<input type="number" min="0" value={form.estimatedAttendance} onChange={(e) => setForm({ ...form, estimatedAttendance: Number(e.target.value) })} required={field.required} />);
      case 'category': return wrap(<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={field.placeholder} required={field.required} />);
      case 'modality': return wrap(<select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} required={field.required}><option value="PRESENTIAL">{tr("Presencial")}</option><option value="VIRTUAL">{tr("Virtual")}</option><option value="HYBRID">{tr("Híbrida")}</option></select>);
      case 'visibility': return wrap(<select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} required={field.required}><option value="INTERNAL">{tr("Toda la iglesia")}</option><option value="LEADERSHIP">{tr("Solo liderazgo")}</option><option value="PUBLIC">{tr("Público")}</option></select>);
      case 'priority': return wrap(<input type="number" min="0" max="10" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} required={field.required} />);
      case 'tags': return wrap(<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder={field.placeholder} required={field.required} />);
      case 'internalNotes': return wrap(<textarea value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} placeholder={field.placeholder} required={field.required} />);
      default: {
        const value = customData[field.id];
        if (field.type === 'textarea') return wrap(<textarea value={String(value ?? '')} onChange={(e) => setCustomData({ ...customData, [field.id]: e.target.value })} placeholder={field.placeholder} required={field.required} />);
        if (field.type === 'select') return wrap(<select value={String(value ?? '')} onChange={(e) => setCustomData({ ...customData, [field.id]: e.target.value })} required={field.required}><option value="">{tr("Seleccionar…")}</option>{field.options.map((option) => <option value={option} key={option}>{option}</option>)}</select>);
        if (field.type === 'checkbox') return <label className={`custom-checkbox-field ${className ?? ''}`} key={field.id}><span><input type="checkbox" checked={value === true} onChange={(e) => setCustomData({ ...customData, [field.id]: e.target.checked })} required={field.required} /> {label}</span>{help}</label>;
        return wrap(<input type={field.type} value={String(value ?? '')} onChange={(e) => setCustomData({ ...customData, [field.id]: field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })} placeholder={field.placeholder} required={field.required} />);
      }
    }
  }

  if (initialLoading) return <Shell title={tr("Nueva actividad")} eyebrow={tr("Planificación")}><Spinner /></Shell>;
  if (!departments.length || !template || initialError) return <Shell title={tr("Nueva actividad")} eyebrow={tr("Planificación")}>
    <Notice tone="danger" title={tr("Formulario no disponible")}>{initialError || tr("No fue posible cargar el formulario de actividad.")}</Notice>
    <div className="modal-actions"><Link href="/calendar" className="button button-ghost">{tr("Volver al calendario")}</Link><button type="button" className="button button-primary" onClick={() => void loadForm()}>{tr("Reintentar")}</button></div>
  </Shell>;
  return <Shell title={tr("Nueva actividad")} eyebrow={tr("Planificación")} actions={<Link href="/calendar" className="button button-ghost desktop-action"><ArrowLeft size={17} />{tr(" Volver")}</Link>}>
    {checkingAvailability && <p role="status">{tr('Verificando disponibilidad…')}</p>}
    {availabilityError && <Notice tone="warning" title={tr('Disponibilidad sin confirmar')}>{tr(availabilityError)} <button type="button" className="button button-ghost compact" onClick={() => setAvailabilityRetry((value) => value + 1)}>{tr('Reintentar')}</button></Notice>}
    <div className="form-layout">
      <form className="panel activity-form" onSubmit={submit}>
        {draftId && !result && <Notice tone="warning" title={tr("Actividad guardada como borrador")}>{tr("La actividad ya está guardada. Reintenta el adjunto o el envío; puedes editar sus datos en el detalle. ")}<Link href={`/activities/${draftId}`} className="button button-ghost compact">{tr("Ver detalle")}</Link></Notice>}
        <fieldset disabled={fieldsLocked || saving} style={{ minWidth: 0, margin: 0, padding: 0, border: 0 }}>
        <div className="form-section-heading"><span>1</span><div><h2>{activityTemplateText(template, 'title', tr)}</h2><p>{activityTemplateText(template, 'description', tr)}</p></div></div>
        <div className="field-grid">{template.fields.filter((field) => field.visible).map(renderConfiguredField)}</div>
        {resources.length > 0 && <fieldset className="resource-picker"><legend>{tr("Recursos exclusivos")}</legend>{resources.map((resource) => <label key={resource.id}><input type="checkbox" checked={resourceIds.includes(resource.id)} onChange={(event) => setResourceIds((current) => event.target.checked ? [...current, resource.id] : current.filter((id) => id !== resource.id))} /> {resource.name}{resource.exclusive ? tr(" · exclusivo") : ''}</label>)}</fieldset>}
        <div className="section-divider" />
        <div className="form-section-heading"><span>2</span><div><h2>{tr("Fechas propuestas")}</h2><p>{tr("Agrega alternativas en orden de preferencia.")}</p></div></div>
        <div className="option-stack">{options.map((option, index) => <div className="date-option" key={index}><div className="date-option-head"><strong>{index + 1}. {option.label}</strong>{options.length > 1 && <button type="button" className="icon-button danger" aria-label={[tr("Eliminar "), option.label].join('')} onClick={() => setOptions(options.filter((_, i) => i !== index))}><Trash2 size={17} /></button>}</div><div className="field-grid"><label>{tr("Inicio")}<input type="datetime-local" value={option.start} onChange={(e) => updateOption(index, { start: e.target.value })} required /></label><label>{tr("Finalización")}<input type="datetime-local" value={option.end} onChange={(e) => updateOption(index, { end: e.target.value })} required /></label><label>{tr("Montaje (minutos)")}<input type="number" min="0" max="1440" value={option.setupMinutes} onChange={(e) => updateOption(index, { setupMinutes: Number(e.target.value) })} /></label><label>{tr("Desmontaje (minutos)")}<input type="number" min="0" max="1440" value={option.teardownMinutes} onChange={(e) => updateOption(index, { teardownMinutes: Number(e.target.value) })} /></label></div>{index === 0 && <button type="button" className="button button-secondary availability-button" onClick={checkAvailability}><CalendarPlus size={17} />{tr(" Comprobar disponibilidad")}</button>}</div>)}</div>
        {options.length < 5 && <button type="button" className="add-option" onClick={() => { const last = options.at(-1)!; const start = new Date(last.start); start.setDate(start.getDate() + 1); const end = new Date(last.end); end.setDate(end.getDate() + 1); setOptions([...options, { ...last, label: `Alternativa ${options.length}`, start: dateTimeLocal(start), end: dateTimeLocal(end) }]); }}><Plus size={18} />{tr(" Agregar otra fecha")}</button>}
        {availability && (availability.available ? <Notice tone="success" title={tr("Horario disponible")}>{tr("La validación automática no encontró choques para la fecha, el lugar ni los recursos seleccionados.")}</Notice> : <><Notice tone="warning" title={[availability.conflicts.length, tr(" conflicto(s) detectado(s)")].join('')}>{tr("La primera actividad sometida conserva la preferencia. Si continúas, tu actividad quedará registrada para resolución.")}</Notice><ConflictPreview conflicts={availability.conflicts} requestedDepartment={availability.requested?.department?.name ?? departments.find((item) => item.id === form.departmentId)?.name ?? 'Tu departamento'} requestedBy={form.responsibleName} requestedStart={availability.requested?.startsAt} requestedEnd={availability.requested?.endsAt} /></>)}
        </fieldset>
        <div className="section-divider" />
        <div className="form-section-heading"><span>3</span><div><h2>{tr("Programa de la actividad")}</h2><p>{tr("Adjunta Word, PDF, Excel, PowerPoint, CSV o imagen.")}</p></div></div>
        {submissionProgress.current.pendingFile && <Notice tone="warning" title={tr('Solicitud pendiente de confirmar')}>{tr('El adjunto sigue sin confirmarse. Reintenta el mismo archivo antes de reemplazarlo.')}</Notice>}
        <label className="file-drop"><FileUp /><strong>{file ? file.name : tr("Selecciona el programa")}</strong><span>{file ? [(file.size / 1024 / 1024).toFixed(2), tr(" MB")].join('') : tr("Máximo 15 MB · será validado antes de publicarse")}</span><input type="file" disabled={saving || Boolean(submissionProgress.current.pendingFile)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        {!result && <><p className="form-field-help">{tr('Guardar borrador conserva los datos completos y el programa confirmado sin enviarlos ni reservar fechas. Continúa desde el detalle después de guardar.')}</p><p className="form-field-help">{tr('Los campos incompletos y los archivos sin confirmar solo permanecen en esta pestaña; no se recuperan al recargar o cerrar.')}</p><div className="form-actions"><span>{tr("La disponibilidad se verificará nuevamente al enviar.")}</span><div className="modal-actions"><button type="submit" data-intent="submit" className="button button-primary" disabled={saving}><Send size={17} /> {saving && !savingDraft ? tr("Enviando…") : fieldsLocked ? tr("Reintentar envío") : activityTemplateText(template, 'submitLabel', tr)}</button><button type="submit" data-intent="draft" className="button button-secondary" disabled={saving}><Save size={17} /> {savingDraft ? tr('Guardando borrador…') : tr('Guardar borrador')}</button></div></div></>}
      </form>
      <aside className="form-aside"><div className="aside-card"><span className="aside-icon"><CalendarPlus /></span><h3>{tr("Antes de enviar")}</h3><ul><li><Check />{tr(" Confirma la zona horaria")}</li><li><Check />{tr(" Incluye montaje y desmontaje")}</li><li><Check />{tr(" Agrega una alternativa si es posible")}</li></ul></div></aside>
    </div>
    {result?.status === 'SUBMITTED' && <Modal busy={saving} className="success-overlay" label={tr("Actividad enviada")} onClose={() => window.location.assign(`/activities/${result.id}`)}><div className="success-dialog"><span><Check /></span><h2>{tr("Actividad enviada")}</h2><p>{tr("La fecha quedó reservada provisionalmente y espera aprobación.")}</p><div><Link className="button button-secondary" href={`/activities/${result.id}`}>{tr("Ver detalle")}</Link><Link className="button button-primary" href="/calendar">{tr("Ir al calendario")}</Link></div></div></Modal>}
    {result?.status === 'ALTERNATIVE_AVAILABLE' && result.alternative && <Modal busy={saving} label={tr("Encontramos una fecha libre")} onClose={() => setResult({ ...result, status: 'CONFLICTED' })}><section className="modal-card conflict-resolution-modal"><span className="modal-alert"><CalendarPlus /></span><h2>{tr("Encontramos una fecha libre")}</h2><p>{tr("La opción principal tiene un choque y la actividad presentada primero conserva la preferencia. ")}<strong>{result.alternative.label}</strong>{tr(" está disponible: ")}{result.alternative.sessions.map((session) => formatDate(session.startsAt)).join(', ')}.</p>{result.conflict?.details && <ConflictPreview conflicts={result.conflict.details} requestedDepartment={departments.find((item) => item.id === form.departmentId)?.name ?? 'Tu departamento'} requestedBy={form.responsibleName} requestedStart={options[0]?.start ? new Date(options[0].start).toISOString() : undefined} requestedEnd={options[0]?.end ? new Date(options[0].end).toISOString() : undefined} />}{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setResult({ ...result, status: 'CONFLICTED' })}>{tr("Solicitar revisión de la fecha original")}</button><button type="button" className="button button-primary" onClick={confirmAlternative} disabled={saving}>{tr("Confirmar alternativa")}</button></div></section></Modal>}
    {result?.status === 'CONFLICTED' && <Modal busy={saving} label={tr("La fecha ya está ocupada")} onClose={() => window.location.assign(`/activities/${result.id}`)}><form className="modal-card conflict-resolution-modal" onSubmit={sendReview}><span className="modal-alert"><AlertTriangle /></span><h2>{tr("La fecha ya está ocupada")}</h2><p>{tr("El choque quedó registrado como un conflicto formal. La actividad presentada primero conserva la preferencia hasta que la junta autorice otra decisión.")}</p>{result.conflict?.details && <ConflictPreview conflicts={result.conflict.details} requestedDepartment={departments.find((item) => item.id === form.departmentId)?.name ?? 'Tu departamento'} requestedBy={form.responsibleName} requestedStart={options[0]?.start ? new Date(options[0].start).toISOString() : undefined} requestedEnd={options[0]?.end ? new Date(options[0].end).toISOString() : undefined} />}{reviewSent ? <Notice tone="success" title={tr("Solicitud enviada")}>{tr("La secretaría ya puede revisar el expediente comparativo completo.")}</Notice> : <><label>{tr("¿Por qué necesitas conservar esta fecha?")}<textarea required minLength={10} value={review.reason} onChange={(e) => setReview({ ...review, reason: e.target.value })} /></label><label>{tr("Impacto de mover o cancelar")}<textarea value={review.impact} onChange={(e) => setReview({ ...review, impact: e.target.value })} /></label><label>{tr("Plan para que ambas actividades coexistan")}<textarea required minLength={10} value={review.coexistencePlan} onChange={(e) => setReview({ ...review, coexistencePlan: e.target.value })} /></label><label>{tr("Distribución de espacios y recursos")}<textarea value={review.resourcePlan} onChange={(e) => setReview({ ...review, resourcePlan: e.target.value })} /></label><label>{tr("Alternativa aceptable")}<textarea value={review.alternative} onChange={(e) => setReview({ ...review, alternative: e.target.value })} /></label></>}{error && <div className="form-error">{error}</div>}<div className="modal-actions">{reviewSent ? <Link className="button button-primary" href="/reviews#conflicts">{tr("Ver en junta de revisión")}</Link> : <><Link className="button button-ghost" href={`/activities/${result.id}`}>{tr("Dejar para después")}</Link><button type="submit" className="button button-primary" disabled={saving}>{tr("Enviar a revisión")}</button></>}</div></form></Modal>}
  </Shell>;
}
