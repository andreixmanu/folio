/**
 * Minimal parser for IBKR Flex (Activity) XML. Workers have no DOMParser, and Flex
 * rows are flat self-closing elements with attributes, so a strict attribute scan is enough.
 * Account identifiers are never copied into the output.
 */

export type IbkrPosition = {
  symbol: string;
  description: string;
  isin: string | null;
  conid: string | null;
  currency: string;
  assetCategory: string;
  subCategory: string | null;
  listingExchange: string | null;
  quantity: number;
  /** Mark price in the instrument currency. */
  markPrice: number;
  /** Position value in the instrument currency. */
  positionValue: number;
  costBasisPrice: number | null;
  costBasisMoney: number | null;
  /** Multiply an instrument-currency amount by this to get the account base currency. */
  fxRateToBase: number;
  /** Unrealized P&L (FIFO) in the instrument currency, when the query includes it. */
  unrealizedPnl: number | null;
  /** `positionValue × fxRateToBase`. */
  valueBase: number;
  /** `markPrice × fxRateToBase`. */
  markPriceBase: number;
  reportDate: string | null;
};

export type IbkrCash = {
  currency: string;
  amount: number;
  /** In the base currency when the row is already a base summary or carries a rate. */
  amountBase: number | null;
};

export type ParsedFlex = {
  /** `YYYY-MM-DD` of the statement (end-of-day values). */
  asOf: string | null;
  /** Raw `whenGenerated` as an ISO-like local timestamp (IBKR server time, usually US/Eastern). */
  generatedAt: string | null;
  positions: IbkrPosition[];
  cash: IbkrCash[];
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(v: string): string {
  return v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function parseAttributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1]!] = decode(m[2]!);
  return out;
}

/** Every `<Name ...>` / `<Name .../>` start tag's attributes. */
export function elements(xml: string, name: string): Record<string, string>[] {
  const re = new RegExp(`<${name}(\\s[^>]*?)?/?>`, 'g');
  const out: Record<string, string>[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(parseAttributes(m[1] ?? ''));
  return out;
}

function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function str(v: string | undefined): string | null {
  return v && v.trim() ? v.trim() : null;
}

/** `20261116` or `2026-11-16` → `2026-11-16`. */
export function flexDate(v: string | undefined): string | null {
  const s = v?.trim() ?? '';
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** `20261117;084623` → `2026-11-17T08:46:23`. */
export function flexTimestamp(v: string | undefined): string | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})[;, T]+(\d{2}):?(\d{2}):?(\d{2})/.exec(v?.trim() ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : flexDate(v);
}

const round = (n: number, dp = 6) => Math.round(n * 10 ** dp) / 10 ** dp;

export function parseFlexStatement(xml: string): ParsedFlex {
  if (!/<FlexQueryResponse[\s>]/.test(xml)) throw new Error('not a Flex statement');
  const stmt = elements(xml, 'FlexStatement')[0] ?? {};

  const positions: IbkrPosition[] = [];
  for (const a of elements(xml, 'OpenPosition')) {
    // Lot rows duplicate the summary row; keep summaries (or rows without a level).
    const level = (a.levelOfDetail ?? '').toUpperCase();
    if (level && level !== 'SUMMARY') continue;
    const symbol = str(a.symbol);
    const quantity = num(a.position) ?? num(a.quantity);
    if (!symbol || quantity === null || quantity === 0) continue;
    const multiplier = num(a.multiplier) ?? 1;
    const markPrice = num(a.markPrice) ?? 0;
    const positionValue = num(a.positionValue) ?? markPrice * quantity * multiplier;
    const fx = num(a.fxRateToBase) ?? 1;
    positions.push({
      symbol,
      description: str(a.description) ?? symbol,
      isin: str(a.isin) ?? (a.securityIDType === 'ISIN' ? str(a.securityID) : null),
      conid: str(a.conid),
      currency: str(a.currency) ?? 'EUR',
      assetCategory: str(a.assetCategory) ?? 'STK',
      subCategory: str(a.subCategory),
      listingExchange: str(a.listingExchange),
      quantity,
      markPrice,
      positionValue,
      costBasisPrice: num(a.costBasisPrice),
      costBasisMoney: num(a.costBasisMoney),
      fxRateToBase: fx,
      unrealizedPnl: num(a.fifoPnlUnrealized),
      valueBase: round(positionValue * fx, 4),
      markPriceBase: round(markPrice * fx),
      reportDate: flexDate(a.reportDate),
    });
  }

  // Optional Cash Report section: one row per currency plus a BASE_SUMMARY row.
  const cash: IbkrCash[] = [];
  for (const a of elements(xml, 'CashReportCurrency')) {
    const currency = str(a.currency);
    const amount = num(a.endingCash) ?? num(a.endingSettledCash);
    if (!currency || amount === null || currency === 'BASE_SUMMARY') continue;
    const level = (a.levelOfDetail ?? '').toUpperCase();
    if (level && level !== 'CURRENCY' && level !== 'SUMMARY') continue;
    const fx = num(a.fxRateToBase);
    cash.push({ currency, amount, amountBase: fx !== null ? round(amount * fx, 4) : null });
  }

  return {
    asOf: flexDate(stmt.toDate) ?? positions.find((p) => p.reportDate)?.reportDate ?? null,
    generatedAt: flexTimestamp(stmt.whenGenerated),
    positions,
    cash,
  };
}

export type FlexStatus = { status: string | null; code: string | null; message: string | null; reference: string | null; url: string | null };

/** `FlexStatementResponse` envelope of SendRequest / GetStatement errors. */
export function parseFlexEnvelope(xml: string): FlexStatus {
  const text = (tag: string) => {
    const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
    return m ? decode(m[1]!.trim()) : null;
  };
  return {
    status: text('Status'),
    code: text('ErrorCode'),
    message: text('ErrorMessage'),
    reference: text('ReferenceCode'),
    url: text('Url'),
  };
}
