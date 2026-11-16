import { AppText, Screen, ScreenHeader } from '@/components/ui';

export default function AnalyticsScreen() {
  return (
    <Screen testID="budget-analytics-screen">
      <ScreenHeader title="Analisi" />
      <AppText variant="caption" color="textTertiary">
        In arrivo
      </AppText>
    </Screen>
  );
}
