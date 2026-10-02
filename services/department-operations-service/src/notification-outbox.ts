import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { domainTransaction } from '../../shared/atomic-domain-mutation.js';

export const DEPARTMENT_OUTBOX_MAX_ATTEMPTS = 8;
type OutboxMetadata = { id: string; event_type: string; aggregate_id: string; attempts: number; delivered_at: string | null };
type QueuedEvent = { id: string; event_type: string; aggregate_id: string; payload: unknown; claim_token: string };
type Transport = (event: { id: string; tenantId: string; type: string; aggregateId: string; payload: unknown }) => Promise<void>;

export async function recoverDepartmentNotification(pool: Pool | PoolClient, id: string, audit: (client: PoolClient, metadata: OutboxMetadata) => Promise<void>): Promise<{ id: string; retryScheduled: true }> {
  return domainTransaction(pool, async (client) => {
    const result = await client.query<OutboxMetadata>('SELECT id,event_type,aggregate_id,attempts,delivered_at FROM department_operations.notification_outbox WHERE id=$1 FOR UPDATE', [id]);
    const event = result.rows[0];
    if (!event) throw Object.assign(new Error('La publicación no existe.'), { status: 404, code: 'OUTBOX_NOT_FOUND' });
    if (event.delivered_at !== null || event.attempts < DEPARTMENT_OUTBOX_MAX_ATTEMPTS) throw Object.assign(new Error('La publicación ya fue entregada o aún dispone de reintentos automáticos.'), { status: 409, code: 'OUTBOX_NOT_RETRYABLE' });
    await client.query('UPDATE department_operations.notification_outbox SET attempts=0,next_attempt_at=now(),lease_until=NULL,claim_token=NULL WHERE id=$1', [id]);
    await audit(client, event);
    return { id, retryScheduled: true };
  });
}

/** Called on the same transaction client as the domain mutation and its audit. */
export async function enqueueDepartmentNotification(client: PoolClient, eventType: string, payload: unknown): Promise<string> {
  const eventId = randomUUID();
  await client.query('INSERT INTO department_operations.notification_outbox(id,event_type,aggregate_id,payload) VALUES($1,$2,$3,$4::jsonb)', [eventId, eventType, randomUUID(), JSON.stringify(payload)]);
  return eventId;
}

export async function deliverDepartmentNotification(event: Parameters<Transport>[0]): Promise<void> {
  const response = await fetch(`${process.env.NOTIFICATION_SERVICE_URL ?? 'http://127.0.0.1:4015'}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': event.tenantId, 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret' },
    body: JSON.stringify(event), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('DEPARTMENT_NOTIFICATION_TRANSPORT_REJECTED');
}

/** Each lease covers one in-flight request, not an entire sequential batch.
 * Stable event IDs make uncertain HTTP acknowledgements replay-safe at the inbox.
 * External providers are still at-least-once: this is not an exactly-once claim. */
export async function dispatchDepartmentNotifications(pool: Pool, tenantId: string, transport: Transport = deliverDepartmentNotification): Promise<{ delivered: number; deferred: number }> {
  const result = { delivered: 0, deferred: 0 };
  try {
    for (let processed = 0; processed < 20; processed++) {
      const claimed = await pool.query<QueuedEvent>(`WITH pending AS (
        SELECT id FROM department_operations.notification_outbox
        WHERE delivered_at IS NULL AND attempts<$1 AND next_attempt_at<=now()
          AND (lease_until IS NULL OR lease_until<now())
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE department_operations.notification_outbox o SET lease_until=now()+interval '45 seconds',claim_token=gen_random_uuid()
        FROM pending p WHERE o.id=p.id RETURNING o.id,o.event_type,o.aggregate_id,o.payload,o.claim_token`, [DEPARTMENT_OUTBOX_MAX_ATTEMPTS]);
      const event = claimed.rows[0];
      if (!event) break;
      try {
        await transport({ id: event.id, tenantId, type: event.event_type, aggregateId: event.aggregate_id, payload: event.payload });
        const settled = await pool.query(`UPDATE department_operations.notification_outbox SET delivered_at=now(),lease_until=NULL,claim_token=NULL WHERE id=$1 AND claim_token=$2 AND delivered_at IS NULL`, [event.id, event.claim_token]);
        result.delivered += settled.rowCount ?? 0;
      } catch {
        const deferred = await pool.query(`UPDATE department_operations.notification_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '10 seconds',lease_until=NULL,claim_token=NULL WHERE id=$1 AND claim_token=$2 AND delivered_at IS NULL`, [event.id, event.claim_token]);
        result.deferred += deferred.rowCount ?? 0;
      }
    }
  } catch (error) {
    // A retired synthetic tenant or unavailable DB must not reject into the host.
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    console.warn(JSON.stringify({ service: 'department-operations-service', event: 'notification_outbox_deferred', code: typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'UNAVAILABLE' }));
  }
  return result;
}
