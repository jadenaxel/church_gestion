'use client';

import { Modal } from '@/components/modal';

import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Eye,
  GripVertical,
  LayoutTemplate,
  Monitor,
  Plus,
  Save,
  Send,
  Settings2,
  Smartphone,
  Sparkles,
  Trash2
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/shell';
import { Notice, Spinner } from '@/components/ui';
import { useUnsavedChanges } from '@/components/unsaved-changes-provider';
import { api, ApiError } from '@/lib/api';
import {
  builtinFieldCatalog,
  activityFieldText,
  activityFieldOptions,
  activityTemplateText,
  customizeActivityField,
  customizeActivityTemplate,
  cloneField,
  essentialActivitySources,
  fieldTypeLabels,
  type ActivityFormField,
  type ActivityFormTemplate,
  type ActivityFormTemplateResponse
} from '@/lib/activity-form';
import { useExperience } from '@/components/experience-provider';

type DraftResponse = { draft: ActivityFormTemplate; draftVersion: number; updatedAt: string; hasUnpublishedChanges: boolean };
type PublishResponse = { published: ActivityFormTemplate; publishedVersion: number; publishedAt: string; hasUnpublishedChanges: boolean };

function PreviewField({ field }: { field: ActivityFormField }) {
  const { tr } = useExperience();
  field = { ...field, label: activityFieldText(field, 'label', tr), placeholder: activityFieldText(field, 'placeholder', tr), helpText: activityFieldText(field, 'helpText', tr), options: activityFieldOptions(field, tr) };

  const inputId = `preview-field-${field.id}`;
  const label = <span>{activityFieldText(field, "label", tr)}{field.required && <b> *</b>}</span>;
  return (
    <label htmlFor={inputId} className={field.width === 'full' ? 'field-span' : ''}>
      {label}
      {field.type === 'textarea' ? <textarea id={inputId} placeholder={field.placeholder} disabled /> : field.type === 'select' ? (
        <select id={inputId} disabled><option>{field.options[0] ?? tr("Seleccionar…")}</option></select>
      ) : field.type === 'checkbox' ? (
        <span className="preview-checkbox"><input id={inputId} type="checkbox" disabled />{tr(" Confirmar")}</span>
      ) : <input id={inputId} type={field.type} placeholder={field.placeholder} disabled />}
      {field.helpText && <small className="form-field-help">{field.helpText}</small>}
    </label>
  );
}

