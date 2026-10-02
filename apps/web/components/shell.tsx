'use client';

import {
  Bell,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ContactRound,
  BookOpenCheck,
  Files,
  Gauge,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Plus,
  Settings,
  ScrollText,
  Vote,
  Users,
  X
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Logo } from './logo';
import { useDialogFocus } from './modal';
import { Notice } from './ui';
import { useExperience } from './experience-provider';
import { isSessionRecoveryActive, sessionRecoveredEvent } from '@/lib/session-recovery';
import { maintainRouteTitle } from './route-title';
import { useConfirmDiscardChanges } from './unsaved-changes-provider';
import { WorkspaceNavigation, type DepartmentApplication } from './workspace-navigation';

type Principal = {
  name: string;
  email: string;
  roles: string[];
  permissions?: string[];
  scope: string;
  tenantSlug?: string;
  departmentNames?: string[];
  departmentApps?: DepartmentApplication[];
  moduleAccess?: string[];
};

const orientationNav = [
  { href: '/dashboard', label: 'Inicio', icon: Gauge, permission: 'dashboard.read' },
  { href: '/notifications', label: 'Alertas', icon: Bell }
];
const coordinationNav = [
  { href: '/calendar', label: 'Calendario', icon: CalendarDays, permission: 'calendar.read' },
  { href: '/activities/new', label: 'Nueva actividad', icon: Plus, primary: true, permission: 'calendar.create' },
  // Participants without review authority can still consult and respond to their meetings.
  { href: '/reviews', label: 'Revisión', icon: ClipboardCheck, permission: 'calendar.read' },
  { href: '/reports', label: 'Reportes', icon: BarChart3, permission: 'reports.read' }
];
const bottomNav = [...orientationNav, ...coordinationNav];
const sidebarPreferenceKey = 'gestionchurch:sidebar-collapsed';

