import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchIbkrPositions, ibkrFlatSeries, ibkrQuotes, ibkrSource, ibkrStatusNote, mapIbkrToPositions } from './ibkr';
import { assembleValueHistory, buildSnapshot, historyWindow } from './portfolio';
import { queryKeys } from './query-keys';
import { RANGE_SPECS } from './ranges';
import { newsSource, priceSources, TANGEM_SOURCE } from './sources';
import type { AssetClass, NewsCategory, Position, Source, TimeRange } from './types';
import { fetchWallets, mapWalletsToPositions, walletStatusNote } from './wallets';

/** Crypto tickers refresh every 30s while the app is focused (the Worker caches for 30s too). */
export const QUOTE_REFRESH_MS = 30_000;
const WALLETS_STALE_MS = 60_000;
/** IBKR Flex is an end-of-day statement; the Worker caches it for ~8h. */
const IBKR_STALE_MS = 30 * 60_000;

export type PriceStatus = 'loading' | 'live' | 'stale' | 'error' | 'partial';

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
    // A failed fetch has no data, so the chart's observer would refetch, clear the error, and unmount.
    retryOnMount: false,
  });
}

export function useIbkrPositions() {
  return useQuery({
    queryKey: queryKeys.ibkr,
    queryFn: ({ signal }) => fetchIbkrPositions(signal),
    staleTime: IBKR_STALE_MS,
    refetchOnWindowFocus: true,
    retry: 1,
    retryOnMount: false,
  });
}

function usePositions() {
  const wallets = useWallets();
  const ibkr = useIbkrPositions();
  const sources = useMemo<Source[]>(() => [ibkrSource(ibkr.data), TANGEM_SOURCE], [ibkr.data]);
  const positions = useMemo(
    () => [
      ...(ibkr.data ? mapIbkrToPositions(ibkr.data) : []),
      ...(wallets.data ? mapWalletsToPositions(wallets.data) : []),
    ],
    [ibkr.data, wallets.data],
  );
  const settled = (wallets.isSuccess || wallets.isError) && (ibkr.isSuccess || ibkr.isError);
  return { sources, positions, wallets, ibkr, settled };
}

function useCryptoQuotes(symbols: string[], enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.quotes('crypto', symbols),
    queryFn: ({ signal }) => priceSources.crypto.getQuotes(symbols, signal),
    enabled: enabled && symbols.length > 0,
    staleTime: QUOTE_REFRESH_MS - 5_000,
    refetchInterval: QUOTE_REFRESH_MS,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry: 2,
    // A failed fetch has no data, so the chart's observer would refetch, clear the error, and unmount.
    retryOnMount: false,
  });
}

function joinNotes(...notes: (string | null)[]): string | null {
  const list = notes.filter((n): n is string => !!n);
  return list.length ? list.join(' · ') : null;
}

/**
 * Portfolio snapshot = IBKR stocks/ETFs (Flex end-of-day marks, EUR) + Tangem quantities ×
 * live Kraken prices. Each source fails on its own: a Kraken outage still shows the stocks,
 * and the hero marks that total as partial. A later price failure keeps the previous
 * numbers (`stale`).
 */
