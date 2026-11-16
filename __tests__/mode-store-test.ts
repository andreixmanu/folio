import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, waitFor } from '@testing-library/react-native';

import { useModeStore } from '@/store/mode-store';

const KEY = 'folio-mode';

async function storedMode(): Promise<string | undefined> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return undefined;
  return (JSON.parse(raw) as { state?: { mode?: string } }).state?.mode;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useModeStore.setState({ mode: 'invest', hasHydrated: false });
  await waitFor(async () => {
    expect(await storedMode()).toBe('invest');
  });
  await act(async () => {
    await useModeStore.persist.rehydrate();
  });
});

describe('mode store', () => {
  test('setMode writes the folio-mode key', async () => {
    useModeStore.getState().setMode('budget');

    await waitFor(async () => {
      expect(await storedMode()).toBe('budget');
    });
    const raw = await AsyncStorage.getItem(KEY);
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ state: { mode: 'budget' }, version: 0 });
    expect(useModeStore.getState().mode).toBe('budget');
  });

  test('rehydrates the stored mode and marks hydration finished', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { mode: 'budget' }, version: 0 }));

    await act(async () => {
      await useModeStore.persist.rehydrate();
    });

    expect(useModeStore.getState().mode).toBe('budget');
    expect(useModeStore.getState().hasHydrated).toBe(true);
  });

  test('finishes hydration when storage is empty and ignores an unknown mode', async () => {
    await AsyncStorage.clear();
    useModeStore.setState({ mode: 'invest', hasHydrated: false });

    await act(async () => {
      await useModeStore.persist.rehydrate();
    });
    expect(useModeStore.getState().hasHydrated).toBe(true);
    expect(useModeStore.getState().mode).toBe('invest');

    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { mode: 'crypto' }, version: 0 }));
    await act(async () => {
      await useModeStore.persist.rehydrate();
    });
    expect(useModeStore.getState().mode).toBe('invest');
    expect(useModeStore.getState().hasHydrated).toBe(true);
  });
});
