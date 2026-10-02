'use client';

import { ShieldCheck } from 'lucide-react';
import { AuditConsole } from '@/components/audit-console';
import { Shell } from '@/components/shell';
import { useExperience } from '@/components/experience-provider';

export default function AuditPage() {
  const { tr } = useExperience();

  return <Shell title={tr("Auditoría")} eyebrow={tr("Gobernanza y cumplimiento")} actions={<span className="audit-live-indicator"><i />{tr(" Registro activo")}</span>}>
    <AuditConsole />
    <aside className="audit-assurance"><ShieldCheck /><div><strong>{tr("Libro inmutable por iglesia")}</strong><span>{tr("Los eventos no pueden editarse ni eliminarse y permanecen aislados en la base de datos de este tenant.")}</span></div></aside>
  </Shell>;
}
