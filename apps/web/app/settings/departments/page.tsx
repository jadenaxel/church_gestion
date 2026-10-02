'use client';

import { Modal } from '@/components/modal';

import {
  Building2,
  Check,
  ChevronRight,
  Crown,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UsersRound,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/shell';
import { Empty, Notice, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';

type DepartmentRole = 'DIRECTOR' | 'ASSISTANT_DIRECTOR' | 'DEPARTMENT_SECRETARY' | 'PLANNER' | 'CONTRIBUTOR' | 'VIEWER';
type Membership = { departmentId: string; role: DepartmentRole };
type Department = {
  id: string; name: string; description: string; color: string; active: boolean;
  member_count: number; activity_count: number; director_name?: string;
};
type User = { id: string; name: string; email: string; phone?: string; active: boolean; memberships: Membership[] };

const roleOptions: Array<{ value: DepartmentRole; label: string; description: string }> = [
  { value: 'DIRECTOR', label: 'Director/a', description: 'Control total antes de aprobación y solicitudes de cambio posteriores.' },
  { value: 'ASSISTANT_DIRECTOR', label: 'Subdirector/a', description: 'Crea, edita y envía actividades del departamento.' },
  { value: 'DEPARTMENT_SECRETARY', label: 'Secretaría departamental', description: 'Organiza, edita y da seguimiento a la planificación.' },
  { value: 'PLANNER', label: 'Planificador/a', description: 'Crea, edita y envía sus propias actividades.' },
  { value: 'CONTRIBUTOR', label: 'Colaborador/a', description: 'Prepara borradores propios sin publicarlos.' },
  { value: 'VIEWER', label: 'Consulta', description: 'Acceso de lectura al calendario y al departamento.' }
];
const palette = ['#0b6b5f', '#7c3aed', '#c27a10', '#2563eb', '#be123c', '#0f766e', '#475569', '#9333ea'];

function initials(name: string) {
  return name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

export default function DepartmentsPage() {
  const { tr } = useExperience();

  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [departmentModal, setDepartmentModal] = useState(false);
  const [memberModal, setMemberModal] = useState(false);
  const [memberMode, setMemberMode] = useState<'new' | 'existing'>('new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [departmentForm, setDepartmentForm] = useState({ name: '', description: '', color: palette[0] });
  const [memberForm, setMemberForm] = useState({ name: '', email: '', phone: '', password: '', userId: '', role: 'DIRECTOR' as DepartmentRole });

  const load = useCallback(async () => {
    try {
      const [departmentData, userData] = await Promise.all([
        api<{ items: Department[] }>('/departments'),
        api<{ items: User[] }>('/users')
      ]);
      setDepartments(departmentData.items);
      setUsers(userData.items);
      setSelectedId((current) => {
        if (current) return current;
        const linkedDepartment = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('departmentId');
        return departmentData.items.find((item) => item.id === linkedDepartment)?.id || departmentData.items.find((item) => item.active)?.id || '';
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible cargar los departamentos.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = departments?.find((department) => department.id === selectedId);
  const members = useMemo(() => users.flatMap((user) => {
    const membership = user.memberships?.find((item) => item.departmentId === selectedId);
    return membership ? [{ ...user, departmentRole: membership.role }] : [];
  }), [selectedId, users]);
  const filteredDepartments = useMemo(() => {
    const query = departmentSearch.trim().toLocaleLowerCase('es');
    if (!query) return departments ?? [];
    return (departments ?? []).filter((department) =>
      `${department.name} ${department.description} ${department.director_name ?? ''}`.toLocaleLowerCase('es').includes(query)
    );
  }, [departmentSearch, departments]);
  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLocaleLowerCase('es');
    if (!query) return members;
    return members.filter((member) => {
      const role = roleOptions.find((option) => option.value === member.departmentRole)?.label ?? member.departmentRole;
      return `${member.name} ${member.email} ${role}`.toLocaleLowerCase('es').includes(query);
    });
  }, [memberSearch, members]);
  const availableUsers = users.filter((user) => !user.memberships?.some((item) => item.departmentId === selectedId));
  const totalMembers = departments?.reduce((sum, item) => sum + Number(item.member_count), 0) ?? 0;

  function clearMessages() { setError(''); setSuccess(''); }

  async function createDepartment(event: React.FormEvent) {
    event.preventDefault(); clearMessages(); setBusy(true);
    try {
      const created = await api<Department>('/departments', { method: 'POST', body: JSON.stringify(departmentForm) });
      setDepartmentModal(false);
      setDepartmentForm({ name: '', description: '', color: palette[0] });
      setSelectedId(created.id);
      setSuccess('Departamento creado y listo para recibir su equipo.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible crear el departamento.'); }
    finally { setBusy(false); }
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    clearMessages(); setBusy(true);
    try {
      if (memberMode === 'new') {
        await api('/users', {
          method: 'POST',
          body: JSON.stringify({
            name: memberForm.name,
            email: memberForm.email,
            phone: memberForm.phone,
            password: memberForm.password,
            assignedRoles: ['VIEWER'],
            memberships: [{ departmentId: selected.id, role: memberForm.role }]
          })
        });
      } else {
        await api('/department-memberships', {
          method: 'POST',
          body: JSON.stringify({ userId: memberForm.userId, departmentId: selected.id, role: memberForm.role })
        });
      }
      setMemberModal(false);
      setMemberForm({ name: '', email: '', phone: '', password: '', userId: '', role: 'DIRECTOR' });
      setSuccess(`Integrante agregado a ${selected.name}.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible agregar el integrante.'); }
    finally { setBusy(false); }
  }

  async function changeRole(userId: string, role: DepartmentRole) {
    if (!selected) return;
    clearMessages();
    try {
      await api('/department-memberships', {
        method: 'POST', body: JSON.stringify({ userId, departmentId: selected.id, role })
      });
      setSuccess('Rol departamental actualizado.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible actualizar el rol.'); }
  }

  async function removeMember(userId: string, name: string) {
    if (!selected || !window.confirm(`¿Retirar a ${name} de ${selected.name}? Su cuenta no será eliminada.`)) return;
    clearMessages();
    try {
      await api(`/department-memberships/${userId}/${selected.id}`, { method: 'DELETE' });
      setSuccess('La persona fue retirada del departamento.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible retirar al integrante.'); }
  }

  return <Shell
    title={tr("Departamentos")}
    eyebrow={tr("Gobierno del tenant")}
    actions={<button type="button" className="button button-primary desktop-action" onClick={() => setDepartmentModal(true)}><Plus size={17} />{tr(" Nuevo departamento")}</button>}
  >
    {error && <Notice tone="danger" title={tr("Atención")}>{error}</Notice>}
    {success && <Notice tone="success" title={tr("Listo")}>{success}</Notice>}
    {!departments ? <Spinner /> : <div className="departments-page">
      <section className="department-hero">
        <div>
          <span className="department-hero-icon"><Building2 /></span>
          <div><span className="eyebrow">{tr("Estructura ministerial")}</span><h2>{tr("Un lugar para cada equipo y cada responsabilidad")}</h2><p>{tr("Crea departamentos, incorpora personas y define exactamente lo que cada rol puede hacer.")}</p></div>
        </div>
        <div className="department-metrics">
          <div><strong>{departments.filter((item) => item.active).length}</strong><span>{tr("departamentos activos")}</span></div>
          <div><strong>{totalMembers}</strong><span>{tr("membresías asignadas")}</span></div>
          <div><strong>{departments.reduce((sum, item) => sum + Number(item.activity_count), 0)}</strong><span>{tr("actividades coordinadas")}</span></div>
        </div>
      </section>

      <div className="department-workspace">
        <section className="department-directory panel">
          <div className="panel-heading"><div><span className="eyebrow">{tr("Directorio")}</span><h2>{tr("Departamentos")}</h2></div><button type="button" className="icon-button" onClick={() => setDepartmentModal(true)} aria-label={tr("Crear departamento")}><Plus /></button></div>
          <div className="list-control-bar compact"><label className="premium-search"><Search /><input aria-label={tr("Buscar departamentos")} value={departmentSearch} onChange={(event) => setDepartmentSearch(event.target.value)} placeholder={tr("Buscar departamento o director…")} />{departmentSearch && <button type="button" onClick={() => setDepartmentSearch('')} aria-label={tr("Limpiar búsqueda de departamentos")}><X /></button>}</label><span>{filteredDepartments.length}{tr(" de ")}{departments.length}</span></div>
          <div className="department-list premium-scroll-list">
            {filteredDepartments.length === 0 ? <div className="list-empty-compact"><Search /><strong>{tr("Sin coincidencias")}</strong><span>{tr("Prueba con otro nombre o responsable.")}</span></div> : filteredDepartments.map((department) => <button type="button" key={department.id} className={`department-card ${department.id === selectedId ? 'selected' : ''} ${!department.active ? 'inactive' : ''}`} onClick={() => setSelectedId(department.id)}>
              <span className="department-color" style={{ '--department-color': department.color } as React.CSSProperties}><Building2 /></span>
              <span className="department-card-copy"><strong>{department.name}</strong><small>{department.director_name || tr("Dirección por asignar")}</small><span><UsersRound size={13} /> {department.member_count}{tr(" integrantes · ")}{department.activity_count}{tr(" actividades")}</span></span>
              <ChevronRight />
            </button>)}
          </div>
        </section>

        <section className="department-detail panel">
          {!selected ? <Empty icon={<Building2 />} title={tr("Selecciona un departamento")} text={tr("Aquí podrás configurar su equipo y responsabilidades.")} /> : <>
            <div className="department-detail-head">
              <div className="department-monogram" style={{ background: selected.color }}>{initials(selected.name)}</div>
              <div><span className="eyebrow">{tr("Departamento activo")}</span><h2>{selected.name}</h2><p>{selected.description || tr("Sin descripción. Puedes incorporar al equipo y comenzar a planificar.")}</p></div>
              <button type="button" className="button button-secondary" onClick={() => setMemberModal(true)}><UserPlus size={17} />{tr(" Integrante")}</button>
            </div>
            <div className="department-policy-banner"><ShieldCheck /><div><strong>{tr("Protección de actividades aprobadas")}</strong><span>{tr("El director puede crear, publicar, modificar y cancelar antes de aprobación. Después, solo puede proponer cambios para autorización del administrador o secretario.")}</span></div></div>
            <div className="members-heading"><div><span className="eyebrow">{tr("Equipo departamental")}</span><h3>{members.length}{tr(" integrantes")}</h3></div><span className="live-indicator"><i />{tr(" Permisos en vivo")}</span></div>
            {members.length > 0 && <div className="list-control-bar detail-search"><label className="premium-search"><Search /><input aria-label={tr("Buscar integrantes del departamento")} value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={tr("Buscar integrante, correo o rol…")} />{memberSearch && <button type="button" onClick={() => setMemberSearch('')} aria-label={tr("Limpiar búsqueda de integrantes")}><X /></button>}</label><span>{filteredMembers.length}{tr(" de ")}{members.length}</span></div>}
            {members.length === 0 ? <Empty icon={<UsersRound />} title={tr("Este departamento aún no tiene equipo")} text={tr("Asigna un director y los demás integrantes con su rol correspondiente.")} /> : filteredMembers.length === 0 ? <div className="list-empty-compact members-empty"><Search /><strong>{tr("No encontramos integrantes")}</strong><span>{tr("Revisa el nombre, correo o rol buscado.")}</span></div> : <div className="member-table premium-scroll-list">
              {filteredMembers.map((member) => <article className="member-row" key={member.id}>
                <div className="member-identity"><span className="avatar" style={{ background: selected.color }}>{initials(member.name)}</span><div><strong>{member.name}</strong><span><Mail size={12} /> {member.email}</span></div></div>
                <label className="member-role"><span>{tr("Rol")}</span><select value={member.departmentRole} onChange={(event) => void changeRole(member.id, event.target.value as DepartmentRole)}>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
                <span className={`member-status ${member.active ? '' : 'disabled'}`}><i /> {member.active ? tr("Activo") : tr("Inactivo")}</span>
                <button type="button" className="icon-button danger-quiet" onClick={() => void removeMember(member.id, member.name)} aria-label={[tr("Retirar a "), member.name].join('')}><Trash2 /></button>
              </article>)}
            </div>}
          </>}
        </section>
      </div>

      <section className="role-matrix panel">
        <div className="panel-heading"><div><span className="eyebrow">{tr("Modelo de permisos")}</span><h2>{tr("Roles claros, gobierno seguro")}</h2></div><Sparkles /></div>
        <div className="role-grid">{roleOptions.map((role, index) => <article key={role.value}><span className={index === 0 ? 'premium' : ''}>{index === 0 ? <Crown /> : <ShieldCheck />}</span><strong>{role.label}</strong><p>{role.description}</p></article>)}</div>
      </section>
    </div>}

    {departmentModal && <Modal busy={busy} label={tr("Crear departamento")} onClose={() => setDepartmentModal(false)}><form className="modal-card premium-modal" onSubmit={createDepartment}>
      {error && <Notice tone="danger" title={tr('No fue posible completar la acción')}>{error}</Notice>}
      <button data-dialog-close type="button" className="modal-close" onClick={() => setDepartmentModal(false)} aria-label={tr("Cerrar")}><X /></button>
      <span className="modal-symbol"><Building2 /></span><span className="eyebrow">{tr("Nueva unidad ministerial")}</span><h2>{tr("Crear departamento")}</h2><p>{tr("Define su identidad visual y deja el espacio listo para asignar dirección y equipo.")}</p>
      <label>{tr("Nombre del departamento")}<input required minLength={2} maxLength={120} value={departmentForm.name} onChange={(event) => setDepartmentForm({ ...departmentForm, name: event.target.value })} placeholder={tr("Ej. Ministerio de la Mujer")} /></label>
      <label>{tr("Descripción")}<textarea maxLength={1000} value={departmentForm.description} onChange={(event) => setDepartmentForm({ ...departmentForm, description: event.target.value })} placeholder={tr("Propósito y alcance del departamento…")} /></label>
      <fieldset className="color-field"><legend>{tr("Color de identificación")}</legend><div>{palette.map((color) => <button type="button" key={color} className={departmentForm.color === color ? 'selected' : ''} style={{ background: color }} onClick={() => setDepartmentForm({ ...departmentForm, color })} aria-label={[tr("Seleccionar "), color].join('')}>{departmentForm.color === color && <Check />}</button>)}</div></fieldset>
      <div className="department-preview" style={{ '--department-color': departmentForm.color } as React.CSSProperties}><span><Building2 /></span><div><small>{tr("Vista previa")}</small><strong>{departmentForm.name || tr("Nuevo departamento")}</strong></div><MoreHorizontal /></div>
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setDepartmentModal(false)}>{tr("Cancelar")}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? tr("Creando…") : tr("Crear departamento")}</button></div>
    </form></Modal>}

    {memberModal && selected && <Modal busy={busy} label={tr("Agregar integrante")} onClose={() => setMemberModal(false)}><form className="modal-card premium-modal member-modal" onSubmit={addMember}>
      {error && <Notice tone="danger" title={tr('No fue posible completar la acción')}>{error}</Notice>}
      <button data-dialog-close type="button" className="modal-close" onClick={() => setMemberModal(false)} aria-label={tr("Cerrar")}><X /></button>
      <span className="modal-symbol"><UserPlus /></span><span className="eyebrow">{selected.name}</span><h2>{tr("Agregar integrante")}</h2><p>{tr("Crea su acceso o incorpora una persona existente y asigna su responsabilidad.")}</p>
      <div className="segmented"><button type="button" className={memberMode === 'new' ? 'active' : ''} onClick={() => setMemberMode('new')}>{tr("Nuevo usuario")}</button><button type="button" className={memberMode === 'existing' ? 'active' : ''} onClick={() => setMemberMode('existing')}>{tr("Usuario existente")}</button></div>
      {memberMode === 'new' ? <div className="form-grid">
        <label className="full">{tr("Nombre completo")}<input required value={memberForm.name} onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })} /></label>
        <label>{tr("Correo")}<input type="email" required value={memberForm.email} onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })} /></label>
        <label>{tr("WhatsApp")}<input type="tel" pattern="\+[1-9][0-9]{7,14}" placeholder="+18095551234" value={memberForm.phone} onChange={(event) => setMemberForm({ ...memberForm, phone: event.target.value })} /></label>
        <label className="full">{tr("Contraseña temporal")}<input type="password" minLength={10} required value={memberForm.password} onChange={(event) => setMemberForm({ ...memberForm, password: event.target.value })} /></label>
      </div> : <label>{tr("Persona")}<select required value={memberForm.userId} onChange={(event) => setMemberForm({ ...memberForm, userId: event.target.value })}><option value="">{tr("Selecciona una persona…")}</option>{availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>}
      <label>{tr("Rol dentro del departamento")}<select value={memberForm.role} onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value as DepartmentRole })}>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select><small className="field-help">{roleOptions.find((role) => role.value === memberForm.role)?.description}</small></label>
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setMemberModal(false)}>{tr("Cancelar")}</button><button type="submit" className="button button-primary" disabled={busy || (memberMode === 'existing' && !memberForm.userId)}>{busy ? tr("Guardando…") : tr("Agregar al equipo")}</button></div>
    </form></Modal>}
  </Shell>;
}
