import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import OverviewScreen from '@/app/(budget)/overview';
import TransactionsScreen from '@/app/(budget)/transactions';
import { groupByDay, recentTransactions } from '@/features/budget/analytics';
import { applyCategories } from '@/features/budget/categorize';
import { FloatingTabBar } from '@/components/navigation/floating-tab-bar';
import { createMockBudgetData } from '@/features/budget/mock-data';
import {
  CATEGORY_BY_ID,
  counterpartyRaw,
  DEFAULT_BUDGETS,
  type CategoryId,
  type Transaction,
} from '@/features/budget/model';
import { displayMerchant } from '@/features/budget/merchant';
import { useBudgetStore } from '@/features/budget/store';
import {
  EMPTY_FILTERS,
  filterTransactions,
  hasActiveFilters,
  isUserChosen,
  type TxFilters,
} from '@/features/budget/transactions-view';
import { formatMoney } from '@/lib/format';
import { useUiStore } from '@/store/ui-store';

import { renderWithProviders } from '../test/test-utils';

const mockSearchParams: { id?: string } = { id: '' };

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

function withFilters(partial: Partial<TxFilters>): TxFilters {
  return {
    ...EMPTY_FILTERS,
    ...partial,
    accountIds: partial.accountIds ?? [],
    categoryIds: partial.categoryIds ?? [],
  };
}

function merchantLabel(tx: Transaction): string {
  return displayMerchant(counterpartyRaw(tx) || tx.merchantKey || tx.remittanceInformation) || 'Movimento';
}

const FULL_MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;

function fullDate(iso: string): string {
  const day = Number(iso.slice(8, 10));
  const month = FULL_MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
  return `${day} ${month} ${iso.slice(0, 4)}`;
}

function categorizedNow(): Transaction[] {
  return applyCategories(createMockBudgetData(new Date()).transactions, [], {});
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
  mockSearchParams.id = '';
  jest.mocked(router.navigate).mockClear();
  jest.mocked(router.push).mockClear();
  jest.mocked(router.back).mockClear();
  jest.mocked(router.canGoBack).mockReset();
  jest.mocked(router.canGoBack).mockReturnValue(false);
});

describe('filterTransactions', () => {
  const shop = movement({
    id: 'shop',
    accountId: 'acc-a',
    creditorName: 'PAGAMENTO POS ESSELUNGA 123 MILANO',
    categoryId: 'groceries',
    amount: { amount: -20, currency: 'EUR' },
  });
  const cafe = movement({
    id: 'cafe',
    accountId: 'acc-a',
    creditorName: 'Caffè Nero',
    categoryId: 'restaurants',
    amount: { amount: -4, currency: 'EUR' },
  });
  const rent = movement({
    id: 'rent',
    accountId: 'acc-b',
    creditorName: 'Mario Rossi',
    remittanceInformation: 'Affitto novembre',
    categoryId: 'home',
    amount: { amount: -800, currency: 'EUR' },
  });
  const salary = movement({
    id: 'salary',
    accountId: 'acc-b',
    debtorName: 'Officine Helios',
    remittanceInformation: 'Emolumenti',
    categoryId: 'income',
    amount: { amount: 2000, currency: 'EUR' },
  });
  const zero = movement({ id: 'zero', amount: { amount: 0, currency: 'EUR' }, categoryId: 'other' });
  const subscription = movement({
    id: 'sub',
    merchantKey: 'netflix',
    categoryId: 'subscriptions',
    amount: { amount: -16, currency: 'EUR' },
  });
  const rows = [shop, cafe, rent, salary, zero, subscription];

  test('keeps every movement when nothing is constrained', () => {
    expect(filterTransactions(rows, EMPTY_FILTERS).map((tx) => tx.id)).toEqual(rows.map((tx) => tx.id));
    expect(filterTransactions(rows, withFilters({ query: '   ' }))).toHaveLength(rows.length);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(withFilters({ query: '   ' }))).toBe(false);
  });

  test('matches merchant, raw counterparty and remittance without case or accents', () => {
    expect(filterTransactions(rows, withFilters({ query: 'esselunga' })).map((tx) => tx.id)).toEqual(['shop']);
    expect(filterTransactions(rows, withFilters({ query: 'pagamento' })).map((tx) => tx.id)).toEqual(['shop']);
    expect(filterTransactions(rows, withFilters({ query: 'CAFFE' })).map((tx) => tx.id)).toEqual(['cafe']);
    expect(filterTransactions(rows, withFilters({ query: 'affitto' })).map((tx) => tx.id)).toEqual(['rent']);
    expect(filterTransactions(rows, withFilters({ query: 'mario' })).map((tx) => tx.id)).toEqual(['rent']);
    expect(filterTransactions(rows, withFilters({ query: 'netflix' })).map((tx) => tx.id)).toEqual(['sub']);
    expect(filterTransactions(rows, withFilters({ query: 'inesistente' }))).toEqual([]);
    expect(hasActiveFilters(withFilters({ query: 'a' }))).toBe(true);
  });

  test('filters accounts, categories and direction, and ignores empty lists', () => {
    expect(filterTransactions(rows, withFilters({ accountIds: ['acc-a'] })).map((tx) => tx.id)).toEqual([
      'shop',
      'cafe',
    ]);
    expect(filterTransactions(rows, withFilters({ categoryIds: ['income'] })).map((tx) => tx.id)).toEqual(['salary']);
    expect(filterTransactions(rows, withFilters({ categoryIds: ['groceries'] })).map((tx) => tx.id)).toEqual(['shop']);
    expect(filterTransactions(rows, withFilters({ direction: 'in' })).map((tx) => tx.id)).toEqual(['salary']);
    expect(filterTransactions(rows, withFilters({ direction: 'out' })).map((tx) => tx.id)).toEqual([
      'shop',
      'cafe',
      'rent',
      'sub',
    ]);
    expect(
      filterTransactions(rows, withFilters({ direction: 'in', accountIds: ['acc-a'], categoryIds: ['income'] })),
    ).toEqual([]);
    expect(hasActiveFilters(withFilters({ accountIds: ['acc-a'] }))).toBe(true);
    expect(hasActiveFilters(withFilters({ categoryIds: ['home'] }))).toBe(true);
    expect(hasActiveFilters(withFilters({ direction: 'out' }))).toBe(true);
  });

  test('treats a user override or a user rule as chosen', () => {
    expect(isUserChosen({ categorySource: 'user' })).toBe(true);
    expect(isUserChosen({ categorySource: 'rule' })).toBe(true);
    expect(isUserChosen({ categorySource: 'builtin' })).toBe(false);
    expect(isUserChosen({ categorySource: 'mcc' })).toBe(false);
    expect(isUserChosen({ categorySource: 'fallback' })).toBe(false);
    expect(isUserChosen({})).toBe(false);
  });
});

