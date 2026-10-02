import { describe, expect, it } from 'vitest';
import { createActivitySchema, updateActivitySchema } from '@gc/contracts';

const session = { startsAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T13:00:00Z' };
const option = (count: number) => ({ label: 'Bounded option', preference: 1, sessions: Array.from({ length: count }, () => session) });
const edit = (count: number) => ({ expectedVersion: 1, changeReason: 'Synthetic preservation', options: [option(count)] });
describe('expanded activity editing bounds', () => {
  it('accepts up to the existing maximum expansion of 20 seeds times 100 occurrences', () => {
    expect(updateActivitySchema.safeParse(edit(30)).success).toBe(true);
    expect(updateActivitySchema.safeParse(edit(2000)).success).toBe(true);
  });
  it('rejects more than the bounded expanded schedule or more than five options', () => {
    expect(updateActivitySchema.safeParse(edit(2001)).success).toBe(false);
    expect(updateActivitySchema.safeParse({ ...edit(1), options: Array.from({ length: 6 }, () => option(1)) }).success).toBe(false);
  });
  it('does not expand the number of creation seeds', () => {
    const payload = { title: 'Synthetic creation', description: 'Creation seed limit stays bounded', departmentId: 'f14cc972-86ab-4670-aa9a-3b1000db7b67', responsibleName: 'Synthetic responsible', options: [option(21)] };
    expect(createActivitySchema.safeParse(payload).success).toBe(false);
    expect(createActivitySchema.safeParse({ ...payload, options: [option(20)] }).success).toBe(true);
  });
});
