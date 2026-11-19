import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AmbientBackground,
  AppText,
  ErrorState,
  Icon,
  PressableScale,
  RowSeparator,
  ScreenHeader,
  Skeleton,
} from '@/components/ui';
import { Search, SlidersHorizontal, X } from '@/components/ui/icons';
import { groupByDay } from '@/features/budget/analytics';
import { CategoryPickerSheet } from '@/features/budget/components/category-picker-sheet';
import { MoneyText, TransactionRow } from '@/features/budget/components';
import { toISODate } from '@/features/budget/dates';
import { useAccounts, useCategorizedTransactions, useRefreshBudget } from '@/features/budget/hooks';
import { type Transaction } from '@/features/budget/model';
import {
  EMPTY_FILTERS,
  filterTransactions,
  hasActiveFilters,
  type TxFilters,
} from '@/features/budget/transactions-view';
import { useBalancesHidden } from '@/store/ui-store';
import { useTheme } from '@/theme';

const LIST_BATCH = 40;

type MovementSection = {
  date: string;
  label: string;
  net: number;
  data: Transaction[];
};

function FilterChip({
  label,
  selected,
  onPress,
  testID,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  icon?: boolean;
}) {
  const theme = useTheme();
  const color = selected ? theme.colors.background : theme.colors.text;
  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      testID={testID}
      accessibilityLabel={label}
      accessibilityState={{ selected }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md + 2,
          height: 32,
          borderRadius: theme.radii.pill,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: selected ? theme.colors.text : theme.colors.surface,
        }}>
        {icon ? <Icon icon={SlidersHorizontal} size={14} color={color} /> : null}
        <AppText variant="label" style={{ color }}>
          {label}
        </AppText>
      </View>
    </PressableScale>
  );
}

function LoadingRows() {
  const theme = useTheme();
  return (
    <View testID="budget-transactions-loading" style={{ gap: theme.spacing.sm }}>
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} height={52} radius={theme.radii.lg} />
      ))}
    </View>
  );
}

