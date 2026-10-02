import { describe, expect, it } from 'vitest';
import { completionTimingEvidence, reportMonthKey } from '../../services/reports-service/src/report-evidence.js';

describe('report evidence is not inferred from missing historical data', () => {
  it('marks a completed record without either timestamp as unknown, not punctual', () => {
    expect(completionTimingEvidence([
      { status: 'COMPLETED', ends_at: null, completed_at: null },
      { status: 'COMPLETED', ends_at: new Date('2030-01-01T00:00:00Z'), completed_at: null },
      { status: 'DRAFT', ends_at: null, completed_at: null },
    ])).toEqual({ onTimeRate: 0, onTimeEvidence: { sampleSize: 0, untimedCompleted: 2 } });
  });
  it('counts only observed completions and preserves the existing one-day tolerance', () => {
    expect(completionTimingEvidence([
      { status: 'COMPLETED', ends_at: new Date('2030-01-01T00:00:00Z'), completed_at: new Date('2030-01-02T00:00:00Z') },
      { status: 'COMPLETED', ends_at: new Date('2030-01-01T00:00:00Z'), completed_at: new Date('2030-01-02T00:00:01Z') },
      { status: 'COMPLETED', ends_at: null, completed_at: null },
    ])).toEqual({ onTimeRate: 50, onTimeEvidence: { sampleSize: 2, untimedCompleted: 1 } });
  });
  it('uses the tenant month instead of the server or UTC month at a timezone boundary', () => {
    expect(reportMonthKey(new Date('2030-02-01T02:00:00Z'), 'Pacific/Honolulu')).toBe('2030-01');
    expect(reportMonthKey(new Date('2030-02-01T02:00:00Z'), 'UTC')).toBe('2030-02');
  });
});
