export type OnTimeEvidence = { sampleSize:number; untimedCompleted:number };

/** A legacy percentage alone does not establish a temporally evidenced completion. */
export function timelinessDisplay(rate:number | undefined,evidence?:OnTimeEvidence) {
  const sampleSize = evidence && Number.isInteger(evidence.sampleSize) && evidence.sampleSize > 0 ? evidence.sampleSize : 0;
  const untimedCompleted = evidence && Number.isInteger(evidence.untimedCompleted) && evidence.untimedCompleted >= 0 ? evidence.untimedCompleted : 0;
  const value = sampleSize > 0 && typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 100 ? `${rate}%` : '—';
  return {value,sampleSize,untimedCompleted};
}
