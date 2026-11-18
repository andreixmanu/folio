import { Fragment } from 'react';
import { View } from 'react-native';

import {
  AppText,
  AssetAvatar,
  ChangeChip,
  IconBadge,
  ListRow,
  PressableScale,
  RowSeparator,
} from '@/components/ui';
import { formatMoney, formatPercent, formatQuantity, MASK } from '@/lib/format';
import type { PortfolioSnapshot } from '@/services/types';
import { useUiStore } from '@/store/ui-store';
import { useTheme } from '@/theme';

import { SOURCE_COLORS, SOURCE_ICONS } from './source-meta';

/**
 * Holdings on the canvas, grouped by source. Groups are separated by space.
 * Holding rows use a hairline, not a card. Source headers are plain rows.
 */
export function HoldingsBySource({
  snapshot,
  walletNote,
  onRetryWallets,
}: {
  snapshot: PortfolioSnapshot;
  walletNote?: string | null;
  onRetryWallets?: () => void;
}) {
  const theme = useTheme();
  const masked = useUiStore((s) => s.hideBalances);
  const groups = snapshot.sources
    .map((source) => {
      const holdings = snapshot.holdings
        .filter((h) => h.sourceId === source.id)
        .sort((a, b) => b.value - a.value);
      return { source, holdings, subtotal: holdings.reduce((s, h) => s + h.value, 0) };
    })
    .filter((g) => g.holdings.length > 0);

  return (
    <View testID="holdings">
      <AppText variant="headline" style={{ marginBottom: theme.spacing.sm }}>
        Posizioni
      </AppText>
      {groups.map(({ source, holdings, subtotal }, gi) => (
        <View key={source.id} testID={`source-${source.id}`}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginTop: gi === 0 ? 2 : 18,
              paddingTop: 4,
              paddingBottom: 8,
              minHeight: 62,
            }}>
            <IconBadge icon={SOURCE_ICONS[source.kind]} color={SOURCE_COLORS[source.id]} size={34} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {source.name}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {source.detail}
              </AppText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="bodyStrong" tabular>
                {masked ? MASK : formatMoney(subtotal, 'EUR', { fractionDigits: 0 })}
              </AppText>
              <AppText variant="caption" color="textSecondary" tabular>
                {formatPercent((subtotal / snapshot.totalValue) * 100, { signed: false })}
              </AppText>
            </View>
          </View>
          {holdings.map((h) => (
            <Fragment key={h.id}>
              <RowSeparator inset={0} />
              <ListRow
                leading={<AssetAvatar symbol={h.symbol} assetClass={h.assetClass} />}
                title={h.name}
                subtitle={`${masked ? MASK : formatQuantity(h.quantity)} ${h.symbol}`}
                value={masked ? MASK : formatMoney(h.value)}
                trailing={<ChangeChip percent={h.changePct} size="sm" variant="plain" />}
                onPress={() => {}}
                testID={`holding-${h.id}`}
              />
            </Fragment>
          ))}
        </View>
      ))}
      {walletNote ? (
        <PressableScale
          onPress={onRetryWallets}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel={walletNote}
          testID="wallet-note"
          style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}>
          <AppText variant="caption" color="warning">
            {walletNote}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}
