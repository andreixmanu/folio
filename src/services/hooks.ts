import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { buildSnapshot, buildValueHistory } from './portfolio';
import { queryKeys } from './query-keys';
import { RANGE_SPECS } from './ranges';
import { newsSource, positionsSource, priceSources } from './sources';
import type { AssetClass, NewsCategory, Position, TimeRange } from './types';

/** Crypto tickers refresh every 30s while the app is focused (the Worker caches for 30s too). */
export const QUOTE_REFRESH_MS = 30_000;

export type PriceStatus = 'loading' | 'live' | 'stale' | 'error';

function symbolsOf(positions: Position[] | undefined, assetClass: AssetClass): string[] {
  return [...new Set((positions ?? []).filter((p) => p.assetClass === assetClass).map((p) => p.symbol))].sort();
}

function usePositions() {
  const sources = useQuery({
    queryKey: queryKeys.sources,
    queryFn: () => positionsSource.getSources(),
    staleTime: Infinity,
  });
  const positions = useQuery({
    queryKey: queryKeys.positions,
    queryFn: () => positionsSource.getPositions(),
    staleTime: Infinity,
  });
  return { sources, positions };
}

function useQuotes(assetClass: AssetClass, symbols: string[], enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.quotes(assetClass, symbols),
    queryFn: ({ signal }) => priceSources[assetClass].getQuotes(symbols, signal),
    enabled,
    staleTime: assetClass === 'crypto' ? QUOTE_REFRESH_MS - 5_000 : 5 * 60_000,
    refetchInterval: assetClass === 'crypto' ? QUOTE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry: 2,
  });
}

/**
 * Portfolio snapshot = mock positions × prices (crypto live from Kraken, stocks mock).
 * Degrades gracefully: on a failed refresh the last prices stay on screen (`stale`).
 */
export function usePortfolio() {
  const { sources, positions } = usePositions();
  const cryptoSymbols = symbolsOf(positions.data, 'crypto');
  const stockSymbols = symbolsOf(positions.data, 'stocks');
  const crypto = useQuotes('crypto', cryptoSymbols, positions.isSuccess);
  const stocks = useQuotes('stocks', stockSymbols, positions.isSuccess);

  const data = useMemo(
    () =>
      sources.data && positions.data && crypto.data && stocks.data
        ? buildSnapshot(
            sources.data,
            positions.data,
            [...crypto.data.quotes, ...stocks.data.quotes],
            crypto.data.updatedAt,
          )
        : undefined,
    [sources.data, positions.data, crypto.data, stocks.data],
  );

  const status: PriceStatus = crypto.isError
    ? crypto.data
      ? 'stale'
      : 'error'
    : crypto.data
      ? 'live'
      : 'loading';

  return {
    data,
    status,
    error: crypto.error,
    /** Epoch ms of the last successful crypto price fetch. */
    pricesUpdatedAt: crypto.dataUpdatedAt,
    isFetching: crypto.isFetching,
    isRefetching: crypto.isRefetching,
    refetch: () => Promise.all([crypto.refetch(), stocks.refetch()]),
  };
}

/**
 * Value history for a range = current quantities × historical closes
 * (Kraken OHLC for crypto, mock for stocks). `live` pins the last point to the live total.
 */
export function useValueHistory(range: TimeRange, live?: { t: number; value: number }) {
  const { positions } = usePositions();
  const cryptoSymbols = symbolsOf(positions.data, 'crypto');
  const stockSymbols = symbolsOf(positions.data, 'stocks');

  const query = useQuery({
    queryKey: queryKeys.history(range, [...cryptoSymbols, ...stockSymbols]),
    enabled: positions.isSuccess,
    queryFn: async ({ signal }) => {
      const [c, s] = await Promise.all([
        priceSources.crypto.getHistory(cryptoSymbols, range, signal),
        priceSources.stocks.getHistory(stockSymbols, range, signal),
      ]);
      return [...c.series, ...s.series];
    },
    staleTime: RANGE_SPECS[range].staleMs,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const liveT = live?.t;
  const liveValue = live?.value;
  const data = useMemo(
    () =>
      query.data && positions.data
        ? buildValueHistory(
            positions.data,
            query.data,
            range,
            liveT && liveValue ? { t: liveT, value: liveValue } : undefined,
          )
        : undefined,
    [query.data, positions.data, range, liveT, liveValue],
  );

  return {
    data,
    isError: query.isError,
    isPlaceholderData: query.isPlaceholderData,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useNews(category: NewsCategory | 'all') {
  return useQuery({
    queryKey: queryKeys.news(category),
    queryFn: () => newsSource.getArticles(category === 'all' ? undefined : category),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
