import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { MOCK_POSITIONS } from './mock/positions';
import { buildSnapshot, buildValueHistory } from './portfolio';
import { queryKeys } from './query-keys';
import { RANGE_SPECS } from './ranges';
import { newsSource, positionsSource, priceSources } from './sources';
import type { AssetClass, NewsCategory, Position, TimeRange } from './types';
import { fetchWallets, mapWalletsToPositions, walletStatusNote } from './wallets';

/** Crypto tickers refresh every 30s while the app is focused (the Worker caches for 30s too). */
export const QUOTE_REFRESH_MS = 30_000;
const WALLETS_STALE_MS = 60_000;

export type PriceStatus = 'loading' | 'live' | 'stale' | 'error';

function symbolsOf(positions: Position[] | undefined, assetClass: AssetClass): string[] {
  return [...new Set((positions ?? []).filter((p) => p.assetClass === assetClass).map((p) => p.symbol))].sort();
}

function useWallets() {
  return useQuery({
    queryKey: queryKeys.wallets,
    queryFn: ({ signal }) => fetchWallets(signal),
    staleTime: WALLETS_STALE_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

function usePositions() {
  const wallets = useWallets();
  const sources = useQuery({
    queryKey: queryKeys.sources,
    queryFn: () => positionsSource.getSources(),
    staleTime: Infinity,
  });
  const positions = useMemo(
    () => [...MOCK_POSITIONS, ...(wallets.data ? mapWalletsToPositions(wallets.data) : [])],
    [wallets.data],
  );
  return { sources, positions, wallets };
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
 * Portfolio snapshot = IBKR mock stocks + Tangem quantities × prices (crypto live from Kraken).
 * Degrades gracefully: on a failed price refresh the last quotes stay on screen (`stale`).
 * A failed `/wallets` fetch still shows stocks plus an inline note.
 */
export function usePortfolio() {
  const { sources, positions, wallets } = usePositions();
  const walletsSettled = wallets.isSuccess || wallets.isError;
  const cryptoSymbols = symbolsOf(positions, 'crypto');
  const stockSymbols = symbolsOf(positions, 'stocks');
  const crypto = useQuotes('crypto', cryptoSymbols, walletsSettled);
  const stocks = useQuotes('stocks', stockSymbols, walletsSettled);

  const data = useMemo(
    () =>
      walletsSettled && sources.data && crypto.data && stocks.data
        ? buildSnapshot(
            sources.data,
            positions,
            [...crypto.data.quotes, ...stocks.data.quotes],
            crypto.data.updatedAt,
          )
        : undefined,
    [walletsSettled, sources.data, positions, crypto.data, stocks.data],
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
    walletNote: walletStatusNote(wallets.data, wallets.isError),
    /** Epoch ms of the last successful crypto price fetch. */
    pricesUpdatedAt: crypto.dataUpdatedAt,
    isFetching: crypto.isFetching || wallets.isFetching,
    isRefetching: crypto.isRefetching || stocks.isRefetching || wallets.isRefetching,
    refetch: () => Promise.all([wallets.refetch(), crypto.refetch(), stocks.refetch()]),
    refetchWallets: () => wallets.refetch(),
  };
}

/**
 * Value history for a range = current quantities × historical closes
 * (Kraken OHLC for crypto, mock for stocks). `live` pins the last point to the live total.
 */
export function useValueHistory(range: TimeRange, live?: { t: number; value: number }) {
  const { positions, wallets } = usePositions();
  const walletsSettled = wallets.isSuccess || wallets.isError;
  const cryptoSymbols = symbolsOf(positions, 'crypto');
  const stockSymbols = symbolsOf(positions, 'stocks');

  const query = useQuery({
    queryKey: queryKeys.history(range, [...cryptoSymbols, ...stockSymbols]),
    enabled: walletsSettled,
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
      query.data
        ? buildValueHistory(
            positions,
            query.data,
            range,
            liveT && liveValue ? { t: liveT, value: liveValue } : undefined,
          )
        : undefined,
    [query.data, positions, range, liveT, liveValue],
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
