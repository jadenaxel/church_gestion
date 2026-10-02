import { describe, expect, it } from 'vitest';
import { canTransition, deriveConflictSeverity, effectiveInterval, expandRecurrence, intervalsOverlap, retryDelayMs, suggestFreeIntervals } from '../../packages/calendar-domain/src/index.js';
import { permissionsFor } from '../../packages/contracts/src/index.js';
import { subjectForDomainEvent } from '../../packages/messaging/src/index.js';
import { escapeNotificationHtml, extractMetaStatuses, renderNotification, validProviderSignature } from '../../packages/notification-domain/src/index.js';
import { createHmac } from 'node:crypto';

describe('dominio de calendario', () => {
  it('usa intervalos [inicio, fin): límites contiguos no chocan', () => {
    const firstStart = new Date('2027-01-01T18:00:00Z');
    const firstEnd = new Date('2027-01-01T20:00:00Z');
    expect(intervalsOverlap(firstStart, firstEnd, firstEnd, new Date('2027-01-01T22:00:00Z'))).toBe(false);
    expect(intervalsOverlap(firstStart, firstEnd, new Date('2027-01-01T19:59:59Z'), new Date('2027-01-01T21:00:00Z'))).toBe(true);
  });

  it('incluye montaje y desmontaje en el rango efectivo', () => {
    const result = effectiveInterval(new Date('2027-01-01T18:00:00Z'), new Date('2027-01-01T20:00:00Z'), 30, 15);
    expect(result.start.toISOString()).toBe('2027-01-01T17:30:00.000Z');
    expect(result.end.toISOString()).toBe('2027-01-01T20:15:00.000Z');
  });

  it('impide transiciones de estado inválidas', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransition('APPROVED', 'DRAFT')).toBe(false);
    expect(canTransition('ARCHIVED', 'APPROVED')).toBe(false);
  });

  it('expande recurrencias con tope explícito', () => {
    const items = expandRecurrence(
      new Date('2027-01-01T18:00:00Z'), new Date('2027-01-01T20:00:00Z'),
      { frequency: 'WEEKLY', interval: 1, count: 3 }, new Date('2027-12-31T00:00:00Z')
    );
    expect(items).toHaveLength(3);
    expect(items[2]!.start.toISOString()).toBe('2027-01-15T18:00:00.000Z');
  });

  it('clasifica como crítico el choque de lugar o recurso', () => {
    expect(deriveConflictSeverity(['PROVISIONAL'])).toBe('WARNING');
    expect(deriveConflictSeverity(['CONFIRMED'])).toBe('HIGH');
    expect(deriveConflictSeverity(['RESOURCE'])).toBe('CRITICAL');
  });

  it('sugiere espacios libres sin alterar la duración', () => {
    const suggestions = suggestFreeIntervals(
      new Date('2027-01-01T18:00:00Z'), new Date('2027-01-01T20:00:00Z'),
      [{ start: new Date('2027-01-01T18:00:00Z'), end: new Date('2027-01-01T21:00:00Z') }],
      { stepMinutes: 30, limit: 2, businessStartHour: 6, businessEndHour: 23 }
    );
    expect(suggestions[0]!.start.toISOString()).toBe('2027-01-01T21:00:00.000Z');
    expect(suggestions[0]!.end.getTime() - suggestions[0]!.start.getTime()).toBe(2 * 3600_000);
  });

  it('aplica backoff exponencial acotado y reproducible', () => {
    expect(retryDelayMs(1, 0)).toBe(1000);
    expect(retryDelayMs(3, 17)).toBe(4017);
    expect(retryDelayMs(100, 0)).toBe(60000);
  });

  it('conserva actividades que cruzan medianoche y recurrencias en UTC', () => {
    const start = new Date('2027-03-27T23:30:00Z');
    const end = new Date('2027-03-28T01:00:00Z');
    const effective = effectiveInterval(start, end, 15, 30);
    expect(effective.start.toISOString()).toBe('2027-03-27T23:15:00.000Z');
    expect(effective.end.toISOString()).toBe('2027-03-28T01:30:00.000Z');
    const occurrences = expandRecurrence(start, end, { frequency: 'DAILY', interval: 1, count: 2 }, new Date('2027-04-01T00:00:00Z'));
    expect(occurrences[1]!.start.toISOString()).toBe('2027-03-28T23:30:00.000Z');
  });
});

