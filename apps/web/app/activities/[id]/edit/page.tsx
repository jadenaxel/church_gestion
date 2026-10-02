'use client';

import { ArrowLeft, CalendarClock, Check, LockKeyhole, Save, Send, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { cloneElement, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Shell } from '@/components/shell';
import { Notice, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';
import { useUnsavedChanges } from '@/components/unsaved-changes-provider';
import { editedScheduleOptions, selectedScheduleOption, type EditableScheduleOption } from '@/components/activity-schedule-edit';
import { activityCustomDataChanged, activityCustomDataPatch, copyActivityCustomData, savedActivityCustomFields, type ActivityCustomData } from '@/components/activity-custom-edit';
import { activityFieldText, type ActivityFormField, type ActivityFormTemplate } from '@/lib/activity-form';

type Activity = {
  id: string; code: string; title: string; description: string; objective: string; version: number; status: string;
  department: string; department_id: string; venue_id: string | null; responsible_name: string; audience: string;
  estimated_attendance: number; category: string; capabilities: { canEdit: boolean; canRequestChange: boolean; departmentRole: string | null };
  options: EditableScheduleOption[];
  custom_data?: ActivityCustomData | null; form_schema_snapshot?: Partial<ActivityFormTemplate> | null;
};
type Venue = { id: string; name: string };

function asLocal(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function EditActivityPage() {
  const { tr } = useExperience();

  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [form, setForm] = useState({ title: '', description: '', objective: '', responsibleName: '', audience: '', estimatedAttendance: 0, category: '', venueId: '', startsAt: '', endsAt: '', reason: '' });
  const [initialSchedule, setInitialSchedule] = useState({ startsAt: '', endsAt: '', venueId: '' });
  const [initialForm, setInitialForm] = useState('');
  const [customData, setCustomData] = useState<ActivityCustomData>({});
  const [initialCustomData, setInitialCustomData] = useState<ActivityCustomData>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { clear } = useUnsavedChanges(Boolean(activity && initialForm && (JSON.stringify(form) !== initialForm || activityCustomDataChanged(initialCustomData, customData))));
  const customFields = savedActivityCustomFields(activity?.form_schema_snapshot);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const [loaded, venueData] = await Promise.all([api<Activity>(`/activities/${id}`, { signal: signal ?? null }), api<{ items: Venue[] }>('/venues', { signal: signal ?? null })]);
      if (signal?.aborted) return;
      const selected = selectedScheduleOption(loaded.options);
      const session = selected?.sessions[0];
      const startsAt = session ? asLocal(session.startsAt) : '';
      const endsAt = session ? asLocal(session.endsAt) : '';
      setActivity(loaded);
      setVenues(venueData.items);
      const initial = {
        title: loaded.title, description: loaded.description, objective: loaded.objective ?? '', responsibleName: loaded.responsible_name,
        audience: loaded.audience, estimatedAttendance: loaded.estimated_attendance ?? 0, category: loaded.category,
        venueId: loaded.venue_id ?? '', startsAt, endsAt, reason: ''
      };
      setForm(initial); setInitialForm(JSON.stringify(initial));
      const loadedCustomData = copyActivityCustomData(loaded.custom_data);
      setCustomData(loadedCustomData); setInitialCustomData(copyActivityCustomData(loadedCustomData));
      setInitialSchedule({ startsAt, endsAt, venueId: loaded.venue_id ?? '' });
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'No fue posible abrir la actividad.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [id]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const approvedFlow = activity?.status === 'APPROVED' && activity.capabilities.canRequestChange;
  const scheduleChanged = useMemo(() => form.startsAt !== initialSchedule.startsAt || form.endsAt !== initialSchedule.endsAt || form.venueId !== initialSchedule.venueId, [form, initialSchedule]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!activity) return;
    setError(''); setBusy(true);
    try {
      const reason = form.reason.trim() || 'Actualización autorizada de la actividad';
      const changes: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        objective: form.objective,
        responsibleName: form.responsibleName,
        audience: form.audience,
        estimatedAttendance: Number(form.estimatedAttendance),
        category: form.category,
        ...activityCustomDataPatch(initialCustomData, customData),
        expectedVersion: activity.version,
        changeReason: reason
      };
      if (scheduleChanged) {
        changes.venueId = form.venueId || null;
        if (form.startsAt !== initialSchedule.startsAt || form.endsAt !== initialSchedule.endsAt) changes.options = editedScheduleOptions(activity.options, form.startsAt, form.endsAt);
      }
      if (approvedFlow) {
        await api(`/activities/${id}/change-requests`, { method: 'POST', body: JSON.stringify({ reason: form.reason, changes }) });
      } else {
        await api(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      }
      clear(); setInitialForm(JSON.stringify(form)); setInitialCustomData(copyActivityCustomData(customData)); router.push(`/activities/${id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible guardar los cambios.'); }
    finally { setBusy(false); }
  }

  function renderCustomField(field: ActivityFormField) {
    const inputId = `edit-custom-${field.id}`;
    const value = customData[field.id];
    const label = activityFieldText(field, 'label', tr);
    const placeholder = activityFieldText(field, 'placeholder', tr);
    const helpText = activityFieldText(field, 'helpText', tr);
    const help = helpText && <small className="form-field-help">{helpText}</small>;
    const className = field.width === 'full' ? 'field-span' : undefined;
    const update = (next: string | number | boolean) => setCustomData((current) => ({ ...current, [field.id]: next }));
    const wrap = (control: ReactElement<{ id?: string }>) => <label htmlFor={inputId} className={className} key={field.id}>{label}{field.required && <b className="required-mark"> *</b>}{cloneElement(control, { id: inputId })}{help}</label>;
    if (field.type === 'textarea') return wrap(<textarea value={String(value ?? '')} onChange={(event) => update(event.target.value)} placeholder={placeholder} required={field.required} />);
    if (field.type === 'select') return wrap(<select value={String(value ?? '')} onChange={(event) => update(event.target.value)} required={field.required}><option value="">{tr('Seleccionar…')}</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>);
    if (field.type === 'checkbox') return <label htmlFor={inputId} className={`custom-checkbox-field ${className ?? ''}`} key={field.id}><span><input id={inputId} type="checkbox" checked={value === true} onChange={(event) => update(event.target.checked)} required={field.required} /> {label}{field.required && <b className="required-mark"> *</b>}</span>{help}</label>;
    return wrap(<input type={field.type} value={String(value ?? '')} onChange={(event) => update(field.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} placeholder={placeholder} required={field.required} />);
  }

  const allowed = activity && (activity.capabilities.canEdit || activity.capabilities.canRequestChange);
  return <Shell title={approvedFlow ? tr("Solicitar modificación") : tr("Editar actividad")} eyebrow={activity ? `${activity.code} · ${activity.department}` : tr("Actividad")} actions={<Link href={`/activities/${id}`} className="button button-ghost desktop-action"><ArrowLeft size={17} />{tr(" Volver")}</Link>}>
    {error && <Notice tone="danger" title={tr("Atención")}>{error}</Notice>}
    {!activity ? loading ? <Spinner /> : <button type="button" className="button button-secondary" onClick={() => void load()}>{tr('Reintentar')}</button> : !allowed ? <Notice tone="danger" title={tr("Actividad protegida")}>{tr("Tu rol no permite modificar esta actividad.")}</Notice> : <form className="edit-activity-layout" onSubmit={submit}>
      <section className="panel activity-form edit-activity-form">
        <div className="form-section-title"><span>1</span><div><h2>{tr("Información de la actividad")}</h2><p>{tr("Actualiza el contenido operativo que verá el equipo.")}</p></div></div>
        <div className="field-grid">
          <label className="field-span">{tr("Nombre de la actividad")}<input required minLength={3} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="field-span">{tr("Descripción")}<textarea required minLength={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="field-span">{tr("Objetivo")}<textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} /></label>
          <label>{tr("Responsable")}<input required value={form.responsibleName} onChange={(event) => setForm({ ...form, responsibleName: event.target.value })} /></label>
          <label>{tr("Audiencia")}<input value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} /></label>
          <label>{tr("Categoría")}<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
          <label>{tr("Asistencia estimada")}<input type="number" min={0} value={form.estimatedAttendance} onChange={(event) => setForm({ ...form, estimatedAttendance: Number(event.target.value) })} /></label>
        </div>
        {customFields.length > 0 && <section><h3>{tr('Respuestas del formulario guardado')}</h3><p className="form-field-help">{tr('Se utiliza el formulario de esta actividad, no la plantilla publicada actualmente.')}</p><div className="field-grid">{customFields.map(renderCustomField)}</div></section>}
        <div className="form-section-title"><span>2</span><div><h2>{tr("Fecha y lugar")}</h2><p>{tr("Los cambios de horario se validan nuevamente contra todo el calendario.")}</p></div></div>
        {activity.options.some((option) => option.sessions.length > 1) && <Notice title={tr('Actividad con varias sesiones')}>{tr('Solo modificas el primer bloque de la opción seleccionada. Las demás sesiones, alternativas y tiempos de preparación se conservan.')}</Notice>}
        <div className="field-grid">
          <label>{tr("Lugar")}<select value={form.venueId} onChange={(event) => setForm({ ...form, venueId: event.target.value })}><option value="">{tr("Por definir")}</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
          <span />
          <label>{tr("Inicio")}<input type="datetime-local" required value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
          <label>{tr("Fin")}<input type="datetime-local" required min={form.startsAt} value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
        </div>
        {approvedFlow && <div className="approved-change-box"><div><LockKeyhole /><span><strong>{tr("Actividad aprobada y protegida")}</strong><small>{tr("El cambio no se aplicará hasta que el administrador o secretario lo autorice.")}</small></span></div><label>{tr("Justificación para la junta")}<textarea required minLength={10} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder={tr("Explica por qué es necesario modificar la actividad…")} /></label></div>}
        {!approvedFlow && <label className="change-reason">{tr("Motivo del cambio")}<input required minLength={5} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder={tr("Deja constancia del motivo…")} /></label>}
        <div className="form-actions"><span>{scheduleChanged ? <><CalendarClock size={16} />{tr(" La disponibilidad será validada")}</> : <><ShieldCheck size={16} />{tr(" El horario actual se conservará")}</>}</span><button type="submit" className="button button-primary" disabled={busy}>{approvedFlow ? <Send size={17} /> : <Save size={17} />}{busy ? tr("Guardando…") : approvedFlow ? tr("Enviar para autorización") : tr("Guardar cambios")}</button></div>
      </section>
      <aside className="panel edit-policy-card"><ShieldCheck /><span className="eyebrow">{tr("Gobierno seguro")}</span><h2>{approvedFlow ? tr("Solicitud trazable") : tr("Edición controlada")}</h2><p>{approvedFlow ? tr("La actividad mantiene intacta su aprobación y reserva hasta que una autoridad revise esta propuesta.") : tr("Cada cambio queda registrado con usuario, versión, fecha y motivo.")}</p><ul><li><Check size={15} />{tr(" Control de versión")}</li><li><Check size={15} />{tr(" Historial auditable")}</li><li><Check size={15} />{tr(" Validación de conflictos")}</li></ul></aside>
    </form>}
  </Shell>;
}
