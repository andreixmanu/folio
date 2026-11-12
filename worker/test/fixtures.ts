import type { KrakenCandle, KrakenTicker } from '../src/kraken';

export function ticker(last: string, open: string): KrakenTicker {
  return {
    a: [last, '1', '1.000'],
    b: [last, '1', '1.000'],
    c: [last, '0.1'],
    v: ['10', '20'],
    p: [last, last],
    t: [1, 2],
    l: ['1', '2'],
    h: ['3', '4'],
    o: open,
  };
}

export function candle(t: number, close: string): KrakenCandle {
  return [t, close, close, close, close, close, '1', 1];
}
