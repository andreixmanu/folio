import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';

import BudgetsScreen from '@/app/(budget)/budgets';
import { budgetProgress } from '@/features/budget/analytics';
import { applyCategories } from '@/features/budget/categorize';
import { createMockBudgetData } from '@/features/budget/mock-data';
import {
  budgetSummary,
  budgetTone,
  CADENCE_LABEL,
  formatBudgetMoney,
  overLabel,
  recurringMonthlyTotal,
  sortByRatio,
  type BudgetProgressItem,
  type BudgetStateName,
} from '@/features/budget/budgets-view';
import { detectRecurring } from '@/features/budget/recurring';
import {
  CATEGORIES,
  DEFAULT_BUDGETS,
  fromCents,
  toCents,
  type CategoryId,
  type RecurringPayment,
  type Transaction,
} from '@/features/budget/model';
import { useBudgetStore } from '@/features/budget/store';
import { useUiStore } from '@/store/ui-store';

import { renderWithProviders } from '../test/test-utils';

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('@/features/budget/data-source', () => {
  const actual = jest.requireActual<typeof import('@/features/budget/data-source')>(
    '@/features/budget/data-source',
  );
  return {
    ...actual,
    budgetSource: actual.createMockBudgetSource(() => new Date(), 0),
  };
});

function emptyBudgetState() {
  return {
    userRules: [],
    categoryOverrides: {},
    overrideMerchants: {},
    budgets: DEFAULT_BUDGETS.map((budget) => ({ ...budget })),
  };
}

function loadedTransactions(now: Date): Transaction[] {
  const stripped = createMockBudgetData(now).transactions.map((tx) => ({
    id: tx.id,
    accountId: tx.accountId,
    bookingDate: tx.bookingDate,
    ...(tx.valueDate ? { valueDate: tx.valueDate } : {}),
    amount: { ...tx.amount },
    status: tx.status,
    ...(tx.creditorName ? { creditorName: tx.creditorName } : {}),
    ...(tx.debtorName ? { debtorName: tx.debtorName } : {}),
    ...(tx.remittanceInformation ? { remittanceInformation: tx.remittanceInformation } : {}),
    ...(tx.merchantCategoryCode ? { merchantCategoryCode: tx.merchantCategoryCode } : {}),
    ...(tx.bankTransactionCode ? { bankTransactionCode: tx.bankTransactionCode } : {}),
  }));
  return applyCategories(stripped, [], {});
}

function progressItem(
  spent: number,
  limit: number,
  state: BudgetStateName,
  categoryId: CategoryId = 'groceries',
): BudgetProgressItem {
  return {
    categoryId,
    spent,
    limit,
    ratio: limit === 0 ? (spent > 0 ? Number.POSITIVE_INFINITY : 0) : spent / limit,
    state,
  };
}

