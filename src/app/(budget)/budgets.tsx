import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  AppText,
  ErrorState,
  IslandCard,
  PressableScale,
  RowSeparator,
  Screen,
  ScreenHeader,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { formatDayLabel } from '@/features/budget/analytics';
import {
  budgetSummary,
  budgetTone,
  CADENCE_LABEL,
  formatBudgetMoney,
  overLabel,
  recurringMonthlyTotal,
  sortByRatio,
  type BudgetProgressItem,
} from '@/features/budget/budgets-view';
import { CategoryBadge, MoneyText } from '@/features/budget/components';
import { BudgetLimitSheet } from '@/features/budget/components/budget-limit-sheet';
import { toISODate } from '@/features/budget/dates';
import { useBudgetProgress, useRecurring, useRefreshBudget } from '@/features/budget/hooks';
import { type CategoryId, type RecurringPayment } from '@/features/budget/model';
import { useAllCategories, useCategory } from '@/features/budget/use-categories';
import { useBudgetStore } from '@/features/budget/store';
import { MASK } from '@/lib/format';
import { useBalancesHidden } from '@/store/ui-store';
import { useTheme } from '@/theme';

function LoadingState() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }} testID="budget-loading">
      <IslandCard>
        <View style={{ gap: theme.spacing.md }}>
          <Skeleton width={90} height={14} />
          <Skeleton width={80} height={14} />
          <Skeleton width={180} height={36} radius={12} />
          <Skeleton height={4} radius={theme.radii.pill} />
        </View>
      </IslandCard>
      <IslandCard>
        <View style={{ gap: theme.spacing.md }}>
          <Skeleton width={110} height={14} />
          <Skeleton height={56} radius={theme.radii.md} />
          <Skeleton height={56} radius={theme.radii.md} />
        </View>
      </IslandCard>
    </View>
  );
}

function BudgetProgressBar({
  ratio,
  tone,
  testID,
}: {
  ratio: number;
  tone: 'accent' | 'warning' | 'negative';
  testID: string;
}) {
  const theme = useTheme();
  const width = `${Math.min(1, Math.max(0, ratio)) * 100}%` as `${number}%`;
  return (
    <View
      style={{
        height: 4,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.surfaceMuted,
        overflow: 'hidden',
      }}>
      <View
        testID={testID}
        style={{
          height: 4,
          width,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors[tone],
        }}
      />
    </View>
  );
}

