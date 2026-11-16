import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import AnalyticsScreen from '@/app/(budget)/analytics';
import CategoryDetailScreen from '@/app/category/[id]';
import {
  categoryBreakdown,
  merchantsForCategory,
  periodComparison,
  periodRange,
  previousRange,
  totalSpent,
  transactionsForCategory,
  type BudgetPeriod,
} from '@/features/budget/analytics';
import { applyCategories } from '@/features/budget/categorize';
import { createMockBudgetData } from '@/features/budget/mock-data';
import { DEFAULT_BUDGETS, sumAmounts, type Transaction } from '@/features/budget/model';
import { useBudgetStore } from '@/features/budget/store';
import { formatMoney } from '@/lib/format';
import { useUiStore } from '@/store/ui-store';

import { renderWithProviders } from '../test/test-utils';

const mockSearchParams: { id?: string; period?: string; category?: string } = {};

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('expo-router', () => ({
  router: {
    navigate: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
  },
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: jest.fn(),
}));

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

function movement(partial: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction {
  return {
    accountId: 'acc-1',
    bookingDate: '2026-11-16',
    amount: { amount: -10, currency: 'EUR' },
    status: 'booked',
    ...partial,
  };
}

function movementsLabel(count: number): string {
  return `${count} ${count === 1 ? 'movimento' : 'movimenti'}`;
}

/** Same shape the query returns: raw fields, then client categories. */
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

function spentLabel(period: BudgetPeriod, now: Date): string {
  return formatMoney(totalSpent(loadedTransactions(now), periodRange(period, now)));
}

/** Let list and query timers finish inside `act` before the next screen mounts. */
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
  mockSearchParams.id = undefined;
  mockSearchParams.period = undefined;
  mockSearchParams.category = undefined;
  jest.mocked(router.navigate).mockClear();
  jest.mocked(router.push).mockClear();
  jest.mocked(router.back).mockClear();
  jest.mocked(router.canGoBack).mockReset();
  jest.mocked(router.canGoBack).mockReturnValue(false);
});

describe('budget period analytics', () => {
  test('previousRange is the equal window immediately before', () => {
    expect(previousRange({ from: '2026-11-01', to: '2026-11-30' })).toEqual({
      from: '2026-10-02',
      to: '2026-10-31',
    });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-01' })).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });

  test('periodComparison measures spend against the previous window', () => {
    const now = new Date('2026-11-16T12:00:00+01:00');
    const current = periodRange('1M', now);
    const prior = previousRange(current);
    const txs = [
      movement({
        id: 'now',
        bookingDate: current.to,
        amount: { amount: -40, currency: 'EUR' },
        categoryId: 'groceries',
      }),
      movement({
        id: 'then',
        bookingDate: prior.to,
        amount: { amount: -10, currency: 'EUR' },
        categoryId: 'restaurants',
      }),
      movement({
        id: 'move',
        bookingDate: current.to,
        amount: { amount: -80, currency: 'EUR' },
        categoryId: 'transfers',
      }),
      movement({
        id: 'pay',
        bookingDate: current.to,
        amount: { amount: 1000, currency: 'EUR' },
        categoryId: 'income',
      }),
    ];
    const result = periodComparison(txs, '1M', now);
    expect(result.spent).toBe(40);
    expect(result.previous).toBe(10);
    expect(result.delta).toBe(30);
    expect(result.changePct).toBe(300);
  });

  test('periodComparison has no percent when the previous window is zero', () => {
    const now = new Date('2026-11-16T12:00:00+01:00');
    const current = periodRange('1W', now);
    const txs = [
      movement({
        id: 'now',
        bookingDate: current.from,
        amount: { amount: -15, currency: 'EUR' },
        categoryId: 'home',
      }),
    ];
    const result = periodComparison(txs, '1W', now);
    expect(result.spent).toBe(15);
    expect(result.previous).toBe(0);
    expect(result.delta).toBe(15);
    expect(result.changePct).toBeNull();
  });

  test('categoryBreakdown shares sum to 100 and exclude transfers', () => {
    const range = { from: '2026-11-01', to: '2026-11-30' };
    const txs = [
      movement({
        id: 'g1',
        bookingDate: '2026-11-02',
        amount: { amount: -20, currency: 'EUR' },
        categoryId: 'groceries',
      }),
      movement({
        id: 'g2',
        bookingDate: '2026-11-03',
        amount: { amount: -10, currency: 'EUR' },
        categoryId: 'groceries',
      }),
      movement({
        id: 'h',
        bookingDate: '2026-11-04',
        amount: { amount: -10, currency: 'EUR' },
        categoryId: 'home',
      }),
      movement({
        id: 't',
        bookingDate: '2026-11-05',
        amount: { amount: -50, currency: 'EUR' },
        categoryId: 'transfers',
      }),
      movement({
        id: 'i',
        bookingDate: '2026-11-06',
        amount: { amount: 200, currency: 'EUR' },
        categoryId: 'income',
      }),
      movement({
        id: 'old',
        bookingDate: '2026-10-01',
        amount: { amount: -99, currency: 'EUR' },
        categoryId: 'shopping',
      }),
    ];
    const rows = categoryBreakdown(txs, range);
    expect(rows.map((row) => row.categoryId)).toEqual(['groceries', 'home']);
    expect(rows[0]).toMatchObject({ total: 30, count: 2 });
    expect(rows[1]).toMatchObject({ total: 10, count: 1 });
    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 5);
    expect(rows[0]?.share).toBeCloseTo(75, 5);
    expect(rows[1]?.share).toBeCloseTo(25, 5);
    expect(rows.some((row) => row.categoryId === 'transfers')).toBe(false);
  });

  test('transactionsForCategory lists spending newest first and keeps transfers only for that category', () => {
    const range = { from: '2026-11-01', to: '2026-11-30' };
    const txs = [
      movement({
        id: 'old',
        bookingDate: '2026-11-02',
        amount: { amount: -5, currency: 'EUR' },
        categoryId: 'groceries',
      }),
      movement({
        id: 'new',
        bookingDate: '2026-11-10',
        amount: { amount: -8, currency: 'EUR' },
        categoryId: 'groceries',
      }),
      movement({
        id: 'same-b',
        bookingDate: '2026-11-10',
        amount: { amount: -3, currency: 'EUR' },
        categoryId: 'groceries',
      }),
      movement({
        id: 'same-a',
        bookingDate: '2026-11-10',
        amount: { amount: -4, currency: 'EUR' },
        categoryId: 'groceries',
      }),
      movement({
        id: 'refund',
        bookingDate: '2026-11-12',
        amount: { amount: 4, currency: 'EUR' },
        categoryId: 'groceries',
      }),
      movement({
        id: 'transfer',
        bookingDate: '2026-11-11',
        amount: { amount: -100, currency: 'EUR' },
        categoryId: 'transfers',
      }),
      movement({
        id: 'transfer-in',
        bookingDate: '2026-11-11',
        amount: { amount: 40, currency: 'EUR' },
        categoryId: 'transfers',
      }),
      movement({
        id: 'out',
        bookingDate: '2026-10-01',
        amount: { amount: -20, currency: 'EUR' },
        categoryId: 'groceries',
      }),
      movement({
        id: 'bare',
        bookingDate: '2026-11-08',
        amount: { amount: -6, currency: 'EUR' },
      }),
    ];
    expect(transactionsForCategory(txs, 'groceries', range).map((tx) => tx.id)).toEqual([
      'same-b',
      'same-a',
      'new',
      'old',
    ]);
    expect(transactionsForCategory(txs, 'transfers', range).map((tx) => tx.id)).toEqual(['transfer']);
    expect(transactionsForCategory(txs, 'other', range).map((tx) => tx.id)).toEqual(['bare']);
  });
});

describe('analytics screen', () => {
  test('defaults to the last month and follows the 3M chip', async () => {
    const now = new Date();
    const view = await renderWithProviders(<AnalyticsScreen />);
    expect((await screen.findByTestId('analytics-total')).props.children).toBe(spentLabel('1M', now));

    await fireEvent.press(screen.getByTestId('period-3M'));
    expect(screen.getByTestId('analytics-total').props.children).toBe(spentLabel('3M', now));
    await view.unmount();
  });

  test('opens the category drill-down from a row', async () => {
    const now = new Date();
    const rows = categoryBreakdown(loadedTransactions(now), periodRange('1M', now));
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    const view = await renderWithProviders(<AnalyticsScreen />);
    await screen.findByTestId(`analytics-cat-${row.categoryId}`);
    await fireEvent.press(screen.getByTestId(`analytics-cat-${row.categoryId}`));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/category/[id]',
      params: { id: row.categoryId, period: '1M' },
    });
    await view.unmount();
  });

  test('opens the drill-down once when Panoramica passes a category', async () => {
    mockSearchParams.category = 'groceries';
    const view = await renderWithProviders(<AnalyticsScreen />);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/category/[id]',
      params: { id: 'groceries', period: '1M' },
    });
    await view.unmount();
  });
});

