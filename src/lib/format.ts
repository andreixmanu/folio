const LOCALE = 'it-IT';
/**
 * Number locale: same separators as it-IT ("1.234,56 €") but CLDR de-DE also groups
 * 4-digit numbers, so amounts in a list align consistently ("9.501,80 €").
 */
const NUMBER_LOCALE = 'de-DE';

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, fractionDigits: number): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits}`;
  let f = currencyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(NUMBER_LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    currencyFormatters.set(key, f);
  }
  return f;
}

export const MASK = '••••';

/** Formats an amount of money, e.g. `128.430,12 €`. */
export function formatMoney(
  value: number,
  currency = 'EUR',
  { fractionDigits = 2, signed = false }: { fractionDigits?: number; signed?: boolean } = {},
): string {
  const formatted = currencyFormatter(currency, fractionDigits).format(Math.abs(value));
  if (value < 0) return `−${formatted}`;
  if (signed && value > 0) return `+${formatted}`;
  return formatted;
}

/** Formats a percentage expressed as a number (2.5 => `+2,50%`). */
export function formatPercent(value: number, { signed = true }: { signed?: boolean } = {}): string {
  const abs = Math.abs(value).toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value < 0) return `−${abs}%`;
  if (signed && value > 0) return `+${abs}%`;
  return `${abs}%`;
}

/** Formats an asset quantity with sensible precision (crypto needs more decimals). */
export function formatQuantity(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return value.toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: digits });
}

/** Short relative time in Italian: `ora`, `5 min fa`, `3 h fa`, `2 g fa`. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return 'ora';
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  const days = Math.round(hours / 24);
  return `${days} g fa`;
}

export function formatChartDate(timestamp: number, range: string): string {
  const d = new Date(timestamp);
  if (range === '1D') {
    return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '1W' || range === '1M') {
    return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' });
}
