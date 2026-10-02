export type ActivityStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'ARCHIVED';

const transitions: Record<ActivityStatus, ActivityStatus[]> = {
  DRAFT: ['SUBMITTED', 'UNDER_REVIEW', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED'],
  CHANGES_REQUESTED: ['SUBMITTED', 'UNDER_REVIEW', 'CANCELLED'],
  APPROVED: ['CANCELLED', 'COMPLETED'],
  REJECTED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: []
};

export function canTransition(from: ActivityStatus, to: ActivityStatus): boolean {
  return transitions[from].includes(to);
}

export function effectiveInterval(start: Date, end: Date, setupMinutes = 0, teardownMinutes = 0) {
  if (!(end > start)) throw new Error('INVALID_INTERVAL');
  if (setupMinutes < 0 || teardownMinutes < 0) throw new Error('INVALID_BUFFER');
  return {
    start: new Date(start.getTime() - setupMinutes * 60_000),
    end: new Date(end.getTime() + teardownMinutes * 60_000)
  };
}

export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type RecurrenceRule = {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  count?: number;
  until?: Date;
};

export function expandRecurrence(start: Date, end: Date, rule: RecurrenceRule, horizon: Date): Array<{ start: Date; end: Date }> {
  if (!(end > start) || rule.interval < 1) throw new Error('INVALID_RECURRENCE');
  const limit = Math.min(rule.count ?? 100, 100);
  const until = rule.until && rule.until < horizon ? rule.until : horizon;
  const duration = end.getTime() - start.getTime();
  const occurrences: Array<{ start: Date; end: Date }> = [];
  let current = new Date(start);
  for (let index = 0; index < limit && current <= until; index++) {
    occurrences.push({ start: new Date(current), end: new Date(current.getTime() + duration) });
    const next = new Date(current);
    if (rule.frequency === 'DAILY') next.setUTCDate(next.getUTCDate() + rule.interval);
    if (rule.frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7 * rule.interval);
    if (rule.frequency === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + rule.interval);
    if (next <= current) throw new Error('INVALID_RECURRENCE_PROGRESS');
    current = next;
  }
  return occurrences;
}

export type ConflictFactor = 'GENERAL' | 'VENUE' | 'RESOURCE' | 'RESPONSIBLE' | 'SCOPE' | 'PROVISIONAL' | 'CONFIRMED';

export function deriveConflictSeverity(factors: ConflictFactor[]): 'WARNING' | 'HIGH' | 'CRITICAL' {
  if (factors.includes('VENUE') || factors.includes('RESOURCE') || factors.includes('RESPONSIBLE')) return 'CRITICAL';
  if (factors.includes('CONFIRMED') || factors.includes('SCOPE')) return 'HIGH';
  return 'WARNING';
}

export function suggestFreeIntervals(
  desiredStart: Date,
  desiredEnd: Date,
  occupied: Array<{ start: Date; end: Date }>,
  options: { horizonDays?: number; stepMinutes?: number; limit?: number; businessStartHour?: number; businessEndHour?: number } = {}
): Array<{ start: Date; end: Date; explanation: string }> {
  if (!(desiredEnd > desiredStart)) throw new Error('INVALID_INTERVAL');
  const duration = desiredEnd.getTime() - desiredStart.getTime();
  const horizon = desiredStart.getTime() + (options.horizonDays ?? 60) * 86_400_000;
  const step = (options.stepMinutes ?? 30) * 60_000;
  const limit = options.limit ?? 5;
  const businessStart = options.businessStartHour ?? 6;
  const businessEnd = options.businessEndHour ?? 23;
  const suggestions: Array<{ start: Date; end: Date; explanation: string }> = [];
  for (let candidateMs = desiredStart.getTime() + step; candidateMs <= horizon && suggestions.length < limit; candidateMs += step) {
    const start = new Date(candidateMs);
    const end = new Date(candidateMs + duration);
    const sameDay = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth() && start.getUTCDate() === end.getUTCDate();
    if (sameDay && (start.getUTCHours() < businessStart || end.getUTCHours() > businessEnd)) continue;
    if (occupied.some((interval) => intervalsOverlap(start, end, interval.start, interval.end))) continue;
    suggestions.push({ start, end, explanation: 'Conserva la duración solicitada y no se solapa con reservas activas.' });
  }
  return suggestions;
}

export function retryDelayMs(attempt: number, seed = 0): number {
  const bounded = Math.max(1, Math.min(attempt, 8));
  const base = Math.min(60_000, 1_000 * 2 ** (bounded - 1));
  const jitter = Math.abs(seed % Math.max(1, Math.floor(base * 0.2)));
  return base + jitter;
}

/** Descriptive metadata for the existing rule-based signal; not a calibrated probability. */
export function heuristicForecastMetadata(score: number, sampleSize: number, computedAt = new Date()) {
  return {
    score,
    method: 'RULE_BASED_HEURISTIC' as const,
    calibrated: false as const,
    evidenceLevel: sampleSize < 3 ? 'INSUFFICIENT_HISTORY' as const : 'LIMITED_HISTORY' as const,
    computedAt: computedAt.toISOString(),
    sampleWindow: { kind: 'RECENT_MANAGED_ACTIVITIES' as const, maxSize: 3 },
    limitations: ['NOT_CALIBRATED', 'NO_VALIDATED_ACCURACY', 'SMALL_RECENT_SAMPLE', ...(sampleSize < 3 ? ['INSUFFICIENT_HISTORY'] : [])],
  };
}
