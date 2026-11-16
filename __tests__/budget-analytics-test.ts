import {
  budgetProgress,
  budgetState,
  formatDayLabel,
  groupByDay,
  merchantsForCategory,
  monthToDateCumulative,
  monthlyTrend,
  periodRange,
  spendingByCategory,
  totalIncome,
  totalSpent,
} from '@/features/budget/analytics';
import { fromCents, money, sumAmounts, toCents, type Transaction } from '@/features/budget/model';

function tx(partial: Omit<Partial<Transaction>, 'amount'> & { amount: number }): Transaction {
  const { amount, ...rest } = partial;
  return {
    id: rest.id ?? `tx-${rest.bookingDate ?? 'x'}-${amount}`,
    accountId: 'acc',
    bookingDate: '2026-11-10',
    status: 'booked',
    ...rest,
    amount: money(amount),
  };
}

const NOV = new Date('2026-11-16T12:00:00.000Z');
const RANGE = { from: '2026-11-01', to: '2026-11-30' };

describe('money helpers', () => {
  test('sums in cents', () => {
    expect(toCents(13.99)).toBe(1399);
    expect(fromCents(1399)).toBe(13.99);
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts([13.99, 10.99, 2.99, 9.99, 2.99])).toBe(40.95);
    expect(sumAmounts([-1.1, -2.2])).toBe(-3.3);
  });
});

describe('periodRange', () => {
  test('rolling windows end on the Rome day of now', () => {
    expect(periodRange('1W', NOV)).toEqual({ from: '2026-11-10', to: '2026-11-16' });
    expect(periodRange('1M', NOV)).toEqual({ from: '2026-10-18', to: '2026-11-16' });
    expect(periodRange('3M', NOV)).toEqual({ from: '2026-08-19', to: '2026-11-16' });
    expect(periodRange('6M', NOV)).toEqual({ from: '2026-05-21', to: '2026-11-16' });
    expect(periodRange('1Y', NOV)).toEqual({ from: '2025-11-17', to: '2026-11-16' });
  });
});

describe('spending totals', () => {
  const txs = [
    tx({ id: 'a', bookingDate: '2026-11-01', amount: -0.1, categoryId: 'groceries' }),
    tx({ id: 'b', bookingDate: '2026-11-02', amount: -0.2, categoryId: 'groceries' }),
    tx({ id: 'c', bookingDate: '2026-11-03', amount: -1.3, categoryId: 'restaurants' }),
    tx({ id: 'd', bookingDate: '2026-11-04', amount: -500, categoryId: 'transfers' }),
    tx({ id: 'e', bookingDate: '2026-11-05', amount: 2350, categoryId: 'income' }),
    tx({ id: 'f', bookingDate: '2026-10-01', amount: -40, categoryId: 'groceries' }),
    tx({ id: 'g', bookingDate: '2026-11-06', amount: 40, categoryId: 'transfers' }),
  ];

  test('cents-exact spend excludes transfers and income', () => {
    expect(totalSpent(txs, RANGE)).toBe(1.6);
    expect(totalIncome(txs, RANGE)).toBe(2350);
    expect(spendingByCategory(txs, RANGE)).toEqual([
      { categoryId: 'restaurants', total: 1.3, count: 1 },
      { categoryId: 'groceries', total: 0.3, count: 2 },
    ]);
  });

  test('merchantsForCategory sorts by total', () => {
    const rows = [
      tx({ id: 'm1', bookingDate: '2026-11-01', amount: -10, categoryId: 'shopping', merchantKey: 'zalando', creditorName: 'ZALANDO' }),
      tx({ id: 'm2', bookingDate: '2026-11-02', amount: -4, categoryId: 'shopping', merchantKey: 'amazon', creditorName: 'AMAZON' }),
      tx({ id: 'm3', bookingDate: '2026-11-03', amount: -6, categoryId: 'shopping', merchantKey: 'amazon', creditorName: 'AMAZON' }),
      tx({ id: 'm4', bookingDate: '2026-11-04', amount: -50, categoryId: 'groceries', merchantKey: 'esselunga' }),
    ];
    expect(merchantsForCategory(rows, 'shopping', RANGE)).toEqual([
      { merchantKey: 'amazon', displayName: 'Amazon', total: 10, count: 2 },
      { merchantKey: 'zalando', displayName: 'Zalando', total: 10, count: 1 },
    ]);
  });
});

