import { describe, expect, it } from 'vitest';
import { coordinationDisplay } from '../../apps/web/components/coordination-evidence.js';
describe('honest coordination evidence', () => {
  it('does not display a perfect legacy score without evidence or for drafts only', () => {
    expect(coordinationDisplay(100).score).toBeNull();
    expect(coordinationDisplay(100, {sampleSize: 0, level: 'INSUFFICIENT_HISTORY', calibrated: false, method:'RULE_BASED_HEURISTIC'}).score).toBeNull();
  });
  it('calls sufficient samples a heuristic, never calibrated certainty', () => {
    const display = coordinationDisplay(80, {sampleSize: 3, level:'LIMITED_HISTORY', calibrated:false, method:'RULE_BASED_HEURISTIC'});
    expect(display.score).toBe(80); expect(display.label).toContain('heurístico'); expect(display.note).toContain('no una medición validada');
  });
});
