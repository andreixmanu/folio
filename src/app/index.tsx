import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { MODE_HOME, useModeStore } from '@/store/mode-store';
import { useTheme } from '@/theme';

/** Waits for the persisted mode, then opens that mode's home tab. */
export default function Index() {
  const theme = useTheme();
  const hasHydrated = useModeStore((s) => s.hasHydrated);
  const mode = useModeStore((s) => s.mode);

  if (!hasHydrated) {
    return <View testID="mode-gate" style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  return <Redirect href={MODE_HOME[mode]} />;
}
