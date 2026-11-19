import { View } from 'react-native';

import { AppText, ListRow, PressableScale } from '@/components/ui';
import { formatMoney, formatPercent, MASK } from '@/lib/format';
import { useTheme } from '@/theme';

import { type CategoryId } from '../model';
import { useCategory } from '../use-categories';

import { CategoryBadge } from './category-badge';

function ShareBar({ share, color }: { share: number; color: string }) {
  const theme = useTheme();
  const width = `${Math.max(0, Math.min(1, share)) * 100}%`;
  return (
    <View
      style={{
        height: 3,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.surfaceMuted,
        overflow: 'hidden',
      }}>
      <View style={{ width, height: 3, borderRadius: theme.radii.pill, backgroundColor: color }} />
    </View>
  );
}

/** Category total with a thin bar for its share of the month. */
export function CategorySpendRow({
  categoryId,
  amount,
  share,
  masked = false,
  onPress,
  testID,
}: {
  categoryId: CategoryId;
  /** Positive euros. */
  amount: number;
  /** Fraction of spend, 0–1. */
  share: number;
  masked?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const category = useCategory(categoryId);
  const color = category.color[theme.scheme];
  const amountText = masked ? MASK : formatMoney(amount);
  const shareText = formatPercent(share * 100, { signed: false, decimals: 0 });
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityLabel={`${category.label}, ${amountText}, ${shareText}`}
      testID={testID}
      style={{ alignSelf: 'stretch' }}>
      <ListRow
        leading={<CategoryBadge categoryId={categoryId} />}
        title={category.label}
        accessory={
          <AppText variant="bodyStrong" tabular>
            {amountText}
          </AppText>
        }
      />
      <View
        style={{
          marginLeft: 48,
          marginBottom: theme.spacing.xs,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}>
        <View style={{ flex: 1 }}>
          <ShareBar share={share} color={color} />
        </View>
        <AppText variant="micro" color="textTertiary" tabular>
          {shareText}
        </AppText>
      </View>
    </PressableScale>
  );
}
