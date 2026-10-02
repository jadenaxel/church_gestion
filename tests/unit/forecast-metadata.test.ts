import { describe, expect, it } from 'vitest';
import { heuristicForecastMetadata } from '../../packages/calendar-domain/src/index.js';

describe('honest compatible forecast metadata', () => {
  it.each([0, 1, 2])('marks a sample of %i as insufficient without inventing calibration', (sampleSize) => {
    const result = heuristicForecastMetadata(65, sampleSize, new Date('2030-01-01T00:00:00Z'));
    expect(result.score).toBe(65);
    expect(result.calibrated).toBe(false);
    expect(result.method).toBe('RULE_BASED_HEURISTIC');
    expect(result.evidenceLevel).toBe('INSUFFICIENT_HISTORY');
    expect(result.limitations).toContain('INSUFFICIENT_HISTORY');
    expect(result.computedAt).toBe('2030-01-01T00:00:00.000Z');
  });
  it('does not turn three historical records into medium confidence or calibrated probability', () => {
    const result = heuristicForecastMetadata(97, 3);
    expect(result.evidenceLevel).toBe('LIMITED_HISTORY');
    expect(result.limitations).toEqual(['NOT_CALIBRATED', 'NO_VALIDATED_ACCURACY', 'SMALL_RECENT_SAMPLE']);
    expect(result.sampleWindow.maxSize).toBe(3);
    expect(result).not.toHaveProperty('confidence');
    expect(result).not.toHaveProperty('probability');
  });
});
