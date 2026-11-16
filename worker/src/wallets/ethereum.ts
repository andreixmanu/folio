import { DEFAULT_REQUEST_TIMEOUT_MS, WORKER_UA, fetchWithTimeout, remainingMs } from './http';
import { ERC20_TOKENS } from './tokens';
import { WalletError, type ChainAsset, type EndpointDiagnostic, type FetchImpl } from './types';
import { formatUnits } from './units';

export const ETH_RPC_ENDPOINTS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
  'https://1rpc.io/eth',
  'https://rpc.flashbots.net',
  'https://rpc.mevblocker.io',
] as const;

const HOST_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/i;
const REASON_RE =
  /^(timeout|bad_json|upstream|rpc_error|rpc_-?\d+|http_\d{3}|fetch_error:[A-Za-z_][A-Za-z0-9_]{0,32})$/;

const BALANCE_OF_SELECTOR = '0x70a08231';

type RpcCall = { method: string; params: unknown[] };
type RpcOk = { id?: unknown; result?: unknown; error?: unknown };

class BatchRejectedError extends Error {
  constructor() {
    super('batch_rejected');
    this.name = 'BatchRejectedError';
  }
}

type RpcCtx = {
  fetchImpl: FetchImpl;
  endpoint: string;
  chainDeadline: number;
  endpointDeadline: number;
  parent?: AbortSignal;
};

/** Https URLs from `ETH_RPC_URLS`. Invalid or non-https entries are dropped. */
export function resolveEthRpcEndpoints(raw: string | undefined): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [...ETH_RPC_ENDPOINTS];
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') continue;
    seen.add(trimmed);
    picked.push(trimmed);
  }
  return picked.length > 0 ? picked : [...ETH_RPC_ENDPOINTS];
}

function padAddress(address: string): string {
  return address.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
}

function balanceOfData(address: string): string {
  return `${BALANCE_OF_SELECTOR}${padAddress(address)}`;
}

function parseHexBigInt(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) throw new WalletError('upstream', undefined, 'bad_json');
  if (value === '0x' || value === '0x0') return 0n;
  return BigInt(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBatchRejectedStatus(status: number): boolean {
  return status === 400 || status === 404 || status === 405 || status === 415 || status === 422;
}

function httpReason(status: number): string {
  if (Number.isInteger(status) && status >= 100 && status <= 599) return `http_${status}`;
  return 'upstream';
}

function rpcReason(error: unknown): string {
  if (isRecord(error)) {
    const code = error.code;
    if (typeof code === 'number' && Number.isInteger(code)) return `rpc_${code}`;
    if (typeof code === 'string' && /^-?\d+$/.test(code)) return `rpc_${code}`;
  }
  return 'rpc_error';
}

function reasonOf(err: unknown): string {
  if (err instanceof WalletError) {
    if (err.reason && REASON_RE.test(err.reason)) return err.reason;
    if (err.code === 'timeout') return 'timeout';
    if (typeof err.status === 'number') return httpReason(err.status);
    return 'upstream';
  }
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) return 'timeout';
  if (err instanceof Error && /^[A-Za-z_][A-Za-z0-9_]{0,32}$/.test(err.name)) return `fetch_error:${err.name}`;
  return 'upstream';
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown';
  }
}

function cleanAttempt(host: string, reason: string): EndpointDiagnostic {
  return {
    host: HOST_RE.test(host) ? host : 'unknown',
    reason: REASON_RE.test(reason) ? reason : 'upstream',
  };
}

function resultById(rows: RpcOk[], id: number): unknown {
  const row = rows.find((r) => r.id === id);
  if (!row || typeof row.result === 'undefined') throw new WalletError('upstream', undefined, 'bad_json');
  if (row.error != null) throw new WalletError('upstream', undefined, rpcReason(row.error));
  return row.result;
}

function optionalResultById(rows: RpcOk[], id: number): unknown {
  const row = rows.find((r) => r.id === id);
  if (!row || row.error != null || typeof row.result === 'undefined') return undefined;
  return row.result;
}

function nextTimeout(ctx: RpcCtx): number {
  const ms = Math.min(remainingMs(ctx.chainDeadline), remainingMs(ctx.endpointDeadline));
  if (ms <= 0 || ctx.parent?.aborted) throw new WalletError('timeout', undefined, 'timeout');
  return ms;
}

async function drain(res: Response): Promise<void> {
  try {
    await res.text();
  } catch {
    /* failure responses are classified by status; the body is discarded */
  }
}

async function postRpc(
  ctx: RpcCtx,
  payload: unknown,
  batch: boolean,
): Promise<{ res: Response; body: unknown }> {
  const res = await fetchWithTimeout(
    ctx.fetchImpl,
    ctx.endpoint,
    {
      method: 'POST',
      headers: {
        'User-Agent': WORKER_UA,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      // workerd rejects redirect:'error'.
      redirect: 'follow',
    },
    nextTimeout(ctx),
    ctx.parent,
  );
  if (batch && isBatchRejectedStatus(res.status)) {
    await drain(res);
    throw new BatchRejectedError();
  }
  if (!res.ok) {
    await drain(res);
    throw new WalletError('upstream', res.status, httpReason(res.status));
  }
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    throw new WalletError('upstream', res.status, reasonOf(err) === 'timeout' ? 'timeout' : 'bad_json');
  }
  if (!text.trim()) throw new WalletError('upstream', res.status, 'bad_json');
  try {
    return { res, body: JSON.parse(text) as unknown };
  } catch {
    throw new WalletError('upstream', res.status, 'bad_json');
  }
}

