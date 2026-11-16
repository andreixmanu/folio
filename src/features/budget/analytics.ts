/**
 * Budget analytics. Every sum is accumulated in cents and converted back once.
 * Spending is outflows excluding transfers. Income is inflows categorised as income.
 */

import { addDays, addMonths, dayOfMonth, daysInMonth, endOfMonth, startOfMonth, toISODate, yearMonth } from './dates';
import { displayMerchant } from './merchant';
import {
  fromCents,
  sumAmounts,
  toCents,
  type Budget,
  type CategoryId,
  type Transaction,
} from './model';

export type BudgetPeriod = '1W' | '1M' | '3M' | '6M' | '1Y';

export type DateRange = {
  /** Inclusive civil start, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive civil end, `YYYY-MM-DD`. */
  to: string;
};

const PERIOD_DAYS: Record<BudgetPeriod, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

/** Rolling window ending on `now`'s Rome calendar day, inclusive. */
export function periodRange(period: BudgetPeriod, now: Date): DateRange {
  const to = toISODate(now);
  const from = addDays(to, -(PERIOD_DAYS[period] - 1));
  return { from, to };
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

function isSpent(tx: Transaction): boolean {
  return tx.amount.amount < 0 && tx.categoryId !== 'transfers';
}

function isIncome(tx: Transaction): boolean {
  return tx.amount.amount > 0 && tx.categoryId === 'income';
}

export type CategorySpend = {
  categoryId: CategoryId;
  /** Positive euros. */
  total: number;
  count: number;
};

export function spendingByCategory(txs: readonly Transaction[], range: DateRange): CategorySpend[] {
  const cents = new Map<CategoryId, { cents: number; count: number }>();
  for (const tx of txs) {
    if (!isSpent(tx) || !inRange(tx.bookingDate, range)) continue;
    const categoryId = tx.categoryId ?? 'other';
    const bucket = cents.get(categoryId) ?? { cents: 0, count: 0 };
    bucket.cents += Math.abs(toCents(tx.amount.amount));
    bucket.count += 1;
    cents.set(categoryId, bucket);
  }
  return [...cents.entries()]
    .map(([categoryId, bucket]) => ({
      categoryId,
      total: fromCents(bucket.cents),
      count: bucket.count,
    }))
    .sort((a, b) => b.total - a.total || a.categoryId.localeCompare(b.categoryId));
}

/** Positive euros spent in the range (outflows, transfers excluded). */
export function totalSpent(txs: readonly Transaction[], range: DateRange): number {
  return sumAmounts(
    txs.filter((tx) => isSpent(tx) && inRange(tx.bookingDate, range)).map((tx) => Math.abs(tx.amount.amount)),
  );
}

/** Positive euros of income in the range. */
export function totalIncome(txs: readonly Transaction[], range: DateRange): number {
  return sumAmounts(
    txs.filter((tx) => isIncome(tx) && inRange(tx.bookingDate, range)).map((tx) => tx.amount.amount),
  );
}

export type CumulativePoint = {
  day: number;
  /** Running spend this month. Null after the cutoff day. */
  current: number | null;
  /** Running spend on that day-of-month last month. Null when that month is shorter. */
  previous: number | null;
};

export type MonthCumulative = {
  /** `YYYY-MM` of the month under the cursor. */
  month: string;
  previousMonth: string;
  /** Day-of-month of `month` (inclusive). Later days are not yet "to date". */
  cutoffDay: number;
  points: CumulativePoint[];
};

function spendByDay(txs: readonly Transaction[], ym: string): Map<number, number> {
  const days = new Map<number, number>();
  for (const tx of txs) {
    if (!isSpent(tx) || yearMonth(tx.bookingDate) !== ym) continue;
    const day = dayOfMonth(tx.bookingDate);
    days.set(day, (days.get(day) ?? 0) + Math.abs(toCents(tx.amount.amount)));
  }
  return days;
}

function running(byDay: Map<number, number>, length: number): number[] {
  const points: number[] = [];
  let total = 0;
  for (let day = 1; day <= length; day += 1) {
    total += byDay.get(day) ?? 0;
    points.push(total);
  }
  return points;
}

/**
 * Daily cumulative spend for the chart: this month against the previous one,
 * aligned by day-of-month. A shorter previous month leaves `previous` null
 * past its last day (March 31 vs February 28). Days after the cursor are null
 * on the current series.
 */
export function monthToDateCumulative(txs: readonly Transaction[], month: Date): MonthCumulative {
  const cursor = toISODate(month);
  const currentYm = yearMonth(cursor);
  const previousYm = yearMonth(startOfMonth(addDays(startOfMonth(cursor), -1)));
  const currentLength = daysInMonth(Number(currentYm.slice(0, 4)), Number(currentYm.slice(5, 7)) - 1);
  const previousLength = daysInMonth(Number(previousYm.slice(0, 4)), Number(previousYm.slice(5, 7)) - 1);
  const currentRun = running(spendByDay(txs, currentYm), currentLength);
  const previousRun = running(spendByDay(txs, previousYm), previousLength);
  const cutoffDay = dayOfMonth(cursor);

  const points: CumulativePoint[] = [];
  for (let day = 1; day <= currentLength; day += 1) {
    points.push({
      day,
      current: day <= cutoffDay ? fromCents(currentRun[day - 1] ?? 0) : null,
      previous: day <= previousLength ? fromCents(previousRun[day - 1] ?? 0) : null,
    });
  }
  return { month: currentYm, previousMonth: previousYm, cutoffDay, points };
}

export type MonthTrend = {
  /** `YYYY-MM`. */
  month: string;
  spent: number;
  income: number;
};

/** `months` calendar months ending at `now`, oldest first. */
export function monthlyTrend(txs: readonly Transaction[], months: number, now: Date = new Date()): MonthTrend[] {
  if (months <= 0) return [];
  const end = yearMonth(toISODate(now));
  let cursor = yearMonth(addMonths(`${end}-01`, -(months - 1)));
  const points: MonthTrend[] = [];
  for (let i = 0; i < months; i += 1) {
    const from = `${cursor}-01`;
    const to = endOfMonth(from);
    points.push({
      month: cursor,
      spent: totalSpent(txs, { from, to }),
      income: totalIncome(txs, { from, to }),
    });
    cursor = yearMonth(addMonths(from, 1));
  }
  return points;
}

export type MerchantSpend = {
  merchantKey: string;
  displayName: string;
  total: number;
  count: number;
};

/** Merchants inside one category, largest total first. */
export function merchantsForCategory(
  txs: readonly Transaction[],
  categoryId: CategoryId,
  range: DateRange,
): MerchantSpend[] {
  const buckets = new Map<string, { cents: number; count: number }>();
  for (const tx of txs) {
    if (!isSpent(tx) || tx.categoryId !== categoryId || !inRange(tx.bookingDate, range)) continue;
    const key = tx.merchantKey?.trim() || '';
    if (!key) continue;
    const bucket = buckets.get(key) ?? { cents: 0, count: 0 };
    bucket.cents += Math.abs(toCents(tx.amount.amount));
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([merchantKey, bucket]) => ({
      merchantKey,
      displayName: displayMerchant(merchantKey),
      total: fromCents(bucket.cents),
      count: bucket.count,
    }))
    .sort((a, b) => b.total - a.total || a.merchantKey.localeCompare(b.merchantKey));
}

export type BudgetState = 'ok' | 'warning' | 'over';

export type BudgetProgress = {
  categoryId: CategoryId;
  spent: number;
  limit: number;
  /** `spent / limit`. Zero when the limit is zero and nothing was spent. */
  ratio: number;
  state: BudgetState;
};

/**
 * `warning` from 80% inclusive, `over` strictly above 100%.
 * 100% on the nose stays a warning: the cap has been reached, not passed.
 */
export function budgetState(spentCents: number, limitCents: number): BudgetState {
  if (limitCents <= 0) return spentCents > 0 ? 'over' : 'ok';
  if (spentCents > limitCents) return 'over';
  if (spentCents * 5 >= limitCents * 4) return 'warning';
  return 'ok';
}

export function budgetProgress(
  budgets: readonly Budget[],
  txs: readonly Transaction[],
  month: Date,
): BudgetProgress[] {
  const cursor = toISODate(month);
  const range: DateRange = { from: startOfMonth(cursor), to: endOfMonth(cursor) };
  // Progress is month-to-date: only days up to the cursor count.
  range.to = cursor;
  return budgets.map((budget) => {
    const spentCents = txs.reduce((sum, tx) => {
      if (!isSpent(tx) || tx.categoryId !== budget.categoryId || !inRange(tx.bookingDate, range)) return sum;
      return sum + Math.abs(toCents(tx.amount.amount));
    }, 0);
    const limitCents = toCents(budget.monthlyLimit);
    const ratio = limitCents <= 0 ? (spentCents > 0 ? Number.POSITIVE_INFINITY : 0) : spentCents / limitCents;
    return {
      categoryId: budget.categoryId,
      spent: fromCents(spentCents),
      limit: fromCents(limitCents),
      ratio,
      state: budgetState(spentCents, limitCents),
    };
  });
}

export type DaySection = {
  date: string;
  /** `Oggi`, `Ieri`, or a short Italian date such as `16 nov`. */
  label: string;
  /** Signed net of every transaction that day, in euros. */
  net: number;
  transactions: Transaction[];
};

const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'] as const;

export function formatDayLabel(iso: string, today: string): string {
  if (iso === today) return 'Oggi';
  if (iso === addDays(today, -1)) return 'Ieri';
  const day = Number(iso.slice(8, 10));
  const month = MONTHS_SHORT[Number(iso.slice(5, 7)) - 1] ?? '';
  if (iso.slice(0, 4) !== today.slice(0, 4)) return `${day} ${month} ${iso.slice(0, 4)}`;
  return `${day} ${month}`;
}

/** Sections newest-first. Transactions keep their incoming order inside the day. */
export function groupByDay(txs: readonly Transaction[], now: Date = new Date()): DaySection[] {
  const today = toISODate(now);
  const groups = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const bucket = groups.get(tx.bookingDate);
    if (bucket) bucket.push(tx);
    else groups.set(tx.bookingDate, [tx]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, transactions]) => ({
      date,
      label: formatDayLabel(date, today),
      net: sumAmounts(transactions.map((tx) => tx.amount.amount)),
      transactions,
    }));
}
