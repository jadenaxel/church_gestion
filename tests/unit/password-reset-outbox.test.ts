import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { passwordResetOutboxSchemaSql } from '../../packages/database/src/password-reset-outbox.js';
import { deliverPasswordReset, dispatchPasswordResets, openResetPayload, passwordResetRetrySchema, sealResetPayload, type ResetEvent } from '../../services/identity-service/src/password-reset-outbox.js';

const env = { CONFIG_ENCRYPTION_KEY: 'synthetic-test-configuration-key-000000000', NODE_ENV: 'test' };
const tenant = randomUUID(), id = randomUUID(), userId = randomUUID();
const payload = { userId, email: 'reset-fixture@premium.example', resetUrl: 'http://localhost:3000/reset-password?token=synthetic-not-usable' };
const event: ResetEvent = { id, tenantId: tenant, aggregateId: userId, type: 'auth.password_reset_requested', payload };

describe('identity-owned durable reset intent safeguards', () => {
  it('round-trips its existing AES-GCM config primitive without plaintext persistence', () => {
    const encrypted = sealResetPayload(payload, tenant, id, env);
    expect(encrypted.includes(payload.email) || encrypted.includes(payload.resetUrl)).toBe(false);
    expect(JSON.stringify(openResetPayload(encrypted, tenant, id, env)) === JSON.stringify(payload)).toBe(true);
  });
  it.each(['tenant', 'event'])('binds encrypted payload to the %s context', (scope) => {
    const encrypted = sealResetPayload(payload, tenant, id, env);
    expect(() => openResetPayload(encrypted, scope === 'tenant' ? randomUUID() : tenant, scope === 'event' ? randomUUID() : id, env)).toThrow('PASSWORD_RESET_PAYLOAD_UNAVAILABLE');
  });
  it('rejects altered ciphertext with a sanitized error', () => {
    const pieces = sealResetPayload(payload, tenant, id, env).split(':');
    const bytes = Buffer.from(pieces[3]!, 'base64url'); bytes[0] = bytes[0]! ^ 1;
    pieces[3] = bytes.toString('base64url');
    expect(() => openResetPayload(pieces.join(':'), tenant, id, env)).toThrow('PASSWORD_RESET_PAYLOAD_UNAVAILABLE');
  });
  it('fails closed without a production config key, even with an internal secret', () => {
    expect(() => sealResetPayload(payload, tenant, id, { NODE_ENV: 'production', INTERNAL_SERVICE_SECRET: env.CONFIG_ENCRYPTION_KEY })).toThrow('KEY_UNAVAILABLE');
    expect(() => sealResetPayload(payload, tenant, id, { NODE_ENV: 'production', CONFIG_ENCRYPTION_KEY: 'short' })).toThrow('KEY_UNAVAILABLE');
  });
  it('rejects malformed envelopes without emitting plaintext or parse details', () => {
    expect(() => openResetPayload('v0:private-data', tenant, id, env)).toThrow('PASSWORD_RESET_PAYLOAD_UNAVAILABLE');
  });
  it('bounds HTTP to 15 seconds and sends the same committed event identifier', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const send = vi.fn(async () => new Response('{}', { status: 201 })) as unknown as typeof fetch;
    try {
      await deliverPasswordReset(event, env, send);
      expect(timeout).toHaveBeenCalledWith(15_000);
      const options = vi.mocked(send).mock.calls[0]![1]!;
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(String(options.body)).id).toBe(id);
    } finally { timeout.mockRestore(); }
  });
  it('does not treat HTTP rejection as an internal receipt or provider delivery', async () => {
    const send = vi.fn(async () => new Response('private-provider-detail', { status: 503 })) as unknown as typeof fetch;
    await expect(deliverPasswordReset(event, env, send)).rejects.toThrow('PASSWORD_RESET_TRANSPORT_NOT_ACCEPTED');
  });
  it('aborts a stalled transport at its deadline', async () => {
    const controller = new AbortController(), timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const send = vi.fn((_url: unknown, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      controller.abort(new DOMException('Synthetic deadline', 'TimeoutError'));
    })) as unknown as typeof fetch;
    try { await expect(deliverPasswordReset(event, env, send)).rejects.toThrow('Synthetic deadline'); }
    finally { timeout.mockRestore(); }
  });
  it('scrubs accepted payloads and fences settlement to the claimant', async () => {
    const claim = { id, user_id: userId, payload_ciphertext: sealResetPayload(payload, tenant, id, env), claim_token: randomUUID() };
    const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rows: [claim] }).mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [] });
    expect(await dispatchPasswordResets({ query } as unknown as Pool, tenant, async () => undefined, env)).toEqual({ accepted: 1, deferred: 0, retired: 0 });
    expect(query.mock.calls[1]![0]).toContain('attempts=attempts+1');
    expect(query.mock.calls[2]![0]).toContain('payload_ciphertext=NULL');
    expect(query.mock.calls[2]![1]).toEqual([id, claim.claim_token]);
  });
  it('retains a failed transport for bounded replay and contains a secondary DB failure', async () => {
    const claim = { id, user_id: userId, payload_ciphertext: sealResetPayload(payload, tenant, id, env), claim_token: randomUUID() };
    const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rows: [claim] }).mockRejectedValue(new Error('private-connection-detail'));
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(dispatchPasswordResets({ query } as unknown as Pool, tenant, async () => { throw new Error('offline'); }, env)).resolves.toEqual({ accepted: 0, deferred: 0, retired: 0 });
      expect(query.mock.calls[2]![0]).toContain("next_attempt_at=now()+interval '10 seconds'");
      expect(String(log.mock.calls[0]![0]).includes('private-connection-detail')).toBe(false);
    } finally { log.mockRestore(); }
  });
  it('contains initial pool rejection without an unhandled promise or payload logging', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try { await expect(dispatchPasswordResets({ query: vi.fn().mockRejectedValue(new Error('private-detail')) } as unknown as Pool, tenant)).resolves.toEqual({ accepted: 0, deferred: 0, retired: 0 }); }
    finally { log.mockRestore(); }
  });
  it('accepts only a bounded trimmed reason and no extra recovery fields', () => {
    expect(passwordResetRetrySchema.safeParse({ reason: '  Synthetic operator recovery  ' }).success).toBe(true);
    for (const body of [{ reason: 'short' }, { reason: 'x'.repeat(501) }, { reason: 'Synthetic valid reason', force: true }]) expect(passwordResetRetrySchema.safeParse(body).success).toBe(false);
  });
  it('adds only its own table/index without grants or data backfill', () => {
    expect(passwordResetOutboxSchemaSql).toContain('identity.password_reset_outbox');
    expect(passwordResetOutboxSchemaSql).not.toMatch(/^\s*(GRANT|INSERT INTO|UPDATE|DELETE FROM)\b/m);
    expect(passwordResetOutboxSchemaSql).toContain('attempts BETWEEN 0 AND 8');
  });
});