describe('movimenti', () => {
  test('groups the days, opens a movement, and narrows with search and direction', async () => {
    const txs = categorizedNow();
    const sections = groupByDay(txs, new Date());
    const first = sections[0];
    expect(first).toBeDefined();
    if (!first) return;

    await renderWithProviders(<TransactionsScreen />);

    const header = await screen.findByTestId(`section-${first.date}`);
    expect(within(header).getByText(first.label)).toBeTruthy();
    const netLabel = formatMoney(first.net, 'EUR', { signed: first.net > 0 });
    expect(within(header).getByLabelText(netLabel)).toBeTruthy();
    const top = first.transactions[0];
    expect(top).toBeDefined();
    if (!top) return;
    expect(screen.getByTestId(`tx-${top.id}`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`tx-${top.id}`));
    expect(router.push).toHaveBeenCalledWith(`/transaction/${top.id}`);

    const query = 'esselunga';
    const matched = filterTransactions(txs, withFilters({ query }));
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.length).toBeLessThan(txs.length);
    await fireEvent.changeText(screen.getByTestId('tx-search'), query);
    expect(screen.getByTestId(`tx-${matched[0]?.id ?? ''}`)).toBeTruthy();
    expect(screen.queryByTestId(`tx-${top.id}`)).toBeNull();

    await fireEvent.changeText(screen.getByTestId('tx-search'), '');
    expect(await screen.findByTestId(`tx-${top.id}`)).toBeTruthy();

    const incoming = filterTransactions(txs, withFilters({ direction: 'in' }));
    expect(incoming[0]).toBeDefined();
    await fireEvent.press(screen.getByTestId('dir-in'));
    expect(screen.queryByTestId(`tx-${top.id}`)).toBeNull();
    expect(screen.getByTestId(`tx-${incoming[0]?.id ?? ''}`)).toBeTruthy();
    expect(top.amount.amount < 0).toBe(true);
  });

  test('shows an empty filter result and clears it', async () => {
    const txs = categorizedNow();
    await renderWithProviders(<TransactionsScreen />);
    expect(await screen.findByTestId(`tx-${txs[0]?.id ?? ''}`)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('tx-search'), 'zzz-niente-qui');
    expect(screen.getByText('Nessun risultato')).toBeTruthy();
    expect(screen.queryByText('Nessun movimento')).toBeNull();

    await fireEvent.press(screen.getByTestId('tx-reset'));
    expect(screen.queryByText('Nessun risultato')).toBeNull();
    expect(screen.getByTestId('tx-search').props.value).toBe('');
    expect(screen.getByTestId(`tx-${txs[0]?.id ?? ''}`)).toBeTruthy();
  });

  test('applies a category filter from the sheet', async () => {
    const txs = categorizedNow();
    const newest = txs[0];
    expect(newest).toBeDefined();
    if (!newest) return;
    await renderWithProviders(<TransactionsScreen />);
    expect(await screen.findByTestId(`tx-${newest.id}`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('cat-filter'));
    await fireEvent.press(screen.getByTestId('category-option-income'));
    await fireEvent.press(screen.getByTestId('category-sheet-apply'));

    expect(screen.getByText('Categorie · 1')).toBeTruthy();
    const income = filterTransactions(txs, withFilters({ categoryIds: ['income'] }));
    expect(income[0]).toBeDefined();
    expect(newest.categoryId).not.toBe('income');
    expect(screen.queryByTestId(`tx-${newest.id}`)).toBeNull();
    expect(screen.getByTestId(`tx-${income[0]?.id ?? ''}`)).toBeTruthy();
  });
});

