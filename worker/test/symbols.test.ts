import { describe, expect, test } from 'vitest';

import { normalizeSymbol, parseSymbols, pickResult } from '../src/symbols';

describe('symbols', () => {
  test('normalizes Kraken aliases', () => {
    expect(normalizeSymbol('xbt')).toBe('BTC');
    expect(normalizeSymbol('XXBT')).toBe('BTC');
    expect(normalizeSymbol('XDG')).toBe('DOGE');
    expect(normalizeSymbol('MATIC')).toBe('POL');
    expect(normalizeSymbol('FOO')).toBeNull();
  });

  test('parses, dedupes and separates unsupported symbols', () => {
    expect(parseSymbols(' btc,ETH,xbt,,foo,FOO ')).toEqual({
      supported: ['BTC', 'ETH'],
      unsupported: ['FOO'],
    });
    expect(parseSymbols(undefined)).toEqual({ supported: [], unsupported: [] });
  });

  test('pickResult accepts both legacy result keys and altnames', () => {
    expect(pickResult({ XXBTZEUR: 1 }, 'BTC')).toBe(1);
    expect(pickResult({ XBTEUR: 2 }, 'BTC')).toBe(2);
    expect(pickResult({ SOLEUR: 3 }, 'SOL')).toBe(3);
    expect(pickResult({ XETHZEUR: 4 }, 'ETH')).toBe(4);
    expect(pickResult({}, 'ETH')).toBeUndefined();
  });
});
