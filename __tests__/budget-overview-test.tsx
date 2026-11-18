import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { View } from 'react-native';
import { router } from 'expo-router';

import OverviewScreen from '@/app/(budget)/overview';
import { monthSpendComparison, recentTransactions, topCategoryShares } from '@/features/budget/analytics';
import { CategoryBadge } from '@/features/budget/components';
import { MoneyText } from '@/features/budget/components/money-text';
import { applyCategories } from '@/features/budget/categorize';
import { budgetSource } from '@/features/budget/data-source';
import { createMockBudgetData } from '@/features/budget/mock-data';
import { CATEGORY_IDS, DEFAULT_BUDGETS, sumAmounts, type Account } from '@/features/budget/model';
import { detectRecurring, upcomingPayments } from '@/features/budget/recurring';
import { useBudgetStore } from '@/features/budget/store';
import { formatMoney } from '@/lib/format';
import { darkColors } from '@/theme';
import { useUiStore } from '@/store/ui-store';

import { renderWithProviders } from '../test/test-utils';

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
  },
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

beforeEach(async () => {
  await AsyncStorage.clear();
  useBudgetStore.setState(emptyBudgetState());
  await act(async () => {
    await useBudgetStore.persist.rehydrate();
  });
  useBudgetStore.setState(emptyBudgetState());
  useUiStore.setState({ hideBalances: false });
  jest.mocked(router.navigate).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('budget overview', () => {
  test('renders the month at a glance and opens the other tabs', async () => {
    await renderWithProviders(<OverviewScreen />);

    expect(screen.getByTestId('budget-overview-screen')).toBeTruthy();
    expect(screen.getByTestId('hero-glow')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Panoramica' })).toBeTruthy();
    expect(screen.queryByTestId('mode-switch')).toBeNull();

    expect(await screen.findByTestId('budget-total')).toBeTruthy();
    const now = new Date();
    const data = createMockBudgetData(now);
    const txs = applyCategories(data.transactions, [], {});
    const total = sumAmounts(data.accounts.map((account) => account.balance.amount));
    const comparison = monthSpendComparison(txs, now);

    expect(screen.getByText('Saldo totale')).toBeTruthy();
    expect(screen.getByTestId('budget-total').props.accessibilityLabel).toBe(formatMoney(total));
    expect(within(screen.getByTestId('budget-account-acc-revolut')).getByText('Revolut')).toBeTruthy();
    expect(within(screen.getByTestId('budget-account-acc-revolut')).getByText('•• 7390')).toBeTruthy();
    expect(within(screen.getByTestId('budget-account-acc-aurora')).getByText('Conto corrente')).toBeTruthy();
    expect(within(screen.getByTestId('budget-account-acc-aurora')).getByText('•• 4821')).toBeTruthy();

    expect(screen.getByText('Speso questo mese')).toBeTruthy();
    expect(screen.getByTestId('budget-spent').props.accessibilityLabel).toBe(formatMoney(comparison.spent));
    expect(screen.getByText('allo stesso giorno del mese scorso')).toBeTruthy();
    expect(screen.getByTestId('budget-spend-chart')).toBeTruthy();
    if (comparison.changePct == null) {
      expect(screen.getByText('Nessun confronto')).toBeTruthy();
    } else if (comparison.changePct > 0.004) {
      expect(screen.getByTestId('budget-spend-change').props.accessibilityLabel).toMatch(/^Spesa in aumento/);
    } else if (comparison.changePct < -0.004) {
      expect(screen.getByTestId('budget-spend-change').props.accessibilityLabel).toMatch(/^Spesa in calo/);
    } else {
      expect(screen.getByTestId('budget-spend-change').props.accessibilityLabel).toMatch(/^Spesa invariata/);
    }

    const top = topCategoryShares(txs, now, 5);
    expect(top.length).toBeGreaterThan(0);
    const first = top[0];
    expect(first).toBeDefined();
    await fireEvent.press(screen.getByTestId(`budget-category-${first?.categoryId ?? 'other'}`));
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/analytics',
      params: { category: first?.categoryId },
    });

    const upcoming = upcomingPayments(detectRecurring(txs, now), now, 14);
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
    for (const payment of upcoming) {
      expect(screen.getByTestId(`budget-upcoming-${payment.merchantKey}`)).toBeTruthy();
    }

    const recent = recentTransactions(txs, 5);
    expect(recent[0]).toBeDefined();
    expect(screen.getByTestId(`budget-tx-${recent[0]?.id ?? ''}`)).toBeTruthy();
    expect(screen.getByText('Movimenti recenti')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('budget-see-all'));
    expect(router.navigate).toHaveBeenCalledWith('/transactions');
    await fireEvent.press(screen.getByTestId(`budget-tx-${recent[0]?.id ?? ''}`));
    expect(router.push).toHaveBeenCalledWith(`/transaction/${recent[0]?.id ?? ''}`);
  });

  test('shows an error and retries the accounts', async () => {
    const getAccounts = jest.spyOn(budgetSource, 'getAccounts').mockRejectedValue(new Error('offline'));
    await renderWithProviders(<OverviewScreen />);

    expect(await screen.findByTestId('budget-overview-error')).toBeTruthy();
    expect(screen.getByText('Conti non disponibili')).toBeTruthy();

    getAccounts.mockResolvedValue(createMockBudgetData(new Date()).accounts);
    await fireEvent.press(screen.getByLabelText('Riprova'));
    expect(await screen.findByTestId('budget-total')).toBeTruthy();
  });

  test('keeps the skeleton until the accounts resolve', async () => {
    let resolveAccounts: ((accounts: Account[]) => void) | undefined;
    jest.spyOn(budgetSource, 'getAccounts').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAccounts = resolve;
        }),
    );
    await renderWithProviders(<OverviewScreen />);
    expect(await screen.findByTestId('budget-overview-loading')).toBeTruthy();

    const accounts = createMockBudgetData(new Date()).accounts;
    await act(async () => {
      resolveAccounts?.(accounts);
    });
    expect(await screen.findByTestId('budget-total')).toBeTruthy();
  });
});

describe('budget money text', () => {
  test('paints income in the positive colour and leaves an outflow in the text colour', async () => {
    await renderWithProviders(
      <View>
        <MoneyText amount={12.5} testID="income" />
        <MoneyText amount={-4} testID="out" />
      </View>,
    );
    const income = screen.getByTestId('income');
    const out = screen.getByTestId('out');
    expect(income.props.accessibilityLabel.replace(/\u00a0|\u202f/g, ' ')).toBe('+12,50 €');
    expect(out.props.accessibilityLabel.replace(/\u00a0|\u202f/g, ' ')).toBe('−4,00 €');
    const colorOf = (node: { props: { style?: unknown } }) => JSON.stringify(node.props.style);
    expect(colorOf(income)).toContain(darkColors.positive);
    expect(colorOf(out)).toContain(darkColors.text);
    expect(colorOf(out)).not.toContain(darkColors.positive);
  });
});

describe('category badge', () => {
  test.each(CATEGORY_IDS)('renders %s', async (categoryId) => {
    await renderWithProviders(<CategoryBadge categoryId={categoryId} />);
  });
});
