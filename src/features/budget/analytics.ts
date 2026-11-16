/**
 * Budget analytics. Every sum is accumulated in cents and converted back once.
 * Spending is outflows excluding transfers. Income is inflows categorised as income.
 */

import { addDays, addMonths, dayOfMonth, daysBetween, daysInMonth, endOfMonth, startOfMonth, toISODate, yearMonth } from './dates';
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

/**
 * Window ending on `now`'s Rome calendar day, inclusive. `1M` is the calendar
 * month to date, like Panoramica and Budget; the others are rolling windows.
 */
export function periodRange(period: BudgetPeriod, now: Date): DateRange {
  const to = toISODate(now);
  if (period === '1M') return { from: startOfMonth(to), to };
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

export type CategoryShare = CategorySpend & {
  /** Fraction of the month-to-date spend, from 0 to 1. */
  share: number;
};

/** Largest month-to-date categories, each with its share of all spending. */
export function topCategoryShares(txs: readonly Transaction[], now: Date, limit = 5): CategoryShare[] {
  const today = toISODate(now);
  const range: DateRange = { from: startOfMonth(today), to: today };
  const total = totalSpent(txs, range);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  return spendingByCategory(txs, range)
    .slice(0, cap)
    .map((row) => ({
      ...row,
      share: total > 0 ? row.total / total : 0,
    }));
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

export type MonthSpendComparison = {
  /** Positive euros spent this month, through today. */
  spent: number;
  /** Positive euros spent on the same day-of-month last month. */
  previous: number;
  /** `spent - previous`. Positive means more was spent. */
  delta: number;
  /**
   * Percent change versus the same day last month.
   * Null when that calendar day does not exist, or when last month was 0 and this month is not.
   */
  changePct: number | null;
};

/** This month's spend against last month, aligned on the day of month. */
export function monthSpendComparison(txs: readonly Transaction[], now: Date): MonthSpendComparison {
  const series = monthToDateCumulative(txs, now);
  const point = series.points[series.cutoffDay - 1];
  const spent = point?.current ?? 0;
  const sameDay = point?.previous;
  if (sameDay == null) {
    return { spent, previous: 0, delta: spent, changePct: null };
  }
  const delta = fromCents(toCents(spent) - toCents(sameDay));
  const changePct = sameDay > 0 ? (delta / sameDay) * 100 : spent === 0 ? 0 : null;
  return { spent, previous: sameDay, delta, changePct };
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

/** Newest transactions first. A non-positive `limit` returns an empty list. */
export function recentTransactions(txs: readonly Transaction[], limit = 5): Transaction[] {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  return [...txs]
    .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || b.id.localeCompare(a.id))
    .slice(0, cap);
}

/** Inclusive window of the same length, ending the day before `range.from`. */
export function previousRange(range: DateRange): DateRange {
  const length = daysBetween(range.from, range.to) + 1;
  const to = addDays(range.from, -1);
  const from = addDays(to, -(length - 1));
  return { from, to };
}

export type PeriodComparison = {
  /** Positive euros spent in the selected period. */
  spent: number;
  /** Positive euros spent in the previous window. */
  previous: number;
  /** `spent - previous`. Positive means more was spent. */
  delta: number;
  /** Percent change versus the previous window. Null when that window is 0. */
  changePct: number | null;
};

/** Spend in `period` against the equal window immediately before it. */
export function periodComparison(txs: readonly Transaction[], period: BudgetPeriod, now: Date): PeriodComparison {
  const current = periodRange(period, now);
  // Month to date compares with the same days of last month (1–16 Nov vs 1–16 Oct).
  const prior =
    period === '1M'
      ? { from: startOfMonth(addMonths(current.from, -1)), to: addMonths(current.to, -1) }
      : previousRange(current);
  const spent = totalSpent(txs, current);
  const previous = totalSpent(txs, prior);
  const delta = fromCents(toCents(spent) - toCents(previous));
  const changePct = previous === 0 ? null : (delta / previous) * 100;
  return { spent, previous, delta, changePct };
}

export type CategoryBreakdown = CategorySpend & {
  /** Percent of spending in the range, from 0 to 100. */
  share: number;
};

/** Spending by category, largest first. `share` is 0–100. Transfers are excluded. */
export function categoryBreakdown(txs: readonly Transaction[], range: DateRange): CategoryBreakdown[] {
  const rows = spendingByCategory(txs, range);
  const totalCents = rows.reduce((sum, row) => sum + toCents(row.total), 0);
  return rows
    .map((row) => ({
      categoryId: row.categoryId,
      total: row.total,
      count: row.count,
      share: totalCents > 0 ? (toCents(row.total) / totalCents) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total || a.categoryId.localeCompare(b.categoryId));
}

/**
 * Spending movements in one category, newest first.
 * Transfers are included only when `categoryId` is `transfers`.
 */
export function transactionsForCategory(
  txs: readonly Transaction[],
  categoryId: CategoryId,
  range: DateRange,
): Transaction[] {
  return txs
    .filter((tx) => {
      if (!inRange(tx.bookingDate, range)) return false;
      const id = tx.categoryId ?? 'other';
      if (id !== categoryId) return false;
      if (categoryId === 'transfers') return tx.amount.amount < 0;
      return isSpent(tx);
    })
    .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || b.id.localeCompare(a.id));
}
