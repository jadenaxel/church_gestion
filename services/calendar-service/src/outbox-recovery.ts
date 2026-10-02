import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '@gc/database';

type OutboxMetadata = { id: string; event_type: string; aggregate_id: string; attempts: number; delivered_at: string | null };

/** Requeues the original durable event only when the existing automatic retry budget is exhausted. */
export async function recoverOutboxEvent(pool: Pool, id: string, audit: (client: PoolClient, metadata: OutboxMetadata) => Promise<void>): Promise<{ id: string; retryScheduled: true }> {
  return withTransaction(pool, async (client) => {
    const result = await client.query<OutboxMetadata>('SELECT id,event_type,aggregate_id,attempts,delivered_at FROM calendar.outbox_events WHERE id=$1 FOR UPDATE', [id]);
    const event = result.rows[0];
    if (!event) throw Object.assign(new Error('La publicación no existe.'), { status: 404, code: 'OUTBOX_NOT_FOUND' });
    if (event.delivered_at !== null || event.attempts < 8) throw Object.assign(new Error('La publicación ya fue entregada o aún dispone de reintentos automáticos.'), { status: 409, code: 'OUTBOX_NOT_RETRYABLE' });
    await client.query('UPDATE calendar.outbox_events SET attempts=0 WHERE id=$1', [id]);
    await audit(client, event);
    return { id, retryScheduled: true };
  });
}
