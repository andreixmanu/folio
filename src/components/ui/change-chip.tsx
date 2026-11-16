import { ArrowDownRight, ArrowUpRight, Minus } from './icons';
import { View } from 'react-native';

import { formatMoney, formatPercent, MASK } from '@/lib/format';
import { useTheme } from '@/theme';

import { Icon } from './icon';
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
  /**
   * `delta`: an increase is positive (a gain).
   * `spend`: an increase is negative (more money left the account).
   */
  tone?: 'delta' | 'spend';
  testID?: string;
};

/** Amount / percentage change pill. `tone="spend"` treats an increase as negative. */
export function ChangeChip({
  percent,
  amount,
  currency = 'EUR',
  size = 'md',
  masked = false,
  variant = 'filled',
  tone = 'delta',
  testID,
}: ChangeChipProps) {
  const theme = useTheme();
  const direction = percent > 0.004 ? 'up' : percent < -0.004 ? 'down' : 'flat';
  const increased = direction === 'up';
  const goodNews = direction === 'flat' ? false : tone === 'spend' ? !increased : increased;
  const sentiment = direction === 'flat' ? 'neutral' : goodNews ? 'positive' : 'negative';
  const fg = sentiment === 'neutral' ? 'textSecondary' : sentiment;
  const bg =
    sentiment === 'positive'
      ? theme.colors.positiveMuted
      : sentiment === 'negative'
        ? theme.colors.negativeMuted
        : theme.colors.surfaceMuted;
  const icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const iconSize = size === 'sm' ? 11 : 13;

  const pct = formatPercent(Math.abs(percent), { signed: false });
  const amt =
    amount === undefined ? null : masked ? MASK : formatMoney(amount, currency, { signed: true });
  const label = amt ? `${amt} · ${pct}` : pct;
  const phrase =
    tone === 'spend'
      ? direction === 'up'
        ? 'Spesa in aumento'
        : direction === 'down'
          ? 'Spesa in calo'
          : 'Spesa invariata'
      : direction === 'up'
        ? 'In rialzo'
        : direction === 'down'
          ? 'In ribasso'
          : 'Invariato';

  return (
    <View
      testID={testID}
      accessibilityLabel={`${phrase} ${label}`}
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
      <Icon icon={icon} size={iconSize} color={theme.colors[fg]} />
      <AppText variant={size === 'sm' ? 'micro' : 'label'} color={fg} tabular>
        {label}
      </AppText>
    </View>
  );
}
