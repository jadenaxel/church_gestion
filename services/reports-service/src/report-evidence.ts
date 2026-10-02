type CompletionTiming = { status: string; ends_at: Date | null; completed_at: Date | null };

/** Missing historical timestamps are unknown, never evidence of punctuality. */
export function completionTimingEvidence(rows: CompletionTiming[]) {
  const completed = rows.filter((row) => row.status === 'COMPLETED');
  const observed = completed.filter((row): row is CompletionTiming & { ends_at: Date; completed_at: Date } => row.ends_at !== null && row.completed_at !== null);
  // The existing one-day tolerance is retained; this does not change business states.
  const onTime = observed.filter((row) => row.completed_at.getTime() <= row.ends_at.getTime() + 86_400_000).length;
  return { onTimeRate: observed.length ? Math.round(onTime / observed.length * 100) : 0, onTimeEvidence: { sampleSize: observed.length, untimedCompleted: completed.length - observed.length } };
}

export function reportMonthKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}
