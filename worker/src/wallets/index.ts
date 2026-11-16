import type { TtlCache } from '../cache';
import type { Env } from '../env';
import type { Fetcher } from '../kraken';

import { fetchBitcoin } from './bitcoin';
import { fetchEthereum, resolveEthRpcEndpoints } from './ethereum';
import { DEFAULT_CHAIN_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, WALLET_CACHE_TTL_MS } from './http';
import { attachPrices } from './price';
import {
  WalletError,
  unpriced,
  walletErrorCode,
  type ChainAsset,
  type ChainId,
  type FetchImpl,
  type WalletChain,
  type WalletsResponse,
} from './types';

function envAddress(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function chainFailure(chain: ChainId, err: unknown, debug: boolean): WalletChain {
  const result: WalletChain = { chain, ok: false, error: walletErrorCode(err), assets: [] };
  if (!debug || !(err instanceof WalletError) || !err.attempts?.length) return result;
  result.detail = err.attempts.map((attempt) => ({ host: attempt.host, reason: attempt.reason }));
  return result;
}

async function loadChain(opts: {
  chain: ChainId;
  address: string | undefined;
  cache: TtlCache;
  debug: boolean;
  load: () => Promise<ChainAsset[]>;
}): Promise<WalletChain> {
  if (!opts.address) return { chain: opts.chain, ok: false, error: 'not_configured', assets: [] };
  try {
    const assets = await opts.cache.get(`wallet:${opts.chain}`, WALLET_CACHE_TTL_MS, opts.load);
    return { chain: opts.chain, ok: true, assets: unpriced(assets) };
  } catch (err) {
    return chainFailure(opts.chain, err, opts.debug);
  }
}

export async function getWalletsResponse(opts: {
  env: Env;
  cache: TtlCache;
  fetchJson: Fetcher;
  fetch: FetchImpl;
  now: () => number;
  chainTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** Attach per-endpoint `{host, reason}` notes. Only for `?debug=1`. */
  debug?: boolean;
}): Promise<WalletsResponse> {
  const chainTimeoutMs = opts.chainTimeoutMs ?? DEFAULT_CHAIN_TIMEOUT_MS;
  const requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const debug = opts.debug === true;
  const btc = envAddress(opts.env.BTC_ADDRESS);
  const eth = envAddress(opts.env.ETH_ADDRESS);
  const deadline = Date.now() + chainTimeoutMs;
  const ethEndpoints = resolveEthRpcEndpoints(opts.env.ETH_RPC_URLS);

  const settled = await Promise.allSettled([
    btc
      ? loadChain({
          chain: 'bitcoin',
          address: btc,
          cache: opts.cache,
          debug,
          load: () =>
            fetchBitcoin({
              address: btc,
              fetch: opts.fetch,
              deadline,
              requestTimeoutMs,
            }),
        })
      : Promise.resolve({ chain: 'bitcoin' as const, ok: false, error: 'not_configured', assets: [] }),
    eth
      ? loadChain({
          chain: 'ethereum',
          address: eth,
          cache: opts.cache,
          debug,
          load: () =>
            fetchEthereum({
              address: eth,
              fetch: opts.fetch,
              deadline,
              requestTimeoutMs,
              endpoints: ethEndpoints,
            }),
        })
      : Promise.resolve({ chain: 'ethereum' as const, ok: false, error: 'not_configured', assets: [] }),
  ]);

  const wallets: WalletChain[] = settled.map((item, i) => {
    const chain: ChainId = i === 0 ? 'bitcoin' : 'ethereum';
    if (item.status === 'fulfilled') return item.value;
    return chainFailure(chain, item.reason, debug);
  });

  try {
    await attachPrices(
      opts.fetchJson,
      opts.cache,
      wallets.flatMap((w) => w.assets),
    );
  } catch {
    /* leave priceEur null */
  }

  return {
    updatedAt: new Date(opts.now()).toISOString(),
    source: 'tangem',
    wallets,
  };
}
