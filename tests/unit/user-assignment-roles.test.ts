import { describe, expect, it } from 'vitest';
import { creationAssignedRoles, mergeAssignedRoleChanges, toggleAssignedRole } from '../../apps/web/components/user-assignment-roles.js';
describe('safe multi-role account editing', () => {
  it('keeps every unrelated, department-derived and unknown role', () => {
    const existing = ['TENANT_ADMIN','DEPARTMENT_LEADER','NOMINATIONS_USER','FUTURE_ROLE'];
    expect(toggleAssignedRole(existing,'NOMINATIONS_BALLOT_CUSTODIAN',true)).toEqual([...existing,'NOMINATIONS_BALLOT_CUSTODIAN']);
    expect(toggleAssignedRole(existing,'NOMINATIONS_USER',false)).toEqual(['TENANT_ADMIN','DEPARTMENT_LEADER','FUTURE_ROLE']);
  });
  it('preserves concurrent additions and never re-grants a concurrently revoked untouched role', () => {
    const original = ['PASTOR','NOMINATIONS_USER'];
    const edited = [...original,'NOMINATIONS_BALLOT_CUSTODIAN'];
    expect(mergeAssignedRoleChanges(original,edited,['PASTOR','AUDITOR'])).toEqual(['PASTOR','AUDITOR','NOMINATIONS_BALLOT_CUSTODIAN']);
  });
  it('revokes exactly the checked assignment without modifying memberships or implicit admin authority', () => {
    expect(mergeAssignedRoleChanges(['TENANT_ADMIN','NOMINATIONS_BALLOT_CUSTODIAN'],['TENANT_ADMIN'],['TENANT_ADMIN','NOMINATIONS_BALLOT_CUSTODIAN','DEPARTMENT_PLANNER'])).toEqual(['TENANT_ADMIN','DEPARTMENT_PLANNER']);
    expect(creationAssignedRoles('TENANT_ADMIN',[])).toEqual(['TENANT_ADMIN']);
    expect(creationAssignedRoles('DEPARTMENT',['NOMINATIONS_COMMISSION_MEMBER','NOMINATIONS_COMMISSION_MEMBER'])).toEqual(['VIEWER','NOMINATIONS_COMMISSION_MEMBER']);
  });
});
