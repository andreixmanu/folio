import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  AppText,
  ErrorState,
  IconButton,
  IslandCard,
  RowSeparator,
  Screen,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { ChevronLeft } from '@/components/ui/icons';
import {
  merchantsForCategory,
  periodRange,
  transactionsForCategory,
  type BudgetPeriod,
} from '@/features/budget/analytics';
import { CategoryBadge, MoneyText, TransactionRow } from '@/features/budget/components';
import { toISODate } from '@/features/budget/dates';
import { useCategorizedTransactions } from '@/features/budget/hooks';
import { CATEGORY_BY_ID, isCategoryId, sumAmounts, type CategoryId } from '@/features/budget/model';
import { useUiStore } from '@/store/ui-store';
import { useSyncMode } from '@/store/use-sync-mode';
import { useTheme } from '@/theme';

const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  '1W': 'Ultima settimana',
  '1M': 'Questo mese',
  '3M': 'Ultimi 3 mesi',
  '6M': 'Ultimi 6 mesi',
  '1Y': 'Ultimo anno',
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function periodFromParam(value: string | string[] | undefined): BudgetPeriod {
  const raw = firstParam(value);
  if (raw === '1W' || raw === '1M' || raw === '3M' || raw === '6M' || raw === '1Y') return raw;
  return '1M';
}

function movementsLabel(count: number): string {
  return `${count} ${count === 1 ? 'movimento' : 'movimenti'}`;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/analytics');
}

function BackHeader() {
  return <IconButton icon={ChevronLeft} accessibilityLabel="Indietro" onPress={goBack} />;
}

function DetailSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }} testID="budget-category-loading">
      <Skeleton width={56} height={56} radius={theme.radii.lg} />
      <Skeleton width={160} height={24} />
      <Skeleton width={140} height={40} radius={12} />
      <Skeleton height={160} radius={theme.radii.xl} />
    </View>
  );
}

export default function CategoryDetailScreen() {
  const theme = useTheme();
  useSyncMode('budget');
  const masked = useUiStore((state) => state.hideBalances);
  const params = useLocalSearchParams<{ id?: string | string[]; period?: string | string[] }>();
  const rawId = firstParam(params.id);
  const categoryId: CategoryId | null = isCategoryId(rawId) ? rawId : null;
  const period = periodFromParam(params.period);
  const query = useCategorizedTransactions();
  const [now] = useState(() => new Date());
  const today = toISODate(now);

  const transactions = query.data;
  const retry = () => {
    void query.refetch();
  };

  let body;
  if (!categoryId) {
    body = (
      <AppText variant="headline" align="center">
        Categoria non trovata
      </AppText>
    );
  } else if (!transactions) {
    body = query.isError ? (
      <ErrorState
        title="Categoria non disponibile"
        message="Non riesco a leggere i movimenti. Riprova tra un momento."
        onRetry={retry}
        testID="budget-category-error"
      />
    ) : (
      <DetailSkeleton />
    );
  } else {
    const category = CATEGORY_BY_ID[categoryId];
    const range = periodRange(period, now);
    const movements = transactionsForCategory(transactions, categoryId, range);
    const merchants = merchantsForCategory(transactions, categoryId, range);
    const total = sumAmounts(movements.map((tx) => Math.abs(tx.amount.amount)));
    body = (
      <>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }}>
          <CategoryBadge categoryId={categoryId} size={56} />
          <AppText variant="title" align="center" accessibilityRole="header">
            {category.label}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {PERIOD_LABEL[period]}
          </AppText>
          <MoneyText
            amount={total}
            tone="balance"
            variant="display"
            masked={masked}
            testID="category-total"
          />
          <AppText variant="caption" color="textSecondary">
            {movementsLabel(movements.length)}
          </AppText>
        </View>

        <IslandCard index={0} testID="category-merchants">
          <SectionTitle title="Esercenti" />
          {merchants.length === 0 ? (
            <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
              Nessun esercente in questo periodo
            </AppText>
          ) : (
            merchants.map((merchant, index) => (
              <View key={merchant.merchantKey}>
                {index > 0 ? <RowSeparator /> : null}
                <View
                  testID={`category-merchant-${merchant.merchantKey}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    minHeight: 52,
                    paddingVertical: 8,
                  }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {merchant.displayName}
                    </AppText>
                    <AppText variant="caption" color="textSecondary">
                      {movementsLabel(merchant.count)}
                    </AppText>
                  </View>
                  <MoneyText amount={merchant.total} tone="balance" variant="bodyStrong" masked={masked} />
                </View>
              </View>
            ))
          )}
        </IslandCard>

        <IslandCard index={1} testID="category-movements">
          <SectionTitle title="Movimenti" />
          {movements.length === 0 ? (
            <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
              Nessun movimento in questo periodo
            </AppText>
          ) : (
            movements.map((tx, index) => (
              <View key={tx.id}>
                {index > 0 ? <RowSeparator /> : null}
                <TransactionRow
                  tx={tx}
                  today={today}
                  masked={masked}
                  onPress={() => router.push(`/transaction/${tx.id}`)}
                  testID={`category-tx-${tx.id}`}
                />
              </View>
            ))
          )}
        </IslandCard>
      </>
    );
  }

  return (
    <Screen testID="budget-category-screen">
      <BackHeader />
      {body}
    </Screen>
  );
}
