import { ScrollView, View } from 'react-native';

import { IconBadge } from '@/components/ui';
import { AppText } from '@/components/ui/text';
import { CreditCard, Landmark, PiggyBank, type LucideIcon } from '@/components/ui/icons';
import { useTheme } from '@/theme';

import type { Account, AccountKind } from '../model';

import { MoneyText } from './money-text';

const KIND_ICON: Record<AccountKind, LucideIcon> = {
  current: Landmark,
  card: CreditCard,
  savings: PiggyBank,
};

/** Compact horizontal account chips: name, bank, balance. */
export function AccountStrip({ accounts, masked = false }: { accounts: readonly Account[]; masked?: boolean }) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -theme.spacing.lg, flexGrow: 0 }}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg }}
      testID="budget-accounts">
      {accounts.map((account) => {
        const bankLine =
          account.institutionName === account.name && account.iban
            ? `${account.institutionName} · ${account.iban}`
            : account.institutionName;
        return (
          <View
            key={account.id}
            testID={`budget-account-${account.id}`}
            accessibilityLabel={`${account.name}, ${account.institutionName}`}
            style={{
              width: 168,
              gap: 2,
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.surfaceMuted,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <IconBadge icon={KIND_ICON[account.kind]} color={theme.colors.accent} size={28} />
              <View style={{ flex: 1 }}>
                <AppText variant="label" numberOfLines={1}>
                  {account.name}
                </AppText>
                <AppText variant="micro" color="textTertiary" numberOfLines={1}>
                  {bankLine}
                </AppText>
              </View>
            </View>
            <MoneyText
              amount={account.balance.amount}
              currency={account.balance.currency}
              masked={masked}
              tone="balance"
              variant="bodyStrong"
            />
          </View>
        );
      })}
    </ScrollView>
  );
}
