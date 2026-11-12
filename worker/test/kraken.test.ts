import { describe, expect, test } from 'vitest';

import { normalizeOhlc, normalizeTicker, ohlcUrl, tickerUrl, unwrap } from '../src/kraken';
import { candleCount, parseRange, RANGE_SPECS, TIME_RANGES } from '../src/ranges';

import { candle, ticker } from './fixtures';

describe('normalizeTicker', () => {
  test('maps quirky result keys back to app symbols, in request order', () => {
    const result = {
      SOLEUR: ticker('73.62', '75.00'),
      XXBTZEUR: ticker('64815.1', '66646.9'),
      XETHZEUR: ticker('1812.26', '1851.67'),
    };
    const { quotes, missing } = normalizeTicker(result, ['BTC', 'ETH', 'SOL', 'ADA']);
    expect(quotes.map((q) => q.symbol)).toEqual(['BTC', 'ETH', 'SOL']);
    expect(missing).toEqual(['ADA']);
    const btc = quotes[0]!;
    expect(btc.pair).toBe('XBTEUR');
    expect(btc.price).toBeCloseTo(64815.1);
    expect(btc.open).toBeCloseTo(66646.9);
    expect(btc.changePct).toBeCloseTo(((64815.1 - 66646.9) / 66646.9) * 100, 6);
    expect(btc.high24h).toBe(4);
    expect(btc.volume24h).toBe(20);
  });

  test('treats unparsable prices as missing', () => {
    const { quotes, missing } = normalizeTicker({ SOLEUR: ticker('n/a', '1') }, ['SOL']);
    expect(quotes).toEqual([]);
    expect(missing).toEqual(['SOL']);
  });
});

describe('normalizeOhlc', () => {
  const now = 1_000_000;
  test('keeps closes inside the window and ignores the `last` field', () => {
    const result = {
      XXBTZEUR: [
        candle(now - 2 * 86_400, '1'),
        candle(now - 3_600, '2'),
        candle(now - 900, '3'),
      ],
      last: now,
    };
    expect(normalizeOhlc(result, 'BTC', RANGE_SPECS['1D'], now)).toEqual([
      { t: now - 3_600, close: 2 },
      { t: now - 900, close: 3 },
    ]);
  });

  test('ALL keeps the full history', () => {
    const result = { SOLEUR: [candle(1, '10'), candle(2, '11')], last: 2 };
    expect(normalizeOhlc(result, 'SOL', RANGE_SPECS.ALL, now)).toHaveLength(2);
  });

  test('returns [] when the pair is absent', () => {
    expect(normalizeOhlc({ last: 1 }, 'ETH', RANGE_SPECS['1M'], now)).toEqual([]);
  });
});

describe('ranges', () => {
  test.each(TIME_RANGES)('%s fits within Kraken’s 720-candle limit', (range) => {
    const n = candleCount(range);
    if (n !== null) expect(n).toBeLessThanOrEqual(720);
  });

  test('parses aliases', () => {
    expect(parseRange('tutto')).toBe('ALL');
    expect(parseRange('1m')).toBe('1M');
    expect(parseRange('2Y')).toBeNull();
  });
});

describe('urls and errors', () => {
  test('requests by altname', () => {
    expect(tickerUrl(['BTC', 'ETH', 'DOGE'])).toBe(
      'https://api.kraken.com/0/public/Ticker?pair=XBTEUR,ETHEUR,XDGEUR',
    );
    expect(ohlcUrl('BTC', '1Y', 10_000_000)).toContain('pair=XBTEUR&interval=1440&since=');
    expect(ohlcUrl('BTC', 'ALL', 10_000_000)).not.toContain('since');
  });

  test('unwrap surfaces Kraken errors', () => {
    expect(() => unwrap({ error: ['EQuery:Unknown asset pair'] })).toThrow(/Unknown asset pair/);
    expect(unwrap({ error: [], result: { a: 1 } })).toEqual({ a: 1 });
  });
});
