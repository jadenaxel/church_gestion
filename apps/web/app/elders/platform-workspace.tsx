'use client';

import { Modal } from '@/components/modal';

import { ArrowDown, ArrowUp, Check, ChevronRight, ClipboardList, Clock3, Crown, LayoutTemplate, Plus, Save, Sparkles, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatDate } from '@/lib/api';
import { Empty, Spinner } from '@/components/ui';
import { useExperience } from '@/components/experience-provider';
import { currentLocale, localeTag } from '@/lib/i18n';

export type PlatformPerson = { id: string; name: string; email: string; roles: string[] };
export type PlatformProgram = { id: string; elderId: string; elderName: string; title: string; serviceAt: string; endsAt: string; serviceType: 'WEDNESDAY' | 'SABBATH' | 'OTHER'; status: string };
export type PlatformTemplateItem = { id?: string; title: string; participationType: string; durationMinutes: number; instructions: string; required: boolean; sequence?: number };
export type PlatformTemplate = { id: string; name: string; serviceType: PlatformProgram['serviceType']; description: string; isSystem: boolean; createdBy: string | null; items: PlatformTemplateItem[] };
type PlatformMember = { id?: string; userId: string | null; displayName: string; roleLabel: string; isLead: boolean; sequence?: number };
type ServiceItem = PlatformTemplateItem & { templateItemId?: string | null; startsAt: string; assigneeUserId: string | null; assigneeName: string; notes: string; status: 'PENDING' | 'READY' | 'COMPLETED' | 'SKIPPED' };
type PlatformPlan = { program: PlatformProgram; platformMembers: PlatformMember[]; items: ServiceItem[] };

const participationNames: Record<string, string> = {
  PLATFORM: 'Plataforma', WELCOME: 'Bienvenida', INVOCATION: 'Invocación', PRAISE: 'Alabanza', HYMN: 'Himno', PRAYER: 'Oración', SCRIPTURE: 'Lectura bíblica',
  MISSION_STORY: 'Minuto misionero', OFFERING: 'Ofrendas', SPECIAL_MUSIC: 'Música especial', SERMON: 'Mensaje', ANNOUNCEMENTS: 'Anuncios', BENEDICTION: 'Bendición', CUSTOM: 'Participación especial'
};

