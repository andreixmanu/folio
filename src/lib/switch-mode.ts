import { router, type Href } from 'expo-router';

import { haptics } from '@/lib/haptics';
import { MODE_HOME, useModeStore, type AppMode } from '@/store/mode-store';

/** Leave the current mode for `next`, restoring its last tab when one was stored. */
export function switchMode(next: AppMode): void {
  const { mode, setMode, lastRoute } = useModeStore.getState();
  if (next === mode) return;
  haptics.light();
  setMode(next);
  const path = lastRoute[next] ?? MODE_HOME[next];
  router.replace(path as Href);
}
