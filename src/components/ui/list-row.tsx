import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './pressable-scale';
import { AppText } from './text';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Leading element, usually an AssetAvatar or IconBadge. */
  leading?: ReactNode;
  /** Primary trailing text (e.g. a value). */
  value?: string;
  /** Element below the trailing value (e.g. a ChangeChip). */
  trailing?: ReactNode;
  /** Custom trailing accessory (e.g. a Switch). Replaces value/trailing. */
  accessory?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  testID?: string;
};

/** Standard row used inside islands: avatar · title/subtitle · value/change · chevron. */
export function ListRow({
  title,
  subtitle,
  leading,
  value,
  trailing,
  accessory,
  showChevron = false,
  onPress,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        minHeight: 60,
      }}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {accessory ?? (
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {value ? (
            <AppText variant="bodyStrong" tabular>
              {value}
            </AppText>
          ) : null}
          {trailing}
        </View>
      )}
      {showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} testID={testID} accessibilityLabel={title}>
      {content}
    </PressableScale>
  );
}

/** Hairline separator aligned with row text (after a 40px avatar + gap). */
export function RowSeparator({ inset = 52 }: { inset?: number }) {
  const theme = useTheme();
  return <View style={{ height: 1, marginLeft: inset, backgroundColor: theme.colors.border }} />;
}
