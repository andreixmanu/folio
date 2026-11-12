import { View } from 'react-native';

import {
  IconButton,
  IslandCard,
  ProfileAvatar,
  Screen,
  ScreenHeader,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { AllocationCard } from '@/features/portfolio/allocation-card';
import { HoldingsBySource } from '@/features/portfolio/holdings-by-source';
import { PortfolioHero } from '@/features/portfolio/portfolio-hero';
import { SourcesStrip } from '@/features/portfolio/sources-strip';
import { usePortfolio } from '@/services/hooks';
import { useUiStore } from '@/store/ui-store';
import { useTheme } from '@/theme';

function LoadingState() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <IslandCard padding="xl">
        <View style={{ gap: theme.spacing.md }}>
          <Skeleton width={110} height={14} />
          <Skeleton width={220} height={40} radius={12} />
          <Skeleton height={180} radius={theme.radii.lg} />
        </View>
      </IslandCard>
      <IslandCard>
        <Skeleton height={160} radius={theme.radii.lg} />
      </IslandCard>
    </View>
  );
}

export default function PortfolioScreen() {
  const portfolio = usePortfolio();
  const hideBalances = useUiStore((s) => s.hideBalances);
  const toggleHideBalances = useUiStore((s) => s.toggleHideBalances);

  return (
    <Screen
      testID="portfolio-screen"
      refreshing={portfolio.isRefetching}
      onRefresh={() => void portfolio.refetch()}>
      <ScreenHeader
        eyebrow="Ciao, Andrei"
        title="Portafoglio"
        right={
          <>
            <IconButton
              name={hideBalances ? 'eye-off-outline' : 'eye-outline'}
              accessibilityLabel={hideBalances ? 'Mostra saldi' : 'Nascondi saldi'}
              onPress={toggleHideBalances}
            />
            <ProfileAvatar initials="AM" />
          </>
        }
      />
      {portfolio.data ? (
        <>
          <PortfolioHero totalValue={portfolio.data.totalValue} />
          <SourcesStrip snapshot={portfolio.data} />
          <AllocationCard holdings={portfolio.data.holdings} />
          <SectionTitle title="Posizioni" />
          <HoldingsBySource snapshot={portfolio.data} />
        </>
      ) : (
        <LoadingState />
      )}
    </Screen>
  );
}
