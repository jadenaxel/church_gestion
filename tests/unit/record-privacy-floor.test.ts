import { describe, expect, it } from 'vitest';
import { canReadMinistryRecord, departmentAccess, effectiveRecordVisibility } from '../../services/department-operations-service/src/authorization.js';
describe('effective historical ministry record privacy floor', () => {
  it.each([
    ['TEAM', 'LEADERSHIP', 'LEADERSHIP'], ['TEAM', 'RESTRICTED', 'RESTRICTED'], ['LEADERSHIP', 'RESTRICTED', 'RESTRICTED'],
    ['RESTRICTED', 'LEADERSHIP', 'RESTRICTED'], ['TEAM', 'TEAM', 'TEAM'],
  ] as const)('preserves or raises %s to its declared minimum %s', (stored, minimum, expected) => {
    expect(effectiveRecordVisibility(stored, minimum)).toBe(expected);
  });
  it('rejects a historical TEAM record for a viewer while allowing existing director authority', () => {
    const effective = effectiveRecordVisibility('TEAM', 'LEADERSHIP');
    expect(canReadMinistryRecord(departmentAccess({ roles: ['VIEWER'] }, 'VIEWER'), effective)).toBe(false);
    expect(canReadMinistryRecord(departmentAccess({ roles: ['DEPARTMENT_LEADER'] }, 'DIRECTOR'), effective)).toBe(true);
  });
});
