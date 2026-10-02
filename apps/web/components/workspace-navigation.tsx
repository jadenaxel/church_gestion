'use client';

import { BookOpenCheck, BriefcaseBusiness, Building2, ChevronDown, HeartHandshake, Search, Send, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useExperience } from './experience-provider';

export type DepartmentApplication = {
  key: string;
  label: string;
  href: string;
  kind: 'SPECIALIZED' | 'WORKSPACE';
  departmentId: string;
  role: string | null;
};

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function WorkspaceNavigation({ applications, onNavigate }: { applications: DepartmentApplication[]; onNavigate: () => void }) {
  const pathname = usePathname();
  const { tr, locale } = useExperience();
  const selectedDepartment = useSearchParams().get('departmentId');
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const items = applications
    .filter((item) => normalized(`${item.label} ${tr(item.label)}`).includes(normalized(search.trim())))
    .sort((left, right) => tr(left.label).localeCompare(tr(right.label), locale));

  return (
    <section className="nav-section workspace-nav" aria-labelledby="nav-workspaces-label">
      <button type="button" className="workspace-nav-toggle" onClick={() => setExpanded(!expanded)} aria-label={tr("Áreas de trabajo")} aria-expanded={expanded} aria-controls="workspace-nav-items">
        <span id="nav-workspaces-label">{tr("Áreas de trabajo")}</span>
        <span className="workspace-nav-count" aria-hidden="true">{applications.length}</span>
        <ChevronDown className={expanded ? '' : 'closed'} aria-hidden="true" />
      </button>
      <Link href="/ministry-hub" onClick={onNavigate} className={pathname === '/ministry-hub' && !selectedDepartment ? 'active' : ''} aria-current={pathname === '/ministry-hub' && !selectedDepartment ? 'page' : undefined} data-label={tr("Espacios de trabajo")}>
        <BriefcaseBusiness size={19} aria-hidden="true" /><span>{tr("Espacios de trabajo")}</span>
      </Link>
      {expanded && <div id="workspace-nav-items" className="workspace-nav-items">
        {applications.length > 6 && <search className="workspace-nav-search" aria-label={tr("Buscar mis áreas de trabajo")}>
          <Search size={15} aria-hidden="true" />
          <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} aria-label={tr("Buscar mis áreas de trabajo")} placeholder={tr("Buscar departamento…")} />
          {search && <button type="button" onClick={() => { setSearch(''); searchRef.current?.focus(); }} aria-label={tr("Limpiar búsqueda")}><X size={14} aria-hidden="true" /></button>}
        </search>}
        <div className="workspace-nav-list">
          {items.map((item) => {
            const active = item.kind === 'WORKSPACE'
              ? pathname === '/ministry-hub' && selectedDepartment === item.departmentId
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.key === 'elders' ? BookOpenCheck : item.key === 'personal-ministries' ? Send : item.key === 'womens-ministry' ? HeartHandshake : Building2;
            return <Link key={item.departmentId} href={item.href} onClick={onNavigate} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} data-label={item.label} title={item.label}>
              <Icon size={19} aria-hidden="true" /><span>{item.label}</span>
            </Link>;
          })}
          {items.length === 0 && <p className="workspace-nav-empty" role="status">{tr("No hay áreas que coincidan.")}</p>}
        </div>
      </div>}
    </section>
  );
}
