import type { TtlCache } from '../cache';
import { fetchQuotes, KRAKEN_BASE, unwrap, type Fetcher, type KrakenResponse, type KrakenTicker } from '../kraken';
import { normalizeSymbol, type SupportedSymbol } from '../symbols';

import type { WalletAsset } from './types';

const TICKER_TTL_MS = 30_000;
const STABLES = new Set(['USDC', 'USDT']);

function tickerKey(symbols: SupportedSymbol[]): string {
  return `ticker:${[...symbols].sort().join(',')}`;
}

async function quotesBySymbol(
  fetchJson: Fetcher,
  cache: TtlCache,
  symbols: SupportedSymbol[],
): Promise<Map<string, { price: number; changePct: number }>> {
  if (symbols.length === 0) return new Map();
  const { quotes } = await cache.get(tickerKey(symbols), TICKER_TTL_MS, () => fetchQuotes(fetchJson, symbols));
  return new Map(quotes.map((q) => [q.symbol, { price: q.price, changePct: q.changePct }]));
}

/** 1 USD in EUR, from Kraken EURUSD / ZEURZUSD. */
export async function fetchUsdEur(fetchJson: Fetcher): Promise<{ price: number; changePct: number } | null> {
  const body = (await fetchJson(`${KRAKEN_BASE}/Ticker?pair=EURUSD`)) as KrakenResponse<Record<string, KrakenTicker>>;
  const result = unwrap(body);
  const t = result.ZEURZUSD ?? result.EURUSD;
  const eurusd = Number(t?.c?.[0]);
  const open = Number(t?.o);
  if (!Number.isFinite(eurusd) || eurusd === 0) return null;
  const price = 1 / eurusd;
  const openPrice = Number.isFinite(open) && open > 0 ? 1 / open : price;
  return {
    price,
    changePct: openPrice > 0 ? ((price - openPrice) / openPrice) * 100 : 0,
  };
}

async function usdEurQuote(fetchJson: Fetcher, cache: TtlCache): Promise<{ price: number; changePct: number } | null> {
  try {
    return await cache.get('ticker:EURUSD', TICKER_TTL_MS, () => fetchUsdEur(fetchJson));
  } catch {
    return null;
  }
}

/** Fill `priceEur` / `valueEur` / `changePct` in place. Failures leave nulls. */
export async function attachPrices(fetchJson: Fetcher, cache: TtlCache, assets: WalletAsset[]): Promise<void> {
  if (assets.length === 0) return;
  const wanted = [...new Set(assets.map((a) => a.symbol))];
  const supported: SupportedSymbol[] = [];
  for (const symbol of wanted) {
    const n = normalizeSymbol(symbol);
    if (n) supported.push(n);
  }

  let quotes = new Map<string, { price: number; changePct: number }>();
  try {
    quotes = await quotesBySymbol(fetchJson, cache, supported);
  } catch {
    quotes = new Map();
  }

  const needUsd = wanted.some((s) => STABLES.has(s) && !quotes.has(s));
  const usdEur = needUsd ? await usdEurQuote(fetchJson, cache) : null;

  for (const asset of assets) {
    const q = quotes.get(asset.symbol);
    if (q) {
      asset.priceEur = q.price;
      asset.changePct = q.changePct;
      asset.valueEur = asset.quantity * q.price;
      continue;
    }
    if (STABLES.has(asset.symbol) && usdEur) {
      asset.priceEur = usdEur.price;
      asset.changePct = usdEur.changePct;
      asset.valueEur = asset.quantity * usdEur.price;
    }
  }
}
