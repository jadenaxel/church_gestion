import { deflateRawSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { permissionsFor, type AuthPrincipal } from '../../packages/contracts/src/index.js';
import { assertRuntimeDatabaseSecurity, controlPool, getTenantPool, withTransaction } from '../../packages/database/src/index.js';
import type { Pool, PoolClient } from 'pg';
import { csrfOriginMiddleware, signAccessToken, verifyAccessToken } from '../../packages/platform/src/index.js';
import { activityReadPredicate, assertActivityRead, canReadActivityDetails, redactActivityConflict } from '../../packages/platform/src/activity-privacy.js';
import { assertSafeOfficeArchive, isProductionDemoPassword, LocalRateCounter, matchesSecret, officeMediaType, safeCalendarText, safeCsvCell, validateProductionSecurity } from '../../packages/platform/src/security.js';
import { assertUploadQuota, canWriteActivityAttachment } from '../../services/file-service/src/authorization.js';
import { isPublicNetworkAddress, resolveSmtpTarget } from '../../services/notification-service/src/outbound-security.js';

function zip(name = 'content.xml', contents = Buffer.from('safe'), declaredSize = contents.length): Buffer {
  const filename = Buffer.from(name);
  const compressed = deflateRawSync(contents);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(declaredSize, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(declaredSize, 24); central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(local.length + filename.length + compressed.length, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}

const director: AuthPrincipal = { sub: randomUUID(), email: 'security@example.com', name: 'Security fixture', roles: ['DEPARTMENT_LEADER'], permissions: permissionsFor(['DEPARTMENT_LEADER']), scope: 'tenant', tenantId: randomUUID(), tenantSlug: 'security-fixture', sessionId: randomUUID() };

describe('seguridad compartida', () => {
  it.each([
    { superuser: true }, { create_database: true }, { create_role: true }, { bypass_rls: true }, { tls: false },
    { service_roles: ['gc_calendar_service', 'gc_identity_service'] }, { service_roles: ['gc_identity_service'] }
  ])('bloquea una conexión administrativa, no cifrada o con facultades de otros servicios: %j', async (unsafe) => {
    const login = { superuser: false, create_database: false, create_role: false, bypass_rls: false, tls: true, service_roles: ['gc_calendar_service'], ...unsafe };
    const pool = { query: vi.fn().mockResolvedValue({ rows: [login] }) } as unknown as Pool;
    await expect(assertRuntimeDatabaseSecurity(pool, { NODE_ENV: 'production' }, 'gc_calendar_service')).rejects.toThrow(/Production runtime/);
  });
  it('permite la conexión mínima de producción y mantiene operativo el entorno local', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ superuser: false, create_database: false, create_role: false, bypass_rls: false, tls: true, service_roles: ['gc_calendar_service'] }] }) } as unknown as Pool;
    await expect(assertRuntimeDatabaseSecurity(pool, { NODE_ENV: 'production' }, 'gc_calendar_service')).resolves.toBeUndefined();
    await assertRuntimeDatabaseSecurity(pool, { NODE_ENV: 'production' }, 'gc_calendar_service');
    expect(pool.query).toHaveBeenCalledTimes(1);
    const local = { query: vi.fn() } as unknown as Pool;
    await assertRuntimeDatabaseSecurity(local, { NODE_ENV: 'development' });
    expect(local.query).not.toHaveBeenCalled();
  });
  it('absorbe desconexiones ociosas sin exponer credenciales ni terminar el servicio', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fixtureId = randomUUID();
    const pool = getTenantPool({ id: fixtureId, slug: 'security-fixture', name: 'Security', timezone: 'UTC', database_name: `gc_tenant_${fixtureId.replaceAll('-', '_')}`, status: 'ACTIVE' });
    try {
      const error = Object.assign(new Error('sensitive connection secret'), { code: '57P01' });
      expect(() => controlPool.emit('error', error)).not.toThrow();
      expect(() => pool.emit('error', error)).not.toThrow();
      expect(log).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive connection secret');
      expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({ code: '57P01', poolKind: 'control' });
    } finally { log.mockRestore(); await pool.end(); }
  });
  it('descarta conexiones rotas al fallar el rollback y preserva el error original', async () => {
    const original = new Error('operation failed');
    const client = Object.assign(new EventEmitter(), { query: vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('disconnect')), release: vi.fn() });
    const pool = { connect: vi.fn((callback: (error: Error | undefined, acquired: PoolClient) => void) => callback(undefined, client as unknown as PoolClient)) } as unknown as Pool;
    await expect(withTransaction(pool, async () => { throw original; })).rejects.toBe(original);
    expect(client.release).toHaveBeenCalledWith(true);
  });
  it('valida contexto y firma de las sesiones existentes', async () => {
    expect(await verifyAccessToken(await signAccessToken(director))).toEqual(director);
    await expect(verifyAccessToken(`${await signAccessToken(director)}tampered`)).rejects.toThrow();
    await expect(verifyAccessToken(await signAccessToken({ ...director, scope: 'global' }))).rejects.toThrow();
  });
  it.each([
    ['POST', 'gc_session=fixture', undefined, false],
    ['POST', 'other=x; gc_session=fixture', 'https://attacker.example', false],
    ['POST', undefined, 'https://attacker.example', false],
    ['POST', 'gc_session=fixture', 'null', false],
    ['POST', 'gc_session=fixture', 'http://localhost:3000', true],
    ['POST', undefined, undefined, true],
    ['GET', 'gc_session=fixture', undefined, true],
    ['OPTIONS', 'gc_session=fixture', 'https://attacker.example', true]
  ])('CSRF %s cookie=%s origin=%s', (method, cookie, origin, allowed) => {
    const next = vi.fn();
    const response = { status: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), json: vi.fn() };
    csrfOriginMiddleware({ method, headers: { cookie, origin }, originalUrl: '/api/v1/activities' } as unknown as Request, response as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (!allowed) expect(response.status).toHaveBeenCalledWith(403);
  });
  it('mantiene límites y no permite evicción de límites activos', () => {
    const rates = new LocalRateCounter(1);
    expect(rates.increment('a', 1000, 0)).toBe(1);
    expect(rates.increment('a', 1000, 10)).toBe(2);
    expect(rates.increment('b', 1000, 10)).toBe(Number.MAX_SAFE_INTEGER);
    expect(rates.increment('a', 1000, 20)).toBe(3);
    expect(rates.increment('b', 2000, 1001)).toBe(1);
  });
  it('rechaza secretos de desarrollo en producción', () => {
    expect(() => validateProductionSecurity({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => validateProductionSecurity({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(40), INTERNAL_SERVICE_SECRET: 'b'.repeat(40), WEB_ORIGIN: 'http://gestionchurch.com' })).toThrow(/HTTPS/);
    expect(() => validateProductionSecurity({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(40), INTERNAL_SERVICE_SECRET: 'b'.repeat(40), WEB_ORIGIN: 'https://gestionchurch.com' })).not.toThrow();
    expect(matchesSecret('valid', 'valid')).toBe(true);
    expect(matchesSecret('invalid', 'valid')).toBe(false);
    expect(matchesSecret(undefined, 'valid')).toBe(false);
    expect(() => validateProductionSecurity({ NODE_ENV: 'production', JWT_SECRET: 'replace-with-at-least-32-random-characters' })).toThrow();
    expect(isProductionDemoPassword('GestionChurch!2026', { NODE_ENV: 'production' })).toBe(true);
    expect(isProductionDemoPassword('GestionChurch!2026', { NODE_ENV: 'development' })).toBe(false);
    expect(isProductionDemoPassword('unique-secure-fixture', { NODE_ENV: 'production' })).toBe(false);
    const production = { NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(40), INTERNAL_SERVICE_SECRET: 'b'.repeat(40), WEB_ORIGIN: 'https://gestionchurch.com' };
    expect(() => validateProductionSecurity({ ...production, CONFIG_ENCRYPTION_KEY: 'local-only-encryption-placeholder-key-12345' })).toThrow();
    expect(() => validateProductionSecurity({ ...production, NOMINATIONS_INTEGRATION_SECRET: production.JWT_SECRET })).toThrow(/reuse/);
  });
});

