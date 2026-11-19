import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { CategoryDonut } from '@/components/charts/category-donut';
import { TrendBars } from '@/components/charts/trend-bars';
import {
  AppText,
  ChangeChip,
  ErrorState,
  FilterChips,
  Icon,
  IslandCard,
  PressableScale,
  RowSeparator,
  Screen,
  ScreenHeader,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { ChevronRight } from '@/components/ui/icons';
import {
  categoryBreakdown,
  monthlyTrend,
  periodComparison,
  periodRange,
  type BudgetPeriod,
  type CategoryBreakdown,
} from '@/features/budget/analytics';
import { CategoryBadge, MoneyText } from '@/features/budget/components';
import { useCategorizedTransactions, useRefreshBudget } from '@/features/budget/hooks';
import { isCategoryId } from '@/features/budget/model';
import { useCategory } from '@/features/budget/use-categories';
import { formatPercent } from '@/lib/format';
import { useBalancesHidden } from '@/store/ui-store';
import { useTheme } from '@/theme';

const PERIOD_OPTIONS: { value: BudgetPeriod; label: string }[] = [
  { value: '1W', label: '1S' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1A' },
];

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function movementsLabel(count: number): string {
  return `${count} ${count === 1 ? 'movimento' : 'movimenti'}`;
}

function LoadingState() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }} testID="budget-analytics-loading">
      <IslandCard>
        <View style={{ gap: theme.spacing.md }}>
          <Skeleton width={80} height={14} />
          <Skeleton width={180} height={36} radius={12} />
          <Skeleton width={220} height={28} radius={theme.radii.pill} />
        </View>
      </IslandCard>
      <IslandCard>
        <View style={{ gap: theme.spacing.md }}>
          <Skeleton width={110} height={14} />
          <Skeleton height={168} radius={theme.radii.pill} />
          <Skeleton height={48} radius={theme.radii.md} />
        </View>
      </IslandCard>
    </View>
  );
}

function CategoryAnalysisRow({
  row,
  masked,
  onPress,
}: {
  row: CategoryBreakdown;
  masked: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const category = useCategory(row.categoryId);
  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      testID={`analytics-cat-${row.categoryId}`}
      accessibilityLabel={category.label}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: 56,
          paddingVertical: 8,
        }}>
        <CategoryBadge categoryId={row.categoryId} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {category.label}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {movementsLabel(row.count)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <MoneyText amount={row.total} tone="balance" variant="bodyStrong" masked={masked} />
          <AppText variant="caption" color="textTertiary">
            {formatPercent(row.share, { signed: false, decimals: 0 })}
          </AppText>
        </View>
        <Icon icon={ChevronRight} size={18} color={theme.colors.textTertiary} />
      </View>
    </PressableScale>
  );
}

export default function AnalyticsScreen() {
  const theme = useTheme();
  const masked = useBalancesHidden();
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const categoryParam = firstParam(params.category);
  const [period, setPeriod] = useState<BudgetPeriod>('1M');
  const redirected = useRef<string | null>(null);
  const query = useCategorizedTransactions();
  const now = new Date();

  useEffect(() => {
    if (!categoryParam || !isCategoryId(categoryParam)) return;
    if (redirected.current === categoryParam) return;
    redirected.current = categoryParam;
    router.push({ pathname: '/category/[id]', params: { id: categoryParam, period } });
  }, [categoryParam, period]);

  const transactions = query.data;
  const range = periodRange(period, now);
  const comparison = transactions ? periodComparison(transactions, period, now) : null;
  const breakdown = transactions ? categoryBreakdown(transactions, range) : [];
  const trend = transactions ? monthlyTrend(transactions, 6, now) : [];
  const bankRefresh = useRefreshBudget();
  const refreshing = bankRefresh.refreshing || query.isRefetching;
  const retry = () => {
    void bankRefresh.refresh();
  };

  let body: ReactNode;
  if (!transactions || !comparison) {
    body = query.isError ? (
      <ErrorState
        title="Analisi non disponibile"
        message="Non riesco a leggere i movimenti. Riprova tra un momento."
        onRetry={retry}
        testID="budget-analytics-error"
      />
    ) : (
      <LoadingState />
    );
  } else {
    body = (
      <>
        <IslandCard index={0} testID="analytics-spent">
          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="caption" color="textSecondary">
              Speso
            </AppText>
            <MoneyText
              amount={comparison.spent}
              tone="balance"
              variant="display"
              masked={masked}
              testID="analytics-total"
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: theme.spacing.sm,
              }}>
              {comparison.changePct == null ? (
                <AppText variant="caption" color="textTertiary">
                  Nessun confronto
                </AppText>
              ) : (
                <>
                  <ChangeChip
                    tone="spend"
                    percent={comparison.changePct}
                    amount={comparison.delta}
                    masked={masked}
                    size="sm"
                    testID="analytics-change"
                  />
                  <AppText variant="caption" color="textSecondary">
                    rispetto al periodo precedente
                  </AppText>
                </>
              )}
            </View>
          </View>
        </IslandCard>

        <IslandCard index={1} testID="analytics-categories">
          <SectionTitle title="Categorie" />
          {breakdown.length === 0 ? (
            <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
              Nessuna spesa in questo periodo
            </AppText>
          ) : (
            <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
              <CategoryDonut
                slices={breakdown.map((row) => ({ categoryId: row.categoryId, value: row.total }))}
                total={comparison.spent}
                masked={masked}
              />
              <View>
                {breakdown.map((row, index) => (
                  <View key={row.categoryId}>
                    {index > 0 ? <RowSeparator /> : null}
                    <CategoryAnalysisRow
                      row={row}
                      masked={masked}
                      onPress={() =>
                        router.push({
                          pathname: '/category/[id]',
                          params: { id: row.categoryId, period },
                        })
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
        </IslandCard>

        <IslandCard index={2} testID="analytics-trend">
          <SectionTitle title="Andamento" />
          <View style={{ marginTop: theme.spacing.md }}>
            <TrendBars points={trend} />
          </View>
        </IslandCard>
      </>
    );
  }

  return (
    <Screen testID="budget-analytics-screen" refreshing={refreshing} onRefresh={retry}>
      <ScreenHeader title="Analisi" />
      <View testID="period-chips">
        <FilterChips testID="period" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
      </View>
      {body}
    </Screen>
  );
}