export default function ActivityFormBuilderPage() {
  const { tr } = useExperience();

  const [template, setTemplate] = useState<ActivityFormTemplate | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [publishedVersion, setPublishedVersion] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [approvedPreviewSignature, setApprovedPreviewSignature] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<ActivityFormTemplateResponse>('/activity-form/template').then((result) => {
      if (!result.canManage || !result.draft || !result.draftVersion) throw new Error('Solo el administrador del tenant puede diseñar este formulario.');
      setTemplate(result.draft);
      setDraftVersion(result.draftVersion);
      setPublishedVersion(result.publishedVersion);
      setSelectedId(result.draft.fields[0]?.id ?? '');
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'No fue posible cargar el diseñador.'));
  }, []);

  const selected = template?.fields.find((field) => field.id === selectedId) ?? null;
  const templateSignature = useMemo(() => template ? JSON.stringify(template) : '', [template]);
  const missingBuiltinFields = useMemo(() => {
    const sources = new Set(template?.fields.map((field) => field.source).filter(Boolean));
    return builtinFieldCatalog.filter((field) => !sources.has(field.source));
  }, [template]);
  const readyToPublish = Boolean(template && !dirty && approvedPreviewSignature === templateSignature);

  function change(mutator: (current: ActivityFormTemplate) => ActivityFormTemplate) {
    setTemplate((current) => current ? mutator(current) : current);
    setDirty(true);
    setMessage('');
    setError('');
    setApprovedPreviewSignature('');
  }

  function updateField(id: string, patch: Partial<ActivityFormField>) {
    change((current) => ({ ...current, fields: current.fields.map((field) => field.id === id ? customizeActivityField(field, patch) : field) }));
  }

  function addCustomField() {
    const id = `custom_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const field: ActivityFormField = {
      id,
      kind: 'custom',
      type: 'text',
      label: 'Nuevo campo',
      placeholder: 'Escribe una respuesta',
      helpText: '',
      required: false,
      visible: true,
      width: 'half',
      options: []
    };
    change((current) => ({ ...current, fields: [...current.fields, field] }));
    setSelectedId(id);
  }

  function restoreBuiltin(field: ActivityFormField) {
    change((current) => ({ ...current, fields: [...current.fields, cloneField(field)] }));
    setSelectedId(field.id);
  }

  function removeField(field: ActivityFormField) {
    if (field.source && essentialActivitySources.has(field.source)) return;
    change((current) => ({ ...current, fields: current.fields.filter((item) => item.id !== field.id) }));
    setSelectedId(template?.fields.find((item) => item.id !== field.id)?.id ?? '');
  }

  function moveField(index: number, direction: -1 | 1) {
    if (!template) return;
    const destination = index + direction;
    if (destination < 0 || destination >= template.fields.length) return;
    change((current) => {
      const fields = [...current.fields];
      const [field] = fields.splice(index, 1);
      if (field) fields.splice(destination, 0, field);
      return { ...current, fields };
    });
  }

  async function saveDraft() {
    if (!template) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await api<DraftResponse>('/activity-form/template/draft', {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion: draftVersion, template })
      });
      setTemplate(result.draft);
      setDraftVersion(result.draftVersion);
      setDirty(false);
      setMessage('Borrador guardado. El formulario publicado todavía no cambió.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : 'No fue posible guardar el borrador.');
    } finally { setSaving(false); }
  }

  async function publish() {
    if (!template || !readyToPublish) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await api<PublishResponse>('/activity-form/template/publish', {
        method: 'POST',
        body: JSON.stringify({ expectedDraftVersion: draftVersion })
      });
      setPublishedVersion(result.publishedVersion);
      setApprovedPreviewSignature('');
      setMessage(`Formulario publicado correctamente como versión ${result.publishedVersion}.`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : 'No fue posible publicar el formulario.');
    } finally { setSaving(false); }
  }

  if (!template && !error) return <Shell title={tr("Diseñador de formulario")} eyebrow={tr("Administración del tenant")}><Spinner /></Shell>;

  return (
    <Shell
      title={tr("Diseñador de formulario")}
      eyebrow={tr("Administración del tenant")}
      actions={<div className="builder-top-actions"><button type="button" className="button button-secondary" onClick={() => setPreviewOpen(true)} disabled={!template}><Eye size={17} />{tr(" Vista previa")}</button><button type="button" className="button button-primary" onClick={publish} disabled={!readyToPublish || saving}><Send size={17} />{tr(" Publicar")}</button></div>}
    >
      {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
      {message && <Notice tone="success" title={tr("Formulario actualizado")}>{message}</Notice>}
      {template && <>
        <section className="panel builder-statusbar">
          <div className="builder-status-icon"><Sparkles /></div>
          <div><span className="eyebrow">{tr("Flujo seguro de publicación")}</span><h2>{tr("Diseña → guarda → revisa → publica")}</h2><p>{tr("Los usuarios continúan usando la versión ")}{publishedVersion}{tr(" hasta que publiques el borrador.")}</p></div>
          <div className="builder-version-stack"><span className={dirty ? 'status-chip warning' : 'status-chip success'}>{dirty ? tr("Cambios sin guardar") : [tr("Borrador v"), draftVersion].join('')}</span><span className="status-chip">{tr("Publicada v")}{publishedVersion}</span></div>
        </section>

        <div className="form-builder-layout">
          <aside className="panel builder-library">
            <div><span className="eyebrow">{tr("Agregar")}</span><h2>{tr("Componentes")}</h2><p>{tr("Extiende el formulario según las necesidades de esta iglesia.")}</p></div>
            <button type="button" className="builder-add-card primary" onClick={addCustomField}><Plus /><span><strong>{tr("Campo personalizado")}</strong><small>{tr("Texto, lista, fecha y más")}</small></span></button>
            {missingBuiltinFields.length > 0 && <div className="builder-restore"><strong>{tr("Campos base disponibles")}</strong>{missingBuiltinFields.map((field) => <button type="button" key={field.id} onClick={() => restoreBuiltin(field)}><Plus size={14} /> {activityFieldText(field, "label", tr)}</button>)}</div>}
            <div className="builder-guardrail"><CheckCircle2 /><p><strong>{tr("Datos esenciales protegidos")}</strong>{tr("Nombre, descripción, departamento y responsable siempre permanecen activos.")}</p></div>
          </aside>

          <section className="panel builder-canvas">
            <div className="builder-document-head">
              <span className="builder-document-icon"><LayoutTemplate /></span>
              <div><input aria-label={tr("Título del formulario")} value={template.title} onChange={(event) => change((current) => customizeActivityTemplate(current, 'title', event.target.value))} /><textarea aria-label={tr("Descripción del formulario")} value={template.description} onChange={(event) => change((current) => customizeActivityTemplate(current, 'description', event.target.value))} /></div>
            </div>
            <div className="builder-field-list">
              {template.fields.map((field, index) => {
                const essential = Boolean(field.source && essentialActivitySources.has(field.source));
                return <article className={`builder-field-card ${selectedId === field.id ? 'selected' : ''} ${!field.visible ? 'disabled' : ''}`} key={field.id}>
                  <button type="button" className="builder-field-select" onClick={() => setSelectedId(field.id)} aria-label={[tr("Editar "), field.label].join('')}>
                    <span className="drag-handle"><GripVertical /></span>
                    <span className="field-type-icon"><Settings2 /></span>
                    <span className="builder-field-copy"><strong>{activityFieldText(field, "label", tr)}{field.required && <b> *</b>}</strong><small>{field.kind === 'builtin' ? tr("Campo base") : fieldTypeLabels[field.type]} · {field.width === 'full' ? tr("Ancho completo") : tr("Media columna")}{!field.visible ? tr(" · oculto") : ''}</small></span>
                    {essential && <span className="essential-badge">{tr("Esencial")}</span>}
                  </button>
                  <div className="field-card-actions">
                    <button type="button" aria-label={[tr("Subir "), field.label].join('')} disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveField(index, -1); }}><ArrowUp /></button>
                    <button type="button" aria-label={[tr("Bajar "), field.label].join('')} disabled={index === template.fields.length - 1} onClick={(event) => { event.stopPropagation(); moveField(index, 1); }}><ArrowDown /></button>
                    <button type="button" className="danger" aria-label={[tr("Quitar "), field.label].join('')} disabled={essential} onClick={(event) => { event.stopPropagation(); removeField(field); }}><Trash2 /></button>
                  </div>
                </article>;
              })}
            </div>
            <div className="builder-submit-preview"><span>{tr("Texto del botón final")}</span><input value={template.submitLabel} onChange={(event) => change((current) => customizeActivityTemplate(current, 'submitLabel', event.target.value))} /></div>
          </section>

          <aside className="panel builder-inspector">
            <div><span className="eyebrow">{tr("Propiedades")}</span><h2>{selected?.label ?? tr("Selecciona un campo")}</h2></div>
            {selected && <div className="inspector-form">
              <label>{tr("Etiqueta")}<input value={selected.label} onChange={(event) => updateField(selected.id, { label: event.target.value })} /></label>
              {selected.kind === 'custom' && <label>{tr("Tipo")}<select value={selected.type} onChange={(event) => updateField(selected.id, { type: event.target.value as ActivityFormField['type'], options: event.target.value === 'select' && selected.options.length < 2 ? ['Opción 1', 'Opción 2'] : selected.options })}>{Object.entries(fieldTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
              {!['checkbox', 'select'].includes(selected.type) && <label>{tr("Texto de ejemplo")}<input value={selected.placeholder} onChange={(event) => updateField(selected.id, { placeholder: event.target.value })} /></label>}
              <label>{tr("Texto de ayuda")}<textarea value={selected.helpText} onChange={(event) => updateField(selected.id, { helpText: event.target.value })} placeholder={tr("Orientación breve para completar el campo")} /></label>
              {selected.kind === 'custom' && selected.type === 'select' && <label>{tr("Opciones, una por línea")}<textarea value={selected.options.join('\n')} onChange={(event) => updateField(selected.id, { options: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} /></label>}
              <label>{tr("Ancho")}<select value={selected.width} onChange={(event) => updateField(selected.id, { width: event.target.value as 'half' | 'full' })}><option value="half">{tr("Media columna")}</option><option value="full">{tr("Ancho completo")}</option></select></label>
              <div className="inspector-toggles">
                <label><input type="checkbox" checked={selected.required} disabled={Boolean(selected.source && essentialActivitySources.has(selected.source))} onChange={(event) => updateField(selected.id, { required: event.target.checked })} />{tr(" Obligatorio")}</label>
                <label><input type="checkbox" checked={selected.visible} disabled={Boolean(selected.source && essentialActivitySources.has(selected.source))} onChange={(event) => updateField(selected.id, { visible: event.target.checked })} />{tr(" Visible")}</label>
              </div>
            </div>}
          </aside>
        </div>

        <div className="builder-bottom-bar">
          <div><strong>{dirty ? tr("Tu borrador tiene cambios pendientes") : tr("Todos los cambios están guardados")}</strong><span>{readyToPublish ? tr("Vista previa aprobada: listo para publicar.") : tr("La publicación requiere guardar y aprobar la vista previa.")}</span></div>
          <button type="button" className="button button-secondary" onClick={saveDraft} disabled={!dirty || saving}><Save size={17} /> {saving ? tr("Guardando…") : tr("Guardar borrador")}</button>
          <button type="button" className="button button-primary" onClick={() => setPreviewOpen(true)}><Eye size={17} />{tr(" Revisar vista previa")}</button>
        </div>

        {previewOpen && <Modal busy={saving} className="form-preview-overlay" label={tr("Vista previa del formulario")} onClose={() => setPreviewOpen(false)}>
          <section className="form-preview-shell">
            <header><div><span className="eyebrow">{tr("Vista previa privada")}</span><h2>{tr("Así verán el formulario")}</h2><p>{tr("Ningún cambio será público hasta completar la publicación.")}</p></div><div className="preview-device-toggle"><button type="button" className={previewDevice === 'desktop' ? 'active' : ''} onClick={() => setPreviewDevice('desktop')} aria-label={tr("Vista de escritorio")}><Monitor /></button><button type="button" className={previewDevice === 'mobile' ? 'active' : ''} onClick={() => setPreviewDevice('mobile')} aria-label={tr("Vista móvil")}><Smartphone /></button></div></header>
            <div className="preview-stage"><div className={`preview-browser ${previewDevice}`}><div className="preview-browser-bar"><i /><i /><i /><span>{tr("gestionchurch.com/activities/new")}</span></div><div className="preview-form"><span className="eyebrow">{tr("Planificación")}</span><h1>{activityTemplateText(template, "title", tr)}</h1><p>{activityTemplateText(template, "description", tr)}</p><div className="preview-section-title"><b>1</b><span><strong>{tr("Información de la actividad")}</strong><small>{tr("Completa los datos solicitados.")}</small></span></div><div className="field-grid">{template.fields.filter((field) => field.visible).map((field) => <PreviewField key={field.id} field={field} />)}</div><div className="preview-section-title"><b>2</b><span><strong>{tr("Fechas propuestas")}</strong><small>{tr("Horario principal y alternativas.")}</small></span></div><div className="preview-placeholder-block" /><div className="preview-section-title"><b>3</b><span><strong>{tr("Programa de la actividad")}</strong><small>{tr("Documento o archivo del programa.")}</small></span></div><div className="preview-upload">{tr("Selecciona el programa")}</div><button type="button" className="button button-primary" disabled>{activityTemplateText(template, "submitLabel", tr)}</button></div></div></div>
            <footer><button data-dialog-close type="button" className="button button-ghost" onClick={() => setPreviewOpen(false)}>{tr("Volver al diseñador")}</button><button type="button" className="button button-primary" onClick={() => { setApprovedPreviewSignature(templateSignature); setPreviewOpen(false); setMessage('Vista previa aprobada. Guarda el borrador si es necesario y luego publícalo.'); }}><Check size={17} />{tr(" Aprobar vista previa")}</button></footer>
          </section>
        </Modal>}
      </>}
    </Shell>
  );
}
