import { budgetProgress, totalIncome, totalSpent } from '@/features/budget/analytics';
import { applyCategories } from '@/features/budget/categorize';
import { createMockBudgetSource } from '@/features/budget/data-source';
import { addDays, addMonths, startOfMonth, toISODate } from '@/features/budget/dates';
import { createMockBudgetData, MOCK_ACCOUNT_IDS } from '@/features/budget/mock-data';
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from '@/features/budget/model';
import { detectRecurring } from '@/features/budget/recurring';

const NOV = new Date('2026-11-16T12:00:00.000Z');
const MARCH = new Date('2026-03-05T12:00:00.000Z');

const GROCERY_KEYS = [
  'esselunga',
  'conad',
  'lidl',
  'coop',
  'eurospin',
  'carrefour',
  'pam',
  'bennet',
  'despar',
  'iper',
];

function load(now: Date) {
  const data = createMockBudgetData(now);
  const txs = applyCategories(data.transactions, []);
  const today = toISODate(now);
  return { data, txs, today };
}

describe('budget model', () => {
  test('lists the twelve Italian categories with a budget accent on subscriptions', () => {
    expect(CATEGORIES.map((category) => category.label)).toEqual([
      'Alimentari',
      'Ristoranti',
      'Trasporti',
      'Shopping',
      'Casa e bollette',
      'Abbonamenti',
      'Salute',
      'Svago',
      'Viaggi',
      'Stipendio/Entrate',
      'Trasferimenti',
      'Altro',
    ]);
    expect(CATEGORIES.map((category) => category.id)).toEqual([...CATEGORY_IDS]);
    expect(CATEGORIES.find((category) => category.id === 'subscriptions')?.color).toEqual({
      dark: '#2EC4A6',
      light: '#0E9F84',
    });
    expect(new Set(CATEGORIES.map((category) => category.icon)).size).toBe(CATEGORIES.length);
  });
});

