import { View } from 'react-native';

import { AllocationDonut } from '@/components/charts/allocation-donut';
import { IslandCard, SectionTitle, SegmentedControl } from '@/components/ui';
import { allocationByAsset, allocationByClass } from '@/services/allocation';
import type { Holding } from '@/services/types';
import { useUiStore, type AllocationMode } from '@/store/ui-store';
import { useTheme } from '@/theme';

const MODE_OPTIONS: { value: AllocationMode; label: string }[] = [
  { value: 'class', label: 'Classe' },
  { value: 'asset', label: 'Asset' },
];

export function AllocationCard({ holdings }: { holdings: Holding[] }) {
  const theme = useTheme();
  const mode = useUiStore((s) => s.allocationMode);
  const setMode = useUiStore((s) => s.setAllocationMode);
  const masked = useUiStore((s) => s.hideBalances);
  const slices =
    mode === 'class' ? allocationByClass(holdings, theme.colors) : allocationByAsset(holdings, theme.colors);

  return (
    <IslandCard index={2} testID="allocation-card">
      <View style={{ gap: theme.spacing.lg }}>
        <SectionTitle
          title="Allocazione"
          right={
            <View style={{ width: 150 }}>
              <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} size="sm" />
            </View>
          }
        />
        <AllocationDonut key={mode} slices={slices} masked={masked} radius={62} />
      </View>
    </IslandCard>
  );
}
