import { allocationByClass } from '@/services/allocation';
import type { Holding, PortfolioSnapshot } from '@/services/types';
import { balancesAreHidden } from '@/store/ui-store';
import { darkColors } from '@/theme/colors';

/** Wire shape of `POST /chat` `portfolio`. Amounts are omitted when balances are hidden. */
export type ChatHolding = {
  symbol: string;
  name: string;
  assetClass: string;
  quantity?: number;
  value?: number;
  weightPct: number;
  changePct?: number;
};

export type ChatPortfolio = {
  totalValue?: number;
  currency: string;
  holdings: ChatHolding[];
  allocation?: { label: string; percent: number }[];
};

function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function round2(n: number): number {
  return roundTo(n, 2);
}

/** Largest slice absorbs rounding drift so displayed weights still sum to 100. */
function roundedWeights(values: number[], total: number): number[] {
  if (total <= 0) return values.map(() => 0);
  const rounded = values.map((value) => round2((value / total) * 100));
  const drift = round2(rounded.reduce((sum, weight) => sum + weight, 0) - 100);
  if (drift !== 0 && rounded.length > 0) {
    let index = 0;
    for (let i = 1; i < rounded.length; i++) {
      if ((rounded[i] ?? 0) > (rounded[index] ?? 0)) index = i;
    }
    const adjusted = round2((rounded[index] ?? 0) - drift);
    if (adjusted >= 0) rounded[index] = adjusted;
  }
  return rounded;
}

function holdingOf(holding: Holding, weightPct: number, hideBalances: boolean): ChatHolding {
  const compact: ChatHolding = {
    symbol: holding.symbol,
    name: holding.name,
    assetClass: holding.assetClass,
    weightPct,
    changePct: round2(holding.changePct),
  };
  if (hideBalances) return compact;
  return {
    ...compact,
    quantity: roundTo(holding.quantity, 8),
    value: round2(holding.value),
  };
}

/**
 * Compact portfolio sent with each chat turn.
 * `hideBalances` (default: the privacy toggle) drops quantities and euro amounts
 * and keeps only weights and allocation percents.
 */
export function buildPortfolioContext(
  snapshot: PortfolioSnapshot,
  hideBalances?: boolean,
): ChatPortfolio {
  const hide = hideBalances ?? balancesAreHidden();
  const total = snapshot.totalValue;
  const weights = roundedWeights(
    snapshot.holdings.map((holding) => holding.value),
    total,
  );
  const holdings = snapshot.holdings.map((holding, index) =>
    holdingOf(holding, weights[index] ?? 0, hide),
  );
  const allocation = allocationByClass(snapshot.holdings, darkColors).map((slice) => ({
    label: slice.label,
    percent: round2(slice.percent),
  }));

  const portfolio: ChatPortfolio = {
    currency: snapshot.baseCurrency,
    holdings,
    ...(allocation.length > 0 ? { allocation } : {}),
  };
  if (!hide) portfolio.totalValue = round2(total);
  return portfolio;
}
