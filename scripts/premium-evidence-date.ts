/** Keep the historical default stable; an explicit, strictly validated date
 * selects a new evidence directory without rewriting a frozen prior run. */
export function resolvePremiumEvidenceDate(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): string {
  let argumentDate: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    let value: string;
    if (argument === '--evidence-date') {
      value = args[++index] ?? '';
    } else if (argument.startsWith('--evidence-date=')) {
      value = argument.slice('--evidence-date='.length);
    } else {
      throw new Error('Unsupported evidence verifier argument.');
    }
    if (argumentDate !== undefined) throw new Error('Duplicate evidence date argument.');
    argumentDate = validDate(value);
  }
  const configured = environment.PREMIUM_EVIDENCE_DATE;
  const environmentDate = configured === undefined ? undefined : validDate(configured);
  if (argumentDate !== undefined && environmentDate !== undefined && argumentDate !== environmentDate) {
    throw new Error('Conflicting evidence date selections.');
  }
  return argumentDate ?? environmentDate ?? '2026-10-01';
}

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error('Evidence date must be a valid YYYY-MM-DD date.');
  const instant = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) {
    throw new Error('Evidence date must be a valid YYYY-MM-DD date.');
  }
  return value;
}
