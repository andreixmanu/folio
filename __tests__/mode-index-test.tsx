import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen } from '@testing-library/react-native';

import Index from '@/app/index';
import { useModeStore } from '@/store/mode-store';
import { useUiStore } from '@/store/ui-store';

import { renderWithProviders } from '../test/test-utils';

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => React.createElement(Text, { testID: 'redirect' }, href),
  };
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useUiStore.setState({ themeMode: 'dark' });
  useModeStore.setState({ mode: 'invest', hasHydrated: false });
  await act(async () => {
    await useModeStore.persist.rehydrate();
  });
});

describe('root index', () => {
  test('shows only the background until the mode store has hydrated', async () => {
    useModeStore.setState({ mode: 'budget', hasHydrated: false });
    await renderWithProviders(<Index />);

    expect(screen.queryByTestId('redirect')).toBeNull();
    expect(screen.getByTestId('mode-gate').props.style).toMatchObject({
      flex: 1,
      backgroundColor: '#08080B',
    });
    expect(screen.getByTestId('mode-gate').props.children).toBeUndefined();
  });

  test('redirects to the home of the persisted mode', async () => {
    useModeStore.setState({ mode: 'budget', hasHydrated: false });
    await renderWithProviders(<Index />);

    await act(async () => {
      useModeStore.setState({ hasHydrated: true });
    });
    expect(screen.getByTestId('redirect').props.children).toBe('/overview');

    await act(async () => {
      useModeStore.setState({ mode: 'invest' });
    });
    expect(screen.getByTestId('redirect').props.children).toBe('/portfolio');
  });
});
