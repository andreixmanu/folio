import Animated from 'react-native-reanimated';

import { AppText, HeroBalance } from '@/components/ui';
import { enterFade, useTheme } from '@/theme';

import type { Account } from '../model';

import { AccountStrip } from './account-strip';

/** Wallet-home balance block for Budget: centred total on the mode-accent glow. */
export function BudgetHero({
  total,
  accounts,
  masked,
}: {
  total: number;
  accounts: readonly Account[];
  masked: boolean;
}) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={enterFade()}
      testID="budget-balance"
      style={{
        alignItems: 'center',
        paddingTop: theme.spacing.xl,
        paddingBottom: theme.spacing.sm,
        gap: theme.spacing.md,
      }}>
      <HeroBalance value={total} masked={masked} testID="budget-total" />
      <AppText variant="caption" color="textSecondary">
        Saldo totale
      </AppText>
      <AccountStrip accounts={accounts} masked={masked} bleed={false} />
    </Animated.View>
  );
}
