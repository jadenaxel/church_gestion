export type CurrencyBudget = {currency:string; plannedBudget:number; spentBudget:number; availableBudget:number};

/** Currency groups are kept separate; a legacy aggregate has no attributable currency. */
export function groupedBudgetText(groups:CurrencyBudget[] | undefined,property:'plannedBudget'|'spentBudget'|'availableBudget',format:(value:number,currency:string)=>string) {
  return groups?.length ? groups.map(group => format(group[property],group.currency)).join(' · ') : '—';
}