describe('permisos y contratos', () => {
  it('reserva la decisión final de coexistencia al secretario', () => {
    expect(permissionsFor(['BOARD_SECRETARY'])).toContain('calendar.conflict.resolve');
    expect(permissionsFor(['TENANT_ADMIN'])).not.toContain('calendar.conflict.resolve');
    expect(permissionsFor(['REVIEWER'])).not.toContain('calendar.conflict.resolve');
    expect(permissionsFor(['DEPARTMENT_LEADER'])).not.toContain('users.manage');
  });

  it('separa la coordinación de turnos de ancianos de los conflictos departamentales', () => {
    expect(permissionsFor(['FIRST_ELDER'])).toContain('elders.manage');
    expect(permissionsFor(['ELDER'])).toContain('elders.program.manage');
    expect(permissionsFor(['ELDER'])).not.toContain('elders.manage');
    expect(permissionsFor(['BOARD_SECRETARY'])).toContain('elders.manage');
    expect(permissionsFor(['TENANT_ADMIN'])).toContain('elders.manage');
  });

  it('separa la biblioteca departamental de su revisión de alineación', () => {
    expect(permissionsFor(['DEPARTMENT_LEADER'])).toContain('documents.read');
    expect(permissionsFor(['DEPARTMENT_LEADER'])).not.toContain('documents.review');
    expect(permissionsFor(['TENANT_ADMIN'])).toEqual(expect.arrayContaining(['documents.read', 'documents.manage', 'documents.review']));
    expect(permissionsFor(['BOARD_SECRETARY'])).toEqual(expect.arrayContaining(['documents.read', 'documents.manage', 'documents.review']));
    expect(permissionsFor(['VIEWER'])).toContain('documents.read');
    expect(permissionsFor(['VIEWER'])).not.toContain('documents.manage');
  });

  it('asigna el Ministerio de la Mujer por rol sin abrir finanzas a planificación', () => {
    expect(permissionsFor(['TENANT_ADMIN'])).toEqual(expect.arrayContaining(['womens_ministry.read', 'womens_ministry.manage', 'womens_ministry.finance']));
    expect(permissionsFor(['DEPARTMENT_LEADER'])).toContain('womens_ministry.finance');
    expect(permissionsFor(['DEPARTMENT_PLANNER'])).toContain('womens_ministry.manage');
    expect(permissionsFor(['DEPARTMENT_PLANNER'])).not.toContain('womens_ministry.finance');
    expect(permissionsFor(['PASTOR'])).toContain('womens_ministry.read');
    expect(permissionsFor(['PASTOR'])).not.toContain('womens_ministry.manage');
  });

  it('renderiza plantillas españolas y escapa contenido HTML', () => {
    const rendered = renderNotification('activity.conflict_detected', { title: 'Culto joven', severity: 'CRITICAL' });
    expect(rendered.title).toBe('Conflicto de calendario');
    expect(rendered.body).toContain('Culto joven');
    expect(escapeNotificationHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('verifica firmas HMAC sin aceptar cuerpos alterados', () => {
    const secret = 'contrato-local';
    const raw = Buffer.from('{"id":"evt-1"}');
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    expect(validProviderSignature(raw, signature, secret)).toBe(true);
    expect(validProviderSignature(Buffer.from('{"id":"evt-2"}'), signature, secret)).toBe(false);
  });

  it('normaliza estados de entrega reportados por Meta', () => {
    const statuses = extractMetaStatuses({ entry: [{ changes: [{ value: { statuses: [
      { id: 'wamid.1', status: 'delivered' },
      { id: 'wamid.2', status: 'failed', errors: [{ title: 'Número inválido' }] }
    ] } }] }] });
    expect(statuses).toEqual([
      { providerMessageId: 'wamid.1', status: 'DELIVERED' },
      { providerMessageId: 'wamid.2', status: 'FAILED', error: 'Número inválido' }
    ]);
  });

  it('genera subjects NATS aislados y saneados por tenant', () => {
    expect(subjectForDomainEvent({ tenantId: 'tenant_123', type: 'activity.approved' })).toBe('gc.events.tenant_123.activity.approved');
    expect(subjectForDomainEvent({ tenantId: 'tenant.123', type: 'review decided' })).toBe('gc.events.tenant_123.review_decided');
  });
});
