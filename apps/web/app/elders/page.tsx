'use client';

import { Modal } from '@/components/modal';

import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Images,
  Mic2,
  Music2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/shell';
import { Empty, Notice, Spinner } from '@/components/ui';
import { API_URL, api, dateTimeLocal, formatDate } from '@/lib/api';
import { PlatformWorkspace, type PlatformPerson, type PlatformProgram, type PlatformTemplate } from './platform-workspace';
import { useExperience } from '@/components/experience-provider';
import { currentLocale, localeTag } from '@/lib/i18n';

type Elder = { id: string; name: string; email: string; phone?: string; roles: string[] };
type Department = { id: string; name: string; color: string; description: string };
type DepartmentAssignment = {
  id: string; elderId: string; elderName: string; elderEmail: string; departmentId: string; departmentName: string;
  departmentColor: string; startsOn: string; endsOn: string; notes: string; status: 'ACTIVE' | 'INACTIVE';
};
type Rotation = { id: string; title: string; startsOn: string; endsOn: string; notes: string; status: string; elders: Elder[] };
type Overlap = { id: string; code: string; title: string; department: string; startsAt: string; endsAt: string };
type Program = {
  id: string; rotationId: string | null; elderId: string; elderName: string; serviceAt: string; endsAt: string;
  serviceType: 'WEDNESDAY' | 'SABBATH' | 'OTHER'; title: string; preacherName: string; singerName: string;
  hymn: string; bibleReading: string; notes: string; status: 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED';
  preacherPhotoId: string | null; artistPhotoId: string | null; overlaps: Overlap[];
};
type Context = {
  access: { full: boolean; publication: boolean; manager: boolean; ownPrograms: boolean };
  currentUserId: string;
  people: Elder[];
  participants: PlatformPerson[];
  departments: Department[];
  departmentAssignments: DepartmentAssignment[];
  rotations: Rotation[];
  programs: Program[];
  templates: PlatformTemplate[];
};
type Tab = 'agenda' | 'coverage' | 'rotations' | 'programs' | 'platform' | 'publication';
type ProgramForm = {
  id: string; rotationId: string; elderId: string; serviceAt: string; endsAt: string; serviceType: Program['serviceType'];
  title: string; preacherName: string; singerName: string; hymn: string; bibleReading: string; notes: string; status: Program['status'];
};

const typeNames = { WEDNESDAY: 'Culto del miércoles', SABBATH: 'Culto del sábado', OTHER: 'Otro encuentro' };
const statusNames = { DRAFT: 'Borrador', PUBLISHED: 'Publicado', COMPLETED: 'Completado', CANCELLED: 'Cancelado' };

