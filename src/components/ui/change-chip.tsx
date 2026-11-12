import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { formatMoney, formatPercent, MASK } from '@/lib/format';
import { useTheme } from '@/theme';

import { AppText } from './text';

export type ChangeChipProps = {
  /** Percent change, e.g. 2.4 for +2.4%. */
  percent: number;
  /** Optional absolute change in `currency`. */
  amount?: number;
  currency?: string;
  size?: 'sm' | 'md';
  /** Mask the amount (privacy mode). */
  masked?: boolean;
  /** Plain variant without background, for dense rows. */
  variant?: 'filled' | 'plain';
  testID?: string;
};

/** Amount / percentage change pill: green for gains, red for losses, neutral for flat. */
export function ChangeChip({
  percent,
  amount,
  currency = 'EUR',
  size = 'md',
  masked = false,
  variant = 'filled',
  testID,
}: ChangeChipProps) {
  const theme = useTheme();
  const direction = percent > 0.004 ? 'up' : percent < -0.004 ? 'down' : 'flat';
  const fg =
    direction === 'up' ? 'positive' : direction === 'down' ? 'negative' : 'textSecondary';
  const bg =
    direction === 'up'
      ? theme.colors.positiveMuted
      : direction === 'down'
        ? theme.colors.negativeMuted
        : theme.colors.surfaceMuted;
  const icon = direction === 'up' ? 'arrow-up' : direction === 'down' ? 'arrow-down' : 'remove';
  const iconSize = size === 'sm' ? 11 : 13;

  const pct = formatPercent(Math.abs(percent), { signed: false });
  const amt =
    amount === undefined ? null : masked ? MASK : formatMoney(amount, currency, { signed: true });
  const label = amt ? `${amt} · ${pct}` : pct;

  return (
    <View
      testID={testID}
      accessibilityLabel={`${direction === 'up' ? 'In rialzo' : direction === 'down' ? 'In ribasso' : 'Invariato'} ${label}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 3,
          borderRadius: theme.radii.pill,
        },
        variant === 'filled' && {
          backgroundColor: bg,
          paddingHorizontal: size === 'sm' ? 6 : 10,
          paddingVertical: size === 'sm' ? 2 : 5,
        },
      ]}>
      <Ionicons name={icon} size={iconSize} color={theme.colors[fg]} />
      <AppText variant={size === 'sm' ? 'micro' : 'label'} color={fg} tabular>
        {label}
      </AppText>
    </View>
  );
}
