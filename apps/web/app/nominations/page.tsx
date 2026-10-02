'use client';

import { LoaderCircle, RefreshCw, ShieldCheck, Vote } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/shell';
import { Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';

export default function NominationsPage() {
  const { tr } = useExperience();

  const [error, setError] = useState('');
  const [launching, setLaunching] = useState(true);

  const launch = useCallback(async () => {
    setError(''); setLaunching(true);
    try {
      const result = await api<{ launchUrl: string }>('/integrations/nominations/launch', {
        method: 'POST', body: '{}'
      });
      window.location.assign(result.launchUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible abrir el módulo.');
      setLaunching(false);
    }
  }, []);

  useEffect(() => { void launch(); }, [launch]);

  return <Shell title={tr("Nombramientos")} eyebrow={tr("Gobierno de iglesia")}>
    <section className="panel empty-state" aria-live="polite">
      <span className="empty-icon"><Vote /></span>
      <h2>{launching ? tr("Abriendo el módulo seguro…") : tr("No pudimos abrir Nombramientos")}</h2>
      <p>{launching ? tr("Validamos tu iglesia y tus roles sin solicitar otra contraseña.") : tr("Tu sesión de GestionChurch continúa protegida. Puedes volver a intentar.")}</p>
      {launching && <LoaderCircle className="spin" aria-hidden="true" />}
      {error && <Notice tone="danger" title={tr("Acceso no completado")}>{error}</Notice>}
      {!launching && <button type="button" className="button button-primary" onClick={() => void launch()}><RefreshCw size={17} />{tr(" Reintentar")}</button>}
      <small><ShieldCheck size={14} />{tr(" Acceso aislado por tenant y auditado de extremo a extremo.")}</small>
    </section>
  </Shell>;
}
