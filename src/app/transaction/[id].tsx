import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, ErrorState, Icon, IslandCard, PressableScale, RowSeparator, Screen, Skeleton } from '@/components/ui';
import { ChevronLeft, ChevronRight } from '@/components/ui/icons';
import { CategoryPickerSheet } from '@/features/budget/components/category-picker-sheet';
import { CategoryBadge, MoneyText } from '@/features/budget/components';
import { useAccounts, useCategorizedTransactions } from '@/features/budget/hooks';
import { displayMerchant } from '@/features/budget/merchant';
import { CATEGORY_BY_ID, counterpartyRaw, type CategoryId, type Transaction } from '@/features/budget/model';
import { useBudgetStore } from '@/features/budget/store';
import { isUserChosen } from '@/features/budget/transactions-view';
import { useUiStore } from '@/store/ui-store';
import { useSyncMode } from '@/store/use-sync-mode';
import { useTheme } from '@/theme';

const FULL_MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;

function formatFullDate(iso: string): string {
  const day = Number(iso.slice(8, 10));
  const month = FULL_MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
  return `${day} ${month} ${iso.slice(0, 4)}`;
}

function merchantLabel(tx: Transaction): string {
  return displayMerchant(counterpartyRaw(tx) || tx.merchantKey || tx.remittanceInformation) || 'Movimento';
}

function paramId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/transactions');
}

function BackHeader() {
  const theme = useTheme();
  return (
    <PressableScale
      haptic="selection"
      onPress={goBack}
      accessibilityLabel="Indietro"
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}>
      <Icon icon={ChevronLeft} size={22} color={theme.colors.text} />
    </PressableScale>
  );
}

function DetailSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }} testID="budget-transaction-loading">
      <Skeleton width={56} height={56} radius={theme.radii.lg} />
      <Skeleton width={180} height={24} />
      <Skeleton width={140} height={40} radius={12} />
      <Skeleton height={180} radius={theme.radii.xl} />
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        minHeight: 48,
        paddingVertical: 10,
      }}>
      <AppText variant="body" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="bodyStrong" align="right" style={{ flex: 1 }}>
        {value}
      </AppText>
    </View>
  );
}

export default function TransactionDetailScreen() {
  const theme = useTheme();
  // Lives above both mode groups; a web deep link must still show the Budget accent.
  useSyncMode('budget');
  const masked = useUiStore((state) => state.hideBalances);
  const setCategoryForTransaction = useBudgetStore((state) => state.setCategoryForTransaction);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = paramId(params.id);
  const transactionsQuery = useCategorizedTransactions();
  const accountsQuery = useAccounts();
  const [open, setOpen] = useState(false);

  const transactions = transactionsQuery.data;
  const tx = transactions?.find((item) => item.id === id);
  const retry = () => {
    void transactionsQuery.refetch();
  };

  let body = <DetailSkeleton />;
  if (transactions == null) {
    body = transactionsQuery.isError ? (
      <ErrorState
        title="Movimento non disponibile"
        message="Non riesco a leggere questo movimento. Riprova tra un momento."
        onRetry={retry}
        testID="budget-transaction-error"
      />
    ) : (
      <DetailSkeleton />
    );
  } else if (!tx) {
    body = (
      <AppText variant="headline" align="center">
        Movimento non trovato
      </AppText>
    );
  } else {
    const category = CATEGORY_BY_ID[tx.categoryId ?? 'other'];
    const accountName = accountsQuery.data?.find((account) => account.id === tx.accountId)?.name ?? '—';
    const causale = tx.remittanceInformation?.trim() || '—';
    body = (
      <>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }}>
          <CategoryBadge categoryId={category.id} size={56} />
          <AppText variant="title" align="center" accessibilityRole="header">
            {merchantLabel(tx)}
          </AppText>
          <MoneyText
            amount={tx.amount.amount}
            currency={tx.amount.currency}
            variant="display"
            masked={masked}
          />
          <AppText variant="caption" color="textSecondary">
            {formatFullDate(tx.bookingDate)}
          </AppText>
        </View>
        <IslandCard index={0}>
          <InfoLine label="Conto" value={accountName} />
          <RowSeparator inset={0} />
          <InfoLine label="Stato" value={tx.status === 'pending' ? 'In sospeso' : 'Contabilizzato'} />
          <RowSeparator inset={0} />
          <InfoLine label="Causale" value={causale} />
          <RowSeparator inset={0} />
          <PressableScale
            haptic="selection"
            onPress={() => setOpen(true)}
            testID="tx-category"
            accessibilityLabel="Categoria">
            <View style={{ gap: 2, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <AppText variant="body" color="textSecondary">
                  Categoria
                </AppText>
                <View style={{ flex: 1 }} />
                <CategoryBadge categoryId={category.id} size={28} />
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {category.label}
                </AppText>
                <Icon icon={ChevronRight} size={18} color={theme.colors.textTertiary} />
              </View>
              <AppText variant="caption" color="textTertiary" testID="tx-category-source">
                {isUserChosen(tx) ? 'Scelta da te' : 'Assegnata automaticamente'}
              </AppText>
            </View>
          </PressableScale>
        </IslandCard>
        {open ? (
          <CategoryPickerSheet
            mode="single"
            selected={tx.categoryId ? [tx.categoryId] : []}
            showMerchantSwitch
            merchantSwitchDisabled={!tx.merchantKey}
            onClose={() => setOpen(false)}
            onApply={(ids, options) => {
              const categoryId: CategoryId | undefined = ids[0];
              if (categoryId) {
                setCategoryForTransaction(tx.id, categoryId, {
                  applyToMerchant: options.applyToMerchant,
                  merchantKey: tx.merchantKey,
                });
              }
              setOpen(false);
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <Screen testID="budget-transaction-screen">
      <BackHeader />
      {body}
    </Screen>
  );
}
