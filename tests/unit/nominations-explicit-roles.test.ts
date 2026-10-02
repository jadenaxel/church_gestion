import { describe, expect, it } from 'vitest';
import { permissionsFor, roles } from '../../packages/contracts/src/index.js';

describe('explicit tenant nominations assignments in central identity contract', () => {
  it.each(['NOMINATIONS_COMMISSION_MEMBER', 'NOMINATIONS_BALLOT_CUSTODIAN'] as const)('registers %s without widening church governance permissions', (role) => {
    expect(roles).toContain(role);
    expect(permissionsFor([role])).toEqual(['dashboard.read', 'nominations.access']);
    expect(permissionsFor([role])).not.toContain('users.manage');
    expect(permissionsFor([role])).not.toContain('calendar.conflict.resolve');
  });
  it('keeps the historical commission role and does not add new assignments automatically', () => {
    expect(permissionsFor(['TENANT_ADMIN'])).toContain('nominations.access');
    expect(permissionsFor(['NOMINATIONS_USER'])).toContain('nominations.access');
    // NOMINATIONS_USER remains Nom's explicit historical commission alias;
    // access alone does not confer custody or add a new central assignment.
    expect(['TENANT_ADMIN', 'BOARD_SECRETARY', 'NOMINATIONS_USER']).not.toContain('NOMINATIONS_COMMISSION_MEMBER');
    expect(['TENANT_ADMIN', 'BOARD_SECRETARY', 'NOMINATIONS_USER']).not.toContain('NOMINATIONS_BALLOT_CUSTODIAN');
  });
});
