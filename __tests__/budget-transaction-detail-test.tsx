import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import OverviewScreen from '@/app/(budget)/overview';
import TransactionDetailScreen from '@/app/transaction/[id]';
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

describe('transaction detail', () => {
  test('renders the movement and keeps a category change on Movimenti and Panoramica', async () => {
    const data = createMockBudgetData(new Date());
    const txs = applyCategories(data.transactions, [], {});
    const tx = recentTransactions(txs, 5)[0];
    expect(tx).toBeDefined();
    if (!tx) return;
    const nextId: CategoryId = tx.categoryId === 'health' ? 'leisure' : 'health';
    const next = CATEGORY_BY_ID[nextId];
    const account = data.accounts.find((item) => item.id === tx.accountId);
    expect(account).toBeDefined();
    mockSearchParams.id = tx.id;

    const detail = await renderWithProviders(<TransactionDetailScreen />);
    expect(await screen.findByTestId('tx-category')).toBeTruthy();
    expect(screen.getByText(merchantLabel(tx))).toBeTruthy();
    expect(screen.getByText(fullDate(tx.bookingDate))).toBeTruthy();
    expect(screen.getByText(account?.name ?? '')).toBeTruthy();
    expect(screen.getByText(tx.status === 'pending' ? 'In sospeso' : 'Contabilizzato')).toBeTruthy();
    expect(screen.getByText('Causale')).toBeTruthy();
    expect(screen.getByText(tx.remittanceInformation?.trim() || '—')).toBeTruthy();
    expect(screen.getByTestId('tx-category-source').props.children).toBe('Assegnata automaticamente');

    await fireEvent.press(screen.getByLabelText('Indietro'));
    expect(router.navigate).toHaveBeenCalledWith('/transactions');
    jest.mocked(router.canGoBack).mockReturnValue(true);
    await fireEvent.press(screen.getByLabelText('Indietro'));
    expect(router.back).toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('tx-category'));
    await fireEvent.press(screen.getByTestId(`category-option-${next.id}`));
    await fireEvent.press(screen.getByTestId('category-sheet-apply'));
    expect(screen.getByTestId('tx-category-source').props.children).toBe('Scelta da te');
    expect(screen.getByText(next.label)).toBeTruthy();
    await detail.unmount();
    await settle();

    const list = await renderWithProviders(<TransactionsScreen />);
    const row = await screen.findByTestId(`tx-${tx.id}`);
    expect(within(row).getByText(new RegExp(next.label))).toBeTruthy();
    await list.unmount();
    await settle();

    await renderWithProviders(<OverviewScreen />);
    const recentIds = (await screen.findAllByTestId(/^budget-tx-/)).map((node) => node.props.testID);
    expect(recentIds).toContain(`budget-tx-${tx.id}`);
    const recent = screen.getByTestId(`budget-tx-${tx.id}`);
    expect(within(recent).getByText(new RegExp(next.label))).toBeTruthy();
  });

  test('apply to merchant recategorises another movement of the same shop', async () => {
    const txs = categorizedNow();
    const groups = new Map<string, Transaction[]>();
    for (const tx of txs) {
      if (!tx.merchantKey) continue;
      const list = groups.get(tx.merchantKey) ?? [];
      list.push(tx);
      groups.set(tx.merchantKey, list);
    }
    const pair = [...groups.values()].find((list) => list.length >= 2);
    expect(pair).toBeDefined();
    const first = pair?.[0];
    const second = pair?.[1];
    expect(first?.merchantKey).toBeTruthy();
    if (!first || !second) return;
    const nextId: CategoryId =
      first.categoryId === 'health' || second.categoryId === 'health' ? 'leisure' : 'health';
    const next = CATEGORY_BY_ID[nextId];
    mockSearchParams.id = first.id;

    const detail = await renderWithProviders(<TransactionDetailScreen />);
    expect(await screen.findByTestId('tx-category')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('tx-category'));
    await fireEvent.press(screen.getByTestId(`category-option-${next.id}`));
    await fireEvent(screen.getByTestId('apply-to-merchant'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('category-sheet-apply'));
    expect(screen.getByTestId('tx-category-source').props.children).toBe('Scelta da te');
    await detail.unmount();
    await settle();

    mockSearchParams.id = second.id;
    const other = await renderWithProviders(<TransactionDetailScreen />);
    expect(await screen.findByTestId('tx-category-source')).toBeTruthy();
    expect(screen.getByTestId('tx-category-source').props.children).toBe('Scelta da te');
    expect(screen.getByText(next.label)).toBeTruthy();
    await other.unmount();
    await settle();

    await renderWithProviders(<TransactionsScreen />);
    await screen.findByTestId('tx-search');
    await fireEvent.changeText(screen.getByTestId('tx-search'), displayMerchant(first.merchantKey));
    expect(within(await screen.findByTestId(`tx-${first.id}`)).getByText(new RegExp(next.label))).toBeTruthy();
    expect(within(screen.getByTestId(`tx-${second.id}`)).getByText(new RegExp(next.label))).toBeTruthy();
  });

  test('says when the movement does not exist', async () => {
    mockSearchParams.id = 'missing-movement';
    await renderWithProviders(<TransactionDetailScreen />);
    expect(await screen.findByText('Movimento non trovato')).toBeTruthy();
  });
});
