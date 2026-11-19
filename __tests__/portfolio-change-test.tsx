import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';

import { ChangeChip } from '@/components/ui/change-chip';
import { downsampleLttb } from '@/lib/downsample';
import { assembleValueHistory, buildSnapshot, buildValueHistory, valueChange } from '@/services/portfolio';
import type { Position, PriceQuote, PriceSeries } from '@/services/types';
import { darkColors } from '@/theme/colors';

import { useUiStore } from '@/store/ui-store';

import { renderWithProviders } from '../test/test-utils';

/**
 * Definition locked by these fixtures:
 * euro change = value_end − value_start, percent = change / value_start.
 * value is today's quantity × the EUR price (Kraken EUR, or IBKR markPriceBase).
 * No cash-flow ledger: deposits and withdrawals are not applied. A holding with no
 * candles stays flat at its live EUR mark, like an IBKR line. Day change is a
 * different number: it uses each quote's open (crypto: 00:00 UTC), not the 1D candle.
 */

function coin(symbol: string, quantity: number): Position {
  return {
    id: symbol,
    sourceId: 'tangem',
    symbol,
    name: symbol,
    assetClass: 'crypto',
    instrument: 'coin',
    quantity,
  };
}

function stock(quantity: number): Position {
  return {
    id: 'acme',
    sourceId: 'ibkr',
    symbol: 'ACME',
    name: 'Acme',
    assetClass: 'stocks',
    instrument: 'stock',
    instrumentId: 'c:42',
    quantity,
  };
}

const BTC_SERIES: PriceSeries = {
  symbol: 'BTC',
  points: [
    { t: 1_000, close: 100 },
    { t: 2_000, close: 130 },
  ],
};

describe('day change', () => {
  test('sums quantity × (last − open) and divides by the previous total', () => {
    // BTC 110 vs open 100 → +10. ETH 75 vs open 100 → −25. Stock unchanged.
    // previous = 100 + 100 + 300 = 500. move = 10 − 25 = −15. percent = −15/500.
    const snap = buildSnapshot(
      [],
      [coin('BTC', 1), coin('ETH', 1), stock(1)],
      [
        { symbol: 'BTC', price: 110, changePct: 10 },
        { symbol: 'ETH', price: 75, changePct: -25 },
        { symbol: 'ACME', instrumentId: 'c:42', price: 300, changePct: 0 },
      ],
      't',
    );
    expect(snap.totalValue).toBe(485);
    expect(snap.dayChange).toBe(-15);
    expect(snap.dayChangePct).toBe(-3);
  });

  test('rounds the euro move to the cent before the percent', () => {
    // value = round(3 × 10.01, 2) = 30.03. previous = 30.03 / 1.01 = 29.7326…
    // raw move 0.2973… rounds to 0.30. percent = 0.30 / 29.73.
    const snap = buildSnapshot(
      [],
      [coin('BTC', 3)],
      [{ symbol: 'BTC', price: 10.01, changePct: 1 }],
      't',
    );
    expect(snap.totalValue).toBe(30.03);
    expect(snap.dayChange).toBe(0.3);
    expect(snap.dayChangePct).toBeCloseTo((0.3 / 29.73) * 100, 10);
  });

  test('a −100% quote adds nothing and does not poison the other holding', () => {
    // ETH: 50 − 50/0.98 = −1.020408… → −1.02. Base = 150 − (−1.02) = 151.02.
    const snap = buildSnapshot(
      [],
      [coin('BTC', 1), coin('ETH', 1)],
      [
        { symbol: 'BTC', price: 100, changePct: -100 },
        { symbol: 'ETH', price: 50, changePct: -2 },
      ],
      't',
    );
    expect(snap.dayChange).toBe(-1.02);
    expect(snap.dayChangePct).toBeCloseTo((-1.02 / 151.02) * 100, 10);
  });

  test('an unpriced holding is left out of both the total and the move', () => {
    // BTC value 100, previous 100/1.1 = 90.9090…, move rounds to 9.09.
    const snap = buildSnapshot(
      [],
      [coin('BTC', 1), coin('ETH', 2)],
      [{ symbol: 'BTC', price: 100, changePct: 10 }],
      't',
    );
    expect(snap.unpriced).toEqual(['ETH']);
    expect(snap.totalValue).toBe(100);
    expect(snap.dayChange).toBe(9.09);
    expect(snap.dayChangePct).toBeCloseTo((9.09 / 90.91) * 100, 10);
  });
});

