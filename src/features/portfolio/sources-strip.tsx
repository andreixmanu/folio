import { ScrollView, View } from 'react-native';

import { AppText, IconBadge, IslandCard } from '@/components/ui';
import { formatMoney, formatPercent, MASK } from '@/lib/format';
import type { PortfolioSnapshot } from '@/services/types';
import { useUiStore } from '@/store/ui-store';
import { useTheme } from '@/theme';

import { SOURCE_COLORS, SOURCE_ICONS } from './source-meta';

/** Horizontal strip of mini islands, one per connected source, with subtotal and weight. */
export function SourcesStrip({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const theme = useTheme();
  const masked = useUiStore((s) => s.hideBalances);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -theme.layout.screenPadding }}
      contentContainerStyle={{
        paddingHorizontal: theme.layout.screenPadding,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.md,
      }}>
      {snapshot.sources.map((source, i) => {
        const subtotal = snapshot.holdings
          .filter((h) => h.sourceId === source.id)
          .reduce((s, h) => s + h.value, 0);
        const weight = (subtotal / snapshot.totalValue) * 100;
        return (
          <IslandCard key={source.id} index={i + 1} padding="md" style={{ width: 148 }}>
            <View style={{ gap: theme.spacing.sm }}>
              <IconBadge name={SOURCE_ICONS[source.kind]} color={SOURCE_COLORS[source.id]} size={34} />
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {source.name}
              </AppText>
              <AppText variant="bodyStrong" tabular numberOfLines={1}>
                {masked ? MASK : formatMoney(subtotal, 'EUR', { fractionDigits: 0 })}
              </AppText>
              <AppText variant="micro" color="textTertiary">
                {formatPercent(weight, { signed: false })} del totale
              </AppText>
            </View>
          </IslandCard>
        );
      })}
    </ScrollView>
  );
}
