import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolvePremiumEvidenceDate } from '../../scripts/premium-evidence-date.js';

describe('strict local evidence date selection', () => {
  it('preserves the historical default when no date was explicitly selected', () => {
    expect(resolvePremiumEvidenceDate([], {})).toBe('2026-10-01');
  });

  it.each([['--evidence-date', '2026-10-02'], ['--evidence-date=2026-10-02']])('selects a new CLI evidence date %j', (...args) => {
    expect(resolvePremiumEvidenceDate(args, {})).toBe('2026-10-02');
  });

  it('accepts a valid environment date and an identical explicit CLI selection', () => {
    expect(resolvePremiumEvidenceDate([], { PREMIUM_EVIDENCE_DATE: '2024-02-29' })).toBe('2024-02-29');
    expect(resolvePremiumEvidenceDate(['--evidence-date=2026-10-02'], { PREMIUM_EVIDENCE_DATE: '2026-10-02' })).toBe('2026-10-02');
  });

  it.each(['', '../2026-10-01', '2026/10/02', '2026-1-02', '2026-02-29', '2026-13-01', '2026-10-32', ' 2026-10-02', '2026-10-02/../../2026-10-01'])
    ('rejects malformed, impossible and path-traversal dates %j', (value) => {
      expect(() => resolvePremiumEvidenceDate(['--evidence-date', value], {})).toThrow();
      expect(() => resolvePremiumEvidenceDate([], { PREMIUM_EVIDENCE_DATE: value })).toThrow();
    });

  it('rejects missing, duplicate, unknown and conflicting arguments before database work', () => {
    for (const args of [ ['--evidence-date'], ['--apply'], ['2026-10-02'], ['--evidence-date', '2026-10-02', '--evidence-date=2026-10-02'] ]) {
      expect(() => resolvePremiumEvidenceDate(args, {})).toThrow();
    }
    expect(() => resolvePremiumEvidenceDate(['--evidence-date=2026-10-02'], { PREMIUM_EVIDENCE_DATE: '2026-10-01' })).toThrow();
  });

  it('wires validation before connections and cannot mutate databases or remove unknown resources', () => {
    const source = readFileSync(new URL('../../scripts/verify-premium-local-state.ts', import.meta.url), 'utf8');
    expect(source.indexOf('resolvePremiumEvidenceDate(process.argv.slice(2), process.env)')).toBeLessThan(source.indexOf('new Client('));
    expect(source).toContain("resolve('docs/premium-evidence', evidenceDate)");
    expect(source).toContain('default_transaction_read_only=on');
    expect(source).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(?:DATABASE|ROLE)|TRUNCATE\s+)\b/iu);
  });
});
