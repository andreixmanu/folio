import { applyCategories, categorize, createRuleFromTransaction, mccCategory } from '@/features/budget/categorize';
import { money, type CategoryId, type Rule, type Transaction } from '@/features/budget/model';

function tx(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: partial.id ?? 'tx-1',
    accountId: 'acc-revolut',
    bookingDate: '2026-11-01',
    amount: money(-10),
    status: 'booked',
    ...partial,
  };
}

function rule(merchantKey: string, categoryId: CategoryId): Rule {
  return { id: `rule-${merchantKey}`, merchantKey, categoryId, createdAt: '2026-11-01T00:00:00.000Z' };
}

describe('categorize precedence', () => {
  test('user rule beats a built-in merchant, which beats MCC, which beats the fallback', () => {
    const esselunga = tx({
      creditorName: 'PAGAMENTO POS ESSELUNGA 123 MILANO',
      merchantCategoryCode: '5812',
    });
    expect(categorize(esselunga, { userRules: [] })).toEqual({ categoryId: 'groceries', source: 'builtin' });
    expect(categorize(esselunga, { userRules: [rule('esselunga', 'restaurants')] })).toEqual({
      categoryId: 'restaurants',
      source: 'user',
    });

    const mccOnly = tx({ creditorName: 'LOCALE NORD', remittanceInformation: 'SCONTRINO 4412', merchantCategoryCode: '5411' });
    expect(categorize(mccOnly, { userRules: [] })).toEqual({ categoryId: 'groceries', source: 'mcc' });

    const unknown = tx({ creditorName: 'TABACCHI DA VINCI' });
    expect(categorize(unknown, { userRules: [] })).toEqual({ categoryId: 'other', source: 'fallback' });
  });

  test('the latest user rule for a merchant wins', () => {
    const sample = tx({ creditorName: 'ESSELUNGA' });
    const result = categorize(sample, {
      userRules: [rule('esselunga', 'shopping'), rule('esselunga', 'health')],
    });
    expect(result).toEqual({ categoryId: 'health', source: 'user' });
  });

  test('amazon prime is a subscription and a marketplace charge is shopping', () => {
    expect(categorize(tx({ creditorName: 'AMAZON PRIME' }), { userRules: [] }).categoryId).toBe('subscriptions');
    expect(categorize(tx({ creditorName: 'PRIME VIDEO' }), { userRules: [] }).categoryId).toBe('subscriptions');
    expect(categorize(tx({ creditorName: 'AMZN MKTP IT*1A2B3C' }), { userRules: [] }).categoryId).toBe('shopping');
    expect(
      categorize(
        tx({ creditorName: 'AMZN MKTP IT', remittanceInformation: 'Amazon Prime membership' }),
        { userRules: [] },
      ).categoryId,
    ).toBe('subscriptions');
  });

  test('bar does not swallow barbiere or Barilla, and IP needs a fuel context', () => {
    expect(categorize(tx({ creditorName: 'BAR CENTRALE MILANO' }), { userRules: [] }).categoryId).toBe('restaurants');
    expect(categorize(tx({ creditorName: 'IL BARBIERE' }), { userRules: [] }).categoryId).toBe('other');
    expect(categorize(tx({ creditorName: 'BARILLA' }), { userRules: [] }).categoryId).toBe('other');
    expect(categorize(tx({ creditorName: 'COOPERATIVA EDILIZIA' }), { userRules: [] }).categoryId).toBe('other');

    expect(categorize(tx({ creditorName: 'IP' }), { userRules: [] }).categoryId).toBe('transport');
    expect(categorize(tx({ creditorName: 'CARBURANTE IP' }), { userRules: [] }).categoryId).toBe('transport');
    expect(categorize(tx({ remittanceInformation: 'pagamento ip societa' }), { userRules: [] }).categoryId).toBe('other');
    expect(categorize(tx({ creditorName: 'RECIPROCO' }), { userRules: [] }).categoryId).toBe('other');
  });

  test('salary and refunds are income only on inflows; transfers stay transfers', () => {
    const salary = tx({
      amount: money(2350),
      debtorName: 'Officine Helios S.p.A.',
      remittanceInformation: 'EMOLUMENTI MESE NOVEMBRE',
    });
    expect(categorize(salary, { userRules: [] })).toEqual({ categoryId: 'income', source: 'builtin' });

    expect(
      categorize(tx({ amount: money(40), debtorName: 'Giulia R.', remittanceInformation: 'Per la cena' }), { userRules: [] }),
    ).toEqual({ categoryId: 'income', source: 'fallback' });

    expect(
      categorize(tx({ amount: money(20), remittanceInformation: 'RIMBORSO SPESE' }), { userRules: [] }).categoryId,
    ).toBe('income');

    expect(categorize(tx({ creditorName: 'STIPENDIO FITTIZIO' }), { userRules: [] }).categoryId).toBe('other');

    expect(
      categorize(tx({ creditorName: 'Revolut', remittanceInformation: 'Bonifico a Revolut' }), { userRules: [] }),
    ).toEqual({ categoryId: 'transfers', source: 'builtin' });
    expect(
      categorize(
        tx({ amount: money(600), debtorName: 'Banca Aurora', remittanceInformation: 'Ricarica Revolut' }),
        { userRules: [] },
      ).categoryId,
    ).toBe('transfers');
    expect(categorize(tx({ remittanceInformation: 'GIROCONTO' }), { userRules: [] }).categoryId).toBe('transfers');
    expect(categorize(tx({ creditorName: 'Marco B.', remittanceInformation: 'Bonifico a Marco B.' }), { userRules: [] }).categoryId).toBe(
      'other',
    );
  });

  test('built-in families', () => {
    const cases: readonly [string, CategoryId][] = [
      ['ESSELUNGA', 'groceries'],
      ['CONAD', 'groceries'],
      ['LIDL', 'groceries'],
      ['TRENITALIA', 'transport'],
      ['ATM MILANO', 'transport'],
      ['ENI STAZIONE CARBURANTE', 'transport'],
      ['NETFLIX.COM', 'subscriptions'],
      ['APPLE.COM/BILL', 'subscriptions'],
      ['DAZN', 'subscriptions'],
      ['ZALANDO', 'shopping'],
      ['IKEA', 'shopping'],
      ['H&M', 'shopping'],
      ['ENEL ENERGIA', 'home'],
      ['ILIAD', 'home'],
      ['AFFITTO NOVEMBRE', 'home'],
      ['FARMACIA COMUNALE', 'health'],
      ['TICKET SANITARIO', 'health'],
      ['PIZZERIA DA GINO', 'restaurants'],
      ['GLOVO *SUSHI', 'restaurants'],
      ['MCFIT', 'leisure'],
      ['UCI CINEMAS', 'leisure'],
      ['RYANAIR', 'travel'],
      ['BOOKING.COM', 'travel'],
    ];
    for (const [name, categoryId] of cases) {
      expect(categorize(tx({ creditorName: name }), { userRules: [] }).categoryId).toBe(categoryId);
    }
  });

  test('a custom builtin list replaces the defaults', () => {
    const result = categorize(tx({ creditorName: 'ESSELUNGA' }), {
      userRules: [],
      builtinRules: [{ categoryId: 'leisure', phrases: ['esselunga'] }],
    });
    expect(result).toEqual({ categoryId: 'leisure', source: 'builtin' });
  });
});

