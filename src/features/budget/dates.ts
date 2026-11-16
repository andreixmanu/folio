/**
 * Civil dates for the budget feature. A `Date` is read in Europe/Rome
 * (the calendar the user lives in); day arithmetic then uses the YYYY-MM-DD
 * string so it does not depend on the machine timezone.
 */

const ROME_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar day of `date` in Europe/Rome, as `YYYY-MM-DD`. */
export function toISODate(date: Date): string {
  const parts = ROME_DAY.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function parts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

/** Days in a calendar month. `monthIndex` is 0-based. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const { year, month } = parts(iso);
  const last = daysInMonth(year, month - 1);
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export function yearMonth(iso: string): string {
  return iso.slice(0, 7);
}

export function dayOfMonth(iso: string): number {
  return parts(iso).day;
}

/** Add calendar days to a `YYYY-MM-DD` string. */
export function addDays(iso: string, days: number): string {
  const { year, month, day } = parts(iso);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add calendar months, clamping the day to the target month's length. */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = parts(iso);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + months);
  const y = date.getUTCFullYear();
  const mIndex = date.getUTCMonth();
  const last = daysInMonth(y, mIndex);
  const d = Math.min(day, last);
  return `${y}-${String(mIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, for a civil date. */
export function weekday(iso: string): number {
  const { year, month, day } = parts(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