describe('range change', () => {
  const quotes: PriceQuote[] = [
    { symbol: 'BTC', price: 132, changePct: 32 },
    { symbol: 'ETH', price: 40, changePct: 0 },
    { symbol: 'ACME', instrumentId: 'c:42', price: 90, changePct: 0 },
  ];

  test('is the live total minus the first point, over that first point', () => {
    // Start: 100×1 + 90×4 = 460. Live end: 132 + 360 = 492. Move 32. Percent 32/460.
    const positions = [coin('BTC', 1), stock(4)];
    const stockSeries: PriceSeries = {
      symbol: 'ACME',
      instrumentId: 'c:42',
      points: [
        { t: 0, close: 90 },
        { t: 4_000, close: 90 },
      ],
    };
    const history = assembleValueHistory({
      positions,
      cryptoSeries: [BTC_SERIES],
      stockSeries: [stockSeries],
      quotes,
      range: '1M',
      live: { t: 4_000, value: 492 },
    });
    expect(history.range).toBe('1M');
    expect(history.points[0]).toEqual({ timestamp: 1_000, value: 460 });
    expect(history.points.at(-1)).toEqual({ timestamp: 4_000, value: 492 });
    expect(history.change).toBe(32);
    expect(history.changePct).toBeCloseTo((32 / 460) * 100, 10);
    expect(history.change).toBe(history.points.at(-1)!.value - history.points[0]!.value);
  });

  test('a coin with no candles stays flat and is not booked as a deposit', () => {
    // ETH 2 × 40 = 80 is in the start and the end. BTC 100 → 132 is the whole move.
    // Pinning the live total (212) onto a BTC-only line would have reported +112.
    const positions = [coin('BTC', 1), coin('ETH', 2)];
    const history = assembleValueHistory({
      positions,
      cryptoSeries: [BTC_SERIES],
      stockSeries: [],
      quotes,
      range: '1W',
      live: { t: 4_000, value: 212 },
    });
    expect(history.points[0]!.value).toBe(180);
    expect(history.points.at(-1)!.value).toBe(212);
    expect(history.change).toBe(32);
    expect(history.changePct).toBeCloseTo((32 / 180) * 100, 10);
  });

  test('does not pin a total that is missing a charted holding', () => {
    // BTC has candles but no quote. Live total is the stock only (360).
    // Using it as the end would turn a +30 BTC move into −100.
    const history = assembleValueHistory({
      positions: [coin('BTC', 1), stock(4)],
      cryptoSeries: [BTC_SERIES],
      stockSeries: [
        {
          symbol: 'ACME',
          instrumentId: 'c:42',
          points: [
            { t: 0, close: 90 },
            { t: 4_000, close: 90 },
          ],
        },
      ],
      quotes: [{ symbol: 'ACME', instrumentId: 'c:42', price: 90, changePct: 0 }],
      range: '1D',
      live: { t: 4_000, value: 360 },
    });
    expect(history.points.map((p) => p.value)).toEqual([460, 490]);
    expect(history.change).toBe(30);
    expect(history.changePct).toBeCloseTo((30 / 460) * 100, 10);
  });

  test('FX is already in the EUR mark, so a flat USD line does not move the euros', () => {
    // 4 shares × $100 × 0.9 = 360 EUR, constant. Crypto +30 EUR. Percent uses 460, not 100.
    const history = buildValueHistory(
      [coin('BTC', 1), stock(4)],
      [
        BTC_SERIES,
        {
          symbol: 'ACME',
          instrumentId: 'c:42',
          points: [
            { t: 0, close: 90 },
            { t: 2_000, close: 90 },
          ],
        },
      ],
      '1Y',
    );
    expect(history.points[0]!.value).toBe(460);
    expect(history.points[1]!.value).toBe(490);
    expect(history.change).toBe(30);
    expect(history.changePct).toBeCloseTo((30 / 460) * 100, 10);
  });

  test('today’s quantity is applied to the whole window, so a deposit is not a separate flow', () => {
    const series = [BTC_SERIES];
    const one = buildValueHistory([coin('BTC', 1)], series, 'ALL');
    const two = buildValueHistory([coin('BTC', 2)], series, 'ALL');
    // Price 100 → 130. One coin: +30 / 100. Two coins: +60 / 200. Same percent.
    expect(one.change).toBe(30);
    expect(one.changePct).toBe(30);
    expect(two.change).toBe(60);
    expect(two.changePct).toBe(30);
  });

  test('the window starts when every holding has a price', () => {
    // ETH does not exist at t=1. That point is dropped, not priced at 0.
    const history = buildValueHistory(
      [coin('BTC', 1), coin('ETH', 2)],
      [
        {
          symbol: 'BTC',
          points: [
            { t: 1, close: 100 },
            { t: 2, close: 110 },
            { t: 3, close: 120 },
          ],
        },
        {
          symbol: 'ETH',
          points: [
            { t: 2, close: 10 },
            { t: 3, close: 12 },
          ],
        },
      ],
      'ALL',
    );
    expect(history.points.map((p) => p.timestamp)).toEqual([2, 3]);
    expect(history.points[0]!.value).toBe(130);
    expect(history.points[1]!.value).toBe(144);
    expect(history.change).toBe(14);
    expect(history.changePct).toBeCloseTo((14 / 130) * 100, 10);
  });

  test('a missing middle close is carried forward', () => {
    // t=2 has no ETH print, so ETH stays 10. Values 110, 120, 150.
    const history = buildValueHistory(
      [coin('BTC', 1), coin('ETH', 1)],
      [
        {
          symbol: 'BTC',
          points: [
            { t: 1, close: 100 },
            { t: 2, close: 110 },
            { t: 3, close: 120 },
          ],
        },
        {
          symbol: 'ETH',
          points: [
            { t: 1, close: 10 },
            { t: 3, close: 30 },
          ],
        },
      ],
      '1M',
    );
    expect(history.points.map((p) => p.value)).toEqual([110, 120, 150]);
    expect(history.change).toBe(40);
    expect(history.changePct).toBeCloseTo((40 / 110) * 100, 10);
  });

  test('the day move and the 1D candle move are different numbers', () => {
    const snap = buildSnapshot([], [coin('BTC', 1)], [{ symbol: 'BTC', price: 110, changePct: 10 }], 't');
    const history = assembleValueHistory({
      positions: [coin('BTC', 1)],
      cryptoSeries: [
        {
          symbol: 'BTC',
          points: [
            { t: 1_000, close: 90 },
            { t: 2_000, close: 100 },
          ],
        },
      ],
      stockSeries: [],
      quotes: [{ symbol: 'BTC', price: 110, changePct: 10 }],
      range: '1D',
      live: { t: 3_000, value: snap.totalValue },
    });
    expect(snap.dayChange).toBe(10);
    expect(snap.dayChangePct).toBeCloseTo(10, 8);
    expect(history.change).toBe(20);
    expect(history.changePct).toBeCloseTo((20 / 90) * 100, 10);
    expect(history.change).not.toBe(snap.dayChange);
  });

  test('empty, a single point, and a zero start', () => {
    expect(valueChange([])).toEqual({ start: 0, end: 0, change: 0, changePct: 0 });
    const one = buildValueHistory([coin('BTC', 1)], [{ symbol: 'BTC', points: [{ t: 1, close: 40 }] }], '1D');
    expect(one.change).toBe(0);
    expect(one.changePct).toBe(0);
    const fromZero = buildValueHistory(
      [coin('BTC', 1)],
      [
        {
          symbol: 'BTC',
          points: [
            { t: 1, close: 0 },
            { t: 2, close: 10 },
          ],
        },
      ],
      '1D',
    );
    expect(fromZero.change).toBe(10);
    expect(fromZero.changePct).toBe(0);
  });

  test('percent uses the cent-rounded euro change', () => {
    // 0.3 − 0.1 is not exact in binary. The displayed euro is 0.20, so the percent is 200.
    const move = valueChange([
      { timestamp: 1, value: 0.1 },
      { timestamp: 2, value: 0.3 },
    ]);
    expect(move.change).toBe(0.2);
    expect(move.changePct).toBe(200);
  });

  test('scrub uses the touched point as the end and the chart keeps that end', () => {
    const history = buildValueHistory(
      [coin('BTC', 1)],
      [
        {
          symbol: 'BTC',
          points: [
            { t: 1, close: 100 },
            { t: 2, close: 140 },
            { t: 3, close: 180 },
            { t: 4, close: 150 },
          ],
        },
      ],
      '1W',
    );
    expect(valueChange(history.points, 0).change).toBe(0);
    expect(valueChange(history.points, 1)).toMatchObject({ start: 100, end: 140, change: 40, changePct: 40 });
    expect(valueChange(history.points).change).toBe(history.change);
    expect(history.change).toBe(50);
    const drawn = downsampleLttb(history.points, 3);
    expect(drawn[0]!.value).toBe(history.points[0]!.value);
    expect(drawn.at(-1)!.value).toBe(history.points.at(-1)!.value);
    expect(valueChange(drawn).change).toBe(history.change);
  });
});

describe('change chip sign and colour', () => {
  test('a loss is negative, ribasso, and the negative colour', async () => {
    useUiStore.setState({ themeMode: 'dark' });
    const history = buildValueHistory(
      [coin('BTC', 1)],
      [
        {
          symbol: 'BTC',
          points: [
            { t: 1, close: 200 },
            { t: 2, close: 150 },
          ],
        },
      ],
      '1M',
    );
    expect(history.change).toBe(-50);
    expect(history.changePct).toBe(-25);
    await renderWithProviders(
      <ChangeChip percent={history.changePct} amount={history.change} testID="chip" />,
    );
    expect(screen.getByTestId('chip').props.accessibilityLabel).toMatch(/^In ribasso −50,00\s€ · 25%$/);
    const flat = StyleSheet.flatten(screen.getByTestId('chip').props.style);
    expect(flat.backgroundColor).toBe(darkColors.negativeMuted);
  });
});