export default function TransactionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const masked = useBalancesHidden();
  const accountsQuery = useAccounts();
  const transactionsQuery = useCategorizedTransactions();
  const [now] = useState(() => new Date());
  const today = toISODate(now);
  const [filters, setFilters] = useState<TxFilters>(EMPTY_FILTERS);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const transactions = transactionsQuery.data;
  const filtered = useMemo(
    () => filterTransactions(transactions ?? [], filters),
    [transactions, filters],
  );
  const sections = useMemo<MovementSection[]>(
    () =>
      groupByDay(filtered, now).map((section) => ({
        date: section.date,
        label: section.label,
        net: section.net,
        data: section.transactions,
      })),
    [filtered, now],
  );

  const accounts = accountsQuery.data ?? [];
  const categoryCount = filters.categoryIds.length;
  const categoryLabel = categoryCount > 0 ? `Categorie · ${categoryCount}` : 'Categorie';
  const topPad = insets.top + theme.spacing.xs;
  const bottomPadding =
    theme.layout.tabBarHeight + theme.layout.tabBarBottomGap + insets.bottom + theme.spacing.lg;

  const bankRefresh = useRefreshBudget();
  const retry = () => {
    void bankRefresh.refresh();
  };

  const resetFilters = () => {
    setFilters({ ...EMPTY_FILTERS, accountIds: [], categoryIds: [] });
  };

  const toggleAccount = (id: string) => {
    setFilters((current) => ({
      ...current,
      accountIds: current.accountIds.includes(id)
        ? current.accountIds.filter((item) => item !== id)
        : [...current.accountIds, id],
    }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID="budget-transactions-screen">
      <SectionList<Transaction, MovementSection>
        style={{
          flex: 1,
          width: '100%',
          maxWidth: theme.layout.maxContentWidth,
          alignSelf: 'center',
          backgroundColor: 'transparent',
        }}
        sections={transactions == null ? [] : sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={LIST_BATCH}
        maxToRenderPerBatch={LIST_BATCH}
        updateCellsBatchingPeriod={0}
        windowSize={11}
        extraData={masked}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: bottomPadding,
        }}
        refreshControl={
          <RefreshControl
            refreshing={bankRefresh.refreshing || transactionsQuery.isRefetching || accountsQuery.isRefetching}
            onRefresh={retry}
            tintColor={theme.colors.textSecondary}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.surfaceElevated}
            progressViewOffset={insets.top}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: theme.spacing.xs }}>
            {/* Fills the header, including the status-bar pad, and scrolls away with it. */}
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
              <AmbientBackground />
            </View>
            <View
              style={{
                paddingTop: topPad,
                paddingHorizontal: theme.layout.screenPadding,
                gap: theme.spacing.md,
              }}>
              <ScreenHeader title="Movimenti" />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  height: 40,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radii.pill,
                  backgroundColor: theme.scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}>
                <Icon icon={Search} size={16} color={theme.colors.textTertiary} />
                <TextInput
                  testID="tx-search"
                  value={filters.query}
                  onChangeText={(query) => setFilters((current) => ({ ...current, query }))}
                  placeholder="Cerca esercente o causale"
                  placeholderTextColor={theme.colors.textTertiary}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  style={{
                    flex: 1,
                    paddingVertical: 0,
                    color: theme.colors.text,
                    fontFamily: theme.typography.body.fontFamily,
                    fontSize: theme.typography.body.fontSize,
                  }}
                />
                {filters.query.length > 0 ? (
                  <PressableScale
                    haptic="selection"
                    accessibilityLabel="Cancella ricerca"
                    hitSlop={8}
                    onPress={() => setFilters((current) => ({ ...current, query: '' }))}>
                    <Icon icon={X} size={16} color={theme.colors.textSecondary} />
                  </PressableScale>
                ) : null}
              </View>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: 2 }}>
                <FilterChip
                  label="Tutti"
                  selected={filters.direction === 'all'}
                  onPress={() => setFilters((current) => ({ ...current, direction: 'all' }))}
                  testID="dir-all"
                />
                <FilterChip
                  label="Entrate"
                  selected={filters.direction === 'in'}
                  onPress={() => setFilters((current) => ({ ...current, direction: 'in' }))}
                  testID="dir-in"
                />
                <FilterChip
                  label="Uscite"
                  selected={filters.direction === 'out'}
                  onPress={() => setFilters((current) => ({ ...current, direction: 'out' }))}
                  testID="dir-out"
                />
                {accounts.map((account) => (
                  <FilterChip
                    key={account.id}
                    label={account.name}
                    selected={filters.accountIds.includes(account.id)}
                    onPress={() => toggleAccount(account.id)}
                    testID={`acct-${account.id}`}
                  />
                ))}
                <FilterChip
                  label={categoryLabel}
                  selected={categoryCount > 0}
                  onPress={() => setCategoriesOpen(true)}
                  testID="cat-filter"
                  icon
                />
              </ScrollView>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View
            testID={`section-${section.date}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: theme.spacing.md,
              paddingBottom: theme.spacing.sm,
              paddingHorizontal: theme.layout.screenPadding,
              backgroundColor: 'transparent',
            }}>
            <AppText variant="label" color="textSecondary">
              {section.label}
            </AppText>
            <MoneyText amount={section.net} variant="label" masked={masked} />
          </View>
        )}
        renderItem={({ item, index }) => (
          <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
            {index > 0 ? <RowSeparator inset={0} /> : null}
            <TransactionRow
              tx={item}
              today={today}
              masked={masked}
              onPress={() => router.push(`/transaction/${item.id}`)}
              testID={`tx-${item.id}`}
            />
          </View>
        )}
        ListEmptyComponent={
          transactions == null ? (
            transactionsQuery.isError ? (
              <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
                <ErrorState
                  title="Movimenti non disponibili"
                  message="Non riesco a leggere i movimenti. Riprova tra un momento."
                  onRetry={retry}
                  testID="budget-transactions-error"
                />
              </View>
            ) : (
              <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
                <LoadingRows />
              </View>
            )
          ) : (
            <View
              style={{
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingVertical: theme.spacing.xxl,
                paddingHorizontal: theme.layout.screenPadding,
              }}>
              <AppText variant="headline">
                {hasActiveFilters(filters) ? 'Nessun risultato' : 'Nessun movimento'}
              </AppText>
              {hasActiveFilters(filters) ? (
                <PressableScale
                  haptic="selection"
                  onPress={resetFilters}
                  testID="tx-reset"
                  accessibilityLabel="Azzera filtri">
                  <AppText variant="label" color="accent">
                    Azzera filtri
                  </AppText>
                </PressableScale>
              ) : null}
            </View>
          )
        }
      />
      {categoriesOpen ? (
        <CategoryPickerSheet
          mode="multi"
          selected={filters.categoryIds}
          onClose={() => setCategoriesOpen(false)}
          onApply={(ids) => {
            setFilters((current) => ({ ...current, categoryIds: ids }));
            setCategoriesOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}
