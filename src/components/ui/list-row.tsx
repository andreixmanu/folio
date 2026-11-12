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
        paddingVertical: 10,
        minHeight: 52,
      }}>
      {leading}
      <View style={{ flex: 1, gap: 1 }}>
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
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
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
    <PressableScale onPress={onPress} testID={testID} accessibilityLabel={title}>
      {content}
    </PressableScale>
  );
}

/** Hairline separator aligned with row text (after a 36px avatar + gap). */
export function RowSeparator({ inset = 48 }: { inset?: number }) {
  const theme = useTheme();
  return <View style={{ height: 1, marginLeft: inset, backgroundColor: theme.colors.border }} />;
}