export function usePortfolio() {
  const { sources, positions, wallets, ibkr, settled } = usePositions();
  const cryptoSymbols = symbolsOf(positions, 'crypto');
  const crypto = useCryptoQuotes(cryptoSymbols, settled);
  const cryptoPending = cryptoSymbols.length > 0 && !crypto.data && !crypto.isError;
  const ready = settled && !cryptoPending;
  const missingCrypto = cryptoSymbols.length > 0 && crypto.isError && !crypto.data;
  const missingIbkr = ibkr.isError;
  const missingWallets = wallets.isError;

  const snapshot = useMemo(() => {
    if (!ready) return undefined;
    const quotes = [...(crypto.data?.quotes ?? []), ...(ibkr.data ? ibkrQuotes(ibkr.data) : [])];
    const updatedAt = crypto.data?.updatedAt ?? ibkr.data?.fetchedAt ?? new Date().toISOString();
    return buildSnapshot(sources, positions, quotes, updatedAt);
  }, [ready, sources, positions, crypto.data, ibkr.data]);

  const failedEmpty = !!snapshot && snapshot.holdings.length === 0 && (missingCrypto || missingIbkr || missingWallets);
  const data = snapshot && !failedEmpty ? snapshot : undefined;
  const totalNote = !data
    ? null
    : missingCrypto
      ? 'Totale parziale · prezzi crypto non disponibili'
      : missingIbkr || missingWallets
        ? 'Totale parziale'
        : null;

  const status: PriceStatus = !ready
    ? 'loading'
    : crypto.isError && crypto.data
      ? 'stale'
      : totalNote
        ? 'partial'
        : !data && (missingCrypto || missingIbkr || missingWallets || crypto.isError)
          ? 'error'
          : 'live';

  return {
    data,
    status,
    totalNote,
    error: crypto.error,
    walletNote: joinNotes(ibkrStatusNote(ibkr.data, ibkr.isError), walletStatusNote(wallets.data, wallets.isError)),
    /** IBKR statement date (`YYYY-MM-DD`), end-of-day values. */
    ibkrAsOf: ibkr.data?.asOf ?? null,
    /** Epoch ms of the last successful crypto price fetch. */
    pricesUpdatedAt: crypto.dataUpdatedAt,
    isFetching: crypto.isFetching || wallets.isFetching || ibkr.isFetching,
    isRefetching: crypto.isRefetching || wallets.isRefetching || ibkr.isRefetching,
    refetch: () => Promise.all([wallets.refetch(), ibkr.refetch(), crypto.refetch()]),
    refetchWallets: () => Promise.all([wallets.refetch(), ibkr.refetch()]),
  };
}

/**
 * Value history for a range = current quantities × historical closes (Kraken OHLC for
 * crypto), in EUR. Stocks have no price history yet, so IBKR holdings are a flat line at
 * the statement mark (`markPriceBase`). A quoted coin with no candles is flat too, so it
 * cannot show up as a deposit. `live` pins the last point to the portfolio total only when
 * that total is the same set of holdings. The payload keeps the range it was fetched for,
 * so a range switch does not relabel the previous series.
 */
export function useValueHistory(range: TimeRange, live?: { t: number; value: number }) {
  const { positions, ibkr, settled } = usePositions();
  const cryptoSymbols = symbolsOf(positions, 'crypto');
  const cryptoQuotes = useCryptoQuotes(cryptoSymbols, settled);

  const query = useQuery({
    queryKey: queryKeys.history(range, cryptoSymbols),
    enabled: settled,
    queryFn: async ({ signal }) => {
      const series = (await priceSources.crypto.getHistory(cryptoSymbols, range, signal)).series;
      return { range, series };
    },
    staleTime: RANGE_SPECS[range].staleMs,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const liveT = live?.t;
  const liveValue = live?.value;
  const payload = query.data;
  const quoteData = cryptoQuotes.data;
  const data = useMemo(() => {
    if (!payload) return undefined;
    const { start, end } = historyWindow(payload.series, liveT ?? 0, payload.range);
    const stockSeries = ibkr.data && end > 0 ? ibkrFlatSeries(ibkr.data, start, end) : [];
    const quotes = [...(quoteData?.quotes ?? []), ...(ibkr.data ? ibkrQuotes(ibkr.data) : [])];
    return assembleValueHistory({
      positions,
      cryptoSeries: payload.series,
      stockSeries,
      quotes,
      range: payload.range,
      live: liveT && liveValue ? { t: liveT, value: liveValue } : undefined,
    });
  }, [payload, ibkr.data, positions, quoteData, liveT, liveValue]);

  return {
    data,
    isError: query.isError,
    isPlaceholderData: query.isPlaceholderData,
    error: query.error,
    refetch: query.refetch,
  };
}

const NEWS_STALE_MS = 5 * 60_000;

/** Headlines for one chip. The query key includes the category; focus refetches. */
export function useNews(category: NewsCategory | 'all') {
  return useQuery({
    queryKey: queryKeys.news(category),
    queryFn: ({ signal }) => newsSource.getArticles(category === 'all' ? undefined : category, signal),
    staleTime: NEWS_STALE_MS,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
}