describe('mccCategory', () => {
  test('maps the documented codes, with 5816 as leisure and airline ranges as travel', () => {
    expect(mccCategory('5411')).toBe('groceries');
    expect(mccCategory('5812')).toBe('restaurants');
    expect(mccCategory('4111')).toBe('transport');
    expect(mccCategory('5541')).toBe('transport');
    expect(mccCategory('4511')).toBe('travel');
    expect(mccCategory('3005')).toBe('travel');
    expect(mccCategory('3299')).toBe('travel');
    expect(mccCategory('2999')).toBeNull();
    expect(mccCategory('4899')).toBe('subscriptions');
    expect(mccCategory('5815')).toBe('subscriptions');
    expect(mccCategory('5818')).toBe('subscriptions');
    expect(mccCategory('5816')).toBe('leisure');
    expect(mccCategory('5912')).toBe('health');
    expect(mccCategory('4900')).toBe('home');
    expect(mccCategory('4814')).toBe('home');
    expect(mccCategory('5732')).toBe('shopping');
    expect(mccCategory('7997')).toBe('leisure');
    expect(mccCategory('nope')).toBeNull();
    expect(mccCategory(undefined)).toBeNull();
  });
});

describe('applyCategories', () => {
  test('fills the key and the source without mutating the input', () => {
    const original = tx({ id: 'tx-a', creditorName: 'NETFLIX.COM' });
    const snapshot = { ...original, amount: { ...original.amount } };
    const [categorised] = applyCategories([original], []);
    expect(original).toEqual(snapshot);
    expect(categorised).toMatchObject({
      merchantKey: 'netflix',
      categoryId: 'subscriptions',
      categorySource: 'builtin',
    });
  });

  test('a per-transaction override wins over a user rule', () => {
    const sample = tx({ id: 'tx-a', creditorName: 'ESSELUNGA' });
    const [categorised] = applyCategories([sample], [rule('esselunga', 'shopping')], { 'tx-a': 'health' });
    expect(categorised).toMatchObject({ categoryId: 'health', categorySource: 'user', merchantKey: 'esselunga' });
  });

  test('createRuleFromTransaction normalises the counterparty', () => {
    const now = new Date('2026-11-16T12:00:00.000Z');
    const created = createRuleFromTransaction(tx({ creditorName: 'PAYPAL *NETFLIX' }), 'leisure', now);
    expect(created.merchantKey).toBe('netflix');
    expect(created.categoryId).toBe('leisure');
    expect(created.createdAt).toBe('2026-11-16T12:00:00.000Z');
    expect(created.id).toContain('netflix');
  });
});
