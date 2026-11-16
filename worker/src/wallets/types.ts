export type ChainId = 'bitcoin' | 'ethereum';

export type WalletAsset = {
  symbol: string;
  name: string;
  chain: ChainId;
  quantity: number;
  priceEur: number | null;
  valueEur: number | null;
  changePct: number | null;
  pending?: number;
};

/** Safe ethereum failover note. Host and a short reason code only — never an address or URL. */
export type EndpointDiagnostic = {
  host: string;
  reason: string;
};

export type WalletChain = {
  chain: ChainId;
  ok: boolean;
  error?: string;
  assets: WalletAsset[];
  /** Set only for `GET /wallets?debug=1` after ethereum endpoints fail. */
  detail?: EndpointDiagnostic[];
};

export type WalletsResponse = {
  updatedAt: string;
  source: 'tangem';
  wallets: WalletChain[];
};

/** Unpriced balance row produced by a chain fetcher. */
export type ChainAsset = {
  symbol: string;
  name: string;
  chain: ChainId;
  quantity: number;
  pending?: number;
};

export type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type WalletErrorCode = 'timeout' | 'upstream' | 'not_configured';

export class WalletError extends Error {
  /** Sanitized per-endpoint notes. Not returned unless `?debug=1`. */
  readonly attempts?: EndpointDiagnostic[];

  constructor(
    readonly code: WalletErrorCode,
    readonly status?: number,
    /** Short diagnostic code (`http_525`, `rpc_-32603`, `timeout`, …). Never a body or address. */
    readonly reason?: string,
    attempts?: EndpointDiagnostic[],
  ) {
    super(code);
    this.name = 'WalletError';
    if (attempts?.length) this.attempts = attempts.map((attempt) => ({ host: attempt.host, reason: attempt.reason }));
  }
}

export function walletErrorCode(err: unknown): WalletErrorCode {
  if (err instanceof WalletError) return err.code;
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) return 'timeout';
  return 'upstream';
}

export function unpriced(assets: ChainAsset[]): WalletAsset[] {
  return assets.map((a) => ({
    ...a,
    priceEur: null,
    valueEur: null,
    changePct: null,
  }));
}
