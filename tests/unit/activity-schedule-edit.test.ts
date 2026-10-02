import { describe, expect, it } from 'vitest';
import { editedScheduleOptions, selectedScheduleOption } from '../../apps/web/components/activity-schedule-edit.js';

const session = { startsAt: '2027-01-01T18:00:00Z', endsAt: '2027-01-01T20:00:00Z', setupMinutes: 45, teardownMinutes: 30 };
const options = [
  { id: 'synthetic-a', label: 'First', preference: 1, is_selected: false, status: 'AVAILABLE', sessions: [{ ...session }] },
  { id: 'synthetic-b', label: 'Selected', preference: 2, is_selected: true, status: 'CONFIRMED', sessions: [{ ...session }, { ...session, startsAt: '2027-01-02T18:00:00Z', endsAt: '2027-01-02T20:00:00Z' }] },
  { id: 'synthetic-old', label: 'Historical', preference: 101, is_selected: false, status: 'RELEASED', sessions: [{ ...session }] }
];
describe('non-destructive schedule editing', () => {
  it('retains active alternatives, additional sessions and preparation time without changing the source', () => {
    const result = editedScheduleOptions(options, '2027-01-03T18:00:00Z', '2027-01-03T21:00:00Z');
    expect(result).toHaveLength(2);
    expect(result[0]?.label).toBe('Selected');
    expect(result[0]?.preference).toBe(1);
    expect(result[0]?.sessions[0]).toMatchObject({ setupMinutes: 45, teardownMinutes: 30, startsAt: '2027-01-03T18:00:00.000Z' });
    expect(result[0]?.sessions[1]).toEqual(options[1]?.sessions[1]);
    expect(result[1]?.sessions).toEqual(options[0]?.sessions);
    expect(options[1]?.sessions[0]).toEqual(session);
  });
  it('finds the effective selected option, ignoring released historical rows', () => {
    expect(selectedScheduleOption(options)?.id).toBe('synthetic-b');
    expect(selectedScheduleOption([{ ...options[2]!, is_selected: true }, { ...options[0]! }])?.id).toBe('synthetic-a');
  });
  it('rejects invalid intervals or oversized series without truncating a single occurrence', () => {
    expect(() => editedScheduleOptions(options, 'bad', 'bad')).toThrow();
    expect(() => editedScheduleOptions(options, '2027-01-03T18:00:00Z', '2027-01-03T17:00:00Z')).toThrow();
    expect(editedScheduleOptions([{ ...options[1]!, sessions: Array.from({ length: 30 }, () => ({ ...session })) }], session.startsAt, session.endsAt)[0]?.sessions).toHaveLength(30);
    expect(() => editedScheduleOptions([{ ...options[1]!, sessions: Array.from({ length: 2001 }, () => ({ ...session })) }], session.startsAt, session.endsAt)).toThrow('No se descartará ninguna sesión');
  });
});
