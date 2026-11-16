import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { useModeStore, type AppMode } from './mode-store';

/**
 * The open route group is the source of truth for Investimenti / Budget.
 * A deep link to `/overview` must not keep a persisted invest accent.
 * Mount covers the first open; focus covers a group that stayed mounted.
 */
export function useSyncMode(mode: AppMode): void {
  const setMode = useModeStore((state) => state.setMode);
  const sync = useCallback(() => {
    if (useModeStore.getState().mode !== mode) setMode(mode);
  }, [mode, setMode]);

  useEffect(() => {
    sync();
  }, [sync]);

  useFocusEffect(sync);
}
