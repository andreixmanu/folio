import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, waitFor } from '@testing-library/react-native';

import { DEFAULT_BUDGETS } from '@/features/budget/model';
import { useBudgetStore } from '@/features/budget/store';

const KEY = 'folio-budget';

function resetBudgetState(): void {
  useBudgetStore.setState({
    userRules: [],
    categoryOverrides: {},
    overrideMerchants: {},
    budgets: DEFAULT_BUDGETS.map((budget) => ({ ...budget })),
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetBudgetState();
  await act(async () => {
    await useBudgetStore.persist.rehydrate();
  });
  resetBudgetState();
});

describe('budget store', () => {
  test('a single-transaction change does not create a merchant rule', () => {
    useBudgetStore.getState().setCategoryForTransaction('tx-1', 'health', {
      applyToMerchant: false,
      merchantKey: 'Esselunga',
    });

    const state = useBudgetStore.getState();
    expect(state.userRules).toEqual([]);
    expect(state.categoryOverrides).toEqual({ 'tx-1': 'health' });
    expect(state.overrideMerchants).toEqual({ 'tx-1': 'esselunga' });
  });

  test('applyToMerchant creates a rule and drops redundant overrides', () => {
    const store = useBudgetStore.getState();
    store.setCategoryForTransaction('tx-a', 'health', { applyToMerchant: false, merchantKey: 'Esselunga' });
    store.setCategoryForTransaction('tx-b', 'shopping', { applyToMerchant: false, merchantKey: 'esselunga' });
    store.setCategoryForTransaction('tx-c', 'leisure', { applyToMerchant: false, merchantKey: 'lidl' });

    useBudgetStore.getState().setCategoryForTransaction('tx-a', 'restaurants', {
      applyToMerchant: true,
      merchantKey: 'PAGAMENTO POS ESSELUNGA 123 MILANO',
    });

    const state = useBudgetStore.getState();
    expect(state.userRules).toHaveLength(1);
    expect(state.userRules[0]).toMatchObject({ merchantKey: 'esselunga', categoryId: 'restaurants' });
    expect(state.userRules[0]?.createdAt).toEqual(expect.any(String));
    expect(state.categoryOverrides).toEqual({ 'tx-c': 'leisure' });
    expect(state.overrideMerchants).toEqual({ 'tx-c': 'lidl' });

    useBudgetStore.getState().setCategoryForTransaction('tx-b', 'groceries', {
      applyToMerchant: true,
      merchantKey: 'esselunga',
    });
    const replaced = useBudgetStore.getState().userRules.filter((rule) => rule.merchantKey === 'esselunga');
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.categoryId).toBe('groceries');
  });

  test('applyToMerchant without a merchant key only stores the override', () => {
    useBudgetStore.getState().setCategoryForTransaction('tx-z', 'health', { applyToMerchant: true });
    expect(useBudgetStore.getState().userRules).toEqual([]);
    expect(useBudgetStore.getState().categoryOverrides).toEqual({ 'tx-z': 'health' });
  });

  test('removeRule and setBudgetLimit update the persisted caps', async () => {
    useBudgetStore.getState().setCategoryForTransaction('tx-1', 'leisure', {
      applyToMerchant: true,
      merchantKey: 'netflix',
    });
    const ruleId = useBudgetStore.getState().userRules[0]?.id ?? '';
    useBudgetStore.getState().removeRule(ruleId);
    expect(useBudgetStore.getState().userRules).toEqual([]);

    useBudgetStore.getState().setBudgetLimit('groceries', 123.456);
    useBudgetStore.getState().setBudgetLimit('income', -5);
    const groceries = useBudgetStore.getState().budgets.find((budget) => budget.categoryId === 'groceries');
    const income = useBudgetStore.getState().budgets.find((budget) => budget.categoryId === 'income');
    expect(groceries?.monthlyLimit).toBe(123.46);
    expect(income).toMatchObject({ monthlyLimit: 0, currency: 'EUR' });

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(KEY);
      expect(raw).toContain('123.46');
    });
  });

  test('removeBudget filters the category out of the persisted list', async () => {
    useBudgetStore.getState().removeBudget('groceries');
    const ids = useBudgetStore.getState().budgets.map((budget) => budget.categoryId);
    expect(ids).not.toContain('groceries');
    expect(ids).toContain('transport');

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed = JSON.parse(raw ?? '{}') as { state?: { budgets?: { categoryId: string }[] } };
      const stored = parsed.state?.budgets?.map((budget) => budget.categoryId) ?? [];
      expect(stored).not.toContain('groceries');
      expect(stored).toContain('transport');
    });
  });

  test('rehydrates rules, overrides, and budgets, and drops invalid rows', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          userRules: [
            { id: 'rule-1', merchantKey: 'PAYPAL *NETFLIX', categoryId: 'leisure', createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 'bad', merchantKey: 'x', categoryId: 'nope', createdAt: '2026-01-01T00:00:00.000Z' },
          ],
          categoryOverrides: { 'tx-1': 'health', 'tx-2': 'crypto' },
          overrideMerchants: { 'tx-1': 'Esselunga 12', 'tx-2': '***' },
          budgets: [
            { categoryId: 'shopping', monthlyLimit: 180.5, currency: 'EUR' },
            { categoryId: 'bogus', monthlyLimit: 10, currency: 'EUR' },
          ],
        },
        version: 0,
      }),
    );

    await act(async () => {
      await useBudgetStore.persist.rehydrate();
    });

    const state = useBudgetStore.getState();
    expect(state.userRules).toEqual([
      { id: 'rule-1', merchantKey: 'netflix', categoryId: 'leisure', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(state.categoryOverrides).toEqual({ 'tx-1': 'health' });
    expect(state.overrideMerchants).toEqual({ 'tx-1': 'esselunga' });
    expect(state.budgets).toEqual([{ categoryId: 'shopping', monthlyLimit: 180.5, currency: 'EUR' }]);
  });
});
