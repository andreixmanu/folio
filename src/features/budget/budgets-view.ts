import { formatMoney } from '@/lib/format';

import { daysBetween, endOfMonth, toISODate } from './dates';
import type { CategoryId, RecurringPayment } from './model';

export type BudgetStateName = 'ok' | 'warning' | 'over';

export type BudgetProgressItem = {
  categoryId: CategoryId;
  spent: number;
  limit: number;
  ratio: number;
  state: BudgetStateName;
};

export type BudgetSummary = {
  limit: number;
  spent: number;
  left: number;
  daysLeft: number;
  dailyAvailable: number;
};

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Whole euros drop the cents; everything else keeps two decimals. */
export function formatBudgetMoney(amount: number): string {
  const rounded = roundCents(amount);
  const whole = rounded === Math.trunc(rounded);
  return formatMoney(rounded, 'EUR', { fractionDigits: whole ? 0 : 2 });
}

/** Days from today through the last calendar day of the Europe/Rome month, inclusive. */
export function daysLeftInMonth(now: Date): number {
  const today = toISODate(now);
  return daysBetween(today, endOfMonth(today)) + 1;
}

export function budgetSummary(progress: readonly BudgetProgressItem[], now: Date): BudgetSummary {
  const limit = roundCents(progress.reduce((sum, item) => sum + item.limit, 0));
  const spent = roundCents(progress.reduce((sum, item) => sum + item.spent, 0));
  const left = roundCents(limit - spent);
  const daysLeft = daysLeftInMonth(now);
  const dailyAvailable = Math.max(0, left) / daysLeft;
  return { limit, spent, left, daysLeft, dailyAvailable };
}

export function sortByRatio(progress: readonly BudgetProgressItem[]): BudgetProgressItem[] {
  return [...progress].sort((a, b) => {
    if (a.ratio !== b.ratio) return b.ratio - a.ratio;
    return a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0;
  });
}

export function budgetTone(state: BudgetStateName): 'accent' | 'warning' | 'negative' {
  if (state === 'warning') return 'warning';
  if (state === 'over') return 'negative';
  return 'accent';
}

export function overLabel(progress: BudgetProgressItem): string {
  const over = roundCents(progress.spent - progress.limit);
  if (over > 0) return `Superato di ${formatBudgetMoney(over)}`;
  return `Restano ${formatBudgetMoney(roundCents(progress.limit - progress.spent))}`;
}

const MONTHLY_FACTOR: Record<RecurringPayment['cadence'], number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

export function recurringMonthlyTotal(recurring: readonly RecurringPayment[]): number {
  const total = recurring.reduce((sum, item) => {
    if (!item.isSubscription) return sum;
    return sum + item.averageAmount * MONTHLY_FACTOR[item.cadence];
  }, 0);
  return roundCents(total);
}

export const CADENCE_LABEL: Record<RecurringPayment['cadence'], string> = {
  weekly: 'Settimanale',
  monthly: 'Mensile',
  quarterly: 'Trimestrale',
  yearly: 'Annuale',
};
