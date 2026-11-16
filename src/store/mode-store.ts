import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Href } from 'expo-router';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AppMode = 'invest' | 'budget';

type ModeState = {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
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
      hasHydrated: false,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode }),
      merge: (persisted, current) => {
        const stored = persisted as { mode?: unknown } | null | undefined;
        const mode = isAppMode(stored?.mode) ? stored.mode : current.mode;
        // Same update as the stored mode, so the root redirect never fires on the default.
        return { ...current, mode, hasHydrated: true };
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
