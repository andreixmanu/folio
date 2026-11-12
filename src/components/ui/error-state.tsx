import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { IslandCard } from './island-card';
import { PressableScale } from './pressable-scale';
import { AppText } from './text';

/** Calm, inline error block with an optional retry button. */
export function ErrorState({
  title,
  message,
  onRetry,
  compact = false,
  testID,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const content = (
    <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: compact ? 0 : theme.spacing.md }} testID={testID}>
      <Ionicons name="cloud-offline-outline" size={compact ? 20 : 26} color={theme.colors.textSecondary} />
      <AppText variant={compact ? 'label' : 'headline'} align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="caption" color="textSecondary" align="center">
          {message}
        </AppText>
      ) : null}
      {onRetry ? (
        <PressableScale
          onPress={onRetry}
          accessibilityLabel="Riprova"
          style={{
            marginTop: theme.spacing.xs,
            paddingHorizontal: theme.spacing.lg,
            height: 32,
            justifyContent: 'center',
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.surfaceMuted,
          }}>
          <AppText variant="label">Riprova</AppText>
        </PressableScale>
      ) : null}
    </View>
  );
  return compact ? content : <IslandCard index={0}>{content}</IslandCard>;
}
