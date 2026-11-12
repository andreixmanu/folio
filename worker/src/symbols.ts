/**
 * Typed map from app symbols to Kraken EUR pairs.
 *
 * Kraken quirks handled here:
 * - Bitcoin is `XBT` (asset id `XXBT`), Dogecoin is `XDG` (`XXDG`).
 * - Legacy assets use X/Z prefixes in result keys: XBTEUR -> `XXBTZEUR`, ETHEUR -> `XETHZEUR`.
 * - Newer assets use the plain altname as the key: `SOLEUR`, `ADAEUR`.
 * We request by `pair` (altname) and accept either the `resultKey` or the altname in responses.
 */
export type KrakenPair = {
  /** Altname used in requests, e.g. `XBTEUR`. */
  pair: string;
  /** Key Kraken uses in `result`, e.g. `XXBTZEUR`. */
  resultKey: string;
};

export const KRAKEN_EUR_PAIRS = {
  BTC: { pair: 'XBTEUR', resultKey: 'XXBTZEUR' },
  ETH: { pair: 'ETHEUR', resultKey: 'XETHZEUR' },
  SOL: { pair: 'SOLEUR', resultKey: 'SOLEUR' },
  XRP: { pair: 'XRPEUR', resultKey: 'XXRPZEUR' },
  LTC: { pair: 'LTCEUR', resultKey: 'XLTCZEUR' },
  XLM: { pair: 'XLMEUR', resultKey: 'XXLMZEUR' },
  DOGE: { pair: 'XDGEUR', resultKey: 'XDGEUR' },
  ADA: { pair: 'ADAEUR', resultKey: 'ADAEUR' },
  DOT: { pair: 'DOTEUR', resultKey: 'DOTEUR' },
  LINK: { pair: 'LINKEUR', resultKey: 'LINKEUR' },
  AVAX: { pair: 'AVAXEUR', resultKey: 'AVAXEUR' },
  ATOM: { pair: 'ATOMEUR', resultKey: 'ATOMEUR' },
  POL: { pair: 'POLEUR', resultKey: 'POLEUR' },
  TRX: { pair: 'TRXEUR', resultKey: 'TRXEUR' },
  UNI: { pair: 'UNIEUR', resultKey: 'UNIEUR' },
  AAVE: { pair: 'AAVEEUR', resultKey: 'AAVEEUR' },
  NEAR: { pair: 'NEAREUR', resultKey: 'NEAREUR' },
  ARB: { pair: 'ARBEUR', resultKey: 'ARBEUR' },
  OP: { pair: 'OPEUR', resultKey: 'OPEUR' },
  TON: { pair: 'TONEUR', resultKey: 'TONEUR' },
  SUI: { pair: 'SUIEUR', resultKey: 'SUIEUR' },
  BCH: { pair: 'BCHEUR', resultKey: 'BCHEUR' },
  USDC: { pair: 'USDCEUR', resultKey: 'USDCEUR' },
  USDT: { pair: 'USDTEUR', resultKey: 'USDTEUR' },
} as const satisfies Record<string, KrakenPair>;

export type SupportedSymbol = keyof typeof KRAKEN_EUR_PAIRS;

/** Common aliases users/wallets may send. */
const ALIASES: Record<string, SupportedSymbol> = {
  XBT: 'BTC',
  XXBT: 'BTC',
  XETH: 'ETH',
  XDG: 'DOGE',
  XXDG: 'DOGE',
  MATIC: 'POL',
};

export function normalizeSymbol(raw: string): SupportedSymbol | null {
  const s = raw.trim().toUpperCase();
  if (s in KRAKEN_EUR_PAIRS) return s as SupportedSymbol;
  return ALIASES[s] ?? null;
}

/** Parses `BTC,eth, XBT` -> unique supported symbols + the unsupported leftovers (in input order). */
export function parseSymbols(param: string | undefined | null): {
  supported: SupportedSymbol[];
  unsupported: string[];
} {
  const supported: SupportedSymbol[] = [];
  const unsupported: string[] = [];
  for (const part of (param ?? '').split(',')) {
    const raw = part.trim().toUpperCase();
    if (!raw) continue;
    const sym = normalizeSymbol(raw);
    if (sym) {
      if (!supported.includes(sym)) supported.push(sym);
    } else if (!unsupported.includes(raw)) {
      unsupported.push(raw);
    }
  }
  return { supported, unsupported };
}

/** Finds the entry for `symbol` in a Kraken `result` object, tolerating key-format differences. */
export function pickResult<T>(result: Record<string, T>, symbol: SupportedSymbol): T | undefined {
  const { pair, resultKey } = KRAKEN_EUR_PAIRS[symbol];
  return result[resultKey] ?? result[pair];
}
