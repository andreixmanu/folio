import { WalletError, type FetchImpl } from './types';

export const WORKER_UA = 'folio-worker/0.1 (+https://github.com/andreixmanu/folio)';

const CHAIN_TTL_MS = 60_000;
export const WALLET_CACHE_TTL_MS = CHAIN_TTL_MS;
export const DEFAULT_CHAIN_TIMEOUT_MS = 6_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 2_500;

export function remainingMs(deadline: number): number {
  return deadline - Date.now();
}

/** Fetch with a per-request timeout. Failures become `WalletError` without echoing the URL. */
export async function fetchWithTimeout(
  fetchImpl: FetchImpl,
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  parent?: AbortSignal,
): Promise<Response> {
  if (timeoutMs <= 0 || parent?.aborted) throw new WalletError('timeout', undefined, 'timeout');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onParent = () => ctrl.abort();
  parent?.addEventListener('abort', onParent);
  // workerd rejects redirect:'error'. Follow unless the caller explicitly stays on manual.
  const redirect = init?.redirect === 'manual' ? 'manual' : 'follow';
  try {
    return await fetchImpl(url, { ...init, redirect, signal: ctrl.signal });
  } catch (err) {
    if (ctrl.signal.aborted || parent?.aborted) throw new WalletError('timeout', undefined, 'timeout');
    if (err instanceof WalletError) throw err;
    const name = err instanceof Error && /^[A-Za-z_][A-Za-z0-9_]{0,32}$/.test(err.name) ? err.name : 'Error';
    throw new WalletError('upstream', undefined, `fetch_error:${name}`);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onParent);
  }
}

export async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new WalletError('upstream', res.status, 'bad_json');
  }
}
