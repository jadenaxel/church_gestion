import type { Pool, PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { withTransaction } from '@gc/database';
import type { ProviderStatus } from '@gc/notification-domain';

export function notificationEventHash(event: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
  };
  return createHash('sha256').update(JSON.stringify(canonical(event))).digest('hex');
}

export async function processInbox<T>(pool: Pool, event: { id: string; type: string }, requestHash: string, work: (client: PoolClient) => Promise<T>): Promise<T | { duplicate: true }> {
  return withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`notification.inbox:${event.id}`]);
    const previous = await client.query<{ processed_at: Date | null; request_hash: string | null }>('SELECT processed_at,request_hash FROM notifications.inbox_events WHERE event_id=$1', [event.id]);
    if (previous.rows[0]?.request_hash && previous.rows[0].request_hash !== requestHash) {
      throw Object.assign(new Error('El identificador del evento fue utilizado con otro contenido.'), { status: 409, code: 'EVENT_ID_REUSED' });
    }
    if (previous.rows[0]?.processed_at) return { duplicate: true };
    await client.query(`INSERT INTO notifications.inbox_events(event_id,event_type,attempts,request_hash) VALUES($1,$2,1,$3)
      ON CONFLICT(event_id) DO UPDATE SET attempts=notifications.inbox_events.attempts+1,request_hash=EXCLUDED.request_hash,last_error=NULL`, [event.id, event.type, requestHash]);
    const result = await work(client);
    await client.query('UPDATE notifications.inbox_events SET processed_at=now() WHERE event_id=$1', [event.id]);
    return result;
  });
}

// Delivery callbacks can be delayed/replayed. Never turn an observed read/delivery into an earlier state.
export const monotonicDeliveryStatusSql = `CASE
  WHEN status='READ' AND $2<>'READ' THEN status
  WHEN status='DELIVERED' AND $2 NOT IN ('DELIVERED','READ') THEN status
  ELSE $2 END`;

export async function recordWebhook(pool: Pool, eventId: string, body: unknown, statuses: ProviderStatus[]) {
  return withTransaction(pool, async (client) => {
    const accepted = await client.query(`INSERT INTO notifications.provider_webhook_events(provider,provider_event_id,payload,signature_valid)
      VALUES('META',$1,$2::jsonb,true) ON CONFLICT DO NOTHING RETURNING provider_event_id`, [eventId, JSON.stringify(body)]);
    if (!accepted.rowCount) return { received: true, duplicate: true, statusesUpdated: 0 };
    let updated = 0;
    for (const status of statuses) {
      const result = await client.query(`UPDATE notifications.deliveries SET status=${monotonicDeliveryStatusSql},
        error=CASE WHEN $2='FAILED' AND status NOT IN ('DELIVERED','READ') THEN $3 ELSE NULL END,updated_at=now()
        WHERE provider_message_id=$1 AND channel='WHATSAPP' RETURNING id`, [status.providerMessageId, status.status, status.error ?? null]);
      updated += result.rowCount ?? 0;
    }
    return { received: true, statusesUpdated: updated };
  });
}

type ReminderKind = 'activity' | 'review';
export type ClaimedReminder = { id: string; claim_token: string; attempts: number; activity_id?: string; review_session_id?: string; user_id: string | null; kind: string; title: string; location: string | null };
function reminderTable(kind: ReminderKind) { return kind === 'review' ? 'calendar.review_session_reminders' : 'notifications.scheduled_reminders'; }

export async function claimReminder(pool: Pool, kind: ReminderKind): Promise<ClaimedReminder | null> {
  const table = reminderTable(kind);
  // Recover only expired claims. Live owners retain their lease; a stale token cannot acknowledge a replacement.
  await pool.query(`UPDATE ${table} SET status=CASE WHEN attempts>=5 THEN 'FAILED' ELSE 'PENDING' END,lease_until=NULL,claim_token=NULL
    WHERE status='PROCESSING' AND (lease_until IS NULL OR lease_until<=now())`);
  const resource = kind === 'review' ? 'calendar.review_sessions' : 'calendar.activities';
  const foreignKey = kind === 'review' ? 'review_session_id' : 'activity_id';
  const resourceStatus = kind === 'review' ? 'SCHEDULED' : 'APPROVED';
  const result = await pool.query<ClaimedReminder>(`WITH candidate AS (
    SELECT r.id FROM ${table} r JOIN ${resource} resource ON resource.id=r.${foreignKey}
      WHERE r.status='PENDING' AND r.attempts<5 AND r.remind_at<=now() AND resource.status=$1
      ORDER BY r.remind_at FOR UPDATE OF r SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE ${table} r SET status='PROCESSING',attempts=attempts+1,lease_until=now()+interval '3 minutes',claim_token=gen_random_uuid()
      FROM candidate WHERE r.id=candidate.id RETURNING r.*
    ) SELECT claimed.*,resource.title,${kind === 'review' ? 'resource.location' : 'NULL::text'} location
      FROM claimed JOIN ${resource} resource ON resource.id=claimed.${foreignKey}`, [resourceStatus]);
  return result.rows[0] ?? null;
}

