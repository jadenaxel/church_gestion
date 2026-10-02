import { describe, expect, it } from 'vitest';
import { frontendCapabilities, optionalItems } from '../../apps/web/components/frontend-capabilities.js';

describe('frontend authority and partial results', () => {
  it('does not infer create or review authority from a title, department or role', () => {
    const capabilities = frontendCapabilities({ roles: ['TENANT_ADMIN', 'PASTOR'], departmentApps: [{ key: 'elders' }], permissions: ['calendar.read'] });
    expect(capabilities.canCreateActivity).toBe(false);
    expect(capabilities.canReviewActivities).toBe(false);
    expect(capabilities.canReadCalendar).toBe(true);
    expect(capabilities.canReadElders).toBe(true);
  });
  it('combines effective permissions and multiple assigned modules without granting absent authority', () => {
    expect(frontendCapabilities({ permissions: ['calendar.create', 'calendar.review'], moduleAccess: ['worship-programs'] })).toMatchObject({ canCreateActivity: true, canReviewActivities: true, canReadElders: true, canManageDepartments: false });
    expect(frontendCapabilities(null).canCreateActivity).toBe(false);
  });
  it('distinguishes empty data, denied modules and unavailable data', () => {
    expect(optionalItems({ status: 'fulfilled', value: { items: [] } })).toEqual({ items: [], failed: false });
    expect(optionalItems({ status: 'rejected', reason: { status: 403 } })).toEqual({ items: [], failed: false });
    expect(optionalItems({ status: 'rejected', reason: { status: 500 } })).toEqual({ items: [], failed: true });
    expect(optionalItems({ status: 'rejected', reason: new Error('offline') }).failed).toBe(true);
  });
});