function assertNoElementErrors(rows: unknown[], status: number): RpcOk[] {
  const parsed: RpcOk[] = [];
  for (const row of rows) {
    if (!isRecord(row)) throw new WalletError('upstream', status, 'bad_json');
    if (row.error != null) throw new WalletError('upstream', status, rpcReason(row.error));
    parsed.push(row as RpcOk);
  }
  return parsed;
}

async function rpcBatch(ctx: RpcCtx, calls: RpcCall[]): Promise<RpcOk[]> {
  const payload = calls.map((call, i) => ({ jsonrpc: '2.0', id: i + 1, method: call.method, params: call.params }));
  const { res, body } = await postRpc(ctx, payload, true);
  if (!Array.isArray(body)) {
    // A JSON-RPC error object is an endpoint failure, not a reason to replay calls one by one.
    if (isRecord(body) && body.error != null) throw new WalletError('upstream', res.status, rpcReason(body.error));
    if (isRecord(body) && 'result' in body) throw new BatchRejectedError();
    throw new WalletError('upstream', res.status, 'bad_json');
  }
  return assertNoElementErrors(body, res.status);
}

async function rpcSequential(ctx: RpcCtx, calls: RpcCall[]): Promise<RpcOk[]> {
  const rows: RpcOk[] = [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]!;
    const { res, body } = await postRpc(
      ctx,
      { jsonrpc: '2.0', id: i + 1, method: call.method, params: call.params },
      false,
    );
    if (!isRecord(body)) throw new WalletError('upstream', res.status, 'bad_json');
    if (body.error != null) throw new WalletError('upstream', res.status, rpcReason(body.error));
    if (typeof body.result === 'undefined') throw new WalletError('upstream', res.status, 'bad_json');
    rows.push(body as RpcOk);
  }
  return rows;
}

async function rpc(ctx: RpcCtx, calls: RpcCall[]): Promise<RpcOk[]> {
  try {
    return await rpcBatch(ctx, calls);
  } catch (err) {
    if (!(err instanceof BatchRejectedError)) throw err;
    return await rpcSequential(ctx, calls);
  }
}

function buildCalls(address: string): RpcCall[] {
  const calls: RpcCall[] = [{ method: 'eth_getBalance', params: [address, 'latest'] }];
  for (const token of ERC20_TOKENS) {
    calls.push({
      method: 'eth_call',
      params: [{ to: token.contract, data: balanceOfData(address) }, 'latest'],
    });
  }
  return calls;
}

function assetsFromRows(rows: RpcOk[]): ChainAsset[] {
  const assets: ChainAsset[] = [];
  const ethRaw = parseHexBigInt(resultById(rows, 1));
  const ethQty = formatUnits(ethRaw, 18);
  if (ethQty !== 0) {
    assets.push({ symbol: 'ETH', name: 'Ethereum', chain: 'ethereum', quantity: ethQty });
  }
  for (let i = 0; i < ERC20_TOKENS.length; i++) {
    const token = ERC20_TOKENS[i]!;
    const raw = optionalResultById(rows, i + 2);
    if (raw === undefined) continue;
    let qty: number;
    try {
      qty = formatUnits(parseHexBigInt(raw), token.decimals);
    } catch {
      continue;
    }
    if (qty === 0) continue;
    assets.push({ symbol: token.symbol, name: token.name, chain: 'ethereum', quantity: qty });
  }
  return assets;
}

function warnAttempts(attempts: EndpointDiagnostic[]): void {
  for (const attempt of attempts) {
    console.warn('[wallets] eth endpoint failed', attempt.host, attempt.reason);
  }
}

export async function fetchEthereum(opts: {
  address: string;
  fetch: FetchImpl;
  deadline: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  endpoints?: readonly string[];
}): Promise<ChainAsset[]> {
  const endpoints = opts.endpoints && opts.endpoints.length > 0 ? opts.endpoints : [...ETH_RPC_ENDPOINTS];
  // Per-endpoint cap (~2.5s) so the ~6s chain deadline can reach more than one provider.
  const endpointBudgetMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const calls = buildCalls(opts.address);
  const attempts: EndpointDiagnostic[] = [];
  let lastCode: 'timeout' | 'upstream' = 'upstream';
  let lastStatus: number | undefined;

  const giveUp = (code: 'timeout' | 'upstream', status?: number): never => {
    warnAttempts(attempts);
    throw new WalletError(code, status, undefined, attempts);
  };

  for (const endpoint of endpoints) {
    if (remainingMs(opts.deadline) <= 0 || opts.signal?.aborted) giveUp('timeout');
    const endpointDeadline = Date.now() + Math.min(endpointBudgetMs, remainingMs(opts.deadline));
    try {
      const rows = await rpc(
        {
          fetchImpl: opts.fetch,
          endpoint,
          chainDeadline: opts.deadline,
          endpointDeadline,
          parent: opts.signal,
        },
        calls,
      );
      return assetsFromRows(rows);
    } catch (err) {
      attempts.push(cleanAttempt(hostOf(endpoint), reasonOf(err)));
      if (err instanceof WalletError) {
        lastCode = err.code === 'timeout' ? 'timeout' : 'upstream';
        lastStatus = err.status;
      } else {
        lastCode = 'upstream';
        lastStatus = undefined;
      }
      if (remainingMs(opts.deadline) <= 0 || opts.signal?.aborted) giveUp('timeout');
    }
  }
  return giveUp(lastCode, lastStatus);
}
