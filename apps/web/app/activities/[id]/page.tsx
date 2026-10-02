'use client';

import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  MapPin,
  Paperclip,
  Pencil,
  Send,
  UserRound,
  UsersRound,
  XCircle
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Shell } from '@/components/shell';
import { Badge, Notice, Spinner } from '@/components/ui';
import { api, API_URL, formatDate } from '@/lib/api';
import type { ActivityFormTemplate } from '@/lib/activity-form';
import { canUploadActivityFile } from '@/components/activity-submission';
import { useExperience } from '@/components/experience-provider';
import { sessionRecoveredEvent } from '@/lib/session-recovery';
import { localizedDateFormat } from '@/lib/locale-format';
import { definitiveWriteRejection } from '@/components/resumable-write';
import { useUnsavedChanges } from '@/components/unsaved-changes-provider';

type Activity = {
  id: string;
  code: string;
  title: string;
  description: string;
  objective: string;
  status: string;
  created_by: string;
  department: string;
  department_color: string;
  venue: string;
  responsible_name: string;
  audience: string;
  estimated_attendance: number;
  lifecycle: { endsAt: string | null; overdue: boolean };
  capabilities: { canEdit: boolean; canSubmit: boolean; canCancel: boolean; canRequestChange: boolean; canComplete: boolean; departmentRole: string | null };
  custom_data: Record<string, string | number | boolean | null>;
  form_schema_snapshot: ActivityFormTemplate | Record<string, never>;
  options: Array<{
    id: string;
    label: string;
    status: string;
    is_selected: boolean;
    sessions: Array<{ startsAt: string; endsAt: string; setupMinutes: number; teardownMinutes: number }>;
  }>;
};
type Attachment = { id: string; original_name: string; media_type: string; size_bytes: number; status: string; version: number; created_at: string };

