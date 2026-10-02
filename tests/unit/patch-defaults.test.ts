import { describe, expect, it } from 'vitest';
import { createActivitySchema, updateActivitySchema } from '../../packages/contracts/src/index.js';

describe('activity PATCH never applies creation defaults to omitted fields', () => {
  it('parses a title-only change without implied resets or resource edits', () => {
    expect(updateActivitySchema.parse({ title: 'Synthetic edited title', expectedVersion: 1, changeReason: 'Synthetic reason' }))
      .toEqual({ title: 'Synthetic edited title', expectedVersion: 1, changeReason: 'Synthetic reason' });
  });
  it('keeps explicit empty, zero and false custom values so intended clears persist', () => {
    const patch = { objective: '', tags: [], resourceIds: [], collaboratorDepartmentIds: [], internalNotes: '', estimatedAttendance: 0,
      customData: { confirmed: false, amount: 0, comment: '' }, expectedVersion: 2, changeReason: 'Synthetic intentional clear' };
    expect(updateActivitySchema.parse(patch)).toEqual(patch);
  });
  it('retains creation defaults only when creating a new activity', () => {
    const created = createActivitySchema.parse({ title: 'Synthetic title', description: 'Synthetic description', responsibleName: 'Synthetic owner',
      departmentId: 'f3d28965-9559-4594-b7d6-b6b672512ac2',
      options: [{ label: 'Primary', preference: 1, sessions: [{ startsAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T13:00:00Z' }] }] });
    expect(created).toMatchObject({ objective: '', tags: [], customData: {}, modality: 'PRESENTIAL', visibility: 'INTERNAL', resourceIds: [], timezone: 'America/La_Paz' });
  });
  it('does not relax existing value, version or schedule validation', () => {
    for (const invalid of [{ expectedVersion: 0 }, { estimatedAttendance: -1 }, { visibility: 'UNKNOWN' }, { options: [] }, { customData: { amount: Infinity } }]) {
      expect(updateActivitySchema.safeParse({ expectedVersion: 1, changeReason: 'Synthetic reason', ...invalid }).success).toBe(false);
    }
  });
});
