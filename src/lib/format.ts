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
export function formatPercent(
  value: number,
  { signed = true, decimals = 2 }: { signed?: boolean; decimals?: number } = {},
): string {
  const abs = Math.abs(value).toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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

const ROME_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function romeDayNumber(date: Date): number {
  const parts = ROME_DAY.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * Short relative time in Italian: `ora`, `5 min fa`, `2 h fa`, `ieri`, `3 g fa`.
 * Hours stay numeric until 24h; yesterday is the Europe/Rome calendar day.
 */
export function formatRelativeTimeIt(date: Date | string | number, now: Date | string | number = new Date()): string {
  const target = date instanceof Date ? date : new Date(date);
  const current = now instanceof Date ? now : new Date(now);
  const diff = current.getTime() - target.getTime();
  if (!Number.isFinite(diff) || diff < 60_000) return 'ora';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours} h fa`;
  const days = romeDayNumber(current) - romeDayNumber(target);
  if (days <= 1) return 'ieri';
  return `${days} g fa`;
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