describe('monthToDateCumulative', () => {
  test('aligns a 31-day month with a 28-day February and stops at the cursor', () => {
    const txs = [
      tx({ id: 'f1', bookingDate: '2026-02-01', amount: -10, categoryId: 'groceries' }),
      tx({ id: 'f2', bookingDate: '2026-02-28', amount: -5, categoryId: 'groceries' }),
      tx({ id: 'f3', bookingDate: '2026-02-10', amount: -100, categoryId: 'transfers' }),
      tx({ id: 'm1', bookingDate: '2026-03-01', amount: -20, categoryId: 'groceries' }),
      tx({ id: 'm2', bookingDate: '2026-03-02', amount: 500, categoryId: 'income' }),
      tx({ id: 'm3', bookingDate: '2026-03-15', amount: -7, categoryId: 'restaurants' }),
    ];
    const series = monthToDateCumulative(txs, new Date('2026-03-16T12:00:00.000Z'));
    expect(series.month).toBe('2026-03');
    expect(series.previousMonth).toBe('2026-02');
    expect(series.cutoffDay).toBe(16);
    expect(series.points).toHaveLength(31);
    expect(series.points[0]).toEqual({ day: 1, current: 20, previous: 10 });
    expect(series.points[14]).toEqual({ day: 15, current: 27, previous: 10 });
    expect(series.points[27]).toEqual({ day: 28, current: null, previous: 15 });
    expect(series.points[28]).toEqual({ day: 29, current: null, previous: null });
    expect(series.points[30]).toEqual({ day: 31, current: null, previous: null });
    const current = series.points.map((point) => point.current);
    expect(current[15]).toBe(27);
    expect(current[16]).toBeNull();
  });
});

describe('monthlyTrend', () => {
  test('returns oldest-first months ending at now', () => {
    const txs = [
      tx({ bookingDate: '2026-09-02', amount: -10, categoryId: 'groceries' }),
      tx({ bookingDate: '2026-10-02', amount: -20, categoryId: 'groceries' }),
      tx({ bookingDate: '2026-11-02', amount: 100, categoryId: 'income' }),
      tx({ bookingDate: '2026-11-03', amount: -5, categoryId: 'shopping' }),
    ];
    expect(monthlyTrend(txs, 3, NOV)).toEqual([
      { month: '2026-09', spent: 10, income: 0 },
      { month: '2026-10', spent: 20, income: 0 },
      { month: '2026-11', spent: 5, income: 100 },
    ]);
    expect(monthlyTrend(txs, 0, NOV)).toEqual([]);
  });
});

describe('budgetProgress', () => {
  function progress(limit: number, spent: number) {
    const budgets = [{ categoryId: 'groceries' as const, monthlyLimit: limit, currency: 'EUR' }];
    const txs = [tx({ bookingDate: '2026-11-04', amount: -spent, categoryId: 'groceries' })];
    return budgetProgress(budgets, txs, NOV)[0];
  }

  test('ok under 80%, warning from 80% through 100%, over above 100%', () => {
    expect(budgetState(0, 10_000)).toBe('ok');
    expect(budgetState(7999, 10_000)).toBe('ok');
    expect(budgetState(8000, 10_000)).toBe('warning');
    expect(budgetState(10_000, 10_000)).toBe('warning');
    expect(budgetState(10_001, 10_000)).toBe('over');
    expect(budgetState(1, 0)).toBe('over');

    expect(progress(100, 79.99)?.state).toBe('ok');
    expect(progress(100, 80)?.state).toBe('warning');
    expect(progress(100, 100)?.state).toBe('warning');
    expect(progress(100, 100.01)?.state).toBe('over');
    expect(progress(100, 80)?.ratio).toBeCloseTo(0.8);
    expect(progress(100, 0)?.spent).toBe(0);
  });

  test('only the cursor month counts, and transfers do not', () => {
    const budgets = [{ categoryId: 'home' as const, monthlyLimit: 100, currency: 'EUR' }];
    const txs = [
      tx({ id: 'old', bookingDate: '2026-10-02', amount: -90, categoryId: 'home' }),
      tx({ id: 'move', bookingDate: '2026-11-02', amount: -90, categoryId: 'transfers' }),
      tx({ id: 'rent', bookingDate: '2026-11-03', amount: -40, categoryId: 'home' }),
      tx({ id: 'later', bookingDate: '2026-11-20', amount: -40, categoryId: 'home' }),
    ];
    const [row] = budgetProgress(budgets, txs, NOV);
    expect(row?.spent).toBe(40);
    expect(row?.state).toBe('ok');
  });
});

describe('groupByDay', () => {
  test('sorts days descending and labels today, yesterday, and older dates', () => {
    const txs = [
      tx({ id: 'old', bookingDate: '2025-12-03', amount: -5, categoryId: 'other' }),
      tx({ id: 'y', bookingDate: '2026-11-15', amount: -2, categoryId: 'restaurants' }),
      tx({ id: 't1', bookingDate: '2026-11-16', amount: -1, categoryId: 'restaurants' }),
      tx({ id: 't2', bookingDate: '2026-11-16', amount: 10, categoryId: 'income' }),
    ];
    const sections = groupByDay(txs, NOV);
    expect(sections.map((section) => section.date)).toEqual(['2026-11-16', '2026-11-15', '2025-12-03']);
    expect(sections.map((section) => section.label)).toEqual(['Oggi', 'Ieri', '3 dic 2025']);
    expect(sections[0]?.net).toBe(9);
    expect(sections[0]?.transactions.map((item) => item.id)).toEqual(['t1', 't2']);
    expect(formatDayLabel('2026-11-02', '2026-11-16')).toBe('2 nov');
  });
});