describe('documentos, calendario y reportes', () => {
  it('serializa la cuota antes de consultar uso y bloquea el exceso sin publicar archivos', async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: '95' }] }) } as unknown as PoolClient;
    await expect(assertUploadQuota(client, 6, 100)).rejects.toMatchObject({ status: 413, code: 'TENANT_FILE_QUOTA_EXCEEDED' });
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock');
    const allowed = { query: vi.fn().mockResolvedValue({ rows: [{ total: '95' }] }) } as unknown as PoolClient;
    await expect(assertUploadQuota(allowed, 5, 100)).resolves.toBeUndefined();
    await expect(assertUploadQuota(allowed, 5, Number.NaN)).rejects.toThrow(/configuration/);
  });
  it('aplica visibilidad de liderazgo sin bloquear al propietario ni las actividades internas', () => {
    const viewer = { ...director, roles: ['VIEWER'] as const, permissions: permissionsFor(['VIEWER']) } as AuthPrincipal;
    const privateActivity = { visibility: 'LEADERSHIP', created_by: randomUUID() };
    expect(canReadActivityDetails(viewer, privateActivity)).toBe(false);
    expect(canReadActivityDetails(viewer, { ...privateActivity, created_by: viewer.sub })).toBe(true);
    expect(canReadActivityDetails(viewer, { ...privateActivity, visibility: 'INTERNAL' })).toBe(true);
    expect(canReadActivityDetails(director, privateActivity)).toBe(true);
    expect(activityReadPredicate(viewer)).toContain(viewer.sub);
    expect(activityReadPredicate(director)).toBe('TRUE');
  });
  it('rechaza cualquier contexto SQL de privacidad no validado', () => {
    expect(() => activityReadPredicate(director, 'a;DROP TABLE users')).toThrow();
    expect(() => activityReadPredicate({ ...director, sub: "'; SELECT 1;--" })).toThrow();
  });
  it('no distingue actividades privadas de recursos inexistentes', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) } as unknown as Pool;
    await expect(assertActivityRead(pool, director, randomUUID())).rejects.toMatchObject({ status: 404, code: 'ACTIVITY_NOT_FOUND' });
  });
  it('conserva el horario ocupado y la preferencia sin divulgar nombres ni identificadores privados', () => {
    const viewer = { ...director, roles: ['VIEWER'] } as AuthPrincipal;
    const conflict = { visibility: 'LEADERSHIP', created_by: randomUUID(), title: 'Private programme', activity_id: randomUUID(), submitted_by_name: 'Private person',
      starts_at: '2027-01-01T18:00:00Z', ends_at: '2027-01-01T19:00:00Z', submitted_at: '2026-09-01T10:00:00Z', same_venue: true };
    const hidden = redactActivityConflict(viewer, conflict);
    expect(hidden).toMatchObject({ title: 'Horario reservado', activity_id: '', submitted_by_name: '', starts_at: conflict.starts_at, submitted_at: conflict.submitted_at, same_venue: true });
    expect(JSON.stringify(hidden)).not.toContain('Private');
    expect(redactActivityConflict(director, conflict)).toMatchObject({ title: conflict.title });
    expect(redactActivityConflict(director, conflict)).not.toHaveProperty('created_by');
  });
  it('acepta ZIP acotado y rechaza paquetes falsos, traversal y tamaños mentirosos', () => {
    expect(() => assertSafeOfficeArchive(zip())).not.toThrow();
    expect(() => assertSafeOfficeArchive(zip(), '.xlsx')).toThrow();
    expect(() => assertSafeOfficeArchive(zip('../payload'))).toThrow();
    expect(() => assertSafeOfficeArchive(zip('/payload'))).toThrow();
    expect(() => assertSafeOfficeArchive(zip('content.xml', Buffer.alloc(200_000), 1))).toThrow();
    expect(() => assertSafeOfficeArchive(Buffer.from('PK\x03\x04'))).toThrow();
    expect(officeMediaType('.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
  it.each(['=HYPERLINK("https://attacker.example")', '+SUM(1)', '-1+2', '@SUM(1)', ' \t=1', '\r=1', '\ntext'])('neutraliza fórmula CSV %s', (value) => {
    expect(safeCsvCell(value).startsWith('"\'')).toBe(true);
  });
  it('mantiene texto normal y escapa todas las variantes de salto de línea ICS', () => {
    expect(safeCsvCell('Raul, "Perez"')).toBe('"Raul, ""Perez"""');
    expect(safeCalendarText('title\rBEGIN:VEVENT\r\nATTENDEE:evil\nend')).not.toMatch(/[\r\n]/);
  });
  it('restringe adjuntos por departamento, propietario y aprobación', () => {
    const draft = { status: 'DRAFT', created_by: director.sub };
    expect(canWriteActivityAttachment(director, draft, null)).toBe(false);
    expect(canWriteActivityAttachment(director, draft, 'VIEWER')).toBe(false);
    expect(canWriteActivityAttachment(director, draft, 'DIRECTOR')).toBe(true);
    expect(canWriteActivityAttachment(director, draft, 'PLANNER')).toBe(true);
    expect(canWriteActivityAttachment(director, draft, 'PLANNER', true)).toBe(true);
    expect(canWriteActivityAttachment(director, { ...draft, created_by: randomUUID() }, 'PLANNER')).toBe(false);
    expect(canWriteActivityAttachment(director, { ...draft, status: 'APPROVED' }, 'DIRECTOR')).toBe(false);
    const admin = { ...director, permissions: permissionsFor(['TENANT_ADMIN']) };
    expect(canWriteActivityAttachment(admin, { ...draft, status: 'APPROVED' }, null)).toBe(true);
    expect(canWriteActivityAttachment(admin, { ...draft, status: 'ARCHIVED' }, null)).toBe(false);
  });
});

describe('salida SMTP contra SSRF', () => {
  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '2001:db8::1'])('rechaza red privada/reservada %s', (address) => expect(isPublicNetworkAddress(address)).toBe(false));
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('permite dirección pública %s', (address) => expect(isPublicNetworkAddress(address)).toBe(true));
  it('permite SMTP privado solo por autorización del despliegue en producción', async () => {
    await expect(resolveSmtpTarget('127.0.0.1', { NODE_ENV: 'production' })).rejects.toThrow(/privada/);
    await expect(resolveSmtpTarget('127.0.0.1', { NODE_ENV: 'production', SMTP_PRIVATE_HOST_ALLOWLIST: '127.0.0.1' })).resolves.toBe('127.0.0.1');
    await expect(resolveSmtpTarget('127.0.0.1', { NODE_ENV: 'development' })).resolves.toBe('127.0.0.1');
  });
});
