import { describe, expect, it } from 'vitest';
import { nominationsRoleOptions } from '../../apps/web/components/nominations-role-options.js';
describe('explicit central Nombramientos assignments', () => {
  it('exposes two distinct assignments and never treats administration or legacy access as either', () => {
    expect(nominationsRoleOptions.map((option) => option.value)).toEqual(['NOMINATIONS_COMMISSION_MEMBER','NOMINATIONS_BALLOT_CUSTODIAN']);
    expect(nominationsRoleOptions.every((option) => option.description.includes('asignación explícita'))).toBe(true);
    expect(nominationsRoleOptions.some((option) => String(option.value) === 'TENANT_ADMIN' || String(option.value) === 'NOMINATIONS_USER')).toBe(false);
  });
});
