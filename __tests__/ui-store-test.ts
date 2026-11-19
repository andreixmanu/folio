import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, waitFor } from '@testing-library/react-native';

import { useUiStore } from '@/store/ui-store';

const KEY = 'folio-ui';

async function stored(): Promise<{ hideBalances?: boolean; timeRange?: string } | undefined> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return undefined;
  return (JSON.parse(raw) as { state?: { hideBalances?: boolean; timeRange?: string } }).state;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useUiStore.setState({ hideBalances: false, timeRange: '1W', balancesHydrated: true });
  await waitFor(async () => {
    expect((await stored())?.hideBalances).toBe(false);
  });
});

describe('ui store privacy flag', () => {
  test('persists hideBalances and leaves the chart range alone', async () => {
    useUiStore.getState().setTimeRange('1Y');
    useUiStore.getState().toggleHideBalances();

    await waitFor(async () => {
      expect(await stored()).toEqual({ hideBalances: true });
    });
  });

  test('a cold start reads the saved flag back', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { hideBalances: true }, version: 0 }));

    await act(async () => {
      await useUiStore.persist.rehydrate();
    });

    expect(useUiStore.getState().hideBalances).toBe(true);
    expect(useUiStore.getState().balancesHydrated).toBe(true);
    expect(useUiStore.getState().timeRange).toBe('1W');
  });
});
