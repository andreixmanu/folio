import { totalIncome, totalSpent } from '@/features/budget/analytics';
import { applyCategories, categorize, isInterestCredit, isSavingsMove } from '@/features/budget/categorize';
import { detectRecurring } from '@/features/budget/recurring';
import { money, type Transaction } from '@/features/budget/model';

/** Synthetic rows shaped like the Revolut open-banking feed. No real data. */
function tx(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: partial.id ?? 'tx-1',
    accountId: 'acc-revolut',
    bookingDate: '2026-11-03',
    amount: money(-100),
    status: 'booked',
    bankTransactionCode: 'TRANSFER',
    ...partial,
  };
}

const RANGE = { from: '2026-01-01', to: '2026-12-31' };

describe('Revolut deposit account (conto deposito)', () => {
  test('single-leg moves to and from the deposit are transfers', () => {
    const out = tx({ remittanceInformation: 'To Conto deposito senza vincoli' });
    const back = tx({ amount: money(250), remittanceInformation: 'From Conto deposito senza vincoli' });
    const noted = tx({ amount: money(80), remittanceInformation: 'Rata macchina From Conto deposito senza vincoli' });
    for (const row of [out, back, noted]) {
      expect(isSavingsMove(row)).toBe(true);
      expect(categorize(row, { userRules: [] })).toEqual({ categoryId: 'transfers', source: 'builtin' });
    }
  });

  test('English savings, vault and pocket wording is recognised', () => {
    const cases = [
      'To Instant Access Savings',
      'From Savings Account',
      'To Savings vault',
      'Pocket top up',
      'To EUR',
      'To EUR MB:0a1b2c3d-0000-4000-8000-123456789abc',
      'From EUR',
    ];
    for (const remittanceInformation of cases) {
      expect(categorize(tx({ remittanceInformation }), { userRules: [] }).categoryId).toBe('transfers');
    }
  });

  test('shops and landlords that only share a word are left alone', () => {
    const cafe = tx({ creditorName: 'POCKET CAFE', bankTransactionCode: 'CARD_PAYMENT', merchantCategoryCode: '5812' });
    expect(isSavingsMove(cafe)).toBe(false);
    expect(categorize(cafe, { userRules: [] }).categoryId).toBe('restaurants');

    const caution = tx({ creditorName: 'Mario Rossi', remittanceInformation: 'Deposito cauzionale appartamento' });
    expect(isSavingsMove(caution)).toBe(false);
    expect(categorize(caution, { userRules: [] }).categoryId).toBe('other');

    const anonymousCaution = tx({ remittanceInformation: 'Deposito cauzionale' });
    expect(isSavingsMove(anonymousCaution)).toBe(false);
  });

  test('interest credited is income in its own category; outgoing interest is not', () => {
    const interest = tx({ amount: money(1.37), remittanceInformation: 'Interessi Conto deposito' });
    expect(isInterestCredit(interest)).toBe(true);
    expect(categorize(interest, { userRules: [] })).toEqual({ categoryId: 'interest', source: 'builtin' });

    const english = tx({ amount: money(0.92), remittanceInformation: 'Interest earned' });
    expect(categorize(english, { userRules: [] }).categoryId).toBe('interest');

    const loan = tx({ amount: money(-12), creditorName: 'Finanziaria Sud', remittanceInformation: 'Interessi rata' });
    expect(isInterestCredit(loan)).toBe(false);
    expect(categorize(loan, { userRules: [] }).categoryId).not.toBe('interest');
  });

  test('totals ignore principal moves and count interest as income', () => {
    const rows = applyCategories(
      [
        tx({ id: 'grocery', amount: money(-40), creditorName: 'ESSELUNGA', bankTransactionCode: 'CARD_PAYMENT' }),
        tx({ id: 'to-dep', amount: money(-500), remittanceInformation: 'To Conto deposito senza vincoli' }),
        tx({ id: 'from-dep', amount: money(200), remittanceInformation: 'From Conto deposito senza vincoli' }),
        tx({ id: 'pocket', amount: money(-0.6), remittanceInformation: 'To EUR MB:00000000-0000-4000-8000-000000000000' }),
        tx({ id: 'interest', amount: money(1.5), remittanceInformation: 'Interessi Conto deposito' }),
      ],
      [],
    );
    expect(totalSpent(rows, RANGE)).toBe(40);
    expect(totalIncome(rows, RANGE)).toBe(1.5);
    expect(rows.find((row) => row.id === 'to-dep')?.categoryId).toBe('transfers');
  });

  test('monthly deposit moves never show up as recurring payments', () => {
    const rows = applyCategories(
      ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'].map((bookingDate, index) =>
        tx({
          id: `dep-${index}`,
          bookingDate,
          amount: money(-300),
          remittanceInformation: 'To Conto deposito senza vincoli',
        }),
      ),
      [],
    );
    expect(detectRecurring(rows, new Date('2026-11-10T12:00:00Z'))).toEqual([]);
  });

  test('a manual choice still wins over deposit detection', () => {
    const row = tx({ id: 'manual', remittanceInformation: 'To Conto deposito senza vincoli' });
    const [result] = applyCategories([row], [], { manual: 'shopping' });
    expect(result?.categoryId).toBe('shopping');
    expect(result?.categorySource).toBe('user');
  });
});
