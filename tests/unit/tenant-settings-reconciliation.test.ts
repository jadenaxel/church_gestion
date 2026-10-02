import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tenantSettingsReconciliationSchemaSql } from '../../packages/database/src/tenant-settings-reconciliation.js';
import { settingsRequestHash, updateTenantSettingsSchema } from '../../services/tenant-service/src/settings-reconciliation.js';

describe('durable tenant settings command boundaries', () => {
  it('preserves an omitted timezone on a name-only PATCH instead of applying creation defaults', () => {
    const parsed = updateTenantSettingsSchema.parse({ name: 'Synthetic renamed church' });
    expect(parsed).toEqual({ name: 'Synthetic renamed church' }); expect(parsed.timezone).toBeUndefined();
  });
  it('preserves an omitted name and keeps explicit zone/version/key', () => {
    const idempotencyKey = randomUUID();
    expect(updateTenantSettingsSchema.parse({ timezone: 'Europe/Paris', expectedVersion: 4, idempotencyKey }))
      .toEqual({ timezone: 'Europe/Paris', expectedVersion: 4, idempotencyKey });
  });
  it('rejects an empty command and unsafe versions', () => {
    for (const input of [{}, { name: 'Synthetic', expectedVersion: -1 }, { timezone: 'Europe/Paris', expectedVersion: 0.5 }])
      expect(updateTenantSettingsSchema.safeParse(input).success).toBe(false);
  });
  it('binds receipts to tenant, actor and actual omitted/explicit command fields', () => {
    const tenantId = randomUUID(), actorId = randomUUID();
    const input = updateTenantSettingsSchema.parse({ name: 'Synthetic' });
    const hash = settingsRequestHash(tenantId, actorId, input);
    expect(settingsRequestHash(tenantId, actorId, { ...input, expectedVersion: 4, idempotencyKey: randomUUID() })).toBe(hash);
    expect(settingsRequestHash(randomUUID(), actorId, input)).not.toBe(hash);
    expect(settingsRequestHash(tenantId, randomUUID(), input)).not.toBe(hash);
    expect(settingsRequestHash(tenantId, actorId, { ...input, timezone: 'America/La_Paz' })).not.toBe(hash);
  });
  it('defines only additive control metadata and forbids public privileges', () => {
    expect(tenantSettingsReconciliationSchemaSql).toContain('CREATE TABLE IF NOT EXISTS control.tenant_settings_updates');
    expect(tenantSettingsReconciliationSchemaSql).toContain("WHERE state IN ('PENDING','CONFLICT')");
    expect(tenantSettingsReconciliationSchemaSql).toContain('REVOKE ALL ON control.tenant_settings_updates FROM PUBLIC');
    expect(tenantSettingsReconciliationSchemaSql).not.toMatch(/(?:^|;)\s*(?:GRANT\b|UPDATE\b|INSERT\s+INTO\b|DELETE\s+FROM\b|CREATE\s+ROLE\b|ALTER\s+ROLE\b)/im);
  });
  it('registers the intent before tenant writes and keeps incomplete tenant receipts honest', () => {
    const source = readFileSync(new URL('../../services/tenant-service/src/settings-reconciliation.ts', import.meta.url), 'utf8');
    const enqueue = source.slice(source.indexOf('export async function enqueueSettingsUpdate'), source.indexOf('async function claimSettingsUpdate'));
    expect(enqueue).toContain("outcome: 'PENDING'"); expect(enqueue).not.toContain('UPDATE control.tenants');
    expect(source).toContain("reconciliationStatus: 'TENANT_APPLIED_CONTROL_PENDING'");
    expect(source).toContain("state='COMPLETED'"); expect(source).toContain('lease_token !== job.lease_token');
  });
  it('uses compatible permission/route with no pending202 or silent distributed commit claim', () => {
    const source = readFileSync(new URL('../../services/tenant-service/src/main.ts', import.meta.url), 'utf8');
    const method = source.slice(source.indexOf("@Patch('tenant/settings')"), source.indexOf("@Patch('global/tenants/:id/status')"));
    expect(method).toContain("requirePermission(user, 'tenant.settings.manage')");
    expect(method).toContain("reconciled?.state !== 'COMPLETED' || !state.settingsCoherent");
    expect(method).toContain('conflict ? 409 : 503'); expect(method).toContain('operationId: error.operationId');
    expect(method).not.toContain('withTransaction(controlPool'); expect(method).not.toContain('status(202)');
  });
});
