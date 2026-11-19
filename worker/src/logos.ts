/**
 * Stock/ETF logos from Financial Modeling Prep's public image endpoint
 * (no API key). ETFs are mapped to a listing that carries the issuer mark.
 */
export const LOGO_TICKER_ALIASES: Readonly<Record<string, string>> = {
  VWCE: 'VWRL.L', // Vanguard FTSE All-World (acc) → Vanguard mark
  VWRL: 'VWRL.L',
  CSPX: 'CSPX.L', // iShares Core S&P 500 → iShares mark
  IWDA: 'IWDA.AS',
};

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;

export function normalizeLogoSymbol(raw: string | undefined): string | null {
  const s = (raw ?? '').trim().toUpperCase().replace(/\.PNG$/, '');
  return SYMBOL_RE.test(s) ? s : null;
}

export function logoUrl(symbol: string): string {
  const ticker = LOGO_TICKER_ALIASES[symbol] ?? symbol;
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`;
}

export type LogoResult = { body: ArrayBuffer; contentType: string } | null;
export type BinaryFetcher = (url: string) => Promise<LogoResult>;

/** Larger than any real mark, small enough to keep out of the isolate cache. */
const MAX_LOGO_BYTES = 512 * 1024;

export const defaultFetchLogo: BinaryFetcher = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'folio-worker/0.1' } });
  const type = res.headers.get('content-type') ?? '';
  if (res.status === 404 || (res.ok && !type.startsWith('image/'))) return null;
  if (!res.ok) throw new Error(`Logo upstream HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_LOGO_BYTES) return null;
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_LOGO_BYTES) return null;
  return { body, contentType: type };
};
