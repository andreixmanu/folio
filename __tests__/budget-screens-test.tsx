import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useState, type ReactNode } from 'react';

import AnalyticsScreen from '@/app/(budget)/analytics';
import BudgetLayout from '@/app/(budget)/_layout';
import BudgetSettingsRoute from '@/app/(budget)/budget-settings';
import BudgetsScreen from '@/app/(budget)/budgets';
import OverviewScreen from '@/app/(budget)/overview';
import TransactionsScreen from '@/app/(budget)/transactions';
import { ThemeProvider } from '@/theme';

import { renderWithProviders } from '../test/test-utils';

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function RouterProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

const placeholders: { screen: () => ReactNode; title: string; testID: string }[] = [
  { screen: () => <TransactionsScreen />, title: 'Movimenti', testID: 'budget-transactions-screen' },
  { screen: () => <AnalyticsScreen />, title: 'Analisi', testID: 'budget-analytics-screen' },
  { screen: () => <BudgetsScreen />, title: 'Budget', testID: 'budget-budgets-screen' },
];

describe('budget placeholders', () => {
  test.each(placeholders)('$title renders the coming-soon line', async ({ screen: Screen, title, testID }) => {
    await renderWithProviders(<Screen />);
    expect(screen.getByTestId(testID)).toBeTruthy();
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
    expect(screen.getByText('In arrivo')).toBeTruthy();
    expect(screen.getByTestId('mode-switch')).toBeTruthy();
  });

  test('budget settings renders the shared settings screen', async () => {
    await renderWithProviders(<BudgetSettingsRoute />);
    expect(screen.getByTestId('settings-screen')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Impostazioni' })).toBeTruthy();
    expect(screen.getByTestId('mode-switch')).toBeTruthy();
  });
});

describe('budget tabs', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders the budget tab bar and switches screens', async () => {
    await renderRouter(
      {
        _layout: RootLayout,
        '(budget)/_layout': BudgetLayout,
        '(budget)/overview': OverviewScreen,
        '(budget)/transactions': TransactionsScreen,
        '(budget)/analytics': AnalyticsScreen,
        '(budget)/budgets': BudgetsScreen,
        '(budget)/budget-settings': BudgetSettingsRoute,
      },
      { initialUrl: '/overview', wrapper: RouterProviders },
    );

    expect(screen.getByTestId('tab-overview')).toBeTruthy();
    expect(screen.getByTestId('tab-transactions')).toBeTruthy();
    expect(screen.getByTestId('tab-analytics')).toBeTruthy();
    expect(screen.getByTestId('tab-budgets')).toBeTruthy();
    expect(screen.getByTestId('tab-budget-settings')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Panoramica' })).toBeTruthy();
    await waitFor(
      () => {
        expect(screen.getByText('Saldo totale')).toBeTruthy();
      },
      { timeout: 4000 },
    );
    expect(screen.queryByText('In arrivo')).toBeNull();

    await fireEvent.press(screen.getByTestId('tab-transactions'));
    expect(screen.getByRole('header', { name: 'Movimenti' })).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tab-analytics'));
    expect(screen.getByRole('header', { name: 'Analisi' })).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tab-budgets'));
    expect(screen.getByRole('header', { name: 'Budget' })).toBeTruthy();
  });
});