function minuteLabel(value: string) {
  return new Intl.DateTimeFormat(localeTag(currentLocale()), { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function recalculate(items: ServiceItem[], serviceAt: string) {
  let cursor = new Date(serviceAt);
  return items.map((item) => {
    const next = { ...item, startsAt: cursor.toISOString() };
    cursor = new Date(cursor.getTime() + Math.max(1, Number(item.durationMinutes) || 1) * 60_000);
    return next;
  });
}

export function PlatformWorkspace({ programs, participants, templates, currentUserId, manager, initialProgramId, onReload, onError, onSuccess }: {
  programs: PlatformProgram[];
  participants: PlatformPerson[];
  templates: PlatformTemplate[];
  currentUserId: string;
  manager: boolean;
  initialProgramId?: string | undefined;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const { tr } = useExperience();

  const editablePrograms = useMemo(() => manager ? programs : programs.filter((program) => program.elderId === currentUserId), [currentUserId, manager, programs]);
  const [programId, setProgramId] = useState(initialProgramId ?? editablePrograms[0]?.id ?? '');
  const [plan, setPlan] = useState<PlatformPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [members, setMembers] = useState<PlatformMember[]>([]);
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [memberUserId, setMemberUserId] = useState('');
  const [externalMember, setExternalMember] = useState('');
  const [templateForm, setTemplateForm] = useState({ name: '', serviceType: 'SABBATH' as PlatformProgram['serviceType'], description: '', items: [] as PlatformTemplateItem[] });

  const loadPlan = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await api<PlatformPlan>(`/elders/programs/${id}/platform`);
      setPlan(result); setMembers(result.platformMembers); setItems(result.items);
      const compatible = templates.find((template) => template.serviceType === result.program.serviceType);
      setSelectedTemplateId(compatible?.id ?? templates[0]?.id ?? '');
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'No fue posible cargar la plataforma del culto.'); }
    finally { setLoading(false); }
  }, [onError, templates]);

  useEffect(() => { if (programId) void loadPlan(programId); }, [loadPlan, programId]);
  useEffect(() => { if (!programId && editablePrograms[0]) setProgramId(editablePrograms[0].id); }, [editablePrograms, programId]);

  const assignedRequired = items.filter((item) => item.required && item.assigneeName.trim()).length;
  const requiredCount = items.filter((item) => item.required).length;
  const readyPercent = requiredCount ? Math.round(assignedRequired / requiredCount * 100) : 0;
  const plannedMinutes = items.reduce((total, item) => total + Number(item.durationMinutes || 0), 0);
  const availableMinutes = plan ? Math.floor((new Date(plan.program.endsAt).getTime() - new Date(plan.program.serviceAt).getTime()) / 60_000) : 0;

  async function applyTemplate() {
    if (!programId || !selectedTemplateId) return;
    setBusy(true); onError('');
    try {
      const result = await api<PlatformPlan>(`/elders/programs/${programId}/platform/apply-template`, { method: 'POST', body: JSON.stringify({ templateId: selectedTemplateId }) });
      setPlan(result); setItems(result.items); setMembers(result.platformMembers); setBuilderOpen(true);
      onSuccess('Plantilla aplicada. Ahora asigna cada participación y confirma el equipo de plataforma.');
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'No fue posible aplicar la plantilla.'); }
    finally { setBusy(false); }
  }

  function addKnownMember() {
    const person = participants.find((item) => item.id === memberUserId);
    if (!person || members.some((member) => member.userId === person.id)) return;
    setMembers((current) => [...current, { userId: person.id, displayName: person.name, roleLabel: current.length ? 'Apoyo de plataforma' : 'Director de plataforma', isLead: current.length === 0 }]);
    setMemberUserId('');
  }

  function addExternalMember() {
    const name = externalMember.trim();
    if (name.length < 2) return;
    setMembers((current) => [...current, { userId: null, displayName: name, roleLabel: current.length ? 'Apoyo de plataforma' : 'Director de plataforma', isLead: current.length === 0 }]);
    setExternalMember('');
  }

  function updateItem(index: number, patch: Partial<ServiceItem>) {
    setItems((current) => recalculate(current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item), plan!.program.serviceAt));
  }

  function moveItem(index: number, offset: number) {
    setItems((current) => {
      const next = [...current]; const target = index + offset;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return recalculate(next, plan!.program.serviceAt);
    });
  }

  function addServiceItem() {
    setItems((current) => recalculate([...current, { title: 'Nueva participación', participationType: 'CUSTOM', durationMinutes: 5, instructions: '', required: true, startsAt: plan!.program.serviceAt, assigneeUserId: null, assigneeName: '', notes: '', status: 'PENDING' }], plan!.program.serviceAt));
  }

  async function savePlan() {
    if (!plan || members.length === 0 || items.length === 0) return;
    if (plannedMinutes > availableMinutes) { onError(`El orden ocupa ${plannedMinutes} minutos y el culto dispone de ${availableMinutes}. Ajusta las duraciones antes de guardar.`); return; }
    setBusy(true); onError('');
    try {
      const result = await api<PlatformPlan & { message: string }>(`/elders/programs/${programId}/platform`, {
        method: 'PATCH', body: JSON.stringify({
          platformMembers: members.map(({ userId, displayName, roleLabel, isLead }) => ({ userId, displayName, roleLabel, isLead })),
          items: items.map(({ templateItemId, title, participationType, startsAt, durationMinutes, assigneeUserId, assigneeName, notes, status }) => ({ templateItemId, title, participationType, startsAt, durationMinutes, assigneeUserId, assigneeName, notes, status: assigneeName && status === 'PENDING' ? 'READY' : status }))
        })
      });
      setPlan(result); setItems(result.items); setMembers(result.platformMembers); setBuilderOpen(false); onSuccess(result.message); await onReload();
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'No fue posible guardar la plataforma.'); }
    finally { setBusy(false); }
  }

  function openTemplateCreator() {
    setTemplateForm({
      name: plan ? `Orden personalizado · ${plan.program.title}` : '',
      serviceType: plan?.program.serviceType ?? 'SABBATH',
      description: 'Plantilla creada por el equipo de Ancianos para reutilizar este orden de culto.',
      items: items.length ? items.map((item) => ({ title: item.title, participationType: item.participationType, durationMinutes: item.durationMinutes, instructions: item.notes || item.instructions, required: item.required })) : [{ title: 'Bienvenida', participationType: 'WELCOME', durationMinutes: 5, instructions: '', required: true }]
    });
    setTemplateOpen(true);
  }

  async function createTemplate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); onError('');
    try {
      await api('/elders/platform/templates', { method: 'POST', body: JSON.stringify(templateForm) });
      setTemplateOpen(false); onSuccess('Plantilla personalizada creada. Ya está disponible para el equipo de Ancianos.'); await onReload();
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'No fue posible crear la plantilla.'); }
    finally { setBusy(false); }
  }

  return <>
    <section className="panel platform-command-center">
      <div className="panel-heading platform-heading"><div><span className="eyebrow">{tr("Dirección del servicio")}</span><h2>{tr("Plataforma y orden minuto a minuto")}</h2><p>{tr("Coordina quién dirige, quién participa y cuándo ocurre cada parte del culto.")}</p></div><button type="button" className="button button-secondary" onClick={openTemplateCreator}><LayoutTemplate />{tr(" Crear plantilla")}</button></div>
      <div className="platform-layout">
        <aside className="platform-program-selector">
          <div className="elders-search"><Clock3 /><strong>{tr("Cultos programados")}</strong></div>
          <div className="premium-scroll-list">{editablePrograms.map((program) => <button type="button" key={program.id} className={programId === program.id ? 'active' : ''} onClick={() => setProgramId(program.id)}><span>{new Date(program.serviceAt).getDate()}<small>{new Intl.DateTimeFormat(localeTag(currentLocale()), { month: 'short' }).format(new Date(program.serviceAt))}</small></span><div><strong>{program.title}</strong><small>{formatDate(program.serviceAt)}</small><em>{program.elderName}</em></div><ChevronRight /></button>)}</div>
        </aside>
        <div className="platform-stage">
          {loading ? <Spinner /> : !plan ? <Empty icon={<ClipboardList />} title={tr("Selecciona un culto")} text={tr("Elige un programa para diseñar su plataforma y orden de servicio.")} /> : <>
            <header><div><span className="eyebrow">{plan.program.serviceType === 'SABBATH' ? tr("Culto del sábado") : plan.program.serviceType === 'WEDNESDAY' ? tr("Culto del miércoles") : tr("Servicio especial")}</span><h2>{plan.program.title}</h2><p>{formatDate(plan.program.serviceAt)} · {availableMinutes}{tr(" minutos disponibles")}</p></div><div className="platform-readiness" style={{ '--readiness': `${readyPercent}%` } as React.CSSProperties}><strong>{readyPercent}%</strong><small>{tr("Asignado")}</small></div></header>
            <div className="platform-kpis"><span><UsersRound /><b>{members.length}</b><small>{tr("En plataforma")}</small></span><span><ClipboardList /><b>{items.length}</b><small>{tr("Participaciones")}</small></span><span className={plannedMinutes > availableMinutes ? 'danger' : ''}><Clock3 /><b>{plannedMinutes}</b><small>{tr("Minutos planificados")}</small></span></div>
            {members.length > 0 && <div className="platform-team"><strong>{tr("Equipo de plataforma")}</strong><div>{members.map((member) => <span key={`${member.userId}-${member.displayName}`}>{member.isLead ? <Crown /> : <UserRound />}<b>{member.displayName}</b><small>{member.roleLabel}</small></span>)}</div></div>}
            {items.length ? <div className="service-timeline premium-scroll-list">{items.map((item, index) => <article key={`${item.id ?? item.title}-${index}`}><time>{minuteLabel(item.startsAt)}<small>{item.durationMinutes}{tr(" min")}</small></time><i /><div><span>{participationNames[item.participationType] ?? item.participationType}</span><strong>{item.title}</strong><small>{item.assigneeName || tr("Participante por asignar")}</small></div>{item.assigneeName ? <Check className="ready" /> : <Clock3 />}</article>)}</div> : <Empty icon={<LayoutTemplate />} title={tr("El orden aún no está definido")} text={tr("Aplica una plantilla base o crea una propia para comenzar.")} />}
            <div className="platform-actions"><select aria-label={tr("Plantilla para aplicar")} value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}><option value="">{tr("Seleccionar plantilla…")}</option>{templates.filter((template) => template.serviceType === plan.program.serviceType || template.serviceType === 'OTHER').map((template) => <option value={template.id} key={template.id}>{template.name}{template.isSystem ? tr(" · Base adaptable") : tr(" · Personalizada")}</option>)}</select><button type="button" className="button button-secondary" disabled={!selectedTemplateId || busy} onClick={() => void applyTemplate()}><Sparkles />{tr(" Aplicar plantilla")}</button><button type="button" className="button button-primary" onClick={() => setBuilderOpen(true)}><ClipboardList /> {items.length ? tr("Editar plataforma") : tr("Diseñar plataforma")}</button></div>
          </>}
        </div>
      </div>
    </section>

    {builderOpen && plan && <Modal busy={busy} label={tr("Plataforma del culto")} onClose={() => setBuilderOpen(false)}><div className="modal-card premium-modal platform-builder-modal">
      <button data-dialog-close type="button" className="modal-close" onClick={() => setBuilderOpen(false)} aria-label={tr("Cerrar")}><X /></button><span className="modal-symbol"><ClipboardList /></span><span className="eyebrow">{tr("Dirección operativa")}</span><h2>{tr("Diseñar plataforma y minuto a minuto")}</h2><p>{plan.program.title} · {formatDate(plan.program.serviceAt)}</p>
      <section className="platform-builder-section"><div className="platform-builder-title"><div><strong>{tr("1. Equipo de plataforma")}</strong><small>{tr("Agrega una o varias personas y define quién dirige.")}</small></div><b>{members.length}</b></div>
        <div className="platform-member-add"><select aria-label={tr("Seleccionar usuario…")} value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)}><option value="">{tr("Seleccionar usuario…")}</option>{participants.filter((person) => !members.some((member) => member.userId === person.id)).map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select><button type="button" onClick={addKnownMember}><Plus />{tr(" Agregar")}</button></div>
        <div className="platform-member-add"><input aria-label={tr("Invitado o participante sin usuario")} value={externalMember} onChange={(event) => setExternalMember(event.target.value)} placeholder={tr("Invitado o participante sin usuario")} /><button type="button" onClick={addExternalMember}><Plus />{tr(" Agregar invitado")}</button></div>
        <div className="platform-member-editor">{members.map((member, index) => <article key={`${member.userId}-${index}`}><button type="button" className={member.isLead ? 'lead' : ''} onClick={() => setMembers((current) => current.map((item, itemIndex) => ({ ...item, isLead: itemIndex === index })))} aria-label={tr("Marcar como director")} aria-pressed={member.isLead}><Crown /></button><div><strong>{member.displayName}</strong><input aria-label={tr("Rol")} value={member.roleLabel} onChange={(event) => setMembers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, roleLabel: event.target.value } : item))} /></div><button type="button" onClick={() => setMembers((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={tr("Quitar de plataforma")}><Trash2 /></button></article>)}</div>
      </section>
      <section className="platform-builder-section"><div className="platform-builder-title"><div><strong>{tr("2. Orden del culto")}</strong><small>{tr("Las horas se recalculan automáticamente al cambiar el orden o la duración.")}</small></div><b>{plannedMinutes}/{availableMinutes}{tr(" min")}</b></div>
        <div className="platform-item-editor premium-scroll-list">{items.map((item, index) => <article key={`${item.id ?? item.title}-${index}`}><div className="platform-item-order"><button type="button" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label={tr("Subir")}><ArrowUp /></button><b>{index + 1}</b><button type="button" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)} aria-label={tr("Bajar")}><ArrowDown /></button></div><div className="platform-item-fields"><div><label>{tr("Hora")}<input value={minuteLabel(item.startsAt)} readOnly /></label><label>{tr("Duración")}<input type="number" min="1" max="180" value={item.durationMinutes} onChange={(event) => updateItem(index, { durationMinutes: Number(event.target.value) })} /></label><label>{tr("Tipo")}<select value={item.participationType} onChange={(event) => updateItem(index, { participationType: event.target.value })}>{Object.entries(participationNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div><label>{tr("Parte del servicio")}<input value={item.title} onChange={(event) => updateItem(index, { title: event.target.value })} /></label><label>{tr("Participante")}<input list="platform-participants" value={item.assigneeName} onChange={(event) => { const person = participants.find((candidate) => candidate.name === event.target.value); updateItem(index, { assigneeName: event.target.value, assigneeUserId: person?.id ?? null, status: event.target.value ? 'READY' : 'PENDING' }); }} placeholder={tr("Nombre de quien participa")} /></label><label>{tr("Indicaciones")}<input value={item.notes} onChange={(event) => updateItem(index, { notes: event.target.value })} placeholder={tr("Micrófono, transición, pista o detalle operativo")} /></label></div><button type="button" className="platform-remove-item" onClick={() => setItems((current) => recalculate(current.filter((_, itemIndex) => itemIndex !== index), plan.program.serviceAt))} aria-label={tr("Quitar participación")}><Trash2 /></button></article>)}</div>
        <datalist id="platform-participants">{participants.map((person) => <option value={person.name} key={person.id} />)}</datalist>
        <button type="button" className="button button-ghost platform-add-item" onClick={addServiceItem}><Plus />{tr(" Agregar participación")}</button>
      </section>
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={openTemplateCreator}><LayoutTemplate />{tr(" Guardar orden como plantilla")}</button><button data-dialog-close type="button" className="button button-ghost" onClick={() => setBuilderOpen(false)}>{tr("Cancelar")}</button><button type="button" className="button button-primary" disabled={busy || !members.length || !items.length || plannedMinutes > availableMinutes} onClick={() => void savePlan()}><Save /> {busy ? tr("Guardando…") : tr("Guardar plataforma")}</button></div>
    </div></Modal>}

    {templateOpen && <Modal busy={busy} label={tr("Crear plantilla de culto")} onClose={() => setTemplateOpen(false)}><form className="modal-card premium-modal platform-template-modal" onSubmit={createTemplate}>
      <button data-dialog-close type="button" className="modal-close" onClick={() => setTemplateOpen(false)} aria-label={tr("Cerrar")}><X /></button><span className="modal-symbol"><LayoutTemplate /></span><span className="eyebrow">{tr("Biblioteca reutilizable")}</span><h2>{tr("Crear plantilla de culto")}</h2><p>{tr("Define una estructura propia. Podrás aplicarla a futuros cultos y ajustar cada detalle antes de guardar.")}</p>
      <label>{tr("Nombre de la plantilla")}<input required minLength={3} value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} placeholder={tr("Ej. Culto joven del sábado")} /></label>
      <div className="form-grid"><label>{tr("Tipo de culto")}<select value={templateForm.serviceType} onChange={(event) => setTemplateForm({ ...templateForm, serviceType: event.target.value as PlatformProgram['serviceType'] })}><option value="SABBATH">{tr("Sábado")}</option><option value="WEDNESDAY">{tr("Miércoles")}</option><option value="OTHER">{tr("Otro")}</option></select></label><label>{tr("Descripción")}<input value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })} /></label></div>
      <div className="template-item-list premium-scroll-list">{templateForm.items.map((item, index) => <article key={index}><b>{index + 1}</b><input aria-label={tr("Parte del servicio")} required value={item.title} onChange={(event) => setTemplateForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: event.target.value } : entry) }))} /><input aria-label={tr("Duración")} required type="number" min="1" max="180" value={item.durationMinutes} onChange={(event) => setTemplateForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, durationMinutes: Number(event.target.value) } : entry) }))} /><span>{tr("min")}</span><button type="button" aria-label={tr("Quitar participación")} onClick={() => setTemplateForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 /></button></article>)}</div>
      <button type="button" className="button button-ghost" onClick={() => setTemplateForm((current) => ({ ...current, items: [...current.items, { title: 'Nueva participación', participationType: 'CUSTOM', durationMinutes: 5, instructions: '', required: true }] }))}><Plus />{tr(" Agregar parte")}</button>
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setTemplateOpen(false)}>{tr("Cancelar")}</button><button type="submit" className="button button-primary" disabled={busy || !templateForm.items.length}>{busy ? tr("Creando…") : tr("Crear plantilla")}</button></div>
    </form></Modal>}
  </>;
}
