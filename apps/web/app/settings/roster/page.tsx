'use client';

import { Modal } from '@/components/modal';

import {
  AlertTriangle,
  CakeSlice,
  Camera,
  Check,
  CircleCheckBig,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  UsersRound,
  Venus,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shell } from '@/components/shell';
import { Empty, Notice, Spinner } from '@/components/ui';
import { API_URL, api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';
import { filterRoster, type RosterFilters } from '@/components/roster-filters';

type Member = {
  id: string; memberCode: string; firstName: string; middleName: string; lastName: string; displayName: string;
  sex: 'FEMALE' | 'MALE' | 'UNSPECIFIED'; dateOfBirth: string | null; email: string; phone: string; whatsapp: string;
  maritalStatus: string; membershipStatus: 'MEMBER' | 'VISITOR' | 'INACTIVE' | 'TRANSFERRED'; active: boolean;
  age: number | null; ageBand: string; hasPhoto: boolean; photoUpdatedAt: string | null;
};
type ImportSummary = { id: string; originalName: string; status: string; totalRows: number; validRows: number; invalidRows: number; warningRows: number; committedRows: number; createdAt: string; committedAt: string | null };
type Context = {
  access: { canManage: boolean };
  metrics: { total: number; women: number; men: number; birthdaysNext30: number; withPhoto: number; missingBirthDate: number };
  members: Member[];
  birthdayMemberIds?: string[];
  today?: string;
  recentImports: ImportSummary[];
};
type PreviewRow = {
  rowNumber: number;
  normalized: Partial<Member> & { memberCode?: string; displayName?: string };
  status: 'VALID' | 'INVALID'; errors: string[]; warnings: string[];
};
type ImportPreview = { id: string; status: string; totalRows: number; validRows: number; invalidRows: number; warningRows: number; rows: PreviewRow[]; truncated: boolean };

const ageLabels: Record<string, string> = {
  UNDER_18: 'Menores de 18', '18_25': '18–25 años', '26_39': '26–39 años', '40_59': '40–59 años', '60_PLUS': '60 años o más', UNSPECIFIED: 'Edad por completar'
};
const statusLabels: Record<string, string> = { MEMBER: 'Miembro', VISITOR: 'Visitante', INACTIVE: 'Inactivo', TRANSFERRED: 'Trasladado' };

function initials(name: string) {
  return name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

export default function ChurchRosterPage() {
  const { tr } = useExperience();

  const [data, setData] = useState<Context | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [focusFilter, setFocusFilter] = useState<RosterFilters['focus']>('ALL');
  const [importOpen, setImportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setData(await api<Context>('/roster/context')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible cargar el padrón de la iglesia.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => filterRoster(data?.members ?? [], { search, sex: sexFilter, status: statusFilter, focus: focusFilter }, data?.birthdayMemberIds), [data, search, sexFilter, statusFilter, focusFilter]);
  function drill(focus: RosterFilters['focus'], sex = 'ALL') { setSearch(''); setSexFilter(sex); setStatusFilter('ACTIVE'); setFocusFilter(focus); }

  function openImport() {
    setError(''); setSuccess(''); setSelectedFile(null); setPreview(null); setImportOpen(true);
  }

  async function previewImport(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedFile) { setError('Seleccione la plantilla completada en formato XLSX o CSV.'); return; }
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('file', selectedFile);
      setPreview(await api<ImportPreview>('/roster/imports/preview', { method: 'POST', body: form }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible analizar el archivo.'); }
    finally { setBusy(false); }
  }

  async function commitImport() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ imported: number; created: number; updated: number; skippedInvalid: number }>('/roster/imports/' + preview.id + '/commit', { method: 'POST' });
      setSuccess(`${result.imported} personas importadas: ${result.created} nuevas y ${result.updated} actualizadas. ${result.skippedInvalid ? `${result.skippedInvalid} filas con errores fueron excluidas.` : 'No se detectaron filas inválidas.'}`);
      setImportOpen(false); setPreview(null); setSelectedFile(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible confirmar la importación.'); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(member: Member, file?: File) {
    if (!file) return;
    setPhotoBusy(member.id); setError(''); setSuccess('');
    try {
      const form = new FormData(); form.append('file', file);
      await api(`/files/member-photos/${member.id}`, { method: 'POST', body: form });
      setSuccess(`Fotografía actualizada para ${member.displayName}.`); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible cargar la fotografía.'); }
    finally { setPhotoBusy(null); }
  }

  return <Shell title={tr("Padrón de iglesia")} eyebrow={tr("Administración del tenant")} actions={<button type="button" className="button button-primary desktop-action" onClick={openImport}><Upload />{tr(" Importar padrón")}</button>}>
    {error && <Notice tone="danger" title={tr("Atención")}>{error}</Notice>}
    {success && <Notice tone="success" title={tr("Padrón actualizado")}>{success}</Notice>}
    {!data ? error ? <button type="button" className="button button-secondary" onClick={() => { setError(''); void load(); }}>{tr('Reintentar')}</button> : <Spinner /> : <div className="roster-admin-page">
      <section className="roster-admin-hero">
        <div><span className="eyebrow">{tr("Fuente maestra del tenant")}</span><h2>{tr("Una iglesia conocida, cuidada y conectada.")}</h2><p>{tr("Importa el padrón una sola vez y mantén sincronizados cumpleaños, edades y perfiles ministeriales sin duplicar información.")}</p><div className="roster-privacy"><ShieldCheck /><span><strong>{tr("Aislamiento por iglesia")}</strong><small>{tr("Solo los administradores autorizados de este tenant pueden gestionar el padrón.")}</small></span></div></div>
        <aside><UsersRound /><strong>{data.metrics.total}</strong><span>{tr("personas activas")}</span><small>{data.metrics.withPhoto}{tr(" con fotografía")}</small></aside>
      </section>

      <section className="roster-metrics" aria-label={tr("Resumen del padrón")}>
        <button type="button" onClick={() => drill('ALL')}><UsersRound /><span><b>{data.metrics.total}</b><small>{tr("Padrón activo")}</small></span></button>
        <button type="button" onClick={() => drill('ALL', 'FEMALE')}><Venus /><span><b>{data.metrics.women}</b><small>{tr("Mujeres sincronizadas")}</small></span></button>
        <button type="button" onClick={() => drill('BIRTHDAYS')}><CakeSlice /><span><b>{data.metrics.birthdaysNext30}</b><small>{tr("Cumpleaños en 30 días")}</small></span></button>
        <button type="button" onClick={() => drill('PHOTO')}><Camera /><span><b>{data.metrics.withPhoto}</b><small>{tr("Perfiles con foto")}</small></span></button>
      </section>

      <section className="panel roster-command-center">
        <div className="panel-heading roster-command-head"><div><span className="eyebrow">{tr("Importación controlada")}</span><h2>{tr("Centro de padrón")}</h2><p>{tr("Descarga el formato oficial, valida los datos y confirma únicamente las filas correctas.")}</p></div><div><a className="button button-ghost" href="/templates/plantilla-padron-iglesia.xlsx" download><Download />{tr(" Descargar plantilla")}</a><button type="button" className="button button-primary" onClick={openImport}><FileSpreadsheet />{tr(" Cargar información")}</button></div></div>
        <ol className="roster-import-flow" aria-label={tr("Flujo de importación")}><li><i>1</i><b>{tr("Descarga")}</b><small>{tr("Formato oficial")}</small></li><li className="flow-connector" aria-hidden="true" /><li><i>2</i><b>{tr("Previsualiza")}</b><small>{tr("Errores y avisos")}</small></li><li className="flow-connector" aria-hidden="true" /><li><i>3</i><b>{tr("Confirma")}</b><small>{tr("Sincronización segura")}</small></li></ol>
      </section>

      <section className="panel roster-directory">
        <div className="panel-heading"><div><span className="eyebrow">{tr("Directorio visual protegido")}</span><h2>{tr("Personas de la iglesia")}</h2><p>{filtered.length}{tr(" de ")}{data.members.length}{tr(" perfiles visibles")}</p></div></div>
        <div className="roster-directory-tools">
          {focusFilter !== 'ALL' && <button type="button" className="button button-ghost" onClick={() => drill('ALL')}>{tr(focusFilter === 'BIRTHDAYS' ? 'Cumpleaños en 30 días' : 'Perfiles con foto')} · {tr('Limpiar filtros')}<X /></button>}
          <label><Search /><input aria-label={tr("Buscar en el padrón")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Código, nombre, correo o teléfono…")} />{search && <button type="button" onClick={() => setSearch('')} aria-label={tr("Limpiar búsqueda")}><X /></button>}</label>
          <select aria-label={tr("Filtrar por sexo")} value={sexFilter} onChange={(event) => setSexFilter(event.target.value)}><option value="ALL">{tr("Todas las personas")}</option><option value="FEMALE">{tr("Mujeres")}</option><option value="MALE">{tr("Hombres")}</option><option value="UNSPECIFIED">{tr("Sin especificar")}</option></select>
          <select aria-label={tr("Filtrar por estado")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ACTIVE">{tr("Activos")}</option><option value="ALL">{tr("Todos los estados")}</option><option value="MEMBER">{tr("Miembros")}</option><option value="VISITOR">{tr("Visitantes")}</option><option value="INACTIVE">{tr("Inactivos")}</option><option value="TRANSFERRED">{tr("Trasladados")}</option></select>
        </div>
        {focusFilter === 'BIRTHDAYS' && !data.birthdayMemberIds && <Notice tone="warning" title={tr('Cumpleaños pendientes de verificar')}>{tr('Actualiza el padrón para recuperar el grupo exacto de cumpleaños.')}</Notice>}
        {filtered.length ? <div className="roster-member-grid premium-scroll-list">{filtered.map((member) => <article key={member.id} className={!member.active ? 'inactive' : ''}>
          <div className="roster-member-photo">{member.hasPhoto ? <img src={`${API_URL}/files/member-photos/${member.id}?v=${encodeURIComponent(member.photoUpdatedAt ?? '')}`} alt={[tr("Foto de "), member.displayName].join("")} loading="lazy" /> : <span>{initials(member.displayName)}</span>}<label title={tr("Actualizar fotografía")}><input aria-label={[tr("Cargar fotografía de "), member.displayName].join('')} type="file" accept="image/png,image/jpeg" disabled={photoBusy === member.id} onChange={(event) => { void uploadPhoto(member, event.target.files?.[0]); event.currentTarget.value = ''; }} /><ImagePlus />{photoBusy === member.id && <i />}</label></div>
          <div className="roster-member-copy"><span><b>{member.displayName}</b><em>{tr(statusLabels[member.membershipStatus] ?? member.membershipStatus)}</em></span><small>{member.memberCode} · {tr(ageLabels[member.ageBand] ?? member.ageBand)}{member.age !== null ? [" · ", member.age, tr(" años")].join('') : ''}</small><p>{member.whatsapp || member.phone || member.email || tr("Sin contacto registrado")}</p></div>
        </article>)}</div> : <Empty icon={<UserRound />} title={tr("No hay perfiles con estos filtros")} text={tr("Ajusta la búsqueda o importa la plantilla oficial del padrón.")} />}
      </section>

      {data.recentImports.length > 0 && <section className="panel roster-import-history"><div className="panel-heading"><div><span className="eyebrow">{tr("Trazabilidad")}</span><h2>{tr("Importaciones recientes")}</h2></div></div><div className="premium-scroll-list">{data.recentImports.map((item) => <article key={item.id}><FileSpreadsheet /><span><strong>{item.originalName}</strong><small>{item.totalRows}{tr(" filas · ")}{item.validRows}{tr(" válidas · ")}{item.invalidRows}{tr(" con error")}</small></span><em className={item.status.toLocaleLowerCase()}>{item.status === 'COMPLETED' ? tr("Completada") : tr("Previsualizada")}</em></article>)}</div></section>}
    </div>}

    {importOpen && <Modal busy={busy} label={tr("Cargar padrón de iglesia")} onClose={() => setImportOpen(false)}><form className="modal-card roster-import-modal" onSubmit={previewImport}                                                                      >
      {error && <Notice tone="danger" title={tr('No fue posible completar la acción')}>{error}</Notice>}
      <button data-dialog-close type="button" className="modal-close" onClick={() => setImportOpen(false)} aria-label={tr("Cerrar")}><X /></button>
      <span className="modal-symbol"><FileSpreadsheet /></span><span className="eyebrow">{tr("Importación segura")}</span><h2 id="roster-import-title">{tr("Cargar padrón de iglesia")}</h2><p>{tr("El archivo se valida primero. Ninguna persona se guarda hasta que revises la previsualización y confirmes.")}</p>
      {!preview ? <>
        <div className="roster-template-callout"><Download /><span><strong>{tr("¿Primera importación?")}</strong><small>{tr("Usa el formato oficial con catálogos, fechas y campos requeridos.")}</small></span><a href="/templates/plantilla-padron-iglesia.xlsx" download>{tr("Descargar plantilla")}</a></div>
        <label className={`roster-dropzone ${selectedFile ? 'selected' : ''}`}><input ref={fileInput} aria-label={tr("Archivo del padrón")} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /><Upload /><span><strong>{selectedFile?.name ?? tr("Selecciona o arrastra tu archivo")}</strong><small>{tr("XLSX o CSV · máximo 8 MB · hasta 5,000 personas")}</small></span>{selectedFile && <CircleCheckBig />}</label>
        <div className="roster-import-assurances"><span><ShieldCheck />{tr(" Aislado por tenant")}</span><span><Check />{tr(" Sin duplicados por código")}</span><span><Venus />{tr(" Sincroniza Ministerio de la Mujer")}</span></div>
        <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setImportOpen(false)}>{tr("Cancelar")}</button><button type="submit" className="button button-primary" disabled={busy || !selectedFile}>{busy ? tr("Analizando archivo…") : tr("Previsualizar importación")}</button></div>
      </> : <>
        <div className="roster-preview-kpis"><span className="valid"><b>{preview.validRows}</b><small>{tr("listas para importar")}</small></span><span className="warning"><b>{preview.warningRows}</b><small>{tr("con advertencias")}</small></span><span className="invalid"><b>{preview.invalidRows}</b><small>{tr("excluidas por error")}</small></span></div>
        {preview.invalidRows > 0 && <div className="roster-preview-warning"><AlertTriangle /><span><strong>{tr("Las filas inválidas no se guardarán.")}</strong><small>{tr("Puedes importar las filas válidas ahora o corregir el archivo y volver a cargarlo.")}</small></span></div>}
        <div className="roster-preview-list premium-scroll-list">{preview.rows.map((row) => <article key={row.rowNumber} className={row.status.toLocaleLowerCase()}><span>{row.status === 'VALID' ? <Check /> : <AlertTriangle />}</span><div><strong>{tr("Fila ")}{row.rowNumber} · {row.normalized.displayName || row.normalized.memberCode || tr("Sin identificar")}</strong>{row.errors.map((item) => <small className="error" key={item}>{item}</small>)}{row.warnings.map((item) => <small key={item}>{item}</small>)}</div><em>{row.status === 'VALID' ? tr("Válida") : tr("Error")}</em></article>)}</div>
        {preview.truncated && <p className="roster-preview-note">{tr("La vista muestra las primeras 500 filas; los totales incluyen el archivo completo.")}</p>}
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => { setPreview(null); setSelectedFile(null); }}>{tr("Elegir otro archivo")}</button><button type="button" className="button button-primary" disabled={busy || preview.validRows === 0} onClick={commitImport}>{busy ? tr("Sincronizando…") : [tr("Importar "), preview.validRows, tr(" filas válidas")].join('')}</button></div>
      </>}
    </form></Modal>}
  </Shell>;
}
