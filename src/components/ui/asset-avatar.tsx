import { Image } from 'expo-image';
import type { LucideIcon } from './icons';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { resolveApiBaseUrl } from '@/services/api/config';
import type { AssetClass } from '@/services/types';
import { useTheme } from '@/theme';

import { ASSET_ICONS } from './asset-icons.generated';
import { Icon } from './icon';
import { AppText } from './text';

const SYMBOL_COLORS: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#14F195',
  NVDA: '#76B900',
  AAPL: '#A2AAAD',
  MSFT: '#00A4EF',
  VWCE: '#C8102E',
  CSPX: '#7C6CFF',
};

/** Light disc behind remote logos, so dark marks stay readable in dark mode. */
const LOGO_DISC = '#F4F4F6';

export type AssetAvatarProps = {
  symbol: string;
  size?: number;
  /** Stocks without a bundled icon try the worker's `/logo/:symbol` endpoint. */
  assetClass?: AssetClass;
};

/** Remote logo URL for a stock/ETF (served and cached by the Folio worker). */
export function remoteLogoUrl(symbol: string): string | null {
  const base = resolveApiBaseUrl();
  return base ? `${base}/logo/${encodeURIComponent(symbol)}` : null;
}

/**
 * Circular asset logo. Order: bundled icon (offline, see assets/asset-icons/SOURCES.md)
 * → remote stock logo via the worker → initials badge (also used if an image fails).
 */
export function AssetAvatar({ symbol, size = 36, assetClass }: AssetAvatarProps) {
  const theme = useTheme();
  const key = symbol.toUpperCase();
  const [failed, setFailed] = useState(false);
  const bundled = ASSET_ICONS[key];
  const remote = !bundled && assetClass === 'stocks' ? remoteLogoUrl(key) : null;
  const circle = { width: size, height: size, borderRadius: size / 2 } as const;

  if (!failed && (bundled || remote)) {
    return (
      <View
        testID={`asset-logo-${key}`}
        accessibilityLabel={symbol}
        style={[
          circle,
          {
            overflow: 'hidden',
            backgroundColor: remote ? LOGO_DISC : 'transparent',
          },
        ]}>
        <Image
          source={bundled ?? { uri: remote! }}
          style={remote ? { flex: 1, margin: size * 0.18 } : circle}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={remote ? 150 : 0}
          recyclingKey={key}
          onError={() => setFailed(true)}
          // The wrapper View owns the label. On web, `accessible={false}` is
          // forwarded to the DOM as the string "false" and React warns.
          {...(Platform.OS === 'web' ? {} : { accessible: false as const })}
        />
        {/* Hairline ring keeps light discs from melting into light surfaces. */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            circle,
            {
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.border,
            },
          ]}
        />
      </View>
    );
  }
  return <InitialsAvatar symbol={symbol} size={size} />;
}

/** Fallback: symbol initials on a tinted background. */
export function InitialsAvatar({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const theme = useTheme();
  const color = SYMBOL_COLORS[symbol] ?? theme.colors.accent;
  return (
    <View
      testID={`asset-initials-${symbol.toUpperCase()}`}
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
        style={{
          color,
          fontSize: Math.round((symbol.length > 3 ? 10 : 12) * (size / 36)),
        }}
        numberOfLines={1}>
        {symbol}
      </AppText>
    </View>
  );
}

/** Rounded-square icon badge used for sources and settings rows. */
export function IconBadge({
  icon,
  color,
  size = 36,
}: {
  icon: LucideIcon;
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
      <Icon icon={icon} size={size * 0.5} color={tint} />
    </View>
  );
}
