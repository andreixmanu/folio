import { AppText, Screen, ScreenHeader } from '@/components/ui';

export default function OverviewScreen() {
  return (
    <Screen testID="budget-overview-screen">
      <ScreenHeader title="Panoramica" />
      <AppText variant="caption" color="textTertiary">
        In arrivo
      </AppText>
    </Screen>
  );
}
