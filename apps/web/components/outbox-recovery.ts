export type FailedPublication = { id: string; eventType: string; aggregateId: string; attempts: number; createdAt: string; retryable?: boolean; expiresAt?: string; lastError?: 'TOKEN_EXPIRED' | 'TOKEN_USED' | 'ACCOUNT_INACTIVE' | null };
export type PublicationQueueSource = 'calendar' | 'departments' | 'identity';
export const publicationQueueSources = [
  {source:'calendar',label:'Calendario',path:'/calendar/outbox/dead-letter'},
  {source:'departments',label:'Operaciones departamentales',path:'/department-operations/outbox/dead-letter'},
  {source:'identity',label:'Recuperación de contraseña',path:'/auth/password/outbox/dead-letter'}
] as const;
export type PublicationQueueResult = {source:PublicationQueueSource;items:FailedPublication[] | null;error:Error | null};

export async function readPublicationQueues(get:(path:string)=>Promise<{items:FailedPublication[]}>):Promise<PublicationQueueResult[]> {
  const results = await Promise.allSettled(publicationQueueSources.map(queue => get(queue.path)));
  return results.map((result,index) => ({source:publicationQueueSources[index]!.source,
    items:result.status === 'fulfilled' ? result.value.items : null,
    error:result.status === 'rejected' ? result.reason instanceof Error ? result.reason : new Error('No fue posible cargar la cola de publicaciones.') : null
  }));
}

export function publicationRetryEndpoint(source:PublicationQueueSource,id:string) {
  const prefix = source === 'calendar' ? '/calendar' : source === 'departments' ? '/department-operations' : '/auth/password';
  return `${prefix}/outbox/${encodeURIComponent(id)}/retry`;
}

export function canRecoverPublications(permissions: readonly string[]): boolean {
  return permissions.includes('users.manage');
}

export function publicationRetryReason(reason: string): { reason: string } {
  const normalized = reason.trim();
  if (normalized.length < 10 || normalized.length > 500) throw new Error('Indica una razón operativa de 10 a 500 caracteres, sin datos sensibles.');
  return { reason: normalized };
}

/** An acknowledgement schedules the existing event; it is not evidence of delivery. */
export async function schedulePublicationRetry(event: FailedPublication, reason: string, post: (id: string, body: { reason: string }) => Promise<{ id: string; retryScheduled: boolean }>) {
  if (event.retryable === false) throw new Error('Reintento no disponible');
  const result = await post(event.id, publicationRetryReason(reason));
  if (result.id !== event.id || result.retryScheduled !== true) throw new Error('No pudimos confirmar la reprogramación. Actualiza la cola antes de reintentar.');
  return result;
}

export function publicationUnavailableLabel(event: FailedPublication): string | null {
  if (event.retryable !== false) return null;
  return event.lastError === 'TOKEN_EXPIRED' ? 'Enlace vencido' : event.lastError === 'TOKEN_USED' ? 'Enlace ya utilizado'
    : event.lastError === 'ACCOUNT_INACTIVE' ? 'Cuenta inactiva' : 'Reintento no disponible';
}
