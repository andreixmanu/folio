import { View } from 'react-native';

import { ValueChart } from '@/components/charts/value-chart';
import {
  AnimatedNumber,
  AppText,
  ChangeChip,
  IslandCard,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { useValueHistory } from '@/services/hooks';
import { TIME_RANGES, type TimeRange } from '@/services/types';
import { useUiStore } from '@/store/ui-store';
import { useTheme } from '@/theme';

const RANGE_OPTIONS = TIME_RANGES.map((r) => ({ value: r, label: r === 'ALL' ? 'Tutto' : r }));

const RANGE_CAPTION: Record<TimeRange, string> = {
  '1D': 'oggi',
  '1W': 'ultima settimana',
  '1M': 'ultimo mese',
  '1Y': 'ultimo anno',
  ALL: 'dall’inizio',
};

export function PortfolioHero({ totalValue }: { totalValue: number }) {
  const theme = useTheme();
  const range = useUiStore((s) => s.timeRange);
  const setRange = useUiStore((s) => s.setTimeRange);
  const masked = useUiStore((s) => s.hideBalances);
  const history = useValueHistory(range);

  const change = history.data?.change ?? 0;
  const changePct = history.data?.changePct ?? 0;

  return (
    <IslandCard index={0} padding="lg" elevated={2} testID="portfolio-hero">
      <View style={{ gap: theme.spacing.xs }}>
        <AppText variant="caption" color="textSecondary">
          Valore totale
        </AppText>
        <AnimatedNumber
          value={totalValue}
          format={(v) => formatMoney(v)}
          variant="display"
          masked={masked}
          testID="total-value"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <ChangeChip percent={changePct} amount={change} masked={masked} testID="total-change" />
          <AppText variant="caption" color="textSecondary">
            {RANGE_CAPTION[range]}
          </AppText>
        </View>
      </View>

      <View style={{ marginTop: theme.spacing.md, marginBottom: theme.spacing.md }}>
        {history.data ? (
          <ValueChart
            points={history.data.points}
            range={range}
            trend={change >= 0 ? 'up' : 'down'}
            masked={masked}
            height={150}
          />
        ) : (
          <Skeleton height={150} radius={theme.radii.lg} />
        )}
      </View>

      <SegmentedControl
        options={RANGE_OPTIONS}
        value={range}
        onChange={setRange}
        size="sm"
        testID="range"
      />
    </IslandCard>
  );
}
