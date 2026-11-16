import { AppText, Screen, ScreenHeader } from '@/components/ui';

export default function TransactionsScreen() {
  return (
    <Screen testID="budget-transactions-screen">
      <ScreenHeader title="Movimenti" />
      <AppText variant="caption" color="textTertiary">
        In arrivo
      </AppText>
    </Screen>
  );
}
