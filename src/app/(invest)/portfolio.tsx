import { Eye, EyeOff } from '@/components/ui/icons';
import { View } from 'react-native';

import {
  ErrorState,
  IconButton,
  IslandCard,
  ProfileAvatar,
  Screen,
  ScreenHeader,
  Skeleton,
} from '@/components/ui';
import { AllocationCard } from '@/features/portfolio/allocation-card';
import { HoldingsBySource } from '@/features/portfolio/holdings-by-source';
import { PortfolioHero } from '@/features/portfolio/portfolio-hero';
import { usePortfolio } from '@/services/hooks';
import { useUiStore } from '@/store/ui-store';
import { useTheme } from '@/theme';

function LoadingState() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <IslandCard>
        <View style={{ gap: theme.spacing.md }}>
          <Skeleton width={110} height={14} />
          <Skeleton width={220} height={40} radius={12} />
          <Skeleton height={150} radius={theme.radii.lg} />
        </View>
      </IslandCard>
      <IslandCard>
        <Skeleton height={120} radius={theme.radii.lg} />
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
        title="Portafoglio"
        right={
          <>
            <IconButton
              icon={hideBalances ? EyeOff : Eye}
              accessibilityLabel={hideBalances ? 'Mostra saldi' : 'Nascondi saldi'}
              onPress={toggleHideBalances}
            />
            <ProfileAvatar initials="AM" />
          </>
        }
      />
      {portfolio.data ? (
        <>
          <PortfolioHero
            totalValue={portfolio.data.totalValue}
            status={portfolio.status}
            pricesUpdatedAt={portfolio.pricesUpdatedAt}
          />
          <AllocationCard snapshot={portfolio.data} />
          <HoldingsBySource
            snapshot={portfolio.data}
            walletNote={portfolio.walletNote}
            onRetryWallets={() => void portfolio.refetchWallets()}
          />
        </>
      ) : portfolio.status === 'error' ? (
        <ErrorState
          title="Prezzi non disponibili"
          message={`Impossibile contattare il server dei prezzi. ${portfolio.error?.message ?? ''}`.trim()}
          onRetry={() => void portfolio.refetch()}
          testID="portfolio-error"
        />
      ) : (
        <LoadingState />
      )}
    </Screen>
  );
}