function BudgetCategoryRow({
  row,
  masked,
  onPress,
}: {
  row: BudgetProgressItem;
  masked: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const category = useCategory(row.categoryId);
  const tone = budgetTone(row.state);
  const captionColor = tone === 'accent' ? 'textSecondary' : tone;
  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      testID={`budget-row-${row.categoryId}`}
      accessibilityLabel={category.label}>
      <View style={{ gap: theme.spacing.sm, paddingVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <CategoryBadge categoryId={row.categoryId} size={36} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {category.label}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {masked ? MASK : `${formatBudgetMoney(row.spent)} / ${formatBudgetMoney(row.limit)}`}
            </AppText>
          </View>
          <AppText variant="caption" color={captionColor} style={{ maxWidth: 120, textAlign: 'right' }}>
            {masked ? MASK : overLabel(row)}
          </AppText>
        </View>
        <BudgetProgressBar ratio={row.ratio} tone={tone} testID={`budget-bar-${row.categoryId}-${tone}`} />
      </View>
    </PressableScale>
  );
}

function RecurringRow({
  payment,
  today,
  masked,
}: {
  payment: RecurringPayment;
  today: string;
  masked: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      testID={`recurring-${payment.merchantKey}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        minHeight: 56,
        paddingVertical: 8,
      }}>
      <CategoryBadge categoryId={payment.categoryId} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <AppText variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {payment.displayName}
          </AppText>
          {payment.isSubscription ? (
            <View
              style={{
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 2,
                borderRadius: theme.radii.pill,
                backgroundColor: theme.colors.surfaceMuted,
              }}>
              <AppText variant="micro" color="textSecondary">
                Abbonamento
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {`${CADENCE_LABEL[payment.cadence]} · prossimo ${formatDayLabel(payment.nextDate, today)}`}
        </AppText>
      </View>
      <MoneyText amount={payment.averageAmount} tone="balance" variant="bodyStrong" masked={masked} />
    </View>
  );
}

export default function BudgetsScreen() {
  const theme = useTheme();
  const masked = useBalancesHidden();
  const budgets = useBudgetStore((state) => state.budgets);
  const setBudgetLimit = useBudgetStore((state) => state.setBudgetLimit);
  const removeBudget = useBudgetStore((state) => state.removeBudget);
  const allCategories = useAllCategories();
  const progressQuery = useBudgetProgress();
  const recurringQuery = useRecurring();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<CategoryId | null>(null);

  const today = toISODate(new Date());
  const bankRefresh = useRefreshBudget();
  const refreshing = bankRefresh.refreshing || progressQuery.isRefetching || recurringQuery.isRefetching;
  const retry = () => {
    void bankRefresh.refresh();
  };

  const closeSheet = () => {
    setCreating(false);
    setEditingId(null);
  };

  const taken = new Set(budgets.map((budget) => budget.categoryId));
  const availableCategoryIds = allCategories
    .map((category) => category.id)
    .filter((id) => !taken.has(id));
  const sheetOpen = creating || editingId != null;
  const editingBudget = budgets.find((budget) => budget.categoryId === editingId);

  let body: ReactNode;
  if (progressQuery.isError && !progressQuery.data) {
    body = (
      <ErrorState
        title="Budget non disponibili"
        message="Non riesco a leggere i movimenti. Riprova tra un momento."
        onRetry={retry}
        testID="budget-error"
      />
    );
  } else if (!progressQuery.data || !recurringQuery.data) {
    body = <LoadingState />;
  } else {
    const rows = sortByRatio(progressQuery.data);
    const summary = budgetSummary(rows, new Date());
    let totalRatio = 0;
    if (summary.limit <= 0) totalRatio = summary.spent > 0 ? 1 : 0;
    else totalRatio = summary.spent / summary.limit;
    let totalState: 'ok' | 'warning' | 'over' = 'ok';
    if (summary.spent > summary.limit) totalState = 'over';
    else if (totalRatio >= 0.8) totalState = 'warning';
    const totalTone = budgetTone(totalState);
    const monthly = recurringMonthlyTotal(recurringQuery.data);
    const recurring = recurringQuery.data;

    body = (
      <>
        <IslandCard index={0} testID="budget-summary">
          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="caption" color="textSecondary">
              Questo mese
            </AppText>
            <AppText variant="caption" color="textTertiary">
              Restano
            </AppText>
            <MoneyText
              amount={summary.left}
              tone="balance"
              variant="display"
              masked={masked}
              testID="budget-left"
            />
            <AppText variant="caption" color="textSecondary">
              {masked
                ? `Spesi ${MASK} su ${MASK}`
                : `Spesi ${formatBudgetMoney(summary.spent)} su ${formatBudgetMoney(summary.limit)}`}
            </AppText>
            <BudgetProgressBar ratio={totalRatio} tone={totalTone} testID="budget-total-bar" />
            <AppText variant="caption" color="textTertiary" testID="budget-daily">
              {summary.left <= 0
                ? 'Budget del mese esaurito'
                : `Puoi spendere ~${masked ? MASK : formatBudgetMoney(summary.dailyAvailable)} al giorno fino a fine mese`}
            </AppText>
          </View>
        </IslandCard>

        <IslandCard index={1} testID="budget-categories">
          <SectionTitle
            title="Categorie"
            right={
              <PressableScale
                haptic="selection"
                testID="manage-categories"
                onPress={() => router.push('/categories')}
                accessibilityLabel="Gestisci categorie">
                <AppText variant="caption" color="accent">
                  Gestisci
                </AppText>
              </PressableScale>
            }
          />
          {rows.length === 0 ? (
            <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
              Nessun budget impostato
            </AppText>
          ) : null}
          <View style={{ marginTop: theme.spacing.sm }}>
            {rows.map((row, index) => (
              <View key={row.categoryId}>
                {index > 0 ? <RowSeparator /> : null}
                <BudgetCategoryRow
                  row={row}
                  masked={masked}
                  onPress={() => {
                    setCreating(false);
                    setEditingId(row.categoryId);
                  }}
                />
              </View>
            ))}
            {availableCategoryIds.length > 0 ? (
              <View>
                {rows.length > 0 ? <RowSeparator /> : null}
                <PressableScale
                  haptic="selection"
                  testID="budget-add"
                  onPress={() => {
                    setCreating(true);
                    setEditingId(null);
                  }}
                  accessibilityLabel="Aggiungi budget">
                  <View
                    style={{
                      minHeight: 52,
                      justifyContent: 'center',
                      paddingVertical: theme.spacing.sm,
                    }}>
                    <AppText variant="bodyStrong" color="accent">
                      + Aggiungi budget
                    </AppText>
                  </View>
                </PressableScale>
              </View>
            ) : null}
          </View>
        </IslandCard>

        <IslandCard index={2} testID="budget-recurring">
          <SectionTitle
            title="Abbonamenti e ricorrenti"
            right={
              <AppText variant="caption" color="textSecondary" testID="recurring-total">
                {masked ? `~${MASK}/mese` : `~${formatBudgetMoney(monthly)}/mese`}
              </AppText>
            }
          />
          {recurring.length === 0 ? (
            <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
              Nessun abbonamento o pagamento ricorrente
            </AppText>
          ) : (
            <View style={{ marginTop: theme.spacing.sm }}>
              {recurring.map((payment, index) => (
                <View key={payment.merchantKey}>
                  {index > 0 ? <RowSeparator /> : null}
                  <RecurringRow payment={payment} today={today} masked={masked} />
                </View>
              ))}
            </View>
          )}
        </IslandCard>
      </>
    );
  }

  return (
    <Screen testID="budget-budgets-screen" refreshing={refreshing} onRefresh={retry}>
      <ScreenHeader title="Budget" />
      {body}
      {sheetOpen ? (
        <BudgetLimitSheet
          key={creating ? 'create' : (editingId ?? 'edit')}
          categoryId={editingId}
          availableCategoryIds={availableCategoryIds}
          initialAmount={creating ? null : (editingBudget?.monthlyLimit ?? null)}
          hasBudget={!creating && editingBudget != null}
          onPickCategory={setEditingId}
          onSave={(amount) => {
            if (!editingId) return;
            setBudgetLimit(editingId, amount);
            closeSheet();
          }}
          onRemove={() => {
            if (!editingId) return;
            removeBudget(editingId);
            closeSheet();
          }}
          onClose={closeSheet}
        />
      ) : null}
    </Screen>
  );
}