describe('createMockBudgetData', () => {
  test('is deterministic for a fixed now and changes when now changes', () => {
    const first = createMockBudgetData(NOV);
    const second = createMockBudgetData(NOV);
    expect(second.transactions).toEqual(first.transactions);
    expect(second.accounts).toEqual(first.accounts);
    expect(second.budgets).toEqual(first.budgets);
    expect(createMockBudgetData(MARCH).transactions).not.toEqual(first.transactions);
  });

  test.each([
    ['2026-11-16', NOV],
    ['2026-03-05', MARCH],
  ])('%s stays inside four months, with no future dates', (_label, now) => {
    const { data, txs, today } = load(now);
    const yesterday = addDays(today, -1);
    const months = [...new Set(data.transactions.map((tx) => tx.bookingDate.slice(0, 7)))].sort();

    expect(months).toHaveLength(4);
    expect(months[0]).toBe(addMonths(startOfMonth(today), -3).slice(0, 7));
    expect(months[3]).toBe(today.slice(0, 7));
    expect(data.transactions.every((tx) => tx.bookingDate <= today)).toBe(true);
    expect(data.transactions.some((tx) => tx.bookingDate === today && tx.status === 'pending')).toBe(true);
    expect(data.transactions.some((tx) => tx.bookingDate === yesterday && tx.status === 'pending')).toBe(true);
    expect(data.transactions.filter((tx) => tx.bookingDate >= yesterday).every((tx) => tx.status === 'pending')).toBe(
      true,
    );
    expect(data.transactions.filter((tx) => tx.bookingDate < yesterday).every((tx) => tx.status === 'booked')).toBe(
      true,
    );
    expect(data.transactions.every((tx) => tx.categoryId === undefined && tx.merchantKey === undefined)).toBe(true);

    const present = new Set(txs.map((tx) => tx.categoryId));
    for (const id of CATEGORY_IDS) expect(present.has(id)).toBe(true);

    for (const month of months.slice(0, 3)) {
      const spent = totalSpent(txs, { from: `${month}-01`, to: `${month}-31` });
      expect(spent).toBeGreaterThanOrEqual(1600);
      expect(spent).toBeLessThanOrEqual(2100);
    }

    for (const account of data.accounts) {
      expect(account.balance.amount).toBeGreaterThan(0);
      expect(account.balance.currency).toBe('EUR');
      expect(account.currency).toBe('EUR');
    }
  });

  test.each([
    ['2026-11-16', NOV],
    ['2026-03-05', MARCH],
  ])('%s current month warns on subscriptions and is over on shopping', (_label, now) => {
    const { data, txs, today } = load(now);
    const progress = budgetProgress(data.budgets, txs, now);
    const byId = Object.fromEntries(progress.map((row) => [row.categoryId, row])) as Record<
      CategoryId,
      (typeof progress)[number]
    >;

    expect(byId.subscriptions).toMatchObject({ spent: 44.95, limit: 50, state: 'warning' });
    expect(byId.shopping).toMatchObject({ spent: 219.89, limit: 200, state: 'over' });
    expect(byId.home).toMatchObject({ spent: 759.99, limit: 950, state: 'ok' });
    expect(progress.some((row) => row.state === 'warning')).toBe(true);
    expect(progress.some((row) => row.state === 'over')).toBe(true);

    const recurring = detectRecurring(txs, now);
    expect(recurring.some((series) => series.categoryId === 'groceries')).toBe(false);
    for (const key of GROCERY_KEYS) {
      expect(recurring.some((series) => series.merchantKey === key || series.merchantKey.startsWith(`${key} `))).toBe(
        false,
      );
    }
    expect(recurring.find((series) => series.merchantKey === 'netflix')).toMatchObject({
      cadence: 'monthly',
      isSubscription: true,
      averageAmount: 13.99,
      occurrences: 4,
    });
    expect(recurring.find((series) => series.merchantKey === 'iliad')).toMatchObject({
      categoryId: 'home',
      isSubscription: false,
      cadence: 'monthly',
    });

    const month = { from: startOfMonth(today), to: today };
    expect(totalSpent(txs, month)).toBeGreaterThan(0);
    expect(today).toBe(_label);
    if (today === '2026-11-16') {
      expect(totalSpent(txs, month)).toBe(1488.74);
      expect(totalIncome(txs, month)).toBe(40);
      expect(progress.map((row) => [row.categoryId, row.spent, row.state])).toEqual([
        ['groceries', 159.34, 'ok'],
        ['restaurants', 81.87, 'ok'],
        ['transport', 99.9, 'ok'],
        ['shopping', 219.89, 'over'],
        ['home', 759.99, 'ok'],
        ['subscriptions', 44.95, 'warning'],
        ['health', 14.3, 'ok'],
        ['leisure', 39, 'ok'],
        ['travel', 0, 'ok'],
        ['other', 69.5, 'ok'],
      ]);
    }
  });

  test('uses fictional Italian accounts and exercises MCC, fallback, income, and transfers', () => {
    const { data, txs } = load(NOV);
    const revolut = data.accounts.find((account) => account.id === MOCK_ACCOUNT_IDS.revolut);
    const aurora = data.accounts.find((account) => account.id === MOCK_ACCOUNT_IDS.aurora);

    expect(revolut).toMatchObject({
      provider: 'revolut',
      name: 'Revolut',
      institutionName: 'Revolut',
      iban: 'IT•• •••• 7390',
      kind: 'card',
    });
    expect(aurora).toMatchObject({
      provider: 'bank',
      name: 'Conto corrente',
      institutionName: 'Banca Aurora',
      iban: 'IT•• •••• 4821',
      kind: 'current',
    });
    expect(data.transactions.some((tx) => tx.debtorName === 'Giulia R.')).toBe(true);
    expect(data.transactions.some((tx) => tx.creditorName === 'Marco B.')).toBe(true);
    expect(data.transactions.some((tx) => tx.remittanceInformation?.startsWith('EMOLUMENTI MESE '))).toBe(true);
    expect(data.transactions.some((tx) => tx.creditorName === 'Officine Helios S.p.A.')).toBe(false);

    const find = (creditor: string) => txs.find((tx) => tx.creditorName === creditor);
    expect(find('LOCALE NORD')).toMatchObject({ categoryId: 'restaurants', categorySource: 'mcc' });
    expect(find('COMPAGNIA ALFA')).toMatchObject({ categoryId: 'travel', categorySource: 'mcc' });
    expect(find('NEGOZIO ALFA')).toMatchObject({ categoryId: 'shopping', categorySource: 'mcc' });
    expect(find('AMBULATORIO 4')).toMatchObject({ categoryId: 'health', categorySource: 'mcc' });
    expect(find('SALA 9')).toMatchObject({ categoryId: 'leisure', categorySource: 'mcc' });
    expect(find('TABACCHI DA VINCI')).toMatchObject({ categoryId: 'other', categorySource: 'fallback' });
    expect(find('SATISPAY *GIULIA R.')).toMatchObject({ categoryId: 'other', categorySource: 'fallback' });
    expect(find('Marco B.')).toMatchObject({ categoryId: 'other', categorySource: 'fallback' });
    expect(find('Revolut')).toMatchObject({ categoryId: 'transfers', categorySource: 'builtin' });

    const salary = txs.find((tx) => tx.remittanceInformation?.startsWith('EMOLUMENTI MESE '));
    expect(salary).toMatchObject({ categoryId: 'income', categorySource: 'builtin', debtorName: 'Officine Helios S.p.A.' });
    const giulia = txs.find((tx) => tx.debtorName === 'Giulia R.');
    expect(giulia).toMatchObject({ categoryId: 'income', categorySource: 'fallback' });
    const topUp = txs.find((tx) => tx.remittanceInformation === 'Ricarica Revolut');
    expect(topUp).toMatchObject({ categoryId: 'transfers', categorySource: 'builtin' });

    expect(totalIncome(txs, { from: '2026-11-01', to: '2026-11-16' })).toBe(40);
  });
});

describe('createMockBudgetSource', () => {
  test('returns raw transactions and filters by account and dates', async () => {
    const source = createMockBudgetSource(() => NOV, 0);
    const raw = await source.getTransactions();
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.every((tx) => tx.categoryId === undefined && tx.categorySource === undefined && tx.merchantKey === undefined)).toBe(
      true,
    );

    const aurora = await source.getTransactions({
      accountId: MOCK_ACCOUNT_IDS.aurora,
      from: '2026-11-01',
      to: '2026-11-16',
    });
    expect(aurora.length).toBeGreaterThan(0);
    expect(
      aurora.every(
        (tx) =>
          tx.accountId === MOCK_ACCOUNT_IDS.aurora &&
          tx.bookingDate >= '2026-11-01' &&
          tx.bookingDate <= '2026-11-16',
      ),
    ).toBe(true);

    const accounts = await source.getAccounts();
    expect(accounts.map((account) => account.institutionName).sort()).toEqual(['Banca Aurora', 'Revolut']);
  });
});
