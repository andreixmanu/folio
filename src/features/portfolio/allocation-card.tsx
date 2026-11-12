import { View } from 'react-native';

import { AllocationDonut } from '@/components/charts/allocation-donut';
import { AppText, IslandCard, SegmentedControl } from '@/components/ui';
import { allocationByAsset, allocationByClass, allocationBySource } from '@/services/allocation';
import type { PortfolioSnapshot } from '@/services/types';
import { useUiStore, type AllocationMode } from '@/store/ui-store';
import { useTheme } from '@/theme';

import { SOURCE_COLORS } from './source-meta';

const MODE_OPTIONS: { value: AllocationMode; label: string }[] = [
  { value: 'class', label: 'Classe' },
  { value: 'asset', label: 'Asset' },
  { value: 'source', label: 'Fonte' },
];

/** Allocation island: by asset class, by asset, or by source (per-source summary rows). */
export function AllocationCard({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const theme = useTheme();
  const mode = useUiStore((s) => s.allocationMode);
  const setMode = useUiStore((s) => s.setAllocationMode);
  const masked = useUiStore((s) => s.hideBalances);
  const slices =
    mode === 'class'
      ? allocationByClass(snapshot.holdings, theme.colors)
      : mode === 'asset'
        ? allocationByAsset(snapshot.holdings, theme.colors, 5)
        : allocationBySource(
            snapshot.holdings,
            snapshot.sources,
            (id, i) => SOURCE_COLORS[id] ?? theme.colors.chart[i % theme.colors.chart.length]!,
          );

  return (
    <IslandCard index={1} testID="allocation-card">
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="headline">Allocazione</AppText>
          <View style={{ width: 186 }}>
            <SegmentedControl
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
              size="sm"
              testID="allocation-mode"
            />
          </View>
        </View>
        <AllocationDonut key={mode} slices={slices} masked={masked} />
      </View>
    </IslandCard>
  );
}