export function Shell({ children, title, eyebrow, actions }: { children: React.ReactNode; title: string; eyebrow?: string; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tr } = useExperience();
  const confirmDiscardChanges = useConfirmDiscardChanges();
  const [user, setUser] = useState<Principal | null>(null);
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const sidebarRef = useRef<HTMLElement>(null);
  useDialogFocus(sidebarRef, menu && narrow, () => setMenu(false));
  const hasModule = (module: string) => Boolean(user?.moduleAccess?.includes(module));
  const canSeeDocuments = hasModule('documents') || Boolean(user?.permissions?.includes('documents.read'));
  const canSeeNominations = hasModule('nominations') || Boolean(user?.permissions?.includes('nominations.access'));
  const canSeeAudit = hasModule('audit') || Boolean(user?.permissions?.includes('audit.read'));
  const departmentApps = user?.departmentApps ?? [];
  const canSeeWorshipPrograms = hasModule('worship-programs') && !departmentApps.some((item) => item.key === 'elders');
  const canSeeLegacyElders = hasModule('elders') && !departmentApps.some((item) => item.key === 'elders');
  const canNavigate = (item: { permission?: string }) => Boolean(user && (!item.permission || user.permissions?.includes(item.permission)));
  const mobileNav = bottomNav.filter(canNavigate).filter((item) => ['/dashboard', '/calendar', '/activities/new', '/reviews', '/notifications'].includes(item.href));

  // Callers translate system copy; a workspace's user-written title must stay unchanged.
  useEffect(() => maintainRouteTitle(`${title} · GestionChurch`), [title]);

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    setSessionLoading(true);
    setSessionError('');
    try {
      const result = await api<{ user: Principal }>('/me', signal ? { signal } : {});
      if (!signal?.aborted) setUser(result.user);
    } catch (reason) {
      if (signal?.aborted) return;
      if (reason instanceof ApiError && reason.status === 401 && !isSessionRecoveryActive()) router.replace('/login');
      else setSessionError('No fue posible cargar la sesión. Comprueba tu conexión y vuelve a intentar.');
    } finally {
      if (!signal?.aborted) setSessionLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const recovered = () => { void loadSession(); };
    window.addEventListener(sessionRecoveredEvent, recovered);
    return () => window.removeEventListener(sessionRecoveredEvent, recovered);
  }, [loadSession]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(sidebarPreferenceKey) === 'true'); }
    catch { /* The drawer remains usable when browser storage is unavailable. */ }
    const media = window.matchMedia('(max-width: 780px)');
    const update = () => { setNarrow(media.matches); if (!media.matches) setMenu(false); };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(sidebarPreferenceKey, String(next)); }
      catch { /* Keep this session's preference in memory. */ }
      return next;
    });
  }

  async function logout() {
    if (loggingOut || !confirmDiscardChanges()) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await api('/auth/logout', { method: 'POST' });
      router.replace('/login');
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) router.replace('/login');
      else {
        setLogoutError('No fue posible cerrar la sesión. Vuelve a intentar.');
        setMenu(false);
      }
    } finally { setLoggingOut(false); }
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside ref={sidebarRef} className={`sidebar ${menu ? 'open' : ''}`} id="primary-sidebar" aria-label={tr("Menú principal")}
        {...(menu && narrow ? { role: 'dialog', 'aria-modal': true as const } : {})}
        inert={narrow && !menu} tabIndex={-1}>
        <div className="sidebar-top">
          <Logo />
          <button type="button" className="icon-button mobile-only" onClick={() => setMenu(false)} aria-label={tr("Cerrar menú")}><X /></button>
        </div>
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={toggleSidebar}
          aria-controls="primary-sidebar"
          aria-expanded={!collapsed}
          aria-label={tr(collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral')}
          title={tr(collapsed ? 'Expandir menú' : 'Contraer menú')}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
        <nav aria-label={tr("Navegación principal")}>
          <section className="nav-section" aria-labelledby="nav-orientation-label">
            <span className="nav-section-label" id="nav-orientation-label">{tr("General")}</span>
            {orientationNav.filter(canNavigate).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} data-label={tr(label)} aria-label={tr(label)} aria-current={pathname === href ? 'page' : undefined} onClick={() => setMenu(false)}><Icon size={19} aria-hidden="true" /><span>{tr(label)}</span></Link>)}
          </section>
          <section className="nav-section" aria-labelledby="nav-coordination-label">
            <span className="nav-section-label" id="nav-coordination-label">{tr("Planificación")}</span>
            {coordinationNav.filter(canNavigate).map(({ href, label, icon: Icon, primary }) => <Link key={href} href={href} className={`${pathname === href ? 'active' : ''} ${primary ? 'nav-create' : ''}`} data-label={tr(label)} aria-label={tr(label)} aria-current={pathname === href ? 'page' : undefined} onClick={() => setMenu(false)}><Icon size={19} aria-hidden="true" /><span>{tr(label)}</span></Link>)}
          </section>
          {departmentApps.length > 0 && <Suspense fallback={null}><WorkspaceNavigation applications={departmentApps} onNavigate={() => setMenu(false)} /></Suspense>}
          {(canSeeLegacyElders || canSeeWorshipPrograms || canSeeDocuments || canSeeNominations) && <section className="nav-section" aria-labelledby="nav-ministries-label">
            <span className="nav-section-label" id="nav-ministries-label">{tr("Recursos compartidos")}</span>
            {(canSeeLegacyElders || canSeeWorshipPrograms) && <Link href="/elders" className={pathname === '/elders' ? 'active' : ''} data-label={tr("Programación de cultos")} onClick={() => setMenu(false)}><BookOpenCheck size={19} /><span>{tr("Programación de cultos")}</span></Link>}
            {canSeeDocuments && <Link href="/documents" className={pathname === '/documents' ? 'active' : ''} data-label={tr("Documentos")} onClick={() => setMenu(false)}><Files size={19} /><span>{tr("Documentos")}</span></Link>}
            {canSeeNominations && <Link href="/nominations" className={pathname === '/nominations' ? 'active' : ''} data-label={tr("Nombramientos")} onClick={() => setMenu(false)}><Vote size={19} /><span>{tr("Nombramientos")}</span></Link>}
          </section>}
          {user?.roles.includes('TENANT_ADMIN') && <section className="nav-section" aria-labelledby="nav-administration-label">
            <span className="nav-section-label" id="nav-administration-label">{tr("Administración")}</span>
            <Link href="/settings/departments" className={pathname === '/settings/departments' ? 'active' : ''} data-label={tr("Departamentos")} onClick={() => setMenu(false)}><Building2 size={19} /><span>{tr("Departamentos")}</span></Link>
            <Link href="/settings/roster" className={pathname === '/settings/roster' ? 'active' : ''} data-label={tr("Padrón de iglesia")} onClick={() => setMenu(false)}><ContactRound size={19} /><span>{tr("Padrón de iglesia")}</span></Link>
            <Link href="/team" className={pathname === '/team' ? 'active' : ''} data-label={tr("Equipo")} onClick={() => setMenu(false)}><Users size={19} /><span>{tr("Equipo")}</span></Link>
            <Link href="/settings/activity-form" className={pathname === '/settings/activity-form' ? 'active' : ''} data-label={tr("Formulario")} onClick={() => setMenu(false)}><PanelsTopLeft size={19} /><span>{tr("Formulario")}</span></Link>
            <Link href="/settings/channels" className={pathname === '/settings/channels' ? 'active' : ''} data-label={tr("Configuración")} onClick={() => setMenu(false)}><Settings size={19} /><span>{tr("Configuración")}</span></Link>
          </section>}
          {canSeeAudit && <section className="nav-section" aria-labelledby="nav-governance-label">
            <span className="nav-section-label" id="nav-governance-label">{tr("Gobernanza")}</span>
            <Link href="/audit" className={pathname === '/audit' ? 'active' : ''} data-label={tr("Auditoría")} onClick={() => setMenu(false)}><ScrollText size={19} /><span>{tr("Auditoría")}</span></Link>
          </section>}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar" data-no-translate={user ? true : undefined} title={user?.name ?? tr("Usuario")}>{user?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('') || tr("GC")}</div>
          <div className="user-copy"><strong data-no-translate={user ? true : undefined}>{user?.name ?? tr("Cargando…")}</strong><small data-no-translate>{user?.tenantSlug ?? tr("GestionChurch")}</small></div>
          <button type="button" className="icon-button" onClick={logout} disabled={loggingOut} aria-busy={loggingOut} aria-label={loggingOut ? tr("Cerrando sesión…") : tr("Cerrar sesión")} title={tr("Cerrar sesión")}><LogOut size={18} /></button>
        </div>
      </aside>
      {menu && <button type="button" className="scrim" data-dialog-backdrop="true" tabIndex={-1} aria-hidden="true" onMouseDown={(event) => event.preventDefault()} onClick={() => setMenu(false)} aria-label={tr("Cerrar navegación")} />}
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <button type="button" className="icon-button menu-button" onClick={() => setMenu(true)} aria-label={tr("Abrir menú")} aria-controls="primary-sidebar" aria-expanded={menu}><Menu /></button>
          <div><span className="eyebrow">{eyebrow ?? tr("GestionChurch")}</span><h1>{title}</h1></div>
          <div className="top-actions">{actions}<Link href="/notifications" className="icon-button" aria-label={tr("Notificaciones")}><Bell size={20} /></Link></div>
        </header>
        <div className="page-content">
          {sessionError && <Notice tone="danger" title={tr("No fue posible cargar la sesión")}>{sessionError} <button type="button" className="button button-ghost compact" disabled={sessionLoading} onClick={() => void loadSession()}>{tr("Reintentar")}</button></Notice>}
          {logoutError && <Notice tone="danger" title={tr("No fue posible cerrar la sesión")}>{logoutError} <button type="button" className="button button-ghost compact" disabled={loggingOut} onClick={() => void logout()}>{tr("Reintentar")}</button></Notice>}
          {loggingOut && <p className="sr-only" role="status">{tr("Cerrando sesión…")}</p>}
          {children}
        </div>
      </main>
      <nav className="bottom-nav" aria-label={tr("Navegación móvil")} style={{ gridTemplateColumns: `repeat(${mobileNav.length || 1},minmax(max-content,1fr))` }}>
        {mobileNav.map((item) => {
          const Icon = item.icon;
          const primary = 'primary' in item && item.primary;
          return <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined} aria-label={tr(item.label)} className={`${pathname === item.href ? 'active' : ''} ${primary ? 'bottom-primary' : ''}`}><Icon size={primary ? 24 : 21} aria-hidden="true" /><span>{tr(primary ? 'Crear' : item.label)}</span></Link>;
        })}
      </nav>
    </div>
  );
}
