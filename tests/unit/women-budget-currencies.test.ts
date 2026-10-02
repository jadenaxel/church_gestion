import { describe, expect, it } from 'vitest';
import { womenBudgetCurrencyTotals } from '../../services/womens-ministry-service/src/budget-currencies.js';

describe('Women budget groups preserve currency and legacy balance semantics', () => {
  it('never adds unlike currencies, normalizes groups and keeps income separate', () => {
    expect(womenBudgetCurrencyTotals([
      { currency: 'dop', plannedBudget: 100, spentBudget: 30, income: 10 },
      { currency: 'USD', plannedBudget: '20', spentBudget: '5', income: '4' },
      { currency: 'DOP', plannedBudget: 10, spentBudget: 2, income: 3 },
    ])).toEqual([
      { currency: 'DOP', plannedBudget: 110, spentBudget: 32, income: 13, availableBudget: 78 },
      { currency: 'USD', plannedBudget: 20, spentBudget: 5, income: 4, availableBudget: 15 },
    ]);
  });
  it('has no assumed currency for an empty dataset', () => { expect(womenBudgetCurrencyTotals([])).toEqual([]); });
});