function cleanDate(value: string) { return value.slice(0, 10); }
function localDateLabel(value: string) {
  return new Intl.DateTimeFormat(localeTag(currentLocale()), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${cleanDate(value)}T12:00:00`));
}

function emptyProgram(elderId = ''): ProgramForm {
  const starts = new Date(); starts.setDate(starts.getDate() + 1); starts.setHours(19, 0, 0, 0);
  const ends = new Date(starts.getTime() + 90 * 60_000);
  return {
    id: '', rotationId: '', elderId, serviceAt: dateTimeLocal(starts), endsAt: dateTimeLocal(ends), serviceType: 'WEDNESDAY',
    title: '', preacherName: '', singerName: '', hymn: '', bibleReading: '', notes: '', status: 'DRAFT' as Program['status']
  };
}

export default function EldersPage() {
  const { tr } = useExperience();

  const [data, setData] = useState<Context | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState<Tab>('agenda');
  const [search, setSearch] = useState('');
  const [rotationOpen, setRotationOpen] = useState(false);
  const [annualPlanOpen, setAnnualPlanOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [programOpen, setProgramOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [rotationForm, setRotationForm] = useState({ title: 'Ancianos responsables', startsOn: '', endsOn: '', notes: '', elderIds: [] as string[] });
  const [annualForm, setAnnualForm] = useState({ year: new Date().getFullYear() + 1, elderIds: [] as string[], eldersPerWeek: 1, notes: 'Calendario anual de cobertura pastoral.' });
  const [assignmentForm, setAssignmentForm] = useState({ elderId: '', departmentIds: [] as string[], startsOn: '', endsOn: '', notes: '' });
  const [programForm, setProgramForm] = useState(emptyProgram());
  const [preacherPhoto, setPreacherPhoto] = useState<File | null>(null);
  const [artistPhoto, setArtistPhoto] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      const context = await api<Context>('/elders/context');
      setData(context);
      if (!context.access.full && context.access.publication) setTab('publication');
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'rotations') setTab('rotations');
      if (params.get('view') === 'coverage') setTab('coverage');
      if (params.get('view') === 'platform') setTab('platform');
      if (params.get('view') === 'publication') setTab('publication');
      const program = context.programs.find((item) => item.id === params.get('programId'));
      if (program) { setSelectedProgram(program); setTab(params.get('view') === 'platform' ? 'platform' : 'programs'); }
      if (params.get('rotationId')) setTab('rotations');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible abrir el módulo de Ancianos.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ownPrograms = useMemo(() => data?.programs.filter((program) => program.elderId === data.currentUserId) ?? [], [data]);
  const currentRotation = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return data?.rotations.find((rotation) => rotation.status === 'ACTIVE' && cleanDate(rotation.startsOn) <= today && cleanDate(rotation.endsOn) >= today);
  }, [data]);
  const visiblePrograms = useMemo(() => {
    const source = tab === 'agenda' ? ownPrograms : data?.programs ?? [];
    const query = search.trim().toLocaleLowerCase('es');
    return query ? source.filter((item) => `${item.title} ${item.elderName} ${item.preacherName} ${item.singerName} ${item.hymn}`.toLocaleLowerCase('es').includes(query)) : source;
  }, [data, ownPrograms, search, tab]);
  const annualPreview = useMemo(() => {
    if (!data || annualForm.elderIds.length === 0 || annualForm.eldersPerWeek > annualForm.elderIds.length) return [];
    const start = new Date(Date.UTC(annualForm.year, 0, 1));
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    const last = new Date(Date.UTC(annualForm.year, 11, 31));
    const result: Array<{ startsOn: string; endsOn: string; elders: string[] }> = [];
    for (let cursor = new Date(start), index = 0; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 7), index++) {
      const end = new Date(cursor); end.setUTCDate(end.getUTCDate() + 6);
      result.push({
        startsOn: cursor.toISOString().slice(0, 10),
        endsOn: end.toISOString().slice(0, 10),
        elders: Array.from({ length: annualForm.eldersPerWeek }, (_, offset) => {
          const id = annualForm.elderIds[(index * annualForm.eldersPerWeek + offset) % annualForm.elderIds.length];
          return data.people.find((elder) => elder.id === id)?.name ?? '';
        })
      });
    }
    return result;
  }, [annualForm, data]);

  function openNewRotation() {
    const start = new Date();
    const day = start.getDay();
    start.setDate(start.getDate() + (day === 0 ? 0 : 7 - day));
    const end = new Date(start); end.setDate(end.getDate() + 6);
    setRotationForm({ title: 'Ancianos responsables', startsOn: dateTimeLocal(start).slice(0, 10), endsOn: dateTimeLocal(end).slice(0, 10), notes: '', elderIds: [] });
    setRotationOpen(true); setError(''); setSuccess('');
  }

  function openAnnualPlan() {
    setAnnualForm({ year: new Date().getFullYear() + 1, elderIds: data?.people.map((elder) => elder.id) ?? [], eldersPerWeek: Math.max(1, Math.min(2, data?.people.length ?? 1)), notes: 'Calendario anual de cobertura pastoral.' });
    setAnnualPlanOpen(true); setError(''); setSuccess('');
  }

  function openNewAssignment() {
    const year = new Date().getFullYear();
    setAssignmentForm({ elderId: data?.people[0]?.id ?? '', departmentIds: [], startsOn: `${year}-01-01`, endsOn: `${year}-12-31`, notes: '' });
    setAssignmentOpen(true); setError(''); setSuccess('');
  }

  function openNewProgram(program?: Program) {
    if (program) {
      setSelectedProgram(program);
      setProgramForm({
        id: program.id, rotationId: program.rotationId ?? '', elderId: program.elderId,
        serviceAt: dateTimeLocal(new Date(program.serviceAt)), endsAt: dateTimeLocal(new Date(program.endsAt)),
        serviceType: program.serviceType, title: program.title, preacherName: program.preacherName, singerName: program.singerName,
        hymn: program.hymn, bibleReading: program.bibleReading, notes: program.notes, status: program.status
      });
    } else {
      setSelectedProgram(null);
      setProgramForm(emptyProgram(data?.access.manager ? data.people[0]?.id : data?.currentUserId));
    }
    setPreacherPhoto(null); setArtistPhoto(null); setProgramOpen(true); setError(''); setSuccess('');
  }

  async function saveRotation(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/elders/rotations', { method: 'POST', body: JSON.stringify(rotationForm) });
      setRotationOpen(false); setSuccess('Turno publicado. Ya es visible en el calendario y no genera conflictos departamentales.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible guardar el turno.'); }
    finally { setBusy(false); }
  }

  async function saveAnnualPlan(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ createdCount: number; skippedCount: number; year: number }>('/elders/rotations/annual-plan', { method: 'POST', body: JSON.stringify(annualForm) });
      setAnnualPlanOpen(false);
      setSuccess(`Calendario ${result.year} publicado: ${result.createdCount} semanas creadas${result.skippedCount ? ` y ${result.skippedCount} respetadas porque ya estaban asignadas` : ''}.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible generar el calendario anual.'); }
    finally { setBusy(false); }
  }

  async function saveAssignment(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/elders/department-assignments', { method: 'POST', body: JSON.stringify(assignmentForm) });
      setAssignmentOpen(false); setSuccess('Cobertura departamental publicada. El anciano recibió una notificación en su centro de alertas.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible guardar la cobertura departamental.'); }
    finally { setBusy(false); }
  }

  async function closeAssignment(id: string) {
    setBusy(true); setError('');
    try {
      await api(`/elders/department-assignments/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'INACTIVE' }) });
      setSuccess('La cobertura departamental fue cerrada y quedó registrada en la auditoría.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible cerrar la cobertura.'); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(programId: string, kind: 'PREACHER' | 'ARTIST', file: File | null) {
    if (!file) return;
    const body = new FormData(); body.append('file', file);
    await api(`/elders/programs/${programId}/media?kind=${kind}`, { method: 'POST', body });
  }

  async function saveProgram(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = {
        ...programForm,
        id: undefined,
        rotationId: programForm.rotationId || null,
        serviceAt: new Date(programForm.serviceAt).toISOString(),
        endsAt: new Date(programForm.endsAt).toISOString()
      };
      const saved = programForm.id
        ? await api<{ updated: true }>(`/elders/programs/${programForm.id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then(() => ({ id: programForm.id }))
        : await api<{ id: string }>('/elders/programs', { method: 'POST', body: JSON.stringify(payload) });
      await Promise.all([uploadPhoto(saved.id, 'PREACHER', preacherPhoto), uploadPhoto(saved.id, 'ARTIST', artistPhoto)]);
      setProgramOpen(false); setSuccess(programForm.status === 'PUBLISHED' ? 'Programa publicado y compartido con Publicidad y Adoración.' : 'Borrador guardado en la agenda del anciano.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible guardar el programa.'); }
    finally { setBusy(false); }
  }

  if (!data && !error) return <Shell title={tr("Ancianos")} eyebrow={tr("Cobertura pastoral")}><Spinner /></Shell>;
  if (!data) return <Shell title={tr("Ancianos")} eyebrow={tr("Cobertura pastoral")}><Notice tone="danger" title={tr("Acceso no disponible")}>{error}</Notice></Shell>;

  const manager = data.access.manager;
  const canEditSelected = selectedProgram && (manager || selectedProgram.elderId === data.currentUserId);

  return <Shell title={tr("Ancianos")} eyebrow={tr("Coordinación espiritual")} actions={<Link href="/calendar" className="button button-ghost desktop-action"><CalendarDays size={17} />{tr(" Ver calendario")}</Link>}>
    {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
    {success && <Notice tone="success" title={tr("Actualización completada")}>{success}</Notice>}

    <section className="elders-hero">
      <div><span><Sparkles />{tr(" Ministerio coordinado")}</span><h2>{tr("Una agenda clara para cuidar cada culto.")}</h2><p>{tr("Turnos, predicación, alabanza y materiales conectados sin crear conflictos artificiales con las actividades de la iglesia.")}</p></div>
      <div className="elders-hero-status"><ShieldCheck /><small>{tr("Cobertura actual")}</small><strong>{currentRotation ? currentRotation.elders.length : 0}{tr(" anciano(s)")}</strong><span>{currentRotation ? `${localDateLabel(currentRotation.startsOn)} – ${localDateLabel(currentRotation.endsOn)}` : tr("Sin turno activo")}</span></div>
    </section>

    <nav className="elders-tabs" aria-label={tr("Secciones de Ancianos")}>
      {data.access.full && <button type="button" className={tab === 'agenda' ? 'active' : ''} onClick={() => setTab('agenda')}><Clock3 />{tr(" Mi agenda ")}<b>{ownPrograms.length}</b></button>}
      {data.access.full && <button type="button" className={tab === 'coverage' ? 'active' : ''} onClick={() => setTab('coverage')}><Building2 />{tr(" Cobertura departamental ")}<b>{data.departmentAssignments.filter((item) => item.status === 'ACTIVE').length}</b></button>}
      {data.access.full && <button type="button" className={tab === 'rotations' ? 'active' : ''} onClick={() => setTab('rotations')}><UsersRound />{tr(" Turnos anuales ")}<b>{data.rotations.length}</b></button>}
      {data.access.full && <button type="button" className={tab === 'programs' ? 'active' : ''} onClick={() => setTab('programs')}><BookOpen />{tr(" Programas ")}<b>{data.programs.length}</b></button>}
      {data.access.full && <button type="button" className={tab === 'platform' ? 'active' : ''} onClick={() => setTab('platform')}><ClipboardList />{tr(" Plataforma ")}<b>{data.programs.length}</b></button>}
      {(data.access.publication || data.access.full) && <button type="button" className={tab === 'publication' ? 'active' : ''} onClick={() => setTab('publication')}><Images />{tr(" Kit Publicidad / Adoración ")}<b>{data.programs.filter((item) => item.status === 'PUBLISHED').length}</b></button>}
    </nav>

    {tab === 'platform' && <PlatformWorkspace
      programs={data.programs as PlatformProgram[]}
      participants={data.participants}
      templates={data.templates}
      currentUserId={data.currentUserId}
      manager={manager}
      initialProgramId={selectedProgram?.id}
      onReload={load}
      onError={setError}
      onSuccess={setSuccess}
    />}

    {tab === 'coverage' && <section className="panel elder-coverage-panel">
      <div className="panel-heading"><div><span className="eyebrow">{tr("Acompañamiento ministerial")}</span><h2>{tr("Anciano responsable por departamento")}</h2><p>{tr("Conecta cada ministerio con un anciano durante un período definido.")}</p></div>{manager && <button type="button" className="button button-primary" onClick={openNewAssignment}><Plus />{tr(" Asignar cobertura")}</button>}</div>
      <div className="elders-search"><Search /><input aria-label={tr("Buscar cobertura departamental")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Buscar departamento o anciano…")} /></div>
      <div className="elder-coverage-grid premium-scroll-list">
        {data.departmentAssignments.filter((assignment) => `${assignment.departmentName} ${assignment.elderName}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).map((assignment) => <article className={`elder-coverage-card ${assignment.status === 'INACTIVE' ? 'inactive' : ''}`} key={assignment.id}>
          <span className="coverage-department-icon" style={{ '--department-color': assignment.departmentColor } as React.CSSProperties}><Building2 /></span>
          <div><span className="rotation-status"><i /> {assignment.status === 'ACTIVE' ? tr("Cobertura activa") : tr("Cobertura cerrada")}</span><h3>{assignment.departmentName}</h3><strong>{assignment.elderName}</strong><p>{localDateLabel(assignment.startsOn)}{tr(" al ")}{localDateLabel(assignment.endsOn)}</p>{assignment.notes && <small>{assignment.notes}</small>}</div>
          {manager && assignment.status === 'ACTIVE' && <button type="button" disabled={busy} onClick={() => void closeAssignment(assignment.id)} aria-label={[tr("Cerrar cobertura de "), assignment.departmentName].join('')}>{tr("Cerrar")}</button>}
        </article>)}
      </div>
      {data.departmentAssignments.length === 0 && <Empty icon={<Building2 />} title={tr("Aún no hay coberturas asignadas")} text={tr("Relaciona cada departamento con el anciano que le dará acompañamiento.")} />}
    </section>}

    {tab === 'rotations' && <div className="elders-layout">
      <section className="panel elders-roster-panel">
        <div className="panel-heading"><div><span className="eyebrow">{tr("Plan anual")}</span><h2>{tr("Turnos de responsabilidad")}</h2><p>{tr("Uno o varios ancianos por semana.")}</p></div>{manager && <div className="elder-plan-actions"><button type="button" className="button button-secondary" onClick={openAnnualPlan}><CalendarDays />{tr(" Generar calendario anual")}</button><button type="button" className="button button-primary" onClick={openNewRotation}><Plus />{tr(" Nuevo turno")}</button></div>}</div>
        <div className="elders-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Buscar anciano o período…")} /></div>
        <div className="elder-rotation-list premium-scroll-list">
          {data.rotations.filter((rotation) => `${rotation.title} ${rotation.elders.map((elder) => elder.name).join(' ')}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).map((rotation) => <article key={rotation.id} className="elder-rotation-card">
            <div className="rotation-date"><strong>{new Date(`${cleanDate(rotation.startsOn)}T12:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat(localeTag(currentLocale()), { month: 'short' }).format(new Date(`${cleanDate(rotation.startsOn)}T12:00:00`))}</span></div>
            <div><span className="rotation-status"><i /> {rotation.status === 'ACTIVE' ? tr("Cobertura activa") : rotation.status === 'COMPLETED' ? tr('Cobertura completada') : rotation.status === 'CANCELLED' ? tr('Cobertura cancelada') : rotation.status}</span><h3>{rotation.title}</h3><p>{localDateLabel(rotation.startsOn)}{tr(" al ")}{localDateLabel(rotation.endsOn)}</p><div className="elder-avatar-row">{rotation.elders.map((elder) => <span key={elder.id} title={elder.name}>{elder.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>)}<strong>{rotation.elders.map((elder) => elder.name).join(' · ')}</strong></div></div>
            <Link href={`/calendar?from=${encodeURIComponent(new Date(`${cleanDate(rotation.startsOn)}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${cleanDate(rotation.endsOn)}T23:59:59`).toISOString())}&label=Turno%20de%20ancianos`} aria-label={tr("Ver turno en calendario")}><ChevronRight /></Link>
          </article>)}
        </div>
      </section>
      <aside className="panel elders-principle"><span><CircleAlert /></span><h2>{tr("Visible, no conflictivo")}</h2><p>{tr("Una asignación indica quién coordina los cultos. Puede coincidir con actividades departamentales porque no reserva lugar, equipo ni horario.")}</p><div><Check />{tr(" Siempre visible en calendario")}</div><div><Check />{tr(" Sin casos de conflicto")}</div><div><Check />{tr(" Trazabilidad por responsable")}</div></aside>
    </div>}

    {(tab === 'agenda' || tab === 'programs') && <section className="panel elders-program-panel">
      <div className="panel-heading"><div><span className="eyebrow">{tab === 'agenda' ? tr("Agenda personal") : tr("Operación de cultos")}</span><h2>{tab === 'agenda' ? tr("Mis próximos servicios") : tr("Programas coordinados")}</h2><p>{tr("Información lista para el equipo que apoyará cada culto.")}</p></div>{data.access.ownPrograms && <button type="button" className="button button-primary" onClick={() => openNewProgram()}><Plus />{tr(" Nuevo programa")}</button>}</div>
      <div className="elders-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Buscar culto, predicador, cantante o himno…")} /></div>
      {visiblePrograms.length === 0 ? <Empty icon={<BookOpen />} title={tr("La agenda está disponible")} text={tr("Crea el primer programa y completa sus participantes.")} /> : <div className="elder-program-grid premium-scroll-list">
        {visiblePrograms.map((program) => <button type="button" className={`elder-program-card ${selectedProgram?.id === program.id ? 'selected' : ''}`} key={program.id} onClick={() => setSelectedProgram(program)}>
          <div className="program-date"><strong>{new Date(program.serviceAt).getDate()}</strong><span>{new Intl.DateTimeFormat(localeTag(currentLocale()), { month: 'short' }).format(new Date(program.serviceAt))}</span><small>{new Intl.DateTimeFormat(localeTag(currentLocale()), { hour: 'numeric', minute: '2-digit' }).format(new Date(program.serviceAt))}</small></div>
          <div><span className={`program-status ${program.status.toLocaleLowerCase()}`}>{statusNames[program.status]}</span><h3>{program.title}</h3><p>{typeNames[program.serviceType]} · {program.elderName}</p><small><Mic2 /> {program.preacherName || tr("Predicador por confirmar")} <Music2 /> {program.singerName || tr("Música por confirmar")}</small>{program.overlaps.length > 0 && <em><CircleAlert />{tr(" Coincide visualmente con ")}{program.overlaps.length}{tr(" actividad(es), sin conflicto.")}</em>}</div><ArrowRight />
        </button>)}
      </div>}
      {selectedProgram && <div className="program-detail">
        <div className="program-detail-head"><div><span className="eyebrow">{tr("Ficha del culto")}</span><h2>{selectedProgram.title}</h2><p>{formatDate(selectedProgram.serviceAt)}{tr(" · Responsable: ")}{selectedProgram.elderName}</p></div>{canEditSelected && <button type="button" className="button button-secondary" onClick={() => openNewProgram(selectedProgram)}>{tr("Editar programa")}</button>}</div>
        <div className="program-detail-grid"><div><Mic2 /><span><small>{tr("Predicador")}</small><strong>{selectedProgram.preacherName || tr("Por confirmar")}</strong></span></div><div><Music2 /><span><small>{tr("Participación musical")}</small><strong>{selectedProgram.singerName || tr("Por confirmar")}</strong></span></div><div><BookOpen /><span><small>{tr("Lectura bíblica")}</small><strong>{selectedProgram.bibleReading || tr("Por confirmar")}</strong></span></div><div><Music2 /><span><small>{tr("Himno solicitado")}</small><strong>{selectedProgram.hymn || tr("Por confirmar")}</strong></span></div></div>
        {selectedProgram.overlaps.length > 0 && <div className="informational-overlap"><CircleAlert /><div><strong>{tr("Coincidencia informativa")}</strong><p>{tr("Este culto es compatible con las actividades siguientes y no abre un caso de conflicto.")}</p>{selectedProgram.overlaps.map((overlap) => <Link href={`/activities/${overlap.id}`} key={overlap.id}>{overlap.code} · {overlap.title} · {overlap.department}<ArrowRight /></Link>)}</div></div>}
      </div>}
    </section>}

    {tab === 'publication' && <section className="publication-workspace">
      <div className="panel publication-heading"><span><Images /></span><div><span className="eyebrow">{tr("Brief creativo conectado")}</span><h2>{tr("Material listo para Publicidad y Adoración")}</h2><p>{tr("Consulta participantes, imágenes, himno y lectura en una sola ficha. Solo aparecen programas publicados.")}</p></div></div>
      <div className="publication-grid">{data.programs.filter((program) => program.status === 'PUBLISHED').map((program) => <article className="panel publication-card" key={program.id}>
        <div className="publication-visuals">
          {program.preacherPhotoId ? <img src={`${API_URL}/elders/media/${program.preacherPhotoId}`} alt={[tr('Predicador '), program.preacherName].join('')} /> : <span><Camera /><small>{tr("Foto del predicador pendiente")}</small></span>}
          {program.artistPhotoId ? <img src={`${API_URL}/elders/media/${program.artistPhotoId}`} alt={[tr('Artista '), program.singerName].join('')} /> : <span><Music2 /><small>{tr("Foto del artista pendiente")}</small></span>}
        </div>
        <div className="publication-copy"><span className="program-status published">{tr("Publicado")}</span><h2>{program.title}</h2><p>{formatDate(program.serviceAt)} · {program.elderName}</p><dl><div><dt>{tr("Predica")}</dt><dd>{program.preacherName || tr("Por confirmar")}</dd></div><div><dt>{tr("Participación")}</dt><dd>{program.singerName || tr("Por confirmar")}</dd></div><div><dt>{tr("Himno")}</dt><dd>{program.hymn || tr("Por confirmar")}</dd></div><div><dt>{tr("Lectura")}</dt><dd>{program.bibleReading || tr("Por confirmar")}</dd></div></dl></div>
      </article>)}</div>
      {!data.programs.some((program) => program.status === 'PUBLISHED') && <Empty icon={<Images />} title={tr("No hay material publicado")} text={tr("Los programas publicados por Ancianos aparecerán aquí automáticamente.")} />}
    </section>}

    {rotationOpen && <Modal busy={busy} label={tr("Programar turno")} onClose={() => setRotationOpen(false)}><form className="modal-card premium-modal elders-modal" onSubmit={saveRotation}>
      {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
      <button data-dialog-close type="button" className="modal-close" onClick={() => setRotationOpen(false)} aria-label={tr("Cerrar")}><X /></button><span className="modal-symbol"><UsersRound /></span><span className="eyebrow">{tr("Cobertura pastoral")}</span><h2>{tr("Programar turno")}</h2><p>{tr("Selecciona uno o varios ancianos. Este bloque será informativo y no reservará recursos.")}</p>
      <label>{tr("Título")}<input required minLength={3} value={rotationForm.title} onChange={(event) => setRotationForm({ ...rotationForm, title: event.target.value })} /></label>
      <div className="form-grid"><label>{tr("Desde")}<input required type="date" value={rotationForm.startsOn} onChange={(event) => setRotationForm({ ...rotationForm, startsOn: event.target.value })} /></label><label>{tr("Hasta")}<input required type="date" min={rotationForm.startsOn} value={rotationForm.endsOn} onChange={(event) => setRotationForm({ ...rotationForm, endsOn: event.target.value })} /></label></div>
      <fieldset className="elder-selector"><legend>{tr("Ancianos responsables")}</legend>{data.people.map((elder) => <label key={elder.id}><input type="checkbox" checked={rotationForm.elderIds.includes(elder.id)} onChange={(event) => setRotationForm((current) => ({ ...current, elderIds: event.target.checked ? [...current.elderIds, elder.id] : current.elderIds.filter((id) => id !== elder.id) }))} /><span>{elder.name}<small>{elder.roles.includes('FIRST_ELDER') ? tr("Primer anciano") : tr("Anciano")}</small></span><Check /></label>)}</fieldset>
      <label>{tr("Nota para el equipo")}<textarea rows={3} value={rotationForm.notes} onChange={(event) => setRotationForm({ ...rotationForm, notes: event.target.value })} /></label>
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setRotationOpen(false)}>{tr("Cancelar")}</button><button type="submit" disabled={busy || rotationForm.elderIds.length === 0} className="button button-primary">{busy ? tr("Publicando…") : tr("Publicar turno")}</button></div>
    </form></Modal>}

    {annualPlanOpen && <Modal busy={busy} label={tr("Crear calendario de ancianos")} onClose={() => setAnnualPlanOpen(false)}><form className="modal-card premium-modal elders-modal annual-plan-modal" onSubmit={saveAnnualPlan}>
      {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
      <button data-dialog-close type="button" className="modal-close" onClick={() => setAnnualPlanOpen(false)} aria-label={tr("Cerrar")}><X /></button><span className="modal-symbol"><CalendarDays /></span><span className="eyebrow">{tr("Planificador anual inteligente")}</span><h2>{tr("Crear calendario de ancianos")}</h2><p>{tr("Distribuye automáticamente las semanas entre los ancianos seleccionados. Las semanas existentes se respetan y estas asignaciones nunca generan conflictos departamentales.")}</p>
      <div className="form-grid"><label>{tr("Año")}<input required type="number" min="2020" max="2100" value={annualForm.year} onChange={(event) => setAnnualForm({ ...annualForm, year: Number(event.target.value) })} /></label><label>{tr("Ancianos por semana")}<select value={annualForm.eldersPerWeek} onChange={(event) => setAnnualForm({ ...annualForm, eldersPerWeek: Number(event.target.value) })}>{Array.from({ length: Math.max(1, Math.min(10, annualForm.elderIds.length)) }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}</select></label></div>
      <fieldset className="elder-selector"><legend>{tr("Ancianos que participan en la rotación")}</legend>{data.people.map((elder) => <label key={elder.id}><input type="checkbox" checked={annualForm.elderIds.includes(elder.id)} onChange={(event) => setAnnualForm((current) => ({ ...current, elderIds: event.target.checked ? [...current.elderIds, elder.id] : current.elderIds.filter((id) => id !== elder.id) }))} /><span>{elder.name}<small>{elder.roles.includes('FIRST_ELDER') ? tr("Primer anciano") : tr("Anciano")}</small></span><Check /></label>)}</fieldset>
      <label>{tr("Nota general")}<textarea rows={2} value={annualForm.notes} onChange={(event) => setAnnualForm({ ...annualForm, notes: event.target.value })} /></label>
      <section className="annual-plan-preview"><div><span className="eyebrow">{tr("Vista previa antes de publicar")}</span><strong>{annualPreview.length}{tr(" semanas · ")}{annualForm.elderIds.length}{tr(" ancianos")}</strong></div>{annualPreview.length > 0 ? <div className="annual-preview-list">{annualPreview.map((week, index) => <article key={week.startsOn}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{localDateLabel(week.startsOn)} – {localDateLabel(week.endsOn)}</strong><small>{week.elders.join(' · ')}</small></span></article>)}</div> : <p>{tr("Selecciona al menos un anciano para generar la vista previa.")}</p>}</section>
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setAnnualPlanOpen(false)}>{tr("Cancelar")}</button><button type="submit" disabled={busy || annualForm.elderIds.length === 0 || annualForm.eldersPerWeek > annualForm.elderIds.length} className="button button-primary">{busy ? tr("Generando…") : [tr("Publicar calendario "), annualForm.year].join('')}</button></div>
    </form></Modal>}

    {assignmentOpen && <Modal busy={busy} label={tr("Asignar anciano")} onClose={() => setAssignmentOpen(false)}><form className="modal-card premium-modal elders-modal" onSubmit={saveAssignment}>
      {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
      <button data-dialog-close type="button" className="modal-close" onClick={() => setAssignmentOpen(false)} aria-label={tr("Cerrar")}><X /></button><span className="modal-symbol"><Building2 /></span><span className="eyebrow">{tr("Cobertura departamental")}</span><h2>{tr("Asignar anciano")}</h2><p>{tr("Selecciona el anciano, los departamentos que acompañará y la vigencia de su responsabilidad.")}</p>
      <label>{tr("Anciano responsable")}<select required value={assignmentForm.elderId} onChange={(event) => setAssignmentForm({ ...assignmentForm, elderId: event.target.value })}><option value="">{tr("Seleccionar…")}</option>{data.people.map((elder) => <option value={elder.id} key={elder.id}>{elder.name}{elder.roles.includes('FIRST_ELDER') ? tr(" · Primer anciano") : ''}</option>)}</select></label>
      <div className="form-grid"><label>{tr("Desde")}<input required type="date" value={assignmentForm.startsOn} onChange={(event) => setAssignmentForm({ ...assignmentForm, startsOn: event.target.value })} /></label><label>{tr("Hasta")}<input required type="date" min={assignmentForm.startsOn} value={assignmentForm.endsOn} onChange={(event) => setAssignmentForm({ ...assignmentForm, endsOn: event.target.value })} /></label></div>
      <fieldset className="elder-selector department-selector"><legend>{tr("Departamentos acompañados")}</legend>{data.departments.map((department) => <label key={department.id}><input type="checkbox" checked={assignmentForm.departmentIds.includes(department.id)} onChange={(event) => setAssignmentForm((current) => ({ ...current, departmentIds: event.target.checked ? [...current.departmentIds, department.id] : current.departmentIds.filter((id) => id !== department.id) }))} /><span><i style={{ background: department.color }} />{department.name}<small>{department.description || tr("Acompañamiento pastoral y coordinación")}</small></span><Check /></label>)}</fieldset>
      <label>{tr("Nota de acompañamiento")}<textarea rows={3} value={assignmentForm.notes} onChange={(event) => setAssignmentForm({ ...assignmentForm, notes: event.target.value })} placeholder={tr("Propósito, frecuencia de seguimiento o acuerdos…")} /></label>
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setAssignmentOpen(false)}>{tr("Cancelar")}</button><button type="submit" disabled={busy || !assignmentForm.elderId || assignmentForm.departmentIds.length === 0} className="button button-primary">{busy ? tr("Publicando…") : tr("Publicar cobertura")}</button></div>
    </form></Modal>}

    {programOpen && <Modal busy={busy} label={programForm.id ? tr("Editar programa") : tr("Nuevo programa")} onClose={() => setProgramOpen(false)}><form className="modal-card premium-modal elders-modal program-modal" onSubmit={saveProgram}>
      {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
      <button data-dialog-close type="button" className="modal-close" onClick={() => setProgramOpen(false)} aria-label={tr("Cerrar")}><X /></button><span className="modal-symbol"><BookOpen /></span><span className="eyebrow">{tr("Agenda de culto")}</span><h2>{programForm.id ? tr("Editar programa") : tr("Nuevo programa")}</h2><p>{tr("Completa la ficha que recibirán Publicidad y Adoración.")}</p>
      {manager && <label>{tr("Anciano responsable")}<select required value={programForm.elderId} onChange={(event) => setProgramForm({ ...programForm, elderId: event.target.value })}><option value="">{tr("Seleccionar…")}</option>{data.people.map((elder) => <option value={elder.id} key={elder.id}>{elder.name}</option>)}</select></label>}
      <div className="form-grid"><label>{tr("Tipo de culto")}<select value={programForm.serviceType} onChange={(event) => setProgramForm({ ...programForm, serviceType: event.target.value as Program['serviceType'] })}>{Object.entries(typeNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>{tr("Turno relacionado")}<select value={programForm.rotationId} onChange={(event) => setProgramForm({ ...programForm, rotationId: event.target.value })}><option value="">{tr("Sin turno relacionado")}</option>{data.rotations.map((rotation) => <option value={rotation.id} key={rotation.id}>{rotation.title} · {cleanDate(rotation.startsOn)}</option>)}</select></label></div>
      <label>{tr("Título del programa")}<input required minLength={3} value={programForm.title} onChange={(event) => setProgramForm({ ...programForm, title: event.target.value })} placeholder={tr("Ej. Culto divino de esperanza")} /></label>
      <div className="form-grid"><label>{tr("Inicio")}<input required type="datetime-local" value={programForm.serviceAt} onChange={(event) => setProgramForm({ ...programForm, serviceAt: event.target.value })} /></label><label>{tr("Finaliza")}<input required type="datetime-local" value={programForm.endsAt} onChange={(event) => setProgramForm({ ...programForm, endsAt: event.target.value })} /></label></div>
      <div className="form-grid"><label>{tr("Predicador")}<input value={programForm.preacherName} onChange={(event) => setProgramForm({ ...programForm, preacherName: event.target.value })} /></label><label>{tr("Cantante / artista invitado")}<input value={programForm.singerName} onChange={(event) => setProgramForm({ ...programForm, singerName: event.target.value })} /></label><label>{tr("Himno solicitado")}<input value={programForm.hymn} onChange={(event) => setProgramForm({ ...programForm, hymn: event.target.value })} /></label><label>{tr("Lectura bíblica")}<input value={programForm.bibleReading} onChange={(event) => setProgramForm({ ...programForm, bibleReading: event.target.value })} /></label></div>
      <div className="photo-upload-grid"><label><Camera /><span>{tr("Foto del predicador")}<small>{tr("JPG, PNG o WebP · máximo 5 MB")}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPreacherPhoto(event.target.files?.[0] ?? null)} /><b>{preacherPhoto?.name ?? (selectedProgram?.preacherPhotoId ? tr("Foto cargada") : tr("Seleccionar"))}</b></label><label><Music2 /><span>{tr("Foto del artista")}<small>{tr("JPG, PNG o WebP · máximo 5 MB")}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setArtistPhoto(event.target.files?.[0] ?? null)} /><b>{artistPhoto?.name ?? (selectedProgram?.artistPhotoId ? tr("Foto cargada") : tr("Seleccionar"))}</b></label></div>
      <label>{tr("Notas de coordinación")}<textarea rows={3} value={programForm.notes} onChange={(event) => setProgramForm({ ...programForm, notes: event.target.value })} /></label>
      <label>{tr("Estado")}<select value={programForm.status} onChange={(event) => setProgramForm({ ...programForm, status: event.target.value as Program['status'] })}><option value="DRAFT">{tr("Guardar como borrador")}</option><option value="PUBLISHED">{tr("Publicar para Publicidad y Adoración")}</option><option value="COMPLETED">{tr("Marcar completado")}</option><option value="CANCELLED">{tr("Cancelar")}</option></select></label>
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setProgramOpen(false)}>{tr("Cancelar")}</button><button type="submit" disabled={busy} className="button button-primary">{busy ? tr("Guardando…") : programForm.status === 'PUBLISHED' ? tr("Guardar y compartir") : tr("Guardar programa")}</button></div>
    </form></Modal>}
  </Shell>;
}
