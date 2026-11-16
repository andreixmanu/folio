import 'react-native-gesture-handler/jestSetup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { FloatingTabBar } from '@/components/navigation/floating-tab-bar';
import { ModeCircleButton, requestModeSwitch } from '@/components/navigation/mode-circle-button';
import { ModeTransitionOverlay } from '@/components/navigation/mode-transition-overlay';
import { ScreenHeader } from '@/components/ui/screen-header';
import { haptics } from '@/lib/haptics';
import { switchMode } from '@/lib/switch-mode';
import { useModeStore } from '@/store/mode-store';
import { useModeTransitionStore } from '@/store/mode-transition-store';

import { renderWithProviders } from '../test/test-utils';

// No animation frames in Jest: Reduce Motion makes the overlay commit the switch at once.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => true };
});

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

function SwitchHarness() {
  return (
    <>
      <ModeCircleButton />
      <ModeTransitionOverlay />
    </>
  );
}

function tabBarProps(name: 'portfolio' | 'news' = 'portfolio'): BottomTabBarProps {
  return {
    state: {
      index: name === 'news' ? 1 : 0,
      routes: [
        { key: 'portfolio-key', name: 'portfolio' },
        { key: 'news-key', name: 'news' },
      ],
    },
    descriptors: {
      'portfolio-key': { options: { title: 'Portafoglio', tabBarButtonTestID: 'tab-portfolio' } },
      'news-key': { options: { title: 'Notizie', tabBarButtonTestID: 'tab-news' } },
    },
    emitter: { emit: jest.fn(() => ({ defaultPrevented: false })) },
    navigateToTab: jest.fn(),
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(haptics, 'light').mockImplementation(() => {});
  jest.mocked(router.replace).mockClear();
  useModeTransitionStore.setState({ active: false, origin: null, target: null });
  useModeStore.setState({ mode: 'invest', hasHydrated: true, lastRoute: {} });
  await act(async () => {
    await useModeStore.persist.rehydrate();
  });
  useModeStore.setState({ mode: 'invest', hasHydrated: true, lastRoute: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('mode switch', () => {
  test('circle press replaces to the budget home', async () => {
    const view = await renderWithProviders(<SwitchHarness />);

    expect(screen.getByTestId('mode-circle').props.accessibilityLabel).toBe('Passa a Budget');

    await fireEvent.press(screen.getByTestId('mode-circle'));

    expect(useModeStore.getState().mode).toBe('budget');
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/overview');
    expect(haptics.light).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  test('circle accessibility label follows the other mode', async () => {
    const view = await renderWithProviders(<ModeCircleButton />);

    expect(screen.getByRole('button', { name: 'Passa a Budget' })).toBeTruthy();

    await act(async () => {
      useModeStore.setState({ mode: 'budget' });
    });

    expect(screen.getByRole('button', { name: 'Passa a Investimenti' })).toBeTruthy();
    await view.unmount();
  });

  test('tab bar accessibility action and requestModeSwitch change mode', async () => {
    const view = await renderWithProviders(
      <>
        <FloatingTabBar {...tabBarProps('news')} />
        <ModeTransitionOverlay />
      </>,
    );

    expect(useModeStore.getState().lastRoute.invest).toBe('/news');

    await fireEvent(screen.getByTestId('mode-tab-bar'), 'accessibilityAction', {
      nativeEvent: { actionName: 'switchMode' },
    });

    expect(useModeStore.getState().mode).toBe('budget');
    expect(router.replace).toHaveBeenCalledWith('/overview');

    jest.mocked(router.replace).mockClear();
    await act(async () => {
      requestModeSwitch('invest', { x: 12, y: 24 });
    });

    expect(useModeStore.getState().mode).toBe('invest');
    expect(router.replace).toHaveBeenCalledWith('/news');
    await view.unmount();
  });

  test('switching back restores the stored route', async () => {
    useModeStore.setState({
      mode: 'invest',
      lastRoute: { invest: '/assistant', budget: '/transactions' },
    });
    const view = await renderWithProviders(<SwitchHarness />);

    await fireEvent.press(screen.getByTestId('mode-circle'));

    expect(useModeStore.getState().mode).toBe('budget');
    expect(router.replace).toHaveBeenCalledWith('/transactions');

    jest.mocked(router.replace).mockClear();
    await fireEvent.press(screen.getByTestId('mode-circle'));

    expect(useModeStore.getState().mode).toBe('invest');
    expect(router.replace).toHaveBeenCalledWith('/assistant');
    await view.unmount();
  });

  test('does nothing when the mode is already selected', async () => {
    const view = await renderWithProviders(<ModeTransitionOverlay />);

    switchMode('invest');
    await act(async () => {
      requestModeSwitch('invest', { x: 1, y: 1 });
    });

    expect(router.replace).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
    expect(useModeStore.getState().mode).toBe('invest');
    await view.unmount();
  });

  test('screen header has no eyebrow and no mode switch', async () => {
    const view = await renderWithProviders(<ScreenHeader title="Portafoglio" />);

    expect(screen.getByRole('header', { name: 'Portafoglio' })).toBeTruthy();
    expect(screen.queryByText('Ciao, Andrei')).toBeNull();
    expect(screen.queryByText('Folio')).toBeNull();
    expect(screen.queryByTestId('mode-switch')).toBeNull();
    await view.unmount();
  });
});
