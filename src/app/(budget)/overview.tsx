import { router } from 'expo-router';
import { View } from 'react-native';

import { SpendCompareChart } from '@/components/charts/spend-compare-chart';
import {
  AnimatedNumber,
  AppText,
  ChangeChip,
  ErrorState,
  IslandCard,
  PressableScale,
  RowSeparator,
  Screen,
  ScreenHeader,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import {
  monthSpendComparison,
  monthToDateCumulative,
  recentTransactions,
  topCategoryShares,
} from '@/features/budget/analytics';
import { BudgetHero, CategorySpendRow, RecurringPaymentRow, TransactionRow } from '@/features/budget/components';
import { toISODate } from '@/features/budget/dates';
import { useAccounts, useCategorizedTransactions, useRecurring } from '@/features/budget/hooks';
import { sumAmounts } from '@/features/budget/model';
import { upcomingPayments } from '@/features/budget/recurring';
import { formatMoney } from '@/lib/format';
import { useUiStore } from '@/store/ui-store';
import { useTheme } from '@/theme';

const TOP_CATEGORIES = 5;
const RECENT_LIMIT = 5;
const UPCOMING_DAYS = 14;

function LoadingState() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }} testID="budget-overview-loading">
      <View
        style={{
          alignItems: 'center',
          paddingTop: theme.spacing.xl,
          gap: theme.spacing.md,
        }}>
        <Skeleton width={220} height={48} radius={14} />
        <Skeleton width={88} height={14} radius={6} />
        <Skeleton height={64} radius={theme.radii.md} />
      </View>
      <IslandCard>
        <View style={{ gap: theme.spacing.md }}>
          <Skeleton width={140} height={14} />
          <Skeleton width={160} height={28} radius={10} />
          <Skeleton height={132} radius={theme.radii.lg} />
        </View>
      </IslandCard>
    </View>
  );
}

function DetailsSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }} testID="budget-overview-details-loading">
      <IslandCard>
        <View style={{ gap: theme.spacing.md }}>
          <Skeleton width={140} height={14} />
          <Skeleton height={132} radius={theme.radii.lg} />
        </View>
      </IslandCard>
      <IslandCard>
        <Skeleton height={120} radius={theme.radii.lg} />
      </IslandCard>
    </View>
  );
}

export default function OverviewScreen() {
  const theme = useTheme();
  const masked = useUiStore((state) => state.hideBalances);
  const accountsQuery = useAccounts();
  const transactionsQuery = useCategorizedTransactions();
  const now = new Date();
  const recurringQuery = useRecurring(now);
  const today = toISODate(now);

  const accounts = accountsQuery.data;
  const transactions = transactionsQuery.data;
  const total = accounts ? sumAmounts(accounts.map((account) => account.balance.amount)) : 0;
  const comparison = transactions ? monthSpendComparison(transactions, now) : null;
  const cumulative = transactions ? monthToDateCumulative(transactions, now) : null;
  const categories = transactions ? topCategoryShares(transactions, now, TOP_CATEGORIES) : [];
  const recent = transactions ? recentTransactions(transactions, RECENT_LIMIT) : [];
  const upcoming = recurringQuery.data ? upcomingPayments(recurringQuery.data, now, UPCOMING_DAYS) : [];

  const refreshing = accountsQuery.isRefetching || transactionsQuery.isRefetching;
  const retry = () => {
    void accountsQuery.refetch();
    void transactionsQuery.refetch();
  };

  return (
    <Screen
      testID="budget-overview-screen"
      glow
      refreshing={refreshing}
      onRefresh={retry}>
      <ScreenHeader title="Panoramica" />
      {!accounts ? (
        accountsQuery.isError ? (
          <ErrorState
            title="Conti non disponibili"
            message="Non riesco a leggere i saldi. Riprova tra un momento."
            onRetry={retry}
            testID="budget-overview-error"
          />
        ) : (
          <LoadingState />
        )
      ) : (
        <>
          <BudgetHero total={total} accounts={accounts} masked={masked} />

          {!transactions || !comparison || !cumulative ? (
            transactionsQuery.isError ? (
              <ErrorState
                title="Movimenti non disponibili"
                message="Non riesco a leggere i movimenti. Riprova tra un momento."
                onRetry={retry}
                testID="budget-overview-error"
              />
            ) : (
              <DetailsSkeleton />
            )
          ) : (
            <>
              <IslandCard index={1} testID="budget-spent-card">
                <View style={{ gap: theme.spacing.sm }}>
                  <AppText variant="caption" color="textSecondary">
                    Speso questo mese
                  </AppText>
                  <AnimatedNumber
                    value={comparison.spent}
                    format={(value) => formatMoney(value)}
                    variant="title"
                    masked={masked}
                    testID="budget-spent"
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
                      <ChangeChip
                        tone="spend"
                        percent={comparison.changePct}
                        amount={comparison.delta}
                        masked={masked}
                        size="sm"
                        testID="budget-spend-change"
                      />
                    )}
                    <AppText variant="caption" color="textSecondary">
                      allo stesso giorno del mese scorso
                    </AppText>
                  </View>
                  <SpendCompareChart points={cumulative.points} masked={masked} testID="budget-spend-chart" />
                </View>
              </IslandCard>

              <IslandCard index={2} testID="budget-categories">
                <SectionTitle title="Categorie" />
                {categories.length === 0 ? (
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
                    Nessuna spesa questo mese
                  </AppText>
                ) : (
                  categories.map((row, index) => (
                    <View key={row.categoryId}>
                      {index > 0 ? <RowSeparator /> : null}
                      <CategorySpendRow
                        categoryId={row.categoryId}
                        amount={row.total}
                        share={row.share}
                        masked={masked}
                        onPress={() =>
                          router.navigate({ pathname: '/analytics', params: { category: row.categoryId } })
                        }
                        testID={`budget-category-${row.categoryId}`}
                      />
                    </View>
                  ))
                )}
              </IslandCard>

              <IslandCard index={3} testID="budget-upcoming">
                <SectionTitle title="Prossimi pagamenti" />
                {upcoming.length === 0 ? (
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
                    {`Nessun pagamento nei prossimi ${UPCOMING_DAYS} giorni`}
                  </AppText>
                ) : (
                  upcoming.map((payment, index) => (
                    <View key={payment.merchantKey}>
                      {index > 0 ? <RowSeparator /> : null}
                      <RecurringPaymentRow
                        payment={payment}
                        today={today}
                        masked={masked}
                        testID={`budget-upcoming-${payment.merchantKey}`}
                      />
                    </View>
                  ))
                )}
              </IslandCard>

              <IslandCard index={4} testID="budget-recent">
                <SectionTitle
                  title="Movimenti recenti"
                  right={
                    <PressableScale
                      onPress={() => router.navigate('/transactions')}
                      haptic="selection"
                      accessibilityLabel="Vedi tutti i movimenti"
                      testID="budget-see-all">
                      <AppText variant="label" color="accent">
                        Vedi tutti
                      </AppText>
                    </PressableScale>
                  }
                />
                {recent.length === 0 ? (
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
                    Nessun movimento
                  </AppText>
                ) : (
                  recent.map((tx, index) => (
                    <View key={tx.id}>
                      {index > 0 ? <RowSeparator /> : null}
                      <TransactionRow
                        tx={tx}
                        today={today}
                        masked={masked}
                        onPress={() => router.push(`/transaction/${tx.id}`)}
                        testID={`budget-tx-${tx.id}`}
                      />
                    </View>
                  ))
                )}
              </IslandCard>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