describe('category drill-down', () => {
  test('shows the period total, merchants by size, and opens a movement', async () => {
    const now = new Date();
    const txs = loadedTransactions(now);
    const range = periodRange('1M', now);
    const row = categoryBreakdown(txs, range).find(
      (item) => merchantsForCategory(txs, item.categoryId, range).length > 0,
    );
    expect(row).toBeDefined();
    if (!row) return;
    const categoryId = row.categoryId;
    const merchants = merchantsForCategory(txs, categoryId, range);
    const movements = transactionsForCategory(txs, categoryId, range);
    const total = sumAmounts(movements.map((tx) => Math.abs(tx.amount.amount)));
    const first = movements[0];
    expect(first).toBeDefined();
    if (!first) return;

    mockSearchParams.id = categoryId;
    mockSearchParams.period = '1M';
    const view = await renderWithProviders(<CategoryDetailScreen />);
    expect((await screen.findByTestId('category-total')).props.children).toBe(formatMoney(total));

    const rendered = screen.getAllByTestId(/^category-merchant-/);
    expect(rendered.map((node) => node.props.testID)).toEqual(
      merchants.map((merchant) => `category-merchant-${merchant.merchantKey}`),
    );
    const top = merchants[0];
    expect(top).toBeDefined();
    if (top) {
      expect(within(screen.getByTestId(`category-merchant-${top.merchantKey}`)).getByText(top.displayName)).toBeTruthy();
      expect(
        within(screen.getByTestId(`category-merchant-${top.merchantKey}`)).getByText(movementsLabel(top.count)),
      ).toBeTruthy();
    }

    await fireEvent.press(screen.getByTestId(`category-tx-${first.id}`));
    expect(router.push).toHaveBeenCalledWith(`/transaction/${first.id}`);

    await fireEvent.press(screen.getByLabelText('Indietro'));
    expect(router.navigate).toHaveBeenCalledWith('/analytics');
    await view.unmount();
  });

  test('says when the category does not exist', async () => {
    mockSearchParams.id = 'not-a-category';
    const view = await renderWithProviders(<CategoryDetailScreen />);
    expect(await screen.findByText('Categoria non trovata')).toBeTruthy();
    await view.unmount();
  });
});
