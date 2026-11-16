import { detectRecurring, upcomingPayments } from '@/features/budget/recurring';
import { money, type Transaction } from '@/features/budget/model';

function outflow(id: string, date: string, amount: number, creditorName: string, categoryId?: Transaction['categoryId']): Transaction {
  return {
    id,
    accountId: 'acc-revolut',
    bookingDate: date,
    amount: money(-Math.abs(amount)),
    status: 'booked',
    creditorName,
    ...(categoryId ? { categoryId, categorySource: 'builtin' as const } : {}),
  };
}

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('detectRecurring', () => {
  test('detects a monthly subscription and keeps the next date when it is still ahead', () => {
    const txs = [
      outflow('a', '2026-01-15', 13.99, 'NETFLIX.COM', 'subscriptions'),
      outflow('b', '2026-02-14', 13.99, 'NETFLIX.COM', 'subscriptions'),
      outflow('c', '2026-03-16', 13.99, 'NETFLIX.COM', 'subscriptions'),
    ];
    const [series] = detectRecurring(txs, NOW);
    expect(series).toMatchObject({
      merchantKey: 'netflix',
      displayName: 'Netflix',
      categoryId: 'subscriptions',
      averageAmount: 13.99,
      cadence: 'monthly',
      lastDate: '2026-03-16',
      nextDate: '2026-06-14',
      occurrences: 3,
      isSubscription: true,
      accountId: 'acc-revolut',
    });
  });

  test('rolls a missed cycle forward past now', () => {
    const txs = [
      outflow('a', '2026-01-15', 13.99, 'NETFLIX.COM', 'subscriptions'),
      outflow('b', '2026-02-14', 13.99, 'NETFLIX.COM', 'subscriptions'),
      outflow('c', '2026-03-16', 13.99, 'NETFLIX.COM', 'subscriptions'),
    ];
    const [series] = detectRecurring(txs, new Date('2026-06-01T12:00:00.000Z'));
    expect(series?.nextDate).toBe('2026-06-14');
    expect(series?.nextDate >= '2026-06-01').toBe(true);
  });

  test('does not roll a payment that is still due today', () => {
    const txs = [
      outflow('a', '2026-08-01', 9.99, 'SPOTIFY', 'subscriptions'),
      outflow('b', '2026-08-31', 9.99, 'SPOTIFY', 'subscriptions'),
      outflow('c', '2026-09-30', 9.99, 'SPOTIFY', 'subscriptions'),
    ];
    const [series] = detectRecurring(txs, new Date('2026-10-30T12:00:00.000Z'));
    expect(series?.cadence).toBe('monthly');
    expect(series?.nextDate).toBe('2026-10-30');
  });

  test('two identical charges about 30 days apart are enough; a different amount is not', () => {
    const pair = [
      outflow('a', '2026-01-01', 9.99, 'ILIAD ITALIA'),
      outflow('b', '2026-01-31', 9.99, 'ILIAD ITALIA'),
    ];
    expect(detectRecurring(pair, new Date('2026-02-01T12:00:00.000Z'))).toHaveLength(1);

    const drifted = [
      outflow('a', '2026-01-01', 9.99, 'ILIAD ITALIA'),
      outflow('b', '2026-01-31', 12, 'ILIAD ITALIA'),
    ];
    expect(detectRecurring(drifted, new Date('2026-02-01T12:00:00.000Z'))).toHaveLength(0);

    const tooClose = [
      outflow('a', '2026-01-01', 9.99, 'ILIAD ITALIA'),
      outflow('b', '2026-01-11', 9.99, 'ILIAD ITALIA'),
    ];
    expect(detectRecurring(tooClose, new Date('2026-02-01T12:00:00.000Z'))).toHaveLength(0);
  });

  test('weekly Esselunga with varying amounts is not recurring', () => {
    const txs = [
      outflow('a', '2026-10-01', 20, 'PAGAMENTO POS ESSELUNGA 123 MILANO', 'groceries'),
      outflow('b', '2026-10-08', 80, 'ESSELUNGA SPA', 'groceries'),
      outflow('c', '2026-10-15', 35, 'Esselunga Milano', 'groceries'),
      outflow('d', '2026-10-22', 60, 'ESSELUNGA 12', 'groceries'),
    ];
    expect(detectRecurring(txs, new Date('2026-10-23T12:00:00.000Z'))).toEqual([]);
  });

  test('a steady weekly shop with a tight amount is recurring, and it is not a subscription', () => {
    const txs = [
      outflow('a', '2026-10-01', 20, 'ESSELUNGA', 'groceries'),
      outflow('b', '2026-10-08', 21, 'ESSELUNGA', 'groceries'),
      outflow('c', '2026-10-15', 19.5, 'ESSELUNGA', 'groceries'),
      outflow('d', '2026-10-22', 20.5, 'ESSELUNGA', 'groceries'),
    ];
    const [series] = detectRecurring(txs, new Date('2026-10-23T12:00:00.000Z'));
    expect(series).toMatchObject({
      merchantKey: 'esselunga',
      cadence: 'weekly',
      isSubscription: false,
      occurrences: 4,
    });
  });

  test('bills within ±15% count and a jump past that does not', () => {
    const tolerated = [
      outflow('a', '2026-01-10', 100, 'ENEL ENERGIA S.P.A.', 'home'),
      outflow('b', '2026-02-09', 110, 'ENEL ENERGIA', 'home'),
      outflow('c', '2026-03-11', 90, 'ENEL', 'home'),
    ];
    const [ok] = detectRecurring(tolerated, new Date('2026-03-12T12:00:00.000Z'));
    expect(ok?.merchantKey).toBe('enel');
    expect(ok?.cadence).toBe('monthly');
    expect(ok?.isSubscription).toBe(false);

    const spiked = [
      outflow('a', '2026-01-10', 100, 'ENEL', 'home'),
      outflow('b', '2026-02-09', 100, 'ENEL', 'home'),
      outflow('c', '2026-03-11', 130, 'ENEL', 'home'),
    ];
    expect(detectRecurring(spiked, new Date('2026-03-12T12:00:00.000Z'))).toEqual([]);
  });

  test('quarterly cadence and inflows are ignored', () => {
    const txs = [
      outflow('a', '2026-01-01', 40, 'MCFIT', 'leisure'),
      outflow('b', '2026-04-01', 40, 'MCFIT', 'leisure'),
      outflow('c', '2026-07-01', 40, 'MCFIT', 'leisure'),
    ];
    const [series] = detectRecurring(txs, new Date('2026-08-01T12:00:00.000Z'));
    expect(series?.cadence).toBe('quarterly');
    expect(series?.nextDate).toBe('2026-09-30');

    const income: Transaction = {
      ...outflow('in', '2026-01-27', 2350, 'Ignored'),
      amount: money(2350),
      debtorName: 'Officine Helios S.p.A.',
      creditorName: undefined,
    };
    expect(detectRecurring([income, income, income], NOW)).toEqual([]);
  });

  test('an identical monthly charge from a known subscription merchant is a subscription even without the category', () => {
    const txs = [
      outflow('a', '2026-01-01', 2.99, 'APPLE.COM/BILL'),
      outflow('b', '2026-01-31', 2.99, 'APPLE.COM/BILL'),
    ];
    const [series] = detectRecurring(txs, new Date('2026-02-01T12:00:00.000Z'));
    expect(series).toMatchObject({ merchantKey: 'icloud', isSubscription: true, cadence: 'monthly' });
  });
});

describe('upcomingPayments', () => {
  test('keeps payments due inside the window, including today', () => {
    const txs = [
      outflow('a', '2026-01-15', 13.99, 'NETFLIX.COM', 'subscriptions'),
      outflow('b', '2026-02-14', 13.99, 'NETFLIX.COM', 'subscriptions'),
      outflow('c', '2026-03-16', 13.99, 'NETFLIX.COM', 'subscriptions'),
    ];
    const recurring = detectRecurring(txs, NOW);
    expect(upcomingPayments(recurring, NOW, 30).map((item) => item.merchantKey)).toEqual(['netflix']);
    expect(upcomingPayments(recurring, NOW, 10)).toEqual([]);
    expect(upcomingPayments(recurring, new Date('2026-06-14T12:00:00.000Z'), 0).map((item) => item.nextDate)).toEqual([
      '2026-06-14',
    ]);
  });
});
