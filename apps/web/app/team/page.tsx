'use client';

import { Modal } from '@/components/modal';

import {
  Building2,
  Check,
  KeyRound,
  Link2,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/shell';
import { Empty, Notice, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';
import { nominationsRoleOptions } from '@/components/nominations-role-options';
import { creationAssignedRoles, mergeAssignedRoleChanges, toggleAssignedRole } from '@/components/user-assignment-roles';

type DepartmentRole = 'DIRECTOR' | 'ASSISTANT_DIRECTOR' | 'DEPARTMENT_SECRETARY' | 'PLANNER' | 'CONTRIBUTOR' | 'VIEWER';
type Membership = { departmentId: string; role: DepartmentRole };
type User = { id: string; email: string; name: string; phone?: string; roles: string[]; memberships: Membership[]; active: boolean };
type Department = { id: string; name: string; color: string; active: boolean; member_count: number };

const globalProfiles = [
  { value: 'DEPARTMENT', label: 'Integrante departamental', description: 'Sus permisos se determinan por cada departamento.' },
  { value: 'TENANT_ADMIN', label: 'Administrador del tenant', description: 'Administra usuarios, departamentos y configuración.' },
  { value: 'PASTOR', label: 'Pastor', description: 'Consulta calendario y participa en revisiones.' },
  { value: 'BOARD_SECRETARY', label: 'Secretaría de junta', description: 'Autoriza conflictos y cambios de actividades aprobadas.' },
  { value: 'FIRST_ELDER', label: 'Primer anciano', description: 'Programa turnos anuales y coordina la agenda del cuerpo de ancianos.' },
  { value: 'ELDER', label: 'Anciano', description: 'Gestiona su agenda de cultos, predicadores, música y lecturas.' },
  { value: 'REVIEWER', label: 'Revisor', description: 'Participa en las juntas y emite recomendaciones.' },
  { value: 'NOMINATIONS_USER', label: 'Comisión de Nombramientos (asignación histórica)', description: 'Conserva la participación histórica en comisión; no incluye custodia de escrutinio.' },
  ...nominationsRoleOptions,
  { value: 'AUDITOR', label: 'Auditor', description: 'Consulta calendario y trazabilidad.' },
  { value: 'VIEWER', label: 'Consulta general', description: 'Acceso de lectura sin responsabilidad departamental.' }
];
const departmentRoles: Array<{ value: DepartmentRole; label: string; description: string }> = [
  { value: 'DIRECTOR', label: 'Director/a', description: 'Publica y administra actividades antes de aprobación.' },
  { value: 'ASSISTANT_DIRECTOR', label: 'Subdirector/a', description: 'Crea, edita y envía actividades del departamento.' },
  { value: 'DEPARTMENT_SECRETARY', label: 'Secretaría departamental', description: 'Organiza y da seguimiento a la planificación.' },
  { value: 'PLANNER', label: 'Planificador/a', description: 'Crea, edita y envía sus propias actividades.' },
  { value: 'CONTRIBUTOR', label: 'Colaborador/a', description: 'Prepara borradores de sus actividades.' },
  { value: 'VIEWER', label: 'Consulta', description: 'Puede consultar la información del departamento.' }
];
const globalRoleNames: Record<string, string> = {
  TENANT_ADMIN: 'Administrador', PASTOR: 'Pastor', BOARD_SECRETARY: 'Secretaría de junta', FIRST_ELDER: 'Primer anciano', ELDER: 'Anciano', REVIEWER: 'Revisor',
  DEPARTMENT_LEADER: 'Liderazgo departamental', DEPARTMENT_PLANNER: 'Planificación departamental', NOMINATIONS_USER: 'Comisión de Nombramientos (asignación histórica)', NOMINATIONS_COMMISSION_MEMBER: 'Miembro de comisión de Nombramientos', NOMINATIONS_BALLOT_CUSTODIAN: 'Custodio de escrutinio de Nombramientos', VIEWER: 'Consulta', AUDITOR: 'Auditor'
};

function initials(name: string) {
  return name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

const emptyForm = () => ({
  name: '', email: '', phone: '', password: '', accessProfile: 'DEPARTMENT',
  additionalRoles: [] as string[],
  memberships: [{ departmentId: '', role: 'CONTRIBUTOR' as DepartmentRole }]
});

export default function TeamPage() {
  const { tr } = useExperience();

  const [items, setItems] = useState<User[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [canManage, setCanManage] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editedRoles, setEditedRoles] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [usersData, departmentData, identity] = await Promise.all([
        api<{ items: User[] }>('/users'),
        api<{ items: Department[] }>('/departments'),
        api<{ user: { permissions: string[] } }>('/me')
      ]);
      setItems(usersData.items);
      setCanManage(identity.user.permissions.includes('users.manage'));
      setDepartments(departmentData.items.filter((department) => department.active));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible cargar el equipo.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const filtered = items?.filter((user) => {
    const departmentsText = user.memberships?.map((membership) => departmentById.get(membership.departmentId)?.name ?? '').join(' ') ?? '';
    return `${user.name} ${user.email} ${user.phone ?? ''} ${departmentsText} ${user.roles.join(' ')}`.toLocaleLowerCase('es')
      .includes(search.trim().toLocaleLowerCase('es'));
  }) ?? [];
  const assignedUsers = items?.filter((user) => user.memberships?.length).length ?? 0;

  function openCreate() {
    if (!canManage) return;
    setError(''); setSuccess(''); setForm(emptyForm()); setOpen(true);
  }

  function updateMembership(index: number, changes: Partial<Membership>) {
    setForm((current) => ({
      ...current,
      memberships: current.memberships.map((membership, membershipIndex) => membershipIndex === index ? { ...membership, ...changes } : membership)
    }));
  }

  function removeMembership(index: number) {
    setForm((current) => ({ ...current, memberships: current.memberships.filter((_, membershipIndex) => membershipIndex !== index) }));
  }

  function selectProfile(accessProfile: string) {
    if (!['FIRST_ELDER', 'ELDER'].includes(accessProfile)) {
      setForm((current) => ({ ...current, accessProfile }));
      return;
    }
    const eldersDepartment = departments.find((department) => department.name.toLocaleLowerCase('es').includes('anciano'));
    setForm((current) => ({
      ...current,
      accessProfile,
      memberships: eldersDepartment && !current.memberships.some((membership) => membership.departmentId === eldersDepartment.id)
        ? [{ departmentId: eldersDepartment.id, role: accessProfile === 'FIRST_ELDER' ? 'DIRECTOR' : 'CONTRIBUTOR' }, ...current.memberships.filter((membership) => membership.departmentId)]
        : current.memberships
    }));
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    setError(''); setSuccess('');
    const memberships = form.memberships.filter((membership) => membership.departmentId);
    if (form.accessProfile === 'DEPARTMENT' && memberships.length === 0) {
      setError('Selecciona al menos un departamento para el usuario departamental.');
      return;
    }
    if (['FIRST_ELDER', 'ELDER'].includes(form.accessProfile) && !memberships.some((membership) => departmentById.get(membership.departmentId)?.name.toLocaleLowerCase('es').includes('anciano'))) {
      setError('Enlaza el usuario con el departamento de Ancianos para activar su agenda ministerial.');
      return;
    }
    if (new Set(memberships.map((membership) => membership.departmentId)).size !== memberships.length) {
      setError('Un departamento no puede asignarse dos veces al mismo usuario.');
      return;
    }
    setBusy(true);
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          assignedRoles: creationAssignedRoles(form.accessProfile, form.additionalRoles),
          memberships
        })
      });
      setOpen(false);
      setForm(emptyForm());
      setSuccess('Usuario creado y enlazado correctamente con sus departamentos y permisos.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible crear el usuario.');
    } finally { setBusy(false); }
  }

  function openAssignments(user: User) {
    if (!canManage) return;
    setError(''); setSuccess(''); setEditingUser(user); setEditedRoles([...user.roles]);
  }

  async function saveAssignments(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || !editingUser || busy) return;
    if (!editedRoles.length) { setError(tr('Conserva al menos un rol para esta cuenta.')); return; }
    setBusy(true); setError('');
    try {
      const latest = (await api<{items: User[]}>('/users')).items.find((user) => user.id === editingUser.id);
      if (!latest) throw new Error(tr('La cuenta ya no está disponible. Actualiza el equipo.'));
      const assignedRoles = mergeAssignedRoleChanges(editingUser.roles, editedRoles, latest.roles);
      if (!assignedRoles.length) throw new Error(tr('Conserva al menos un rol para esta cuenta.'));
      await api(`/users/${editingUser.id}`, { method: 'PATCH', body: JSON.stringify({ assignedRoles, expectedRoles: latest.roles }) });
      setEditingUser(null); setSuccess(tr('Asignaciones actualizadas. Los departamentos y demás datos se conservaron.')); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr('No fue posible actualizar las asignaciones.')); }
    finally { setBusy(false); }
  }

  return <Shell title={tr("Equipo y permisos")} eyebrow={tr("Administración")} actions={canManage && <button type="button" className="button button-primary desktop-action" onClick={openCreate}><Plus size={17} />{tr(" Agregar usuario")}</button>}>
    {error && <Notice tone="danger" title={tr("Atención")}>{error}</Notice>}
    {success && <Notice tone="success" title={tr("Todo conectado")}>{success}</Notice>}
    {!items ? error ? <button type="button" className="button button-secondary" onClick={() => { setError(''); void load(); }}>{tr('Reintentar')}</button> : <Spinner /> : <div className="team-page">
      <section className="team-hero panel">
        <div><span className="team-hero-icon"><Users /></span><div><span className="eyebrow">{tr("Identidad y acceso")}</span><h2>{tr("Personas, departamentos y permisos en un solo lugar")}</h2><p>{tr("Cada cuenta queda conectada con su responsabilidad real dentro de la iglesia.")}</p></div></div>
        <div className="team-summary"><span><strong>{items.length}</strong>{tr(" usuarios")}</span><span><strong>{assignedUsers}</strong>{tr(" enlazados a departamentos")}</span><span><strong>{departments.length}</strong>{tr(" departamentos disponibles")}</span></div>
      </section>

      <section className="panel team-panel premium-team-panel">
        <div className="panel-heading"><div><span className="eyebrow">{tr("Accesos del tenant")}</span><h2>{tr("Personas autorizadas")}</h2><small className="result-count">{filtered.length}{tr(" de ")}{items.length}{tr(" usuarios")}</small></div><div className="team-tools"><label className="premium-search team-search"><Search /><input aria-label={tr("Buscar usuarios")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Nombre, correo, rol o departamento…")} />{search && <button type="button" onClick={() => setSearch('')} aria-label={tr("Limpiar búsqueda de usuarios")}><X /></button>}</label><button type="button" className="button button-primary" onClick={openCreate}><UserPlus size={17} />{tr(" Nuevo usuario")}</button></div></div>
        {filtered.length === 0 ? <Empty icon={<Search />} title={tr("No encontramos usuarios")} text={search ? tr("Prueba con otro nombre, correo, rol o departamento.") : tr("Agrega personas y enlázalas con sus departamentos.")} /> : <div className="user-grid connected-user-grid premium-scroll-list">{filtered.map((user) => <article className="user-card connected-user-card" key={user.id}>
          <div className="user-card-head"><div className="avatar large">{initials(user.name)}</div><div><strong>{user.name}</strong><span><Mail size={12} /> {user.email}</span></div><span className={`member-status ${user.active ? '' : 'disabled'}`}><i /> {user.active ? tr("Activo") : tr("Inactivo")}</span></div>
          <div className="global-access"><ShieldCheck /><div><small>{tr("Acceso general")}</small><strong>{user.roles.filter((role) => !['DEPARTMENT_LEADER', 'DEPARTMENT_PLANNER'].includes(role)).map((role) => globalRoleNames[role] ? tr(globalRoleNames[role]!) : role).join(' · ') || tr("Acceso departamental")}</strong></div></div>
          {canManage && <button type="button" className="button button-ghost" onClick={() => openAssignments(user)}><ShieldCheck size={16}/>{tr('Editar asignaciones')}</button>}
          <div className="user-departments"><span>{tr("Departamentos enlazados")}</span>{user.memberships?.length ? user.memberships.map((membership) => {
            const department = departmentById.get(membership.departmentId);
            const role = departmentRoles.find((candidate) => candidate.value === membership.role);
            return <Link href={`/settings/departments?departmentId=${membership.departmentId}`} key={membership.departmentId} className="user-department-link"><i style={{ background: department?.color ?? '#0b6b5f' }} /><span><strong>{department?.name ?? tr("Departamento")}</strong><small>{role?.label ? tr(role.label) : membership.role}</small></span><Link2 /></Link>;
          }) : <small className="unassigned-department"><Building2 />{tr(" Sin departamento asignado")}</small>}</div>
        </article>)}</div>}
      </section>
    </div>}

    {open && <Modal busy={busy} label={tr("Agregar usuario")} onClose={() => setOpen(false)}><form className="modal-card premium-modal user-create-modal" onSubmit={create}>
      <button data-dialog-close type="button" className="modal-close" onClick={() => setOpen(false)} aria-label={tr("Cerrar")}><X /></button>
      <span className="modal-symbol"><UserPlus /></span><span className="eyebrow">{tr("Cuenta conectada")}</span><h2>{tr("Agregar usuario")}</h2><p>{tr("Define su identidad, acceso general y el rol exacto que tendrá dentro de cada departamento.")}</p>

      <div className="user-modal-section"><div className="modal-section-heading"><span>1</span><div><strong>{tr("Datos de acceso")}</strong><small>{tr("Información personal y credenciales temporales.")}</small></div></div><div className="form-grid">
        <label className="full">{tr("Nombre completo")}<input required minLength={2} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>{tr("Correo")}<input type="email" required autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>{tr("WhatsApp (E.164)")}<input type="tel" pattern="\+[1-9][0-9]{7,14}" autoComplete="tel" placeholder="+18095551234" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label className="full">{tr("Contraseña temporal")}<span className="input-with-icon"><KeyRound /><input type="password" minLength={10} required autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></span></label>
      </div></div>

      <div className="user-modal-section"><div className="modal-section-heading"><span>2</span><div><strong>{tr("Perfil general")}</strong><small>{tr("El acceso transversal dentro del tenant.")}</small></div></div><label>{tr("Tipo de cuenta")}<select value={form.accessProfile} onChange={(event) => selectProfile(event.target.value)}>{globalProfiles.map((profile) => <option key={profile.value} value={profile.value}>{tr(profile.label)}</option>)}</select><small className="field-help">{tr(globalProfiles.find((profile) => profile.value === form.accessProfile)?.description ?? '')}</small></label></div>
      <fieldset className="assignment-role-grid"><legend>{tr('Asignaciones explícitas de Nombramientos')}</legend>{nominationsRoleOptions.map((role) => <label className="assignment-role-choice" key={role.value}><input type="checkbox" checked={form.accessProfile === role.value || form.additionalRoles.includes(role.value)} disabled={form.accessProfile === role.value} onChange={(event) => setForm((current) => ({ ...current, additionalRoles: toggleAssignedRole(current.additionalRoles, role.value, event.target.checked) }))}/><span><strong>{tr(role.label)}</strong><small>{tr(role.description)}</small></span></label>)}</fieldset>

      <div className="user-modal-section department-assignment-section"><div className="modal-section-heading"><span>3</span><div><strong>{tr("Departamentos y responsabilidades")}</strong><small>{tr("Estas asignaciones controlan lo que puede hacer en el calendario.")}</small></div></div>
        <div className="connection-line"><Building2 /><span /><Link2 /><span /><ShieldCheck /></div>
        <div className="membership-editor">{form.memberships.map((membership, index) => <div className="membership-editor-row" key={`${index}-${membership.departmentId}`}>
          <label>{tr("Departamento")}<select required={form.accessProfile === 'DEPARTMENT'} value={membership.departmentId} onChange={(event) => updateMembership(index, { departmentId: event.target.value })}><option value="">{tr("Seleccionar…")}</option>{departments.map((department) => <option key={department.id} value={department.id} disabled={form.memberships.some((item, membershipIndex) => membershipIndex !== index && item.departmentId === department.id)}>{department.name}</option>)}</select></label>
          <label>{tr("Rol departamental")}<select value={membership.role} onChange={(event) => updateMembership(index, { role: event.target.value as DepartmentRole })}>{departmentRoles.map((role) => <option key={role.value} value={role.value}>{tr(role.label)}</option>)}</select></label>
          <button type="button" className="icon-button danger-quiet" onClick={() => removeMembership(index)} disabled={form.memberships.length === 1 && form.accessProfile === 'DEPARTMENT'} aria-label={[tr("Quitar asignación "), index + 1].join('')}><Trash2 /></button>
          {membership.departmentId && <div className="membership-confirmation"><Check /><span><strong>{departmentById.get(membership.departmentId)?.name}</strong><small>{tr(departmentRoles.find((role) => role.value === membership.role)?.description ?? "")}</small></span></div>}
        </div>)}</div>
        <button type="button" className="add-membership-button" onClick={() => setForm((current) => ({ ...current, memberships: [...current.memberships, { departmentId: '', role: 'CONTRIBUTOR' }] }))} disabled={form.memberships.length >= departments.length}><Plus />{tr(" Agregar otro departamento")}</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setOpen(false)}>{tr("Cancelar")}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? tr("Creando y enlazando…") : tr("Crear usuario conectado")}</button></div>
    </form></Modal>}
    {editingUser && <Modal busy={busy} label={tr('Editar asignaciones')} onClose={() => setEditingUser(null)}><form className="modal-card premium-modal user-create-modal" onSubmit={saveAssignments}>
      <button data-dialog-close type="button" className="modal-close" onClick={() => setEditingUser(null)} aria-label={tr('Cerrar')}><X/></button>
      <span className="modal-symbol"><ShieldCheck/></span><h2>{tr('Editar asignaciones')}</h2><p>{editingUser.name} · {editingUser.email}</p>
      <p>{tr('Solo se modificarán los roles seleccionados. Los departamentos, cargos y datos personales se conservan.')}</p>
      {error && <Notice tone="danger" title={tr('No fue posible completar la acción')}>{error}</Notice>}
      <fieldset className="assignment-role-grid"><legend>{tr('Roles de la cuenta')}</legend>{globalProfiles.filter((profile) => profile.value !== 'DEPARTMENT').map((role) => <label className="assignment-role-choice" key={role.value}><input type="checkbox" checked={editedRoles.includes(role.value)} onChange={(event) => setEditedRoles((current) => toggleAssignedRole(current, role.value, event.target.checked))}/><span><strong>{tr(role.label)}</strong><small>{tr(role.description)}</small></span></label>)}</fieldset>
      {editedRoles.filter((role) => !globalProfiles.some((profile) => profile.value === role)).length > 0 && <Notice tone="info" title={tr('Otros roles conservados')}>{editedRoles.filter((role) => !globalProfiles.some((profile) => profile.value === role)).map((role) => globalRoleNames[role] ? tr(globalRoleNames[role]!) : role).join(' · ')}</Notice>}
      {editingUser.roles.includes('TENANT_ADMIN') && !editedRoles.includes('TENANT_ADMIN') && <Notice tone="warning" title={tr('Se retirará la administración del tenant')}>{tr('Comprueba que otra cuenta autorizada podrá seguir administrando el equipo.')}</Notice>}
      <div className="modal-actions"><button data-dialog-close type="button" className="button button-ghost" onClick={() => setEditingUser(null)}>{tr('Cancelar')}</button><button type="submit" className="button button-primary" disabled={busy || !editedRoles.length || JSON.stringify(editedRoles) === JSON.stringify(editingUser.roles)}>{busy ? tr('Guardando…') : tr('Guardar asignaciones')}</button></div>
    </form></Modal>}
  </Shell>;
}
