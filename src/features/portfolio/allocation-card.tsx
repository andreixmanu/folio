import { View } from 'react-native';

import { AllocationDonut } from '@/components/charts/allocation-donut';
import { AppText, SegmentedControl } from '@/components/ui';
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

/** Allocation on the canvas: title, text tabs, donut and a hairline legend. */
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
    <View testID="allocation-card" style={{ gap: theme.spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 32,
        }}>
        <AppText variant="headline">Allocazione</AppText>
        <SegmentedControl
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          size="sm"
          variant="underline"
          testID="allocation-mode"
        />
      </View>
      <AllocationDonut key={mode} slices={slices} masked={masked} />
    </View>
  );
}