function payment(
  partial: Pick<RecurringPayment, 'cadence' | 'averageAmount' | 'isSubscription' | 'merchantKey'>,
): RecurringPayment {
  return {
    displayName: partial.merchantKey,
    categoryId: 'subscriptions',
    lastDate: '2026-11-01',
    nextDate: '2026-12-01',
    occurrences: 3,
    accountId: 'acc-1',
    ...partial,
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

afterEach(async () => {
  await settle();
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useBudgetStore.setState(emptyBudgetState());
  await act(async () => {
    await useBudgetStore.persist.rehydrate();
  });
  useBudgetStore.setState(emptyBudgetState());
  useUiStore.setState({ hideBalances: false });
});

describe('budget view math', () => {
  const midMonth = new Date('2026-11-16T12:00:00.000Z');
  const monthEnd = new Date('2026-11-30T12:00:00.000Z');

  test('summarises the month, including a negative remainder and the last day', () => {
    const negative = budgetSummary(
      [
        progressItem(150, 100, 'over', 'groceries'),
        progressItem(10, 40, 'ok', 'transport'),
      ],
      midMonth,
    );
    expect(negative.limit).toBe(140);
    expect(negative.spent).toBe(160);
    expect(negative.left).toBe(-20);
    expect(negative.daysLeft).toBe(15);
    expect(negative.dailyAvailable).toBe(0);

    const open = budgetSummary([progressItem(40, 100, 'ok')], midMonth);
    expect(open.left).toBe(60);
    expect(open.dailyAvailable).toBe(60 / 15);

    const end = budgetSummary([progressItem(50, 10, 'over')], monthEnd);
    expect(end.daysLeft).toBe(1);
    expect(end.left).toBe(-40);
    expect(end.dailyAvailable).toBe(0);
  });

  test('sorts by ratio descending and breaks ties by category id', () => {
    const sorted = sortByRatio([
      progressItem(5, 10, 'ok', 'transport'),
      progressItem(9, 10, 'warning', 'shopping'),
      progressItem(5, 10, 'ok', 'groceries'),
    ]);
    expect(sorted.map((row) => row.categoryId)).toEqual(['shopping', 'groceries', 'transport']);
  });

  test('maps tone and the over label at 79, 80, 100 and 101 percent', () => {
    expect(budgetTone('ok')).toBe('accent');
    expect(budgetTone('warning')).toBe('warning');
    expect(budgetTone('over')).toBe('negative');

    const label = (value: string) => value.replace(/\u00a0|\u202f/g, ' ');
    expect(overLabel(progressItem(79, 100, 'ok'))).toBe(`Restano ${formatBudgetMoney(21)}`);
    expect(overLabel(progressItem(80, 100, 'warning'))).toBe(`Restano ${formatBudgetMoney(20)}`);
    expect(overLabel(progressItem(100, 100, 'warning'))).toBe(`Restano ${formatBudgetMoney(0)}`);
    expect(overLabel(progressItem(101, 100, 'over'))).toBe(`Superato di ${formatBudgetMoney(1)}`);
    expect(label(overLabel(progressItem(123, 100, 'over')))).toBe('Superato di 23 €');
    expect(label(overLabel(progressItem(60, 100, 'ok')))).toBe('Restano 40 €');
  });

  test('normalises subscription cadences to a monthly total', () => {
    expect(CADENCE_LABEL).toEqual({
      weekly: 'Settimanale',
      monthly: 'Mensile',
      quarterly: 'Trimestrale',
      yearly: 'Annuale',
    });
    const total = recurringMonthlyTotal([
      payment({ merchantKey: 'w', cadence: 'weekly', averageAmount: 10, isSubscription: true }),
      payment({ merchantKey: 'm', cadence: 'monthly', averageAmount: 10, isSubscription: true }),
      payment({ merchantKey: 'q', cadence: 'quarterly', averageAmount: 30, isSubscription: true }),
      payment({ merchantKey: 'y', cadence: 'yearly', averageAmount: 120, isSubscription: true }),
      payment({ merchantKey: 'n', cadence: 'monthly', averageAmount: 999, isSubscription: false }),
    ]);
    expect(total).toBe(Math.round((10 * (52 / 12) + 10 + 10 + 10) * 100) / 100);
  });
});

describe('budgets screen', () => {
  test('renders category rows sorted by ratio', async () => {
    const now = new Date();
    const expected = sortByRatio(budgetProgress(useBudgetStore.getState().budgets, loadedTransactions(now), now));
    const view = await renderWithProviders(<BudgetsScreen />);
    await screen.findByTestId('budget-summary');

    const rendered = screen.getAllByTestId(/^budget-row-/);
    expect(rendered.map((node) => node.props.testID)).toEqual(
      expected.map((row) => `budget-row-${row.categoryId}`),
    );
    expect(screen.getByTestId('budget-daily')).toBeTruthy();
    await view.unmount();
  });

  test('shows an over-budget row with the negative bar', async () => {
    const now = new Date();
    useBudgetStore.setState({
      budgets: DEFAULT_BUDGETS.map((budget) => ({ ...budget, monthlyLimit: 1 })),
    });
    const over = budgetProgress(useBudgetStore.getState().budgets, loadedTransactions(now), now).find(
      (row) => row.state === 'over',
    );
    expect(over).toBeDefined();
    if (!over) return;

    const view = await renderWithProviders(<BudgetsScreen />);
    await screen.findByTestId('budget-summary');
    expect(screen.getAllByText(/Superato di/).length).toBeGreaterThan(0);
    expect(screen.getByTestId(`budget-bar-${over.categoryId}-negative`)).toBeTruthy();
    await view.unmount();
  });

  test('shows the warning bar at the warning threshold', async () => {
    const now = new Date();
    const sample = budgetProgress([...DEFAULT_BUDGETS], loadedTransactions(now), now).find((row) => row.spent > 0);
    expect(sample).toBeDefined();
    if (!sample) return;
    const limit = fromCents(toCents(sample.spent));
    useBudgetStore.setState({
      budgets: [{ categoryId: sample.categoryId, monthlyLimit: limit, currency: 'EUR' }],
    });
    expect(budgetProgress(useBudgetStore.getState().budgets, loadedTransactions(now), now)[0]?.state).toBe('warning');

    const view = await renderWithProviders(<BudgetsScreen />);
    await screen.findByTestId('budget-summary');
    expect(screen.getByTestId(`budget-bar-${sample.categoryId}-warning`)).toBeTruthy();
    await view.unmount();
  });

  test('saves a new limit from the sheet and updates the row', async () => {
    const view = await renderWithProviders(<BudgetsScreen />);
    await screen.findByTestId('budget-summary');
    const row = screen.getAllByTestId(/^budget-row-/)[0];
    const categoryId = String(row?.props.testID ?? '').replace('budget-row-', '') as CategoryId;
    expect(categoryId).not.toBe('');

    await fireEvent.press(screen.getByTestId(`budget-row-${categoryId}`));
    await fireEvent.changeText(screen.getByTestId('limit-input'), '180,50');
    await fireEvent.press(screen.getByTestId('limit-save'));

    expect(useBudgetStore.getState().budgets.find((budget) => budget.categoryId === categoryId)?.monthlyLimit).toBe(
      180.5,
    );
    expect(screen.getByTestId(`budget-row-${categoryId}`)).toHaveTextContent(/180,50/);
    await view.unmount();
  });

  test('removes a budget from the sheet', async () => {
    const view = await renderWithProviders(<BudgetsScreen />);
    await screen.findByTestId('budget-summary');
    const row = screen.getAllByTestId(/^budget-row-/)[0];
    const categoryId = String(row?.props.testID ?? '').replace('budget-row-', '') as CategoryId;

    await fireEvent.press(screen.getByTestId(`budget-row-${categoryId}`));
    await fireEvent.press(screen.getByTestId('limit-remove'));

    expect(useBudgetStore.getState().budgets.some((budget) => budget.categoryId === categoryId)).toBe(false);
    expect(screen.queryByTestId(`budget-row-${categoryId}`)).toBeNull();
    await view.unmount();
  });

  test('adds a budget for a category that does not have one', async () => {
    const missing = CATEGORIES.find(
      (category) => !useBudgetStore.getState().budgets.some((budget) => budget.categoryId === category.id),
    );
    expect(missing).toBeDefined();
    if (!missing) return;

    const view = await renderWithProviders(<BudgetsScreen />);
    await screen.findByTestId('budget-add');
    await fireEvent.press(screen.getByTestId('budget-add'));
    await fireEvent.press(screen.getByTestId(`limit-cat-${missing.id}`));
    await fireEvent.changeText(screen.getByTestId('limit-input'), '90');
    await fireEvent.press(screen.getByTestId('limit-save'));

    expect(useBudgetStore.getState().budgets.find((budget) => budget.categoryId === missing.id)?.monthlyLimit).toBe(90);
    expect(screen.getByTestId(`budget-row-${missing.id}`)).toBeTruthy();
    await view.unmount();
  });

  test('shows subscription badges and the monthly total', async () => {
    const now = new Date();
    const recurring = detectRecurring(loadedTransactions(now), now);
    const subscriptions = recurring.filter((item) => item.isSubscription);
    expect(subscriptions.length).toBeGreaterThan(0);
    const total = formatBudgetMoney(recurringMonthlyTotal(recurring));

    const view = await renderWithProviders(<BudgetsScreen />);
    await screen.findByTestId('budget-recurring');
    expect(screen.getAllByText('Abbonamento').length).toBe(subscriptions.length);
    expect(screen.getByTestId('recurring-total')).toHaveTextContent(`~${total}/mese`);
    expect(screen.getByTestId(`recurring-${subscriptions[0]?.merchantKey}`)).toHaveTextContent(/prossimo/);
    await view.unmount();
  });
});
