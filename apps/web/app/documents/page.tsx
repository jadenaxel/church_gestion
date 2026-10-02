'use client';

import { Modal } from '@/components/modal';

import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Download,
  Eye,
  FileStack,
  FileText,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/shell';
import { Empty, Notice, Spinner } from '@/components/ui';
import { API_URL, api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';

type Department = { id: string; name: string; color: string; description: string; canUpload: boolean };
type DocumentItem = {
  id: string; fileId: string; departmentId: string; departmentName: string; departmentColor: string;
  title: string; description: string; documentType: DocumentType; ministryYear: number;
  alignmentBasis: AlignmentBasis; alignmentReference: string; alignmentNotes: string;
  alignmentStatus: 'DECLARED' | 'VERIFIED' | 'NEEDS_CHANGES'; visibility: 'DEPARTMENT' | 'LEADERSHIP' | 'TENANT';
  createdByName: string; reviewedByName: string | null; reviewedAt: string | null; createdAt: string;
  originalName: string; mediaType: string; sizeBytes: number; version: number;
  capabilities: { canDelete: boolean; canReview: boolean };
};
type DocumentType = 'PROGRAM' | 'GUIDE' | 'MINUTES' | 'BUDGET' | 'REPORT' | 'TEMPLATE' | 'OTHER';
type AlignmentBasis = 'ANNUAL_CHURCH_PLAN' | 'ADVENTIST_MANUAL' | 'DEPARTMENTAL_GUIDE' | 'LOCAL_STRATEGIC_PLAN' | 'OTHER';

const typeLabels: Record<DocumentType, string> = {
  PROGRAM: 'Programa departamental', GUIDE: 'Guía', MINUTES: 'Acta', BUDGET: 'Presupuesto', REPORT: 'Informe', TEMPLATE: 'Plantilla', OTHER: 'Otro documento'
};
const basisLabels: Record<AlignmentBasis, string> = {
  ANNUAL_CHURCH_PLAN: 'Plan anual de la iglesia', ADVENTIST_MANUAL: 'Manual de Iglesia Adventista',
  DEPARTMENTAL_GUIDE: 'Guía oficial del departamento', LOCAL_STRATEGIC_PLAN: 'Plan estratégico local', OTHER: 'Otra referencia aprobada'
};
const statusLabels = { DECLARED: 'Alineación declarada', VERIFIED: 'Alineación verificada', NEEDS_CHANGES: 'Requiere cambios' };

function initialForm(year: number, departmentId = '') {
  return {
    departmentId, title: '', description: '', documentType: 'PROGRAM' as DocumentType, ministryYear: year,
    alignmentBasis: 'ANNUAL_CHURCH_PLAN' as AlignmentBasis, alignmentReference: '', alignmentNotes: '',
    visibility: 'DEPARTMENT' as DocumentItem['visibility'], alignmentConfirmed: false
  };
}

export default function DocumentsPage() {
  const { tr } = useExperience();

  const [context, setContext] = useState<{ departments: Department[]; canReview: boolean; canUpload: boolean; currentYear: number } | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [alignmentStatus, setAlignmentStatus] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState(initialForm(new Date().getFullYear()));
  const [viewer, setViewer] = useState<{ document: DocumentItem; url: string; loading: boolean } | null>(null);
  const [review, setReview] = useState<{ document: DocumentItem; status: 'VERIFIED' | 'NEEDS_CHANGES'; notes: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextContext, library] = await Promise.all([
        api<{ departments: Department[]; canReview: boolean; canUpload: boolean; currentYear: number }>('/files/department-documents/context'),
        api<{ items: DocumentItem[] }>('/files/department-documents')
      ]);
      setContext(nextContext); setDocuments(library.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible abrir la biblioteca ministerial.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (viewer?.url) URL.revokeObjectURL(viewer.url); }, [viewer?.url]);

  const visibleDocuments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return documents.filter((document) =>
      (!departmentId || document.departmentId === departmentId) &&
      (!documentType || document.documentType === documentType) &&
      (!alignmentStatus || document.alignmentStatus === alignmentStatus) &&
      (!query || `${document.title} ${document.description} ${document.departmentName} ${document.originalName} ${document.alignmentReference}`.toLocaleLowerCase('es').includes(query))
    );
  }, [alignmentStatus, departmentId, documentType, documents, search]);

  const metrics = useMemo(() => ({
    total: documents.length,
    programs: documents.filter((item) => item.documentType === 'PROGRAM').length,
    verified: documents.filter((item) => item.alignmentStatus === 'VERIFIED').length,
    review: documents.filter((item) => item.alignmentStatus !== 'VERIFIED').length
  }), [documents]);

  function openUpload() {
    const available = context?.departments.filter((item) => item.canUpload) ?? [];
    setForm(initialForm(context?.currentYear ?? new Date().getFullYear(), available[0]?.id ?? ''));
    setFile(null); setUploadOpen(true); setError(''); setSuccess('');
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError('Seleccione el documento que desea cargar.');
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      Object.entries(form).forEach(([key, value]) => { body.append(key, String(value)); });
      await api('/files/department-documents', { method: 'POST', body });
      setUploadOpen(false); setSuccess('Documento cargado, analizado y registrado para revisión de alineación.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible cargar el documento.'); }
    finally { setBusy(false); }
  }

  async function openViewer(document: DocumentItem) {
    if (viewer?.url) URL.revokeObjectURL(viewer.url);
    setViewer({ document, url: '', loading: true }); setError('');
    try {
      const response = await fetch(`${API_URL}/files/department-documents/${document.id}/preview`, { credentials: 'include' });
      if (!response.ok) throw new Error('No fue posible generar la vista previa segura.');
      const url = URL.createObjectURL(await response.blob());
      setViewer({ document, url, loading: false });
    } catch (reason) {
      setViewer(null); setError(reason instanceof Error ? reason.message : 'No fue posible visualizar el documento.');
    }
  }

  async function download(document: DocumentItem) {
    setError('');
    try {
      const response = await fetch(`${API_URL}/files/${document.fileId}/download`, { credentials: 'include' });
      if (!response.ok) throw new Error('No fue posible descargar el documento.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.originalName; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible descargar el documento.'); }
  }

  async function remove(document: DocumentItem) {
    if (!window.confirm(`¿Retirar “${document.title}” de la biblioteca?`)) return;
    setBusy(true); setError('');
    try {
      await api(`/files/department-documents/${document.id}`, { method: 'DELETE' });
      setSuccess('El documento fue retirado de manera auditable.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible retirar el documento.'); }
    finally { setBusy(false); }
  }

  async function saveReview(event: React.FormEvent) {
    event.preventDefault(); if (!review) return;
    setBusy(true); setError('');
    try {
      await api(`/files/department-documents/${review.document.id}/alignment`, { method: 'PATCH', body: JSON.stringify({ status: review.status, notes: review.notes }) });
      setReview(null); setSuccess('La revisión de alineación fue registrada con trazabilidad.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible registrar la revisión.'); }
    finally { setBusy(false); }
  }

  if (loading) return <Shell title={tr("Biblioteca ministerial")} eyebrow={tr("Programas y documentos")}><Spinner /></Shell>;
  if (!context) return <Shell title={tr("Biblioteca ministerial")} eyebrow={tr("Programas y documentos")}><Notice tone="danger" title={tr("Biblioteca no disponible")}>{error}</Notice></Shell>;

  return <Shell title={tr("Biblioteca ministerial")} eyebrow={tr("Conocimiento conectado")} actions={context.canUpload ? <button type="button" className="button button-primary desktop-action" onClick={openUpload}><UploadCloud />{tr(" Cargar documento")}</button> : undefined}>
    {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
    {success && <Notice tone="success" title={tr("Actualización completada")}>{success}</Notice>}

    <section className="document-hero">
      <div><span><BookOpenCheck />{tr(" Ministerio alineado")}</span><h2>{tr("Programas claros, accesibles y con propósito.")}</h2><p>{tr("Cada departamento conserva sus programas, guías y documentos en una biblioteca segura, con revisión humana de alineación y vista previa integrada.")}</p></div>
      <div className="document-hero-seal"><ShieldCheck /><small>{tr("Gobierno documental")}</small><strong>{metrics.verified}{tr(" verificados")}</strong><span>{tr("Versionado · antivirus · auditoría")}</span></div>
    </section>

    <section className="document-metrics">
      <button type="button" onClick={() => { setDocumentType(''); setAlignmentStatus(''); }}><FileStack /><span><small>{tr("Documentos")}</small><strong>{metrics.total}</strong></span></button>
      <button type="button" onClick={() => setDocumentType('PROGRAM')}><BookOpenCheck /><span><small>{tr("Programas")}</small><strong>{metrics.programs}</strong></span></button>
      <button type="button" onClick={() => setAlignmentStatus('VERIFIED')}><CheckCircle2 /><span><small>{tr("Verificados")}</small><strong>{metrics.verified}</strong></span></button>
      <button type="button" onClick={() => setAlignmentStatus('DECLARED')}><AlertTriangle /><span><small>{tr("Por revisar")}</small><strong>{metrics.review}</strong></span></button>
    </section>

    <section className="panel document-library">
      <div className="document-library-head"><div><span className="eyebrow">{tr("Repositorio vivo")}</span><h2>{tr("Documentos departamentales")}</h2><p>{tr("Busca, filtra, visualiza y descarga sin abandonar GestionChurch.")}</p></div>{context.canUpload && <button type="button" className="button button-primary" onClick={openUpload}><UploadCloud />{tr(" Cargar documento")}</button>}</div>
      <div className="document-filters">
        <label className="document-search"><Search /><input aria-label={tr("Buscar documentos")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Buscar título, archivo, referencia…")} /></label>
        <select aria-label={tr("Filtrar por departamento")} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">{tr("Todos los departamentos")}</option>{context.departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <select aria-label={tr("Filtrar por tipo")} value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="">{tr("Todos los tipos")}</option>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        <select aria-label={tr("Filtrar por alineación")} value={alignmentStatus} onChange={(event) => setAlignmentStatus(event.target.value)}><option value="">{tr("Toda alineación")}</option><option value="VERIFIED">{tr("Verificados")}</option><option value="DECLARED">{tr("Declarados")}</option><option value="NEEDS_CHANGES">{tr("Requieren cambios")}</option></select>
      </div>
      {visibleDocuments.length === 0 ? <Empty icon={<FileText />} title={tr("No hay documentos en esta vista")} text={tr("Carga el primer programa o ajusta los filtros para consultar la biblioteca.")} /> : <div className="document-card-grid premium-scroll-list">{visibleDocuments.map((document) => <article className="document-card" key={document.id}>
        <div className="document-card-top"><span className="document-file-icon" style={{ '--department-color': document.departmentColor } as React.CSSProperties}><FileText /></span><div><small>{document.departmentName} · {document.ministryYear}</small><h3>{document.title}</h3><p>{typeLabels[document.documentType]}{tr(" · versión ")}{document.version}</p></div><span className={`alignment-badge ${document.alignmentStatus.toLocaleLowerCase()}`}>{statusLabels[document.alignmentStatus]}</span></div>
        <p className="document-description">{document.description || tr("Sin descripción adicional.")}</p>
        <div className="document-alignment"><ShieldCheck /><span><small>{basisLabels[document.alignmentBasis]}</small><strong>{document.alignmentReference}</strong></span></div>
        <div className="document-meta"><span>{document.originalName}</span><span>{(Number(document.sizeBytes) / 1024 / 1024).toFixed(2)}{tr(" MB")}</span><span>{tr("Por ")}{document.createdByName}</span></div>
        <div className="document-actions"><button type="button" className="button button-primary" onClick={() => void openViewer(document)}><Eye />{tr(" Visualizar")}</button><button type="button" className="icon-button" onClick={() => void download(document)} aria-label={[tr("Descargar "), document.title].join('')}><Download /></button>{document.capabilities.canReview && <button type="button" className="icon-button" onClick={() => setReview({ document, status: 'VERIFIED', notes: document.alignmentNotes || 'Revisado conforme al programa y lineamientos vigentes.' })} aria-label={[tr("Revisar alineación de "), document.title].join('')}><ShieldCheck /></button>}{document.capabilities.canDelete && <button type="button" className="icon-button danger" disabled={busy} onClick={() => void remove(document)} aria-label={[tr("Retirar "), document.title].join('')}><Trash2 /></button>}</div>
      </article>)}</div>}
    </section>

    {uploadOpen && <Modal busy={busy} label={tr("Cargar documento")} onClose={() => setUploadOpen(false)}><form className="modal-card premium-modal document-upload-modal" onSubmit={upload}>
      <button data-dialog-close type="button" className="modal-close" onClick={() => setUploadOpen(false)} aria-label={tr("Cerrar")}><X /></button><span className="modal-symbol"><UploadCloud /></span><span className="eyebrow">{tr("Nuevo recurso ministerial")}</span><h2>{tr("Cargar documento")}</h2><p>{tr("Describe el propósito y la referencia que conecta este material con la planificación de la Iglesia Adventista.")}</p>
      <div className="form-grid"><label>{tr("Departamento")}<select required value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>{context.departments.filter((item) => item.canUpload).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>{tr("Año ministerial")}<input required type="number" min="2000" max="2100" value={form.ministryYear} onChange={(event) => setForm({ ...form, ministryYear: Number(event.target.value) })} /></label></div>
      <label>{tr("Título")}<input required minLength={3} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={tr("Ej. Programa anual de Jóvenes")} /></label>
      <div className="form-grid"><label>{tr("Tipo")}<select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value as DocumentType })}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>{tr("Visibilidad")}<select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as DocumentItem['visibility'] })}><option value="DEPARTMENT">{tr("Solo departamento")}</option><option value="LEADERSHIP">{tr("Liderazgo de la iglesia")}</option><option value="TENANT">{tr("Toda la iglesia")}</option></select></label></div>
      <label>{tr("Descripción")}<textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={tr("Objetivo y uso de este documento…")} /></label>
      <div className="alignment-form-block"><span><ShieldCheck /></span><div><strong>{tr("Declaración de alineación")}</strong><p>{tr("La validación final corresponde al liderazgo autorizado; GestionChurch conserva la referencia y la revisión.")}</p></div></div>
      <div className="form-grid"><label>{tr("Base de alineación")}<select value={form.alignmentBasis} onChange={(event) => setForm({ ...form, alignmentBasis: event.target.value as AlignmentBasis })}>{Object.entries(basisLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>{tr("Referencia exacta")}<input required minLength={3} value={form.alignmentReference} onChange={(event) => setForm({ ...form, alignmentReference: event.target.value })} placeholder={tr("Plan 2027 · Objetivo 3")} /></label></div>
      <label>{tr("Notas de alineación")}<textarea rows={2} value={form.alignmentNotes} onChange={(event) => setForm({ ...form, alignmentNotes: event.target.value })} placeholder={tr("Explique cómo contribuye a la misión…")} /></label>
      <label className="document-file-drop"><UploadCloud /><strong>{file?.name ?? tr("Seleccionar documento")}</strong><span>{file ? [(file.size / 1024 / 1024).toFixed(2), tr(" MB")].join('') : tr("PDF, Word, Excel, PowerPoint, texto o imagen · máximo 15 MB")}</span><input required type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <label className="alignment-confirm"><input required type="checkbox" checked={form.alignmentConfirmed} onChange={(event) => setForm({ ...form, alignmentConfirmed: event.target.checked })} /><span><strong>{tr("Confirmo que el material fue preparado tomando como base la referencia indicada.")}</strong><small>{tr("Quedará como “alineación declarada” hasta la revisión del liderazgo autorizado.")}</small></span></label>
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setUploadOpen(false)}>{tr("Cancelar")}</button><button type="submit" className="button button-primary" disabled={busy || !file || !form.alignmentConfirmed}>{busy ? tr("Analizando…") : tr("Cargar y registrar")}</button></div>
    </form></Modal>}

    {viewer && <Modal busy={busy} className="document-viewer-backdrop" label={[tr("Visor de "), viewer.document.title].join('')} onClose={() => setViewer(null)}><section className="document-viewer"                                 aria-label={[tr("Visor de "), viewer.document.title].join('')}>
      <header><div><small>{viewer.document.departmentName} · {typeLabels[viewer.document.documentType]}</small><h2>{viewer.document.title}</h2></div><div><button type="button" onClick={() => void download(viewer.document)}><Download />{tr(" Descargar")}</button><button type="button" onClick={() => setViewer(null)} aria-label={tr("Cerrar visor")}><X /></button></div></header>
      <aside><span className={`alignment-badge ${viewer.document.alignmentStatus.toLocaleLowerCase()}`}>{statusLabels[viewer.document.alignmentStatus]}</span><strong>{basisLabels[viewer.document.alignmentBasis]}</strong><p>{viewer.document.alignmentReference}</p>{viewer.document.alignmentNotes && <small>{viewer.document.alignmentNotes}</small>}</aside>
      <div className="document-preview-stage">{viewer.loading ? <Spinner /> : <iframe title={[tr("Vista previa de "), viewer.document.title].join('')} src={viewer.url} />}</div>
    </section></Modal>}

    {review && <Modal busy={busy} label={tr("Validar alineación")} onClose={() => setReview(null)}><form className="modal-card premium-modal alignment-review-modal" onSubmit={saveReview}>
      <button type="button" className="modal-close" onClick={() => setReview(null)} aria-label={tr("Cerrar")}><X /></button><span className="modal-symbol"><ShieldCheck /></span><span className="eyebrow">{tr("Revisión autorizada")}</span><h2>{tr("Validar alineación")}</h2><p><strong>{review.document.title}</strong><br />{basisLabels[review.document.alignmentBasis]} · {review.document.alignmentReference}</p>
      <label>{tr("Decisión")}<select value={review.status} onChange={(event) => setReview({ ...review, status: event.target.value as 'VERIFIED' | 'NEEDS_CHANGES' })}><option value="VERIFIED">{tr("Verificar alineación")}</option><option value="NEEDS_CHANGES">{tr("Solicitar cambios")}</option></select></label>
      <label>{tr("Fundamento")}<textarea required minLength={5} rows={4} value={review.notes} onChange={(event) => setReview({ ...review, notes: event.target.value })} /></label>
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setReview(null)}>{tr("Cancelar")}</button><button type="submit" disabled={busy} className="button button-primary">{busy ? tr("Registrando…") : tr("Guardar revisión")}</button></div>
    </form></Modal>}
  </Shell>;
}
