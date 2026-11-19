import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';

import { spendingByCategory } from '@/features/budget/analytics';
import { applyCategories } from '@/features/budget/categorize';
import { categoryFormSchema } from '@/features/budget/components/category-editor';
import {
  CATEGORY_BY_ID,
  DEFAULT_BUDGETS,
  isCategoryId,
  isCustomCategoryId,
  money,
  resolveCategory,
  type CustomCategoryId,
  type Transaction,
} from '@/features/budget/model';
import { newCustomCategoryId, useBudgetStore } from '@/features/budget/store';

const KEY = 'folio-budget';
const GIFT = { label: 'Regali', icon: 'Gift' as const, color: { dark: '#FF7AD9', light: '#C2449F' } };

function reset(): void {
  useBudgetStore.setState({
    userRules: [],
    categoryOverrides: {},
    overrideMerchants: {},
    budgets: DEFAULT_BUDGETS.map((budget) => ({ ...budget })),
    customCategories: [],
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  reset();
  await act(async () => {
    await useBudgetStore.persist.rehydrate();
  });
  reset();
});

function tx(partial: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction {
  return {
    accountId: 'acc-1',
    bookingDate: '2026-11-10',
    amount: money(-25),
    status: 'booked',
    creditorName: 'LIBRERIA FELTRINELLI',
    bankTransactionCode: 'CARD_PAYMENT',
    ...partial,
  };
}

describe('custom category ids', () => {
  test('ids are custom- slugs, unique and resolvable', () => {
    const id = newCustomCategoryId('Città & Viaggi!', new Set(), new Date(0));
    expect(id).toBe('custom-citta-viaggi-0');
    expect(newCustomCategoryId('Città & Viaggi!', new Set([id]), new Date(0))).toBe('custom-citta-viaggi-0-2');
    expect(isCustomCategoryId(id)).toBe(true);
    expect(isCategoryId(id)).toBe(true);
    expect(isCategoryId('custom-')).toBe(false);
    expect(isCategoryId('nope')).toBe(false);
    expect(resolveCategory('custom-gone' as CustomCategoryId, [])).toBe(CATEGORY_BY_ID.other);
  });
});

describe('custom categories in the store', () => {
  test('create, rename, recolour and change icon', () => {
    const id = useBudgetStore.getState().createCategory({ ...GIFT, label: '  Regali   di Natale ' });
    expect(id).toBeTruthy();
    if (!id) return;
    expect(useBudgetStore.getState().customCategories).toEqual([
      { id, label: 'Regali di Natale', icon: 'Gift', color: GIFT.color, custom: true },
    ]);

    useBudgetStore.getState().updateCategory(id, { label: 'Regali', icon: 'Heart', color: { dark: '#35C2FF', light: '#0B8EC4' } });
    expect(useBudgetStore.getState().customCategories[0]).toMatchObject({
      id,
      label: 'Regali',
      icon: 'Heart',
      color: { dark: '#35C2FF', light: '#0B8EC4' },
    });
    expect(useBudgetStore.getState().createCategory({ ...GIFT, label: '   ' })).toBeNull();
  });

  test('manual assignment and merchant rules use custom categories, overrides win', () => {
    const id = useBudgetStore.getState().createCategory(GIFT);
    if (!id) throw new Error('not created');
    const rows = [tx({ id: 'a' }), tx({ id: 'b', bookingDate: '2026-11-12' }), tx({ id: 'c', creditorName: 'ESSELUNGA' })];

    useBudgetStore.getState().setCategoryForTransaction('c', id, { applyToMerchant: false, merchantKey: 'ESSELUNGA' });
    let state = useBudgetStore.getState();
    let out = applyCategories(rows, state.userRules, state.categoryOverrides);
    expect(out.map((row) => row.categoryId)).toEqual(['other', 'other', id]);

    useBudgetStore.getState().setCategoryForTransaction('a', id, {
      applyToMerchant: true,
      merchantKey: out[0]?.merchantKey,
    });
    state = useBudgetStore.getState();
    out = applyCategories([...rows, tx({ id: 'future', bookingDate: '2026-12-01' })], state.userRules, state.categoryOverrides);
    expect(out.filter((row) => row.categoryId === id).map((row) => row.id)).toEqual(['a', 'b', 'c', 'future']);

    const spend = spendingByCategory(out, { from: '2026-11-01', to: '2026-11-30' });
    expect(spend.find((row) => row.categoryId === id)).toMatchObject({ total: 75, count: 3 });
  });

  test('deleting a category sends its movements back to auto and drops its rules and budget', () => {
    const id = useBudgetStore.getState().createCategory(GIFT);
    if (!id) throw new Error('not created');
    useBudgetStore.getState().setCategoryForTransaction('a', id, { applyToMerchant: false, merchantKey: 'X' });
    useBudgetStore.getState().setCategoryForTransaction('b', id, { applyToMerchant: true, merchantKey: 'Feltrinelli' });
    useBudgetStore.getState().setCategoryForTransaction('z', 'health', { applyToMerchant: false });
    useBudgetStore.getState().setBudgetLimit(id, 50);

    useBudgetStore.getState().deleteCategory(id);
    const state = useBudgetStore.getState();
    expect(state.customCategories).toEqual([]);
    expect(state.userRules).toEqual([]);
    expect(state.categoryOverrides).toEqual({ z: 'health' });
    expect(state.budgets.some((budget) => budget.categoryId === id)).toBe(false);
  });

  test('clearCategoryForTransaction returns one movement to auto', () => {
    useBudgetStore.getState().setCategoryForTransaction('a', 'health', { applyToMerchant: false, merchantKey: 'X' });
    useBudgetStore.getState().clearCategoryForTransaction('a');
    expect(useBudgetStore.getState().categoryOverrides).toEqual({});
    expect(useBudgetStore.getState().overrideMerchants).toEqual({});
  });

  test('persisted state is sanitised: bad customs dropped, dangling references removed', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          customCategories: [
            { id: 'custom-ok-1', label: 'Auto', icon: 'Car', color: { dark: '#35C2FF', light: '#0B8EC4' } },
            { id: 'custom-ok-1', label: 'Duplicate', icon: 'Car', color: { dark: '#35C2FF', light: '#0B8EC4' } },
            { id: 'groceries', label: 'Hijack', icon: 'Car', color: { dark: '#000000', light: '#000000' } },
            { id: 'custom-bad-icon', label: 'Casa 2', icon: 'NotAnIcon', color: { dark: 'red', light: 'blue' } },
            { id: 'custom-empty', label: '   ', icon: 'Car', color: { dark: '#35C2FF', light: '#0B8EC4' } },
          ],
          userRules: [
            { id: 'r1', merchantKey: 'feltrinelli', categoryId: 'custom-ok-1', createdAt: '2026-11-01T00:00:00Z' },
            { id: 'r2', merchantKey: 'ikea', categoryId: 'custom-deleted', createdAt: '2026-11-01T00:00:00Z' },
          ],
          categoryOverrides: { a: 'custom-ok-1', b: 'custom-deleted', c: 'health' },
          budgets: [
            { categoryId: 'custom-ok-1', monthlyLimit: 100, currency: 'EUR' },
            { categoryId: 'custom-deleted', monthlyLimit: 100, currency: 'EUR' },
          ],
        },
        version: 0,
      }),
    );
    await act(async () => {
      await useBudgetStore.persist.rehydrate();
    });
    const state = useBudgetStore.getState();
    expect(state.customCategories.map((category) => [category.id, category.label, category.icon])).toEqual([
      ['custom-ok-1', 'Auto', 'Car'],
      ['custom-bad-icon', 'Casa 2', 'Tag'],
    ]);
    expect(state.customCategories[1]?.color.dark).toMatch(/^#[0-9A-F]{6}$/i);
    expect(state.userRules.map((rule) => rule.id)).toEqual(['r1']);
    expect(state.categoryOverrides).toEqual({ a: 'custom-ok-1', c: 'health' });
    expect(state.budgets.map((budget) => budget.categoryId)).toEqual(['custom-ok-1']);
  });
});

describe('category form validation', () => {
  test('name is required, trimmed, limited and unique', () => {
    const schema = categoryFormSchema(['Alimentari', 'Regali']);
    expect(schema.safeParse({ label: '  Auto  ', icon: 'Car', colorIndex: 0 })).toMatchObject({
      success: true,
      data: { label: 'Auto' },
    });
    expect(schema.safeParse({ label: '   ', icon: 'Car', colorIndex: 0 }).success).toBe(false);
    expect(schema.safeParse({ label: 'regali', icon: 'Car', colorIndex: 0 }).success).toBe(false);
    expect(schema.safeParse({ label: 'Auto', icon: 'Nope', colorIndex: 0 }).success).toBe(false);
    expect(schema.safeParse({ label: 'Auto', icon: 'Car', colorIndex: 99 }).success).toBe(false);
  });
});
