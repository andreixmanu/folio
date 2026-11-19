import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { NewsCategory, TimeRange } from '@/services/types';

export type ThemeMode = 'dark' | 'light' | 'system';
export type AllocationMode = 'class' | 'asset' | 'source';
export type NewsFilter = 'all' | NewsCategory;

type UiState = {
  timeRange: TimeRange;
  allocationMode: AllocationMode;
  newsFilter: NewsFilter;
  hideBalances: boolean;
  /** False until the saved privacy flag has been read. Amounts stay masked until then. */
  balancesHydrated: boolean;
  themeMode: ThemeMode;
  setTimeRange: (range: TimeRange) => void;
  setAllocationMode: (mode: AllocationMode) => void;
  setNewsFilter: (filter: NewsFilter) => void;
  toggleHideBalances: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = 'folio-ui';

function markBalancesHydrated(): void {
  if (useUiStore.getState().balancesHydrated) return;
  useUiStore.setState({ balancesHydrated: true });
}

/** Local UI state. Only the privacy toggle is persisted. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      timeRange: '1W',
      allocationMode: 'class',
      newsFilter: 'all',
      hideBalances: false,
      // Tests start hydrated so screens render amounts without waiting on storage.
      balancesHydrated: typeof globalThis !== 'undefined' && 'jest' in globalThis,
      themeMode: 'dark',
      setTimeRange: (timeRange) => set({ timeRange }),
      setAllocationMode: (allocationMode) => set({ allocationMode }),
      setNewsFilter: (newsFilter) => set({ newsFilter }),
      toggleHideBalances: () => set((state) => (state.balancesHydrated ? { hideBalances: !state.hideBalances } : state)),
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ hideBalances: state.hideBalances }),
      merge: (persisted, current) => {
        const stored = persisted as { hideBalances?: unknown } | null | undefined;
        const hideBalances = typeof stored?.hideBalances === 'boolean' ? stored.hideBalances : current.hideBalances;
        return { ...current, hideBalances, balancesHydrated: true };
      },
      onRehydrateStorage: () => () => {
        markBalancesHydrated();
      },
    },
  ),
);

useUiStore.persist.onFinishHydration(markBalancesHydrated);

if (useUiStore.persist.hasHydrated()) markBalancesHydrated();

/** Hidden until storage is read, then the saved choice. */
export function useBalancesHidden(): boolean {
  const hide = useUiStore((state) => state.hideBalances);
  const ready = useUiStore((state) => state.balancesHydrated);
  return ready ? hide : true;
}

export function balancesAreHidden(): boolean {
  const state = useUiStore.getState();
  return state.balancesHydrated ? state.hideBalances : true;
}
