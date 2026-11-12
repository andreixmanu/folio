import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './text';

const SYMBOL_COLORS: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#14F195',
  USDC: '#2775CA',
  EUR: '#35C2FF',
  NVDA: '#76B900',
  AAPL: '#A2AAAD',
  MSFT: '#00A4EF',
  VWCE: '#C8102E',
  CSPX: '#7C6CFF',
};

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Circular avatar for an asset (symbol initials on a tinted background). */
export function AssetAvatar({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const theme = useTheme();
  const color = SYMBOL_COLORS[symbol] ?? theme.colors.accent;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}26`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText
        variant="micro"
        style={{ color, fontSize: symbol.length > 3 ? 10 : 12 }}
        numberOfLines={1}>
        {symbol}
      </AppText>
    </View>
  );
}

/** Rounded-square icon badge used for sources and settings rows. */
export function IconBadge({
  name,
  color,
  size = 40,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  const theme = useTheme();
  const tint = color ?? theme.colors.accent;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        borderCurve: 'continuous',
        backgroundColor: `${tint}24`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Ionicons name={name} size={size * 0.5} color={tint} />
    </View>
  );
}
