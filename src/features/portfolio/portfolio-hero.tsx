import { memo } from 'react';
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
import { useBalancesHidden, useUiStore } from '@/store/ui-store';
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

function PortfolioHeroImpl({
  totalValue,
  status,
  pricesUpdatedAt,
  totalNote,
}: {
  totalValue: number;
  status: PriceStatus;
  pricesUpdatedAt: number;
  totalNote?: string | null;
}) {
  const theme = useTheme();
  const range = useUiStore((s) => s.timeRange);
  const setRange = useUiStore((s) => s.setTimeRange);
  const masked = useBalancesHidden();
  const history = useValueHistory(range, { t: pricesUpdatedAt, value: totalValue });

  const historyData = history.data;

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
      <View style={{ alignItems: 'center' }}>
        <HeroBalance value={totalValue} masked={masked} testID="total-value" />
        <View style={{ position: 'absolute', right: -14, top: 18 }}>
          <LiveIndicator status={status} updatedAt={pricesUpdatedAt} />
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}>
        {historyData ? (
          <>
            <ChangeChip
              percent={historyData.changePct}
              amount={historyData.change}
              masked={masked}
              testID="total-change"
              style={{ alignSelf: 'center' }}
            />
            <AppText variant="caption" color="textSecondary">
              {RANGE_CAPTION[historyData.range]}
            </AppText>
          </>
        ) : history.isError ? null : (
          <Skeleton width={148} height={28} radius={theme.radii.pill} />
        )}
      </View>
      {totalNote ? (
        <AppText variant="caption" color="warning" testID="partial-total">
          {totalNote}
        </AppText>
      ) : null}

      <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.xs }}>
        {historyData ? (
          <ValueChart
            points={historyData.points}
            range={historyData.range}
            trend={historyData.change >= 0 ? 'up' : 'down'}
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

export const PortfolioHero = memo(PortfolioHeroImpl);
