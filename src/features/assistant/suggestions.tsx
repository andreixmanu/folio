import { View } from 'react-native';

import { AppText, IslandCard, PressableScale } from '@/components/ui';
import { useTheme } from '@/theme';

export const SUGGESTIONS = [
  "Com'è esposto il mio portafoglio sulla tech?",
  'Cosa muove BTC oggi?',
  'Riassumi i rischi del mio portafoglio',
  'Come stanno andando gli ETF azionari globali?',
] as const;

export function Suggestions({ onSelect }: { onSelect: (text: string) => void }) {
  const theme = useTheme();
  return (
    <IslandCard index={0}>
      <AppText variant="callout" color="textSecondary">
        Chiedimi di mercati, ETF, crypto, macro o del tuo portafoglio.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        {SUGGESTIONS.map((label, index) => (
          <PressableScale
            key={label}
            testID={`suggestion-${index}`}
            accessibilityLabel={label}
            haptic="selection"
            onPress={() => onSelect(label)}
            style={{ maxWidth: '100%' }}>
            <View
              style={{
                maxWidth: '100%',
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radii.pill,
                backgroundColor: theme.colors.surfaceMuted,
              }}>
              <AppText variant="caption">{label}</AppText>
            </View>
          </PressableScale>
        ))}
      </View>
    </IslandCard>
  );
}
