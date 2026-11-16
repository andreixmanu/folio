import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ModeSwitch } from '@/components/navigation/mode-switch';
import { haptics } from '@/lib/haptics';
import { useModeStore } from '@/store/mode-store';

import { renderWithProviders } from '../test/test-utils';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(haptics, 'light').mockImplementation(() => {});
  jest.mocked(router.replace).mockClear();
  useModeStore.setState({ mode: 'invest', hasHydrated: true });
  await act(async () => {
    await useModeStore.persist.rehydrate();
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('<ModeSwitch />', () => {
  test('replaces to the budget home and stores the mode', async () => {
    await renderWithProviders(<ModeSwitch />);

    expect(screen.getByTestId('mode-switch')).toBeTruthy();
    expect(screen.getByTestId('mode-invest').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('mode-budget').props.accessibilityState).toEqual({ selected: false });

    await fireEvent.press(screen.getByTestId('mode-budget'));

    expect(useModeStore.getState().mode).toBe('budget');
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/overview');
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  test('replaces to the portfolio when leaving budget', async () => {
    useModeStore.setState({ mode: 'budget' });
    await renderWithProviders(<ModeSwitch />);

    await fireEvent.press(screen.getByTestId('mode-invest'));

    expect(useModeStore.getState().mode).toBe('invest');
    expect(router.replace).toHaveBeenCalledWith('/portfolio');
  });

  test('does nothing when the mode is already selected', async () => {
    await renderWithProviders(<ModeSwitch />);

    await fireEvent.press(screen.getByTestId('mode-invest'));

    expect(router.replace).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
    expect(useModeStore.getState().mode).toBe('invest');
  });
});
