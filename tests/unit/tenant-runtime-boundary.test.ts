import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tenantServiceRuntimeGrantsSql, openTenantBootstrapPool } from '../../packages/database/src/migrations.js';

describe('tenant service runtime and fresh bootstrap boundaries', () => {
  it('exposes additive minimal grants without membership in another domain', () => {
    expect(tenantServiceRuntimeGrantsSql).toContain('CREATE ROLE gc_tenant_service NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
    expect(tenantServiceRuntimeGrantsSql).toContain('GRANT SELECT(id,email,name,roles,active) ON identity.users');
    expect(tenantServiceRuntimeGrantsSql).toContain('GRANT UPDATE(timezone,updated_at) ON calendar.tenant_calendar_settings');
    expect(tenantServiceRuntimeGrantsSql).toContain('GRANT SELECT,INSERT ON audit.audit_events');
    expect(tenantServiceRuntimeGrantsSql).not.toMatch(/identity\.credentials|password_hash|GRANT .*ALL TABLES|GRANT gc_\w+_service TO|UPDATE,DELETE|ALTER DEFAULT PRIVILEGES/);
  });
  it('refuses a bootstrap pool aimed at a substituted database or noncanonical UUID', () => {
    const id = randomUUID();
    const own = `gc_tenant_${id.replaceAll('-', '_')}`;
    expect(() => openTenantBootstrapPool('postgresql://postgres@127.0.0.1:55432/postgres', id, 'gestionchurch_control')).toThrow('identity mismatch');
    expect(() => openTenantBootstrapPool('postgresql://postgres@127.0.0.1:55432/postgres', 'invalid', own)).toThrow('identity mismatch');
  });
  it('creates a separate uncached bootstrap pool only for the exact returned database', async () => {
    const id = randomUUID(), own = `gc_tenant_${id.replaceAll('-', '_')}`;
    const pool = openTenantBootstrapPool('postgresql://postgres@127.0.0.1:55432/postgres', id, own);
    try {
      expect(new URL(pool.options.connectionString!).pathname).toBe(`/${own}`);
      expect(pool.options.application_name).toBe('gestionchurch-fresh-tenant-bootstrap');
      expect(pool.options.max).toBe(1);
      expect(pool.options.options).toBeUndefined();
    } finally { await pool.end(); }
  });
  it('keeps the explicit runtime role and fresh admin pool closure in the create handler', () => {
    const source = readFileSync(new URL('../../services/tenant-service/src/main.ts', import.meta.url), 'utf8');
    const create = source.slice(source.indexOf('  async create('), source.indexOf("  @Get('tenant/settings')"));
    expect(source).toContain("process.env.DATABASE_SERVICE_ROLE ??= 'gc_tenant_service'");
    expect(create).toContain('provisionTenantDatabase(adminUrl, id, { requireNew: true })');
    expect(create).toContain('openTenantBootstrapPool(adminUrl, id, provisionedDatabase)');
    expect(create).toContain('finally { await pool.end(); }');
    expect(create).not.toContain('getTenantPool(');
    expect(create).toContain("process.env.NODE_ENV === 'production' && !process.env.POSTGRES_ADMIN_URL");
  });
});
