/**
 * Recurring-payment detection. A series needs a steady cadence and amounts
 * within ±15% (identical amounts are the narrow ≥2-occurrence exception).
 * Groceries and bars fall out on their own when the gap or the amount wanders.
 */

import { categorize, isSubscriptionMerchant } from './categorize';
import { addDays, daysBetween, toISODate } from './dates';
import { displayMerchant, merchantKeyFor } from './merchant';
import {
  counterpartyRaw,
  fromCents,
  toCents,
  type CategoryId,
  type RecurringCadence,
  type RecurringPayment,
  type Transaction,
} from './model';

const CADENCE_WINDOWS: readonly { cadence: RecurringCadence; min: number; max: number }[] = [
  { cadence: 'weekly', min: 6, max: 8 },
  { cadence: 'monthly', min: 27, max: 33 },
  { cadence: 'quarterly', min: 85, max: 95 },
  { cadence: 'yearly', min: 350, max: 380 },
];

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

function absCents(tx: Transaction): number {
  return Math.abs(toCents(tx.amount.amount));
}

function amountsWithinTolerance(cents: readonly number[]): boolean {
  const mid = median(cents);
  if (mid <= 0) return false;
  return cents.every((value) => Math.abs(value - mid) <= mid * 0.15 + 1e-6);
}

function allIdentical(cents: readonly number[]): boolean {
  const first = cents[0];
  return cents.every((value) => value === first);
}

function cadenceOf(intervals: readonly number[]): { cadence: RecurringCadence; every: number } | null {
  if (intervals.length === 0) return null;
  for (const window of CADENCE_WINDOWS) {
    if (intervals.every((days) => days >= window.min && days <= window.max)) {
      return { cadence: window.cadence, every: Math.max(1, Math.round(median(intervals))) };
    }
  }
  return null;
}

function rollForward(lastDate: string, everyDays: number, today: string): string {
  let next = addDays(lastDate, everyDays);
  let guard = 0;
  while (next < today && guard < 500) {
    next = addDays(next, everyDays);
    guard += 1;
  }
  return next;
}

function seriesCategory(txs: readonly Transaction[]): CategoryId {
  const latest = txs[txs.length - 1];
  if (!latest) return 'other';
  if (latest.categoryId) return latest.categoryId;
  return categorize(latest, { userRules: [] }).categoryId;
}

function toSeries(merchantKey: string, txs: Transaction[], today: string): RecurringPayment | null {
  if (txs.length < 2) return null;
  const ordered = [...txs].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate) || a.id.localeCompare(b.id));
  const intervals: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const current = ordered[i];
    if (!prev || !current) continue;
    intervals.push(daysBetween(prev.bookingDate, current.bookingDate));
  }
  const cents = ordered.map(absCents);
  const cadence = cadenceOf(intervals);
  if (!cadence || !amountsWithinTolerance(cents)) return null;

  const identical = allIdentical(cents);
  const enough = ordered.length >= 3 || (ordered.length >= 2 && identical && cadence.cadence === 'monthly');
  if (!enough) return null;

  const latest = ordered[ordered.length - 1];
  if (!latest) return null;
  const categoryId = seriesCategory(ordered);
  const average = Math.round(cents.reduce((sum, value) => sum + value, 0) / cents.length);
  const rawName = counterpartyRaw(latest) || merchantKey;
  const isSubscription =
    categoryId === 'subscriptions' ||
    (identical && cadence.cadence === 'monthly' && isSubscriptionMerchant(merchantKey));

  return {
    merchantKey,
    displayName: displayMerchant(rawName),
    categoryId,
    averageAmount: fromCents(average),
    cadence: cadence.cadence,
    lastDate: latest.bookingDate,
    nextDate: rollForward(latest.bookingDate, cadence.every, today),
    occurrences: ordered.length,
    isSubscription,
    accountId: latest.accountId,
  };
}

/** Outflow series with a steady gap and a steady amount. */
export function detectRecurring(txs: readonly Transaction[], now: Date): RecurringPayment[] {
  const today = toISODate(now);
  const groups = new Map<string, Transaction[]>();
  for (const tx of txs) {
    if (tx.amount.amount >= 0) continue;
    const key = merchantKeyFor(tx);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(tx);
    else groups.set(key, [tx]);
  }

  const found: RecurringPayment[] = [];
  for (const [key, group] of groups) {
    const series = toSeries(key, group, today);
    if (series) found.push(series);
  }
  found.sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.merchantKey.localeCompare(b.merchantKey));
  return found;
}

/** Payments whose next date falls within the next `days` days, including today. */
export function upcomingPayments(
  recurring: readonly RecurringPayment[],
  now: Date,
  days = 30,
): RecurringPayment[] {
  const today = toISODate(now);
  const horizon = Math.max(0, days);
  const until = addDays(today, horizon);
  return recurring
    .filter((item) => item.nextDate >= today && item.nextDate <= until)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.merchantKey.localeCompare(b.merchantKey));
}
