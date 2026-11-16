import { AppText, Screen, ScreenHeader } from '@/components/ui';

export default function BudgetsScreen() {
  return (
    <Screen testID="budget-budgets-screen">
      <ScreenHeader title="Budget" />
      <AppText variant="caption" color="textTertiary">
        In arrivo
      </AppText>
    </Screen>
  );
}
