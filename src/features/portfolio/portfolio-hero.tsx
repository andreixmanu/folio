import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ValueChart } from '@/components/charts/value-chart';
import {
  AppText,
  ChangeChip,
  ErrorState,
  HeroBalance,
  LiveIndicator,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { useValueHistory, type PriceStatus } from '@/services/hooks';
import { TIME_RANGES, type TimeRange } from '@/services/types';
import { useUiStore } from '@/store/ui-store';
import { enterFade, useTheme } from '@/theme';

const RANGE_OPTIONS = TIME_RANGES.map((r) => ({ value: r, label: r === 'ALL' ? 'Tutto' : r }));

const RANGE_CAPTION: Record<TimeRange, string> = {
  '1D': 'ultime 24 ore',
  '1W': 'ultima settimana',
  '1M': 'ultimo mese',
  '1Y': 'ultimo anno',
  ALL: 'dall’inizio',
};

const CHART_HEIGHT = 148;

export function PortfolioHero({
  totalValue,
  status,
  pricesUpdatedAt,
}: {
  totalValue: number;
  status: PriceStatus;
  pricesUpdatedAt: number;
}) {
  const theme = useTheme();
  const range = useUiStore((s) => s.timeRange);
  const setRange = useUiStore((s) => s.setTimeRange);
  const masked = useUiStore((s) => s.hideBalances);
  const history = useValueHistory(range, { t: pricesUpdatedAt, value: totalValue });

  const change = history.data?.change ?? 0;
  const changePct = history.data?.changePct ?? 0;

  return (
    <Animated.View
      entering={enterFade()}
      testID="portfolio-hero"
      style={{
        alignItems: 'center',
        paddingTop: theme.spacing.xl,
        paddingBottom: theme.spacing.sm,
        gap: theme.spacing.md,
      }}>
      <HeroBalance value={totalValue} masked={masked} testID="total-value" />
      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <LiveIndicator status={status} updatedAt={pricesUpdatedAt} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: theme.spacing.sm,
          }}>
          <ChangeChip
            percent={changePct}
            amount={change}
            masked={masked}
            testID="total-change"
            style={{ alignSelf: 'center' }}
          />
          <AppText variant="caption" color="textSecondary">
            {RANGE_CAPTION[range]}
          </AppText>
        </View>
      </View>

      <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.xs }}>
        {history.data ? (
          <ValueChart
            points={history.data.points}
            range={range}
            trend={change >= 0 ? 'up' : 'down'}
            masked={masked}
            height={CHART_HEIGHT}
          />
        ) : history.isError ? (
          <View style={{ height: CHART_HEIGHT, justifyContent: 'center' }}>
            <ErrorState
              compact
              title="Storico non disponibile"
              onRetry={() => void history.refetch()}
              testID="history-error"
            />
          </View>
        ) : (
          <Skeleton height={CHART_HEIGHT} radius={theme.radii.lg} />
        )}
      </View>

      <View style={{ alignSelf: 'stretch' }}>
        <SegmentedControl
          options={RANGE_OPTIONS}
          value={range}
          onChange={setRange}
          size="sm"
          variant="ghost"
          testID="range"
        />
      </View>
    </Animated.View>
  );
}
