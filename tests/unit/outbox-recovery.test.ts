import { describe, expect, it, vi } from 'vitest';
import { canRecoverPublications, publicationRetryEndpoint, publicationRetryReason, publicationUnavailableLabel, readPublicationQueues, schedulePublicationRetry } from '../../apps/web/components/outbox-recovery.js';
const event = {id:'fixture-event',eventType:'activity.submitted',aggregateId:'fixture-activity',attempts:8,createdAt:'2026-10-01T12:00:00Z'};
describe('manual publication recovery', () => {
  it('uses effective users.manage, not inferred administrator role names', () => {
    expect(canRecoverPublications([])).toBe(false); expect(canRecoverPublications(['notifications.read'])).toBe(false); expect(canRecoverPublications(['users.manage'])).toBe(true);
  });
  it('requires a bounded, trimmed reason before making any request', () => {
    expect(publicationRetryReason('  Proveedor disponible nuevamente.  ')).toEqual({reason:'Proveedor disponible nuevamente.'});
    expect(() => publicationRetryReason('corto')).toThrow(); expect(() => publicationRetryReason('x'.repeat(501))).toThrow();
  });
  it('reprograms the exact event and never claims synchronous delivery', async () => {
    const post = vi.fn(async (id: string) => ({id,retryScheduled:true}));
    await expect(schedulePublicationRetry(event,'Proveedor recuperado.',post)).resolves.toEqual({id:'fixture-event',retryScheduled:true});
    expect(post).toHaveBeenCalledExactlyOnceWith('fixture-event',{reason:'Proveedor recuperado.'});
  });
  it('preserves rejected and uncertain results instead of reporting success', async () => {
    await expect(schedulePublicationRetry(event,'Proveedor recuperado.',async()=>({id:event.id,retryScheduled:false}))).rejects.toThrow('No pudimos confirmar');
    await expect(schedulePublicationRetry(event,'Proveedor recuperado.',async()=>{throw Object.assign(new Error('Already handled'),{status:409});})).rejects.toMatchObject({status:409});
  });
  it('routes a retry to the explicit source namespace without changing its event ID', () => {
    expect(publicationRetryEndpoint('calendar',event.id)).toBe('/calendar/outbox/fixture-event/retry');
    expect(publicationRetryEndpoint('departments',event.id)).toBe('/department-operations/outbox/fixture-event/retry');
    expect(publicationRetryEndpoint('identity',event.id)).toBe('/auth/password/outbox/fixture-event/retry');
  });
  it('keeps the error from a failed source distinct from a successfully empty queue', async () => {
    const failure = new Error('Fixture service unavailable');
    const result = await readPublicationQueues(async path => { if (path.startsWith('/department-operations')) throw failure; return {items:[]}; });
    expect(result).toEqual([{source:'calendar',items:[],error:null},{source:'departments',items:null,error:failure},{source:'identity',items:[],error:null}]);
  });
  it('keeps source identity separate even when queues contain the same event ID', async () => {
    const result = await readPublicationQueues(async () => ({items:[event]}));
    expect(result.map(queue=>queue.source)).toEqual(['calendar','departments','identity']);
    expect(result.map(queue=>queue.items?.[0]?.id)).toEqual([event.id,event.id,event.id]);
  });
  it('never sends a retry of a retired reset intent and explains its terminal reason', async () => {
    const post = vi.fn();
    await expect(schedulePublicationRetry({ ...event, retryable: false }, 'Synthetic unavailable retry', post)).rejects.toThrow('Reintento no disponible');
    expect(post).not.toHaveBeenCalled();
    expect(publicationUnavailableLabel({ ...event, retryable: false, lastError: 'TOKEN_EXPIRED' })).toBe('Enlace vencido');
    expect(publicationUnavailableLabel({ ...event, retryable: false, lastError: 'TOKEN_USED' })).toBe('Enlace ya utilizado');
    expect(publicationUnavailableLabel({ ...event, retryable: false, lastError: 'ACCOUNT_INACTIVE' })).toBe('Cuenta inactiva');
    expect(publicationUnavailableLabel(event)).toBeNull();
  });
});
