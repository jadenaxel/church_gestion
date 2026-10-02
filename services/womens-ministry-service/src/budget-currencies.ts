type ActivityBudget = { currency: string; plannedBudget: unknown; spentBudget: unknown; income: unknown };
export type CurrencyBudget = { currency: string; plannedBudget: number; spentBudget: number; income: number; availableBudget: number };

/** Amounts inherit the activity's currency; no exchange rate or state filtering is introduced. */
export function womenBudgetCurrencyTotals(activities: ActivityBudget[]): CurrencyBudget[] {
  const groups = new Map<string, CurrencyBudget>();
  for (const activity of activities) {
    const currency = activity.currency.toUpperCase();
    const group = groups.get(currency) ?? { currency, plannedBudget: 0, spentBudget: 0, income: 0, availableBudget: 0 };
    group.plannedBudget += Number(activity.plannedBudget);
    group.spentBudget += Number(activity.spentBudget);
    group.income += Number(activity.income);
    // Keep the established planned-minus-spent definition; income is reported separately.
    group.availableBudget = group.plannedBudget - group.spentBudget;
    groups.set(currency, group);
  }
  return [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
