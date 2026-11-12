import { Fragment } from 'react';
import { View } from 'react-native';

import {
  AppText,
  AssetAvatar,
  ChangeChip,
  IconBadge,
  IslandCard,
  ListRow,
  RowSeparator,
} from '@/components/ui';
import { formatMoney, formatQuantity, MASK } from '@/lib/format';
import type { PortfolioSnapshot } from '@/services/types';
import { useUiStore } from '@/store/ui-store';
import { useTheme } from '@/theme';

import { SOURCE_COLORS, SOURCE_ICONS } from './source-meta';

/** Holdings grouped by source (IBKR, wallets, exchanges), each group in its own island. */
export function HoldingsBySource({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const theme = useTheme();
  const masked = useUiStore((s) => s.hideBalances);

  return (
    <View style={{ gap: theme.spacing.lg }} testID="holdings">
      {snapshot.sources.map((source, groupIndex) => {
        const holdings = snapshot.holdings
          .filter((h) => h.sourceId === source.id)
          .sort((a, b) => b.value - a.value);
        if (holdings.length === 0) return null;
        const subtotal = holdings.reduce((s, h) => s + h.value, 0);

        return (
          <IslandCard key={source.id} index={groupIndex + 3} testID={`source-${source.id}`}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingBottom: theme.spacing.sm,
              }}>
              <IconBadge name={SOURCE_ICONS[source.kind]} color={SOURCE_COLORS[source.id]} size={36} />
              <View style={{ flex: 1 }}>
                <AppText variant="headline">{source.name}</AppText>
                <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                  {source.detail}
                </AppText>
              </View>
              <AppText variant="bodyStrong" tabular>
                {masked ? MASK : formatMoney(subtotal, 'EUR', { fractionDigits: 0 })}
              </AppText>
            </View>
            {holdings.map((h, i) => (
              <Fragment key={h.id}>
                {i > 0 ? <RowSeparator /> : null}
                <ListRow
                  leading={<AssetAvatar symbol={h.symbol} />}
                  title={h.name}
                  subtitle={`${masked ? MASK : formatQuantity(h.quantity)} ${h.symbol}`}
                  value={masked ? MASK : formatMoney(h.value)}
                  trailing={
                    h.assetClass === 'cash' ? (
                      <AppText variant="micro" color="textTertiary">
                        Liquidità
                      </AppText>
                    ) : (
                      <ChangeChip percent={h.changePct} size="sm" variant="plain" />
                    )
                  }
                  onPress={() => {}}
                  testID={`holding-${h.id}`}
                />
              </Fragment>
            ))}
          </IslandCard>
        );
      })}
    </View>
  );
}
