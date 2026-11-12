import type { ColorTokens } from '@/theme/colors';

import type { AllocationSlice, AssetClass, Holding, Source } from './types';

const CLASS_LABELS: Record<AssetClass, string> = {
  stocks: 'Azioni & ETF',
  crypto: 'Crypto',
};

function toSlices(
  entries: { key: string; label: string; value: number; color: string }[],
): AllocationSlice[] {
  const total = entries.reduce((s, e) => s + e.value, 0);
  return entries
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((e) => ({ ...e, percent: total > 0 ? (e.value / total) * 100 : 0 }));
}

/** Allocation by asset class (stocks & ETFs vs crypto). */
export function allocationByClass(holdings: Holding[], colors: ColorTokens): AllocationSlice[] {
  const totals: Record<AssetClass, number> = { stocks: 0, crypto: 0 };
  for (const h of holdings) totals[h.assetClass] += h.value;
  return toSlices(
    (Object.keys(totals) as AssetClass[]).map((k) => ({
      key: k,
      label: CLASS_LABELS[k],
      value: totals[k],
      color: colors.assetClass[k],
    })),
  );
}

/** Allocation by asset symbol, merging the same asset across sources (e.g. BTC on Ledger + Binance). */
export function allocationByAsset(
  holdings: Holding[],
  colors: ColorTokens,
  maxSlices = 6,
): AllocationSlice[] {
  const bySymbol = new Map<string, { label: string; value: number }>();
  for (const h of holdings) {
    const prev = bySymbol.get(h.symbol);
    bySymbol.set(h.symbol, { label: h.symbol, value: (prev?.value ?? 0) + h.value });
  }
  const sorted = [...bySymbol.entries()].sort((a, b) => b[1].value - a[1].value);
  const top = sorted.slice(0, maxSlices);
  const rest = sorted.slice(maxSlices).reduce((s, [, v]) => s + v.value, 0);
  const entries = top.map(([key, v], i) => ({
    key,
    label: v.label,
    value: v.value,
    color: colors.chart[i % colors.chart.length]!,
  }));
  if (rest > 0) entries.push({ key: 'other', label: 'Altro', value: rest, color: colors.textTertiary });
  return toSlices(entries);
}

/** Allocation by source (IBKR, each wallet, each exchange; later a bank). */
export function allocationBySource(
  holdings: Holding[],
  sources: Source[],
  colorFor: (sourceId: string, index: number) => string,
): AllocationSlice[] {
  return toSlices(
    sources.map((s, i) => ({
      key: s.id,
      label: s.name,
      value: holdings.filter((h) => h.sourceId === s.id).reduce((sum, h) => sum + h.value, 0),
      color: colorFor(s.id, i),
    })),
  );
}

export const ASSET_CLASS_LABELS = CLASS_LABELS;
