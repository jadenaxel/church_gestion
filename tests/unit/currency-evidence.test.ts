import {describe,expect,it,vi} from 'vitest';
import {groupedBudgetText} from '../../apps/web/components/currency-evidence.js';
describe('currency-specific budget presentation', () => {
  it('never adds unlike currencies or assumes DOP for an unattributed legacy aggregate', () => {
    const format = vi.fn((value:number,currency:string) => `${currency} ${value}`);
    const groups = [{currency:'DOP',plannedBudget:50,spentBudget:10,availableBudget:40},{currency:'USD',plannedBudget:20,spentBudget:5,availableBudget:15}];
    expect(groupedBudgetText(groups,'spentBudget',format)).toBe('DOP 10 · USD 5');
    expect(format).toHaveBeenCalledTimes(2); expect(groupedBudgetText(undefined,'spentBudget',format)).toBe('—');
    expect(groupedBudgetText([],'spentBudget',format)).toBe('—');
  });
});
