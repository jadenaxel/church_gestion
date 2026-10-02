export type CoordinationEvidence = { sampleSize: number; level: 'INSUFFICIENT_HISTORY' | 'LIMITED_HISTORY'; calibrated: false; method: 'RULE_BASED_HEURISTIC' };

/** Legacy scores without evidence are not proof of a healthy operation. */
export function coordinationDisplay(score: number | undefined, evidence?: CoordinationEvidence) {
  const available = Boolean(evidence && evidence.level !== 'INSUFFICIENT_HISTORY' && evidence.sampleSize >= 3 && Number.isFinite(score));
  return { available, score: available ? score! : null, label: available ? 'Indicador heurístico de coordinación' : 'Evidencia insuficiente', note: 'Orientación basada en reglas, no una medición validada.' };
}
