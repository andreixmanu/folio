import type { PriceSource } from '../types';

/**
 * Combines a primary and a fallback price source: symbols the primary reports as
 * `unsupported` are retried on the fallback. Intended for e.g. Kraken -> OpenMarket later.
 */
export function withFallback(primary: PriceSource, fallback: PriceSource): PriceSource {
  return {
    id: `${primary.id}+${fallback.id}`,
    async getQuotes(symbols, signal) {
      const first = await primary.getQuotes(symbols, signal);
      if (first.unsupported.length === 0) return first;
      const second = await fallback.getQuotes(first.unsupported, signal);
      return {
        source: this.id,
        updatedAt: first.updatedAt,
        quotes: [...first.quotes, ...second.quotes],
        unsupported: second.unsupported,
      };
    },
    async getHistory(symbols, range, signal) {
      const first = await primary.getHistory(symbols, range, signal);
      if (first.unsupported.length === 0) return first;
      const second = await fallback.getHistory(first.unsupported, range, signal);
      return {
        source: this.id,
        range,
        series: [...first.series, ...second.series],
        unsupported: second.unsupported,
      };
    },
  };
}
