import { ApiError, getJson } from '../api/client';
import type { HistoryResult, PriceSource, QuotesResult, TimeRange } from '../types';

type WorkerQuotes = {
  source: string;
  updatedAt: string;
  quotes: { symbol: string; price: number; changePct: number }[];
  unsupported: string[];
};

type WorkerHistory = {
  source: string;
  range: TimeRange;
  series: { symbol: string; points: { t: number; close: number }[] }[];
  unsupported: string[];
};

/** Price source backed by the Folio Worker (`/prices`, `/history`), which proxies Kraken. */
export function createWorkerPriceSource(baseUrl: string | null): PriceSource {
  const url = (path: string) => {
    if (!baseUrl) throw new ApiError('API non configurata (EXPO_PUBLIC_API_URL)');
    return `${baseUrl}${path}`;
  };
  return {
    id: 'kraken',
    async getQuotes(symbols, signal): Promise<QuotesResult> {
      if (symbols.length === 0) return { source: 'kraken', quotes: [], unsupported: [], updatedAt: new Date().toISOString() };
      const body = await getJson<WorkerQuotes>(url(`/prices?symbols=${symbols.join(',')}`), { signal });
      return {
        source: body.source,
        updatedAt: body.updatedAt,
        unsupported: body.unsupported,
        quotes: body.quotes.map((q) => ({ symbol: q.symbol, price: q.price, changePct: q.changePct })),
      };
    },
    async getHistory(symbols, range, signal): Promise<HistoryResult> {
      if (symbols.length === 0) return { source: 'kraken', range, series: [], unsupported: [] };
      const body = await getJson<WorkerHistory>(
        url(`/history?symbols=${symbols.join(',')}&range=${range}`),
        { signal },
      );
      return {
        source: body.source,
        range: body.range,
        unsupported: body.unsupported,
        // Worker uses seconds (like Kraken); the app uses milliseconds.
        series: body.series.map((s) => ({
          symbol: s.symbol,
          points: s.points.map((p) => ({ t: p.t * 1000, close: p.close })),
        })),
      };
    },
  };
}
