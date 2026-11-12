import { create } from 'zustand';

import type { NewsCategory, TimeRange } from '@/services/types';

export type ThemeMode = 'dark' | 'light' | 'system';
export type AllocationMode = 'class' | 'asset';
export type NewsFilter = 'all' | NewsCategory;

type UiState = {
  timeRange: TimeRange;
  allocationMode: AllocationMode;
  newsFilter: NewsFilter;
  hideBalances: boolean;
  themeMode: ThemeMode;
  setTimeRange: (range: TimeRange) => void;
  setAllocationMode: (mode: AllocationMode) => void;
  setNewsFilter: (filter: NewsFilter) => void;
  toggleHideBalances: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

/** Local, non-persisted UI state. Persistence (AsyncStorage/MMKV) can be added later. */
export const useUiStore = create<UiState>()((set) => ({
  timeRange: '1M',
  allocationMode: 'class',
  newsFilter: 'all',
  hideBalances: false,
  themeMode: 'dark',
  setTimeRange: (timeRange) => set({ timeRange }),
  setAllocationMode: (allocationMode) => set({ allocationMode }),
  setNewsFilter: (newsFilter) => set({ newsFilter }),
  toggleHideBalances: () => set((s) => ({ hideBalances: !s.hideBalances })),
  setThemeMode: (themeMode) => set({ themeMode }),
}));
