import { create } from 'zustand';

import type { AppMode } from '@/store/mode-store';

export type ModeTransitionOrigin = { x: number; y: number };

type ModeTransitionState = {
  active: boolean;
  origin: ModeTransitionOrigin | null;
  target: AppMode | null;
  start: (origin: ModeTransitionOrigin, target: AppMode) => void;
  finish: () => void;
};

/** Ephemeral expand-from-point transition. Not persisted. */
export const useModeTransitionStore = create<ModeTransitionState>((set) => ({
  active: false,
  origin: null,
  target: null,
  start: (origin, target) => set({ active: true, origin, target }),
  finish: () => set({ active: false, origin: null, target: null }),
}));
