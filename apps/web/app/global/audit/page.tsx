'use client';

import { ArrowLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AuditConsole, type AuditTenant } from '@/components/audit-console';
import { Logo } from '@/components/logo';
import { Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';

export default function GlobalAuditPage() {
  const { tr } = useExperience();

  const [tenants, setTenants] = useState<AuditTenant[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => api<{ items: AuditTenant[] }>('/global/tenants').then((result) => setTenants(result.items)).catch((reason) => setError(reason instanceof Error ? reason.message : 'No fue posible cargar las iglesias.')), []);
  useEffect(() => { void load(); }, [load]);
  return <main className="global-page global-audit-page">
    <header className="global-header"><Logo /><div><span className="eyebrow">{tr("Gobernanza global")}</span><h1>{tr("Auditoría de la plataforma")}</h1></div><Link className="button button-ghost" href="/global"><ArrowLeft size={17} />{tr(" Volver a iglesias")}</Link></header>
    <div className="global-content">{error && <Notice tone="danger" title={tr("Atención")}>{error}</Notice>}<AuditConsole global tenants={tenants} /><aside className="audit-assurance"><ShieldCheck /><div><strong>{tr("Visibilidad global controlada")}</strong><span>{tr("El administrador global puede consultar la plataforma o seleccionar una iglesia. Las bases permanecen físicamente aisladas y nunca se mezclan.")}</span></div></aside></div>
  </main>;
}
