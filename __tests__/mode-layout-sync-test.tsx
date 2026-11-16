import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text, View } from 'react-native';

import BudgetLayout from '@/app/(budget)/_layout';
import InvestLayout from '@/app/(invest)/_layout';
import { ModeSwitch } from '@/components/navigation/mode-switch';
import { useModeStore } from '@/store/mode-store';
import { useUiStore } from '@/store/ui-store';
import { ThemeProvider, useTheme } from '@/theme';

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function Probe() {
  const theme = useTheme();
  return (
    <View>
      <ModeSwitch />
      <Text testID="accent">{theme.colors.accent}</Text>
    </View>
  );
}

const budgetRoutes = {
  _layout: RootLayout,
  '(budget)/_layout': BudgetLayout,
  '(budget)/overview': Probe,
  '(budget)/transactions': Probe,
  '(budget)/analytics': Probe,
  '(budget)/budgets': Probe,
  '(budget)/budget-settings': Probe,
};

const investRoutes = {
  _layout: RootLayout,
  '(invest)/_layout': InvestLayout,
  '(invest)/portfolio': Probe,
  '(invest)/news': Probe,
  '(invest)/assistant': Probe,
  '(invest)/settings': Probe,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  useUiStore.setState({ themeMode: 'dark' });
  useModeStore.setState({ mode: 'invest', hasHydrated: false });
  await act(async () => {
    await useModeStore.persist.rehydrate();
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('mode follows the open route group', () => {
  test('opening /overview forces budget mode and the teal accent', async () => {
    useModeStore.setState({ mode: 'invest' });

    await renderRouter(budgetRoutes, { initialUrl: '/overview', wrapper: ThemeProvider });

    await waitFor(() => {
      expect(useModeStore.getState().mode).toBe('budget');
      expect(screen.getByTestId('accent').props.children).toBe('#2EC4A6');
    });
    expect(screen.getByTestId('mode-budget').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('mode-invest').props.accessibilityState).toMatchObject({ selected: false });
  });

  test('opening /portfolio forces invest mode and the violet accent', async () => {
    useModeStore.setState({ mode: 'budget' });

    await renderRouter(investRoutes, { initialUrl: '/portfolio', wrapper: ThemeProvider });

    await waitFor(() => {
      expect(useModeStore.getState().mode).toBe('invest');
      expect(screen.getByTestId('accent').props.children).toBe('#7C6CFF');
    });
    expect(screen.getByTestId('mode-invest').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('mode-budget').props.accessibilityState).toMatchObject({ selected: false });
  });
});
