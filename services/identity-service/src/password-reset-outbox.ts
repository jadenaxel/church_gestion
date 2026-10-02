import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { withTransaction } from '@gc/database';

export const PASSWORD_RESET_EVENT_TYPE = 'auth.password_reset_requested';
export const PASSWORD_RESET_MAX_ATTEMPTS = 8;
export const passwordResetRetrySchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();
type Context = { id: string; slug: string };
type Payload = { userId: string; email: string; resetUrl: string };
export type ResetEvent = { id: string; tenantId: string; type: typeof PASSWORD_RESET_EVENT_TYPE; aggregateId: string; payload: Payload };
type Transport = (event: ResetEvent) => Promise<void>;
type ClaimedIntent = { id: string; user_id: string; payload_ciphertext: string; claim_token: string };

function encryptionKey(env: NodeJS.ProcessEnv): Buffer {
  const secret = env.CONFIG_ENCRYPTION_KEY ?? (env.NODE_ENV === 'production' ? '' : (env.JWT_SECRET ?? env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-local-configuration-key'));
  if (secret.length < 32) throw new Error('PASSWORD_RESET_ENCRYPTION_KEY_UNAVAILABLE');
  return createHash('sha256').update(secret).digest();
}

function aad(tenantId: string, eventId: string): Buffer {
  return Buffer.from(`identity.password_reset_outbox:v1:${tenantId}:${eventId}`);
}

/** Same AES-GCM/config-key primitive as notification settings, bound to tenant/event.
 * No token, email, URL or encrypted payload may be logged or exposed as metadata. */
export function sealResetPayload(payload: Payload, tenantId: string, eventId: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  cipher.setAAD(aad(tenantId, eventId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function openResetPayload(value: string, tenantId: string, eventId: string, env: NodeJS.ProcessEnv = process.env): Payload {
  try {
    const pieces = value.split(':');
    if (pieces.length !== 4 || pieces[0] !== 'v1') throw new Error('INVALID_ENVELOPE');
    const iv = Buffer.from(pieces[1]!, 'base64url'), tag = Buffer.from(pieces[2]!, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw new Error('INVALID_ENVELOPE');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), iv);
    decipher.setAAD(aad(tenantId, eventId)); decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(pieces[3]!, 'base64url')), decipher.final()]).toString('utf8');
    return z.object({ userId: z.uuid(), email: z.email(), resetUrl: z.url() }).strict().parse(JSON.parse(plaintext));
  } catch {
    throw new Error('PASSWORD_RESET_PAYLOAD_UNAVAILABLE');
  }
}

/** Only durable intent creation occurs here. No HTTP/provider before COMMIT. */
export async function requestPasswordReset(pool: Pool, tenant: Context, email: string, env: NodeJS.ProcessEnv = process.env): Promise<{ token: string; eventId: string } | null> {
  return withTransaction(pool, async (client) => {
    const found = await client.query<{ id: string; email: string }>('SELECT id,email FROM identity.users WHERE email=$1 AND active FOR SHARE', [email]);
    const user = found.rows[0];
    if (!user) return null;
    const token = randomBytes(32).toString('base64url'), eventId = randomUUID();
    const resetUrl = new URL('/reset-password', env.WEB_ORIGIN ?? 'http://localhost:3000');
    if (!['http:', 'https:'].includes(resetUrl.protocol) || (env.NODE_ENV === 'production' && resetUrl.protocol !== 'https:')) throw new Error('PASSWORD_RESET_ORIGIN_UNAVAILABLE');
    resetUrl.searchParams.set('tenant', tenant.slug); resetUrl.searchParams.set('token', token);
    const encrypted = sealResetPayload({ userId: user.id, email: user.email, resetUrl: resetUrl.href }, tenant.id, eventId, env);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO identity.password_reset_tokens(user_id,token_hash,expires_at)
       VALUES($1,$2,now()+interval '30 minutes') RETURNING id`,
      [user.id, createHash('sha256').update(token).digest('hex')]
    );
    const reset = inserted.rows[0]!;
    // Keep PostgreSQL precision: serializing expires_at through JS Date truncates microseconds.
    await client.query(`INSERT INTO identity.password_reset_outbox(id,reset_token_id,user_id,payload_ciphertext,expires_at)
      SELECT $1,t.id,$3,$4,t.expires_at FROM identity.password_reset_tokens t WHERE t.id=$2`, [eventId, reset.id, user.id, encrypted]);
    await client.query(`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
      VALUES($1::uuid,'auth.password_reset.requested','user',$1::text,jsonb_build_object('outcome','SUCCESS','notificationIntentId',$2::text))`, [user.id, eventId]);
    return { token, eventId };
  });
}

export async function deliverPasswordReset(event: ResetEvent, env: NodeJS.ProcessEnv = process.env, send: typeof fetch = fetch): Promise<void> {
  const response = await send(`${env.NOTIFICATION_SERVICE_URL ?? 'http://127.0.0.1:4015'}/events`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant-id': event.tenantId, 'x-internal-secret': env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret' },
    body: JSON.stringify(event), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('PASSWORD_RESET_TRANSPORT_NOT_ACCEPTED');
}

/** An acknowledgement is only durable internal inbox acceptance, never SMTP delivery.
 * Attempts increment at claim (also bounds process crashes); expired/used intents
 * are scrubbed, stable IDs permit uncertain-ACK replay, and old owners are fenced. */
export async function dispatchPasswordResets(pool: Pool, tenantId: string, transport: Transport = deliverPasswordReset, env: NodeJS.ProcessEnv = process.env): Promise<{ accepted: number; deferred: number; retired: number }> {
  const result = { accepted: 0, deferred: 0, retired: 0 };
  try {
    const retired = await pool.query(`UPDATE identity.password_reset_outbox o SET retired_at=now(),payload_ciphertext=NULL,lease_until=NULL,claim_token=NULL,
      terminal_reason=CASE WHEN t.used_at IS NOT NULL THEN 'TOKEN_USED' WHEN t.expires_at<=now() OR o.expires_at<=now() THEN 'TOKEN_EXPIRED' ELSE 'ACCOUNT_INACTIVE' END
      FROM identity.password_reset_tokens t,identity.users u WHERE t.id=o.reset_token_id AND u.id=o.user_id
        AND o.accepted_at IS NULL AND o.retired_at IS NULL AND (t.used_at IS NOT NULL OR t.expires_at<=now() OR o.expires_at<=now() OR NOT u.active)
        AND (o.lease_until IS NULL OR o.lease_until<now())`);
    result.retired = retired.rowCount ?? 0;
    for (let count = 0; count < 20; count++) {
      const claimed = await pool.query<ClaimedIntent>(`WITH candidate AS (
        SELECT o.id FROM identity.password_reset_outbox o JOIN identity.password_reset_tokens t ON t.id=o.reset_token_id JOIN identity.users u ON u.id=o.user_id
        WHERE o.accepted_at IS NULL AND o.retired_at IS NULL AND o.attempts<$1 AND o.next_attempt_at<=now()
          AND (o.lease_until IS NULL OR o.lease_until<now()) AND t.used_at IS NULL AND t.expires_at>now() AND o.expires_at>now() AND u.active
        ORDER BY o.created_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED
      ) UPDATE identity.password_reset_outbox o SET attempts=attempts+1,lease_until=now()+interval '45 seconds',claim_token=gen_random_uuid()
        FROM candidate c WHERE o.id=c.id RETURNING o.id,o.user_id,o.payload_ciphertext,o.claim_token`, [PASSWORD_RESET_MAX_ATTEMPTS]);
      const intent = claimed.rows[0];
      if (!intent) break;
      try {
        const payload = openResetPayload(intent.payload_ciphertext, tenantId, intent.id, env);
        if (payload.userId !== intent.user_id) throw new Error('PASSWORD_RESET_PAYLOAD_UNAVAILABLE');
        await transport({ id: intent.id, tenantId, type: PASSWORD_RESET_EVENT_TYPE, aggregateId: intent.user_id, payload });
        const accepted = await pool.query(`UPDATE identity.password_reset_outbox SET accepted_at=now(),payload_ciphertext=NULL,lease_until=NULL,claim_token=NULL WHERE id=$1 AND claim_token=$2 AND accepted_at IS NULL AND retired_at IS NULL`, [intent.id, intent.claim_token]);
        result.accepted += accepted.rowCount ?? 0;
      } catch {
        const deferred = await pool.query(`UPDATE identity.password_reset_outbox SET next_attempt_at=now()+interval '10 seconds',lease_until=NULL,claim_token=NULL WHERE id=$1 AND claim_token=$2 AND accepted_at IS NULL AND retired_at IS NULL`, [intent.id, intent.claim_token]);
        result.deferred += deferred.rowCount ?? 0;
      }
    }
  } catch {
    console.warn(JSON.stringify({ service: 'identity-service', event: 'password_reset_outbox_unavailable' }));
  }
  return result;
}

export async function listPasswordResetDeadLetters(pool: Pool) {
  const rows = await pool.query(`SELECT o.id,$1::text "eventType",o.user_id "aggregateId",o.attempts,o.created_at "createdAt",LEAST(o.expires_at,t.expires_at) "expiresAt",
    CASE WHEN t.used_at IS NOT NULL THEN 'TOKEN_USED' WHEN t.expires_at<=now() OR o.expires_at<=now() THEN 'TOKEN_EXPIRED' WHEN NOT u.active THEN 'ACCOUNT_INACTIVE' ELSE o.terminal_reason END "lastError",
    (o.retired_at IS NULL AND o.payload_ciphertext IS NOT NULL AND (o.lease_until IS NULL OR o.lease_until<=now()) AND t.used_at IS NULL AND t.expires_at>now() AND o.expires_at>now() AND u.active) "retryable"
    FROM identity.password_reset_outbox o JOIN identity.password_reset_tokens t ON t.id=o.reset_token_id JOIN identity.users u ON u.id=o.user_id
    WHERE o.accepted_at IS NULL AND (o.attempts>=$2 OR o.retired_at IS NOT NULL OR t.used_at IS NOT NULL OR t.expires_at<=now() OR o.expires_at<=now() OR NOT u.active) ORDER BY o.created_at LIMIT 200`, [PASSWORD_RESET_EVENT_TYPE, PASSWORD_RESET_MAX_ATTEMPTS]);
  return { items: rows.rows };
}

export async function retryPasswordReset(pool: Pool, id: string, actorId: string, reason: string): Promise<{ id: string; retryScheduled: true }> {
  const validated = passwordResetRetrySchema.parse({ reason });
  return withTransaction(pool, async (client) => {
    const result = await client.query<{ attempts: number; available: boolean }>(`SELECT o.attempts,
      (o.accepted_at IS NULL AND o.retired_at IS NULL AND o.payload_ciphertext IS NOT NULL AND (o.lease_until IS NULL OR o.lease_until<=now()) AND t.used_at IS NULL AND t.expires_at>now() AND o.expires_at>now() AND u.active) available
      FROM identity.password_reset_outbox o JOIN identity.password_reset_tokens t ON t.id=o.reset_token_id JOIN identity.users u ON u.id=o.user_id WHERE o.id=$1 FOR UPDATE OF o`, [id]);
    const event = result.rows[0];
    if (!event) throw Object.assign(new Error('La publicación no existe.'), { status: 404, code: 'OUTBOX_NOT_FOUND' });
    if (!event.available || event.attempts < PASSWORD_RESET_MAX_ATTEMPTS) throw Object.assign(new Error('El enlace ya no es válido, fue aceptado o aún dispone de reintentos automáticos.'), { status: 409, code: 'PASSWORD_RESET_OUTBOX_NOT_RETRYABLE' });
    await client.query('UPDATE identity.password_reset_outbox SET attempts=0,next_attempt_at=now(),lease_until=NULL,claim_token=NULL WHERE id=$1', [id]);
    await client.query(`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
      VALUES($1::uuid,'auth.password_reset.notification_retried','password_reset_outbox',$2,jsonb_build_object('outcome','SUCCESS','reason',$3::text,'previousAttempts',$4::int))`, [actorId, id, validated.reason, event.attempts]);
    return { id, retryScheduled: true };
  });
}