export default function ActivityPage() {
  const { tr } = useExperience();

  const { id } = useParams<{ id: string }>();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [user, setUser] = useState<{ sub: string; permissions: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const uploadKey = useRef<string | null>(null);
  const { clear: clearPendingUpload } = useUnsavedChanges(Boolean(pendingUpload));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [loadedActivity, loadedFiles, me] = await Promise.all([
    api<Activity>(`/activities/${id}`),
    api<{ items: Attachment[] }>(`/files/activity/${id}`),
    api<{ user: { sub: string; permissions: string[] } }>('/me')
  ]);
    setActivity(loadedActivity);
    setFiles(loadedFiles.items);
    setUser(me.user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible abrir la actividad.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const recovered = () => { void load(); }; window.addEventListener(sessionRecoveredEvent,recovered); return () => window.removeEventListener(sessionRecoveredEvent,recovered); }, [load]);

  async function action(name: 'submit' | 'cancel' | 'complete') {
    try {
      await api(`/activities/${id}/${name}`, { method: 'POST' });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible completar la acción.'); }
  }

  async function upload(file?: File) {
    const selectedFile = pendingUpload ?? file;
    if (!selectedFile || uploading || !activity || !canUploadActivityFile(user, activity)) return;
    setUploading(true); setError('');
    setPendingUpload(selectedFile); uploadKey.current ??= `attachment-${crypto.randomUUID()}`;
    const data = new FormData();
    data.append('file', selectedFile);
    try {
      await api(`/files/activity/${id}`, { method: 'POST', headers: { 'idempotency-key': uploadKey.current }, body: data });
      setPendingUpload(null); uploadKey.current = null; clearPendingUpload();
      await load();
    } catch (reason) { if (definitiveWriteRejection(reason) && Number((reason as {status:unknown}).status) !== 401) { setPendingUpload(null); uploadKey.current = null; clearPendingUpload(); } setError(reason instanceof Error ? reason.message : 'No fue posible cargar el archivo.'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }

  async function download(fileId: string) {
    try {
      const signed = await api<{ url: string }>(`/files/${fileId}/access-token`, { method: 'POST' });
      window.location.assign(new URL(signed.url, API_URL).toString());
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible preparar la descarga.'); }
  }

  const snapshotFields = activity && 'fields' in activity.form_schema_snapshot ? activity.form_schema_snapshot.fields : [];
  const customFields = snapshotFields.filter((field) => field.kind === 'custom' && field.visible && activity?.custom_data[field.id] !== undefined);

  return <Shell title={tr("Detalle de actividad")} eyebrow={tr("Calendario")} actions={<Link href="/calendar" className="button button-ghost desktop-action"><ArrowLeft size={17} />{tr(" Calendario")}</Link>}>
    {error && <Notice tone="danger" title={tr("Atención")}>{error}</Notice>}
    {!activity ? loading ? <Spinner /> : <button type="button" className="button button-secondary" onClick={() => void load()}>{tr("Reintentar")}</button> : <div className="detail-layout">
      <section className="panel activity-detail">
        {activity.lifecycle.overdue && <Notice tone="warning" title={tr("Actividad finalizada pendiente de cierre")}>{tr("Confirma que se realizó para reflejarla como completada en el centro de control.")}</Notice>}
        <div className="activity-title"><span className="color-dot" style={{ background: activity.department_color }} /><div><span className="eyebrow">{activity.code} · {activity.department}</span><h2>{activity.title}</h2></div><Badge status={activity.status} /></div>
        <p className="lead">{activity.description}</p>
        {activity.objective && <div className="detail-block"><h3>{tr("Objetivo")}</h3><p>{activity.objective}</p></div>}
        <div className="info-grid">
          <div><CalendarClock /><span><small>{tr("Fecha y horario")}</small>{activity.options.flatMap((option) => option.sessions).map((session) => <strong key={session.startsAt}>{formatDate(session.startsAt)} – {localizedDateFormat({ hour: '2-digit', minute: '2-digit' }).format(new Date(session.endsAt))}</strong>)}</span></div>
          <div><MapPin /><span><small>{tr("Lugar")}</small><strong>{activity.venue || tr("Por definir")}</strong></span></div>
          <div><UserRound /><span><small>{tr("Responsable")}</small><strong>{activity.responsible_name}</strong></span></div>
          <div><UsersRound /><span><small>{tr("Audiencia estimada")}</small><strong>{activity.audience} · {activity.estimated_attendance || tr("Sin estimar")}</strong></span></div>
        </div>
        {customFields.length > 0 && <div className="detail-block custom-data-block"><h3>{tr("Información adicional")}</h3><div className="custom-data-grid">{customFields.map((field) => <div key={field.id}><small>{field.label}</small><strong>{typeof activity.custom_data[field.id] === 'boolean' ? (activity.custom_data[field.id] ? tr("Sí") : tr("No")) : String(activity.custom_data[field.id] ?? '—')}</strong></div>)}</div></div>}
        <div className="detail-actions">
          {(activity.capabilities.canEdit || activity.capabilities.canRequestChange) && <Link href={`/activities/${activity.id}/edit`} className="button button-secondary"><Pencil size={17} /> {activity.capabilities.canRequestChange ? tr("Solicitar modificación") : tr("Editar actividad")}</Link>}
          {activity.capabilities.canSubmit && <button type="button" className="button button-primary" onClick={() => action('submit')}><Send size={17} />{tr(" Enviar para aprobación")}</button>}
          {activity.capabilities.canComplete && <button type="button" className="button button-primary" onClick={() => action('complete')}><CheckCircle2 size={17} />{tr(" Marcar completada")}</button>}
          {activity.capabilities.canCancel && <button type="button" className="button button-danger" onClick={() => action('cancel')}><XCircle size={17} />{tr(" Cancelar actividad")}</button>}
        </div>
      </section>
      <aside className="panel attachment-panel">
        <div className="panel-heading"><div><span className="eyebrow">{tr("Documentos")}</span><h2>{tr("Programa")}</h2></div>{canUploadActivityFile(user, activity) && <><button type="button" className="button button-secondary compact" disabled={uploading} aria-busy={uploading} onClick={() => pendingUpload ? void upload() : fileInputRef.current?.click()}><Paperclip size={16} /> {uploading ? tr("Cargando…") : pendingUpload ? tr('Reintentar confirmación') : tr("Adjuntar")}</button><input ref={fileInputRef} type="file" hidden disabled={Boolean(pendingUpload)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.png,.jpg,.jpeg" onChange={(event) => void upload(event.target.files?.[0])} /></>}</div>
        {pendingUpload && <Notice tone="warning" title={tr('Solicitud pendiente de confirmar')}>{pendingUpload.name} · {tr('El adjunto sigue sin confirmarse. Reintenta el mismo archivo antes de reemplazarlo.')}</Notice>}
        {files.length === 0 ? <div className="small-empty"><FileText /><p>{tr("Aún no hay archivos adjuntos.")}</p></div> : <div className="file-list">{files.map((file) => <button type="button" onClick={() => download(file.id)} className="file-row" key={file.id}><span><FileText /></span><div><strong>{file.original_name}</strong><small>{(file.size_bytes / 1024 / 1024).toFixed(2)}{tr(" MB · versión ")}{file.version}</small></div><Download size={17} /></button>)}</div>}
      </aside>
    </div>}
  </Shell>;
}
