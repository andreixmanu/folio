import { DEFAULT_REQUEST_TIMEOUT_MS, WORKER_UA, fetchWithTimeout, readJson, remainingMs } from './http';
import { WalletError, type ChainAsset, type FetchImpl } from './types';
import { formatUnits } from './units';

const MEMPOOL_BASE = 'https://mempool.space/api';
const BLOCKSTREAM_BASE = 'https://blockstream.info/api';

type TxoStats = {
  funded_txo_sum?: unknown;
  spent_txo_sum?: unknown;
};

type AddressInfo = {
  chain_stats?: TxoStats;
  mempool_stats?: TxoStats;
};

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return 0n;
}

function parseAddressInfo(body: unknown): AddressInfo {
  if (typeof body !== 'object' || body === null) throw new WalletError('upstream');
  return body as AddressInfo;
}

async function fetchAddress(
  fetchImpl: FetchImpl,
  base: string,
  address: string,
  timeoutMs: number,
  parent?: AbortSignal,
): Promise<AddressInfo> {
  const res = await fetchWithTimeout(
    fetchImpl,
    `${base}/address/${address}`,
    { headers: { 'User-Agent': WORKER_UA, Accept: 'application/json' } },
    timeoutMs,
    parent,
  );
  if (!res.ok) throw new WalletError('upstream', res.status);
  return parseAddressInfo(await readJson(res));
}

function shouldFallback(err: unknown): boolean {
  if (err instanceof WalletError) {
    if (err.code === 'timeout') return true;
    if (err.code === 'upstream' && (err.status === undefined || err.status >= 500)) return true;
    return false;
  }
  return true;
}

export async function fetchBitcoin(opts: {
  address: string;
  fetch: FetchImpl;
  deadline: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<ChainAsset[]> {
  const requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const timeout = () => Math.min(requestTimeoutMs, remainingMs(opts.deadline));

  let info: AddressInfo;
  try {
    info = await fetchAddress(opts.fetch, MEMPOOL_BASE, opts.address, timeout(), opts.signal);
  } catch (err) {
    if (remainingMs(opts.deadline) <= 0) throw new WalletError('timeout');
    if (!shouldFallback(err)) throw err instanceof WalletError ? err : new WalletError('upstream');
    info = await fetchAddress(opts.fetch, BLOCKSTREAM_BASE, opts.address, timeout(), opts.signal);
  }

  const chain = info.chain_stats ?? {};
  const mempool = info.mempool_stats ?? {};
  const confirmed = toBigInt(chain.funded_txo_sum) - toBigInt(chain.spent_txo_sum);
  const pendingSats = toBigInt(mempool.funded_txo_sum) - toBigInt(mempool.spent_txo_sum);
  const total = confirmed + pendingSats;
  const quantity = formatUnits(total, 8);
  if (quantity === 0) return [];

  const pending = formatUnits(pendingSats, 8);
  const asset: ChainAsset = {
    symbol: 'BTC',
    name: 'Bitcoin',
    chain: 'bitcoin',
    quantity,
  };
  if (pending !== 0) asset.pending = pending;
  return [asset];
}
