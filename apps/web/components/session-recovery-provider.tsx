'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { api, abortPendingRequests } from '@/lib/api';
import { isPublicPagePath } from '@/lib/public-page-routes';
import { recoveryIdentity, sessionRecoveredEvent, sessionRecovery } from '@/lib/session-recovery';
import { useExperience } from './experience-provider';
import { Modal } from './modal';
import { Notice } from './ui';

export function SessionRecoveryProvider({children}: {children:ReactNode}) {
  const pathname = usePathname();
  const {tr} = useExperience();
  const [state,setState] = useState(sessionRecovery.state);
  const [checking,setChecking] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => { setState(sessionRecovery.state()); return sessionRecovery.subscribe(setState); }, []);
  async function checkSession() {
    if (checking) return;
    setChecking(true); setError('');
    try {
      const {user} = await api<{user:unknown}>('/me');
      const identity = recoveryIdentity(user);
      if (!identity) throw new Error(tr('No pudimos verificar la identidad de la sesión.'));
      if (sessionRecovery.resume(identity)) window.dispatchEvent(new Event(sessionRecoveredEvent));
      else if (sessionRecovery.state().phase !== 'changed') throw new Error(tr('La sesión todavía no está disponible. Inicia sesión y vuelve a comprobar.'));
    } catch {
      if (sessionRecovery.state().phase !== 'changed') setError(tr('La sesión todavía no está disponible. Inicia sesión y vuelve a comprobar.'));
    } finally { setChecking(false); }
  }
  function discard() {
    if (!window.confirm(tr('Se descartarán los datos y archivos de esta pestaña. ¿Continuar?'))) return;
    abortPendingRequests(); window.location.replace('/login');
  }
  if (isPublicPagePath(pathname)) return <>{children}</>;
  return <>
    {state.phase !== 'changed' && children}
    {state.phase === 'expired' && <Modal protectChanges={false} busy={checking} label={tr('Tu sesión expiró')} onClose={() => undefined}>
      <section className="modal-card premium-modal"><span className="modal-symbol"><ShieldCheck/></span><h2>{tr('Tu sesión expiró')}</h2>
        <p>{tr('Los datos y archivos siguen en memoria en esta pestaña. No se guardaron en el dispositivo ni se reenviará ninguna solicitud automáticamente.')}</p>
        <p>{tr('Inicia sesión con la misma cuenta e iglesia en otra pestaña. Después comprueba la sesión para continuar; los permisos se verificarán de nuevo.')}</p>
        {error && <Notice tone="danger" title={tr('Sesión sin confirmar')}>{error}</Notice>}
        <div className="modal-actions"><a className="button button-secondary" href="/login?reauth=1" target="_blank" rel="noopener noreferrer">{tr('Abrir acceso en otra pestaña')}</a><button type="button" className="button button-primary" disabled={checking} onClick={() => void checkSession()}>{checking ? tr('Comprobando sesión…') : tr('Comprobar sesión y continuar')}</button><button type="button" className="button button-ghost" disabled={checking} onClick={discard}>{tr('Descartar y volver al acceso')}</button></div>
        <small>{tr('Recargar o cerrar esta pestaña pierde la recuperación en memoria. Salir no cancela una solicitud ya enviada.')}</small>
      </section>
    </Modal>}
    {state.phase === 'changed' && <Modal protectChanges={false} label={tr('Cambió la cuenta o la iglesia')} onClose={() => undefined}>
      <section className="modal-card premium-modal"><span className="modal-symbol"><ShieldCheck/></span><h2>{tr('Cambió la cuenta o la iglesia')}</h2><Notice tone="warning" title={tr('Borrador y archivos descartados')}>{tr('El estado de la cuenta anterior se eliminó de esta pestaña para evitar compartir información entre identidades. No se reintentó ninguna operación.')}</Notice><a className="button button-primary" href="/dashboard" onClick={() => abortPendingRequests()}>{tr('Ir al inicio')}</a></section>
    </Modal>}
  </>;
}