export async function finishReminder(pool: Pool, kind: ReminderKind, reminder: ClaimedReminder, succeeded: boolean, delayMs: number): Promise<number> {
  const result = await pool.query(`UPDATE ${reminderTable(kind)} SET
    status=CASE WHEN $3 THEN 'SENT' WHEN attempts>=5 THEN 'FAILED' ELSE 'PENDING' END,
    remind_at=CASE WHEN $3 THEN remind_at ELSE now()+($4||' milliseconds')::interval END,lease_until=NULL,claim_token=NULL
    WHERE id=$1 AND claim_token=$2 AND status='PROCESSING'`, [reminder.id, reminder.claim_token, succeeded, delayMs]);
  return result.rowCount ?? 0;
}

export async function sendReminderEvent(endpoint: string, tenantId: string, secret: string, event: unknown, send: typeof fetch = fetch): Promise<void> {
  const response = await send(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-secret': secret, 'x-tenant-id': tenantId }, body: JSON.stringify(event), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`El servicio de alertas respondió ${response.status}.`);
}

export type ClaimedDelivery = { id: string; claim_token: string; notification_id: string; channel: 'EMAIL' | 'WHATSAPP'; attempts: number; title: string; body: string; email: string | null; phone: string | null; recipient_data: { emails?: string[]; phone?: string | null; messages?: Array<{ email: string; title: string; body: string }> } | null };

export async function claimDelivery(pool: Pool): Promise<ClaimedDelivery | null> {
  await pool.query(`UPDATE notifications.deliveries SET status='DEAD_LETTER',lease_until=NULL,claim_token=NULL
    WHERE status IN ('PENDING','FAILED') AND attempts>=5 AND (lease_until IS NULL OR lease_until<=now())`);
  const result = await pool.query<ClaimedDelivery>(`WITH candidate AS (
    SELECT d.id FROM notifications.deliveries d JOIN notifications.notifications n ON n.id=d.notification_id
      LEFT JOIN identity.users u ON u.id=n.user_id
      WHERE d.status IN ('PENDING','FAILED') AND d.attempts<5 AND COALESCE(d.next_attempt_at,'-infinity'::timestamptz)<=now()
        AND (d.lease_until IS NULL OR d.lease_until<=now()) AND d.channel IN ('EMAIL','WHATSAPP') AND (n.user_id IS NULL OR u.active)
      ORDER BY d.next_attempt_at NULLS FIRST FOR UPDATE OF d SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE notifications.deliveries d SET attempts=attempts+1,lease_until=now()+interval '3 minutes',claim_token=gen_random_uuid()
      FROM candidate WHERE d.id=candidate.id RETURNING d.*
    ) SELECT claimed.*,n.title,n.body,u.email,u.phone FROM claimed JOIN notifications.notifications n ON n.id=claimed.notification_id
      LEFT JOIN identity.users u ON u.id=n.user_id`);
  return result.rows[0] ?? null;
}

export async function finishDelivery(pool: Pool, delivery: ClaimedDelivery, outcome: { status: 'SENT' | 'FAILED' | 'SIMULATED'; providerMessageId?: string; error?: string }, delayMs: number): Promise<number> {
  const status = outcome.status === 'FAILED' && delivery.attempts >= 5 ? 'DEAD_LETTER' : outcome.status;
  const result = await pool.query(`UPDATE notifications.deliveries SET status=${monotonicDeliveryStatusSql},last_attempt_at=now(),
      next_attempt_at=CASE WHEN $2='FAILED' THEN now()+($3||' milliseconds')::interval ELSE NULL END,
      provider_message_id=COALESCE($4,provider_message_id),error=CASE WHEN status IN ('DELIVERED','READ') THEN NULL ELSE $5 END,lease_until=NULL,claim_token=NULL,updated_at=now()
      WHERE id=$1 AND claim_token=$6`, [delivery.id, status, delayMs, outcome.providerMessageId ?? null, outcome.error ?? null, delivery.claim_token]);
  return result.rowCount ?? 0;
}
