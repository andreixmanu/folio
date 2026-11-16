import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Href } from 'expo-router';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AppMode = 'invest' | 'budget';

type ModeState = {
  mode: AppMode;
  /** Last focused tab path for each mode, used when switching back. */
  lastRoute: Partial<Record<AppMode, string>>;
  setMode: (mode: AppMode) => void;
  setLastRoute: (mode: AppMode, path: string) => void;
  /** False until AsyncStorage has been read. The root route waits on this. */
  hasHydrated: boolean;
};

const STORAGE_KEY = 'folio-mode';

export const MODE_HOME: Record<AppMode, Href> = {
  invest: '/portfolio',
  budget: '/overview',
};

function isAppMode(value: unknown): value is AppMode {
  return value === 'invest' || value === 'budget';
}

function sanitizeLastRoute(value: unknown): Partial<Record<AppMode, string>> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const next: Partial<Record<AppMode, string>> = {};
  if (typeof record.invest === 'string') next.invest = record.invest;
  if (typeof record.budget === 'string') next.budget = record.budget;
  return next;
}

function markHydrated(): void {
  if (useModeStore.getState().hasHydrated) return;
  useModeStore.setState({ hasHydrated: true });
}

/**
 * Persisted Investimenti / Budget choice.
 * Hydration is signalled from `onRehydrateStorage` and `persist.onFinishHydration`
 * so it still flips under Jest's async AsyncStorage mock.
 */
export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      mode: 'invest',
      lastRoute: {},
      hasHydrated: false,
      setMode: (mode) => set({ mode }),
      setLastRoute: (mode, path) =>
        set((state) =>
          state.lastRoute[mode] === path ? state : { lastRoute: { ...state.lastRoute, [mode]: path } },
        ),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode, lastRoute: state.lastRoute }),
      merge: (persisted, current) => {
        const stored = persisted as { mode?: unknown; lastRoute?: unknown } | null | undefined;
        const mode = isAppMode(stored?.mode) ? stored.mode : current.mode;
        const lastRoute = sanitizeLastRoute(stored?.lastRoute);
        // Same update as the stored mode, so the root redirect never fires on the default.
        return { ...current, mode, lastRoute, hasHydrated: true };
      },
      onRehydrateStorage: () => () => {
        markHydrated();
      },
    },
  ),
);

useModeStore.persist.onFinishHydration(markHydrated);

if (useModeStore.persist.hasHydrated()) {
  markHydrated();
}
