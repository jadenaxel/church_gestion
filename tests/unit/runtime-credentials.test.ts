import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveTenantRuntimeConnection } from '../../packages/database/src/runtime-credentials.js';

const folder = mkdtempSync(join(tmpdir(), 'gc-premium-credential-'));
const file = join(folder, 'synthetic.json'), caFile = join(folder, 'synthetic-ca.pem');
writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\nSynthetic test CA, not a usable certificate\n-----END CERTIFICATE-----');
const id = randomUUID(), otherId = randomUUID(), role = 'gc_calendar_service';
const tenant = { id, database_name: `gc_tenant_${id.replaceAll('-', '_')}` };
const entry = { tenantId: id, databaseName: tenant.database_name, serviceRole: role, username: `gcr_${id.replaceAll('-', '')}_calendar`, password: randomBytes(32).toString('hex'), host: 'database.synthetic.invalid', port: 5432, caFile };
const env = { NODE_ENV: 'production', GC_TENANT_CREDENTIALS_FILE: file };
afterAll(() => {
  if (dirname(folder) !== resolve(tmpdir()) || !folder.split(/[\\/]/).at(-1)?.startsWith('gc-premium-credential-')) throw new Error('Unsafe test cleanup');
  rmSync(folder, { recursive: true, force: true });
});
describe('runtime connection credentials are explicit and scoped', () => {
  it('refuses the shared development login in production', () => {
    expect(() => resolveTenantRuntimeConnection(tenant, role, { NODE_ENV: 'production', TENANT_DATABASE_USER: 'postgres' })).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
    expect(resolveTenantRuntimeConnection(tenant, role, { NODE_ENV: 'development' }).cacheIdentity).toBe('development-fallback');
  });
  it('resolves only its tenant and service with verified TLS and a unique login', () => {
    writeFileSync(file, JSON.stringify({ version: 1, tenants: [entry] }));
    const resolved = resolveTenantRuntimeConnection(tenant, role, env);
    expect(resolved.config.database).toBe(tenant.database_name);
    expect(resolved.config.user).toBe(entry.username);
    expect(resolved.config.connectionString).toBeUndefined();
    expect(resolved.config.ssl).toMatchObject({ rejectUnauthorized: true });
    expect(() => resolveTenantRuntimeConnection({ id: otherId, database_name: `gc_tenant_${otherId.replaceAll('-', '_')}` }, role, env)).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
    expect(() => resolveTenantRuntimeConnection(tenant, 'gc_file_service', env)).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
  });
  it('refuses reused or administrative logins, tenant-to-database substitution and another service in its secret file', () => {
    for (const tenants of [[{ ...entry, username: 'postgres' }], [entry, entry], [entry, { ...entry, serviceRole: 'gc_file_service', username: `gcr_${id.replaceAll('-', '')}_file` }], [{ ...entry, databaseName: `gc_tenant_${otherId.replaceAll('-', '_')}` }]]) {
      writeFileSync(file, JSON.stringify({ version: 1, tenants }));
      expect(() => resolveTenantRuntimeConnection(tenant, role, env)).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
    }
    expect(() => resolveTenantRuntimeConnection({ ...tenant, database_name: 'gestionchurch_control' }, role, env)).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
  });
  it('rotated credentials change the pool identity without disclosing the credential', () => {
    writeFileSync(file, JSON.stringify({ version: 1, tenants: [entry] }));
    const before = resolveTenantRuntimeConnection(tenant, role, env);
    writeFileSync(file, JSON.stringify({ version: 1, tenants: [{ ...entry, password: randomBytes(32).toString('hex') }] }));
    const after = resolveTenantRuntimeConnection(tenant, role, env);
    expect(after.cacheIdentity).not.toBe(before.cacheIdentity);
    expect(after.cacheIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(after.cacheIdentity).not.toContain(entry.password);
  });
  it('supports the tenant domain without accepting credentials for any other service', () => {
    const tenantRole = 'gc_tenant_service';
    const own = { ...entry, serviceRole: tenantRole, username: `gcr_${id.replaceAll('-', '')}_tenant` };
    writeFileSync(file, JSON.stringify({ version: 1, tenants: [own] }));
    const result = resolveTenantRuntimeConnection(tenant, tenantRole, env);
    expect(result.config.user).toBe(own.username);
    expect(result.config.database).toBe(tenant.database_name);
    expect(result.config.ssl).toMatchObject({ rejectUnauthorized: true });
    expect(() => resolveTenantRuntimeConnection(tenant, undefined, env)).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
    expect(() => resolveTenantRuntimeConnection(tenant, role, env)).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
    expect(() => resolveTenantRuntimeConnection({ id: otherId, database_name: `gc_tenant_${otherId.replaceAll('-', '_')}` }, tenantRole, env)).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
    for (const username of ['postgres', entry.username, `gcr_${otherId.replaceAll('-', '')}_tenant`]) {
      writeFileSync(file, JSON.stringify({ version: 1, tenants: [{ ...own, username }] }));
      expect(() => resolveTenantRuntimeConnection(tenant, tenantRole, env)).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
    }
    writeFileSync(file, JSON.stringify({ version: 1, tenants: [own, entry] }));
    expect(() => resolveTenantRuntimeConnection(tenant, tenantRole, env)).toThrow('TENANT_RUNTIME_CREDENTIALS_INVALID');
  });
});
