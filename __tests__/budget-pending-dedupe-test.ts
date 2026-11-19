import { withoutSupersededPending } from '@/features/budget/pending-dedupe';
import type { Transaction } from '@/features/budget/model';

function movement(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'status'>): Transaction {
  return {
    accountId: 'acc',
    bookingDate: '2026-11-10',
    amount: { amount: -12.5, currency: 'EUR' },
    creditorName: 'Bar Centrale',
    ...partial,
  };
}

const HASH = 'acc:h0123456789abcdef01234567';

describe('pending versus booked', () => {
  test('keeps the booked copy and one unmatched pending coffee', () => {
    const pending = movement({ id: HASH, status: 'pending', bookingDate: '2026-11-08' });
    const booked = movement({ id: 'acc:T9', status: 'booked', providerRefs: ['T9'] });
    const other = movement({
      id: 'acc:habcdef0123456789abcdef01',
      status: 'pending',
      bookingDate: '2026-11-08',
      creditorName: 'Other',
    });
    expect(withoutSupersededPending([pending, other, booked]).map((row) => row.id)).toEqual([other.id, booked.id]);
  });

  test('matches a shared entry reference and does not merge two booked coffees', () => {
    const pending = movement({ id: 'acc:E1', status: 'pending', providerRefs: ['E1'], remittanceInformation: 'auth' });
    const booked = movement({
      id: 'acc:T9',
      status: 'booked',
      providerRefs: ['T9', 'E1'],
      remittanceInformation: 'settled',
    });
    const coffeeA = movement({ id: 'acc:C1', status: 'booked', creditorName: 'Cafe', amount: { amount: -1.2, currency: 'EUR' } });
    const coffeeB = movement({ id: 'acc:C2', status: 'booked', creditorName: 'Cafe', amount: { amount: -1.2, currency: 'EUR' } });
    expect(withoutSupersededPending([pending, booked, coffeeA, coffeeB]).map((row) => row.id)).toEqual([
      booked.id,
      coffeeA.id,
      coffeeB.id,
    ]);
  });

  test('keeps a different bank id, a far date and a blank description', () => {
    const booked = movement({ id: 'acc:T9', status: 'booked', providerRefs: ['T9'] });
    const otherId = movement({ id: 'acc:E2', status: 'pending', providerRefs: ['E2'] });
    const far = movement({ id: HASH, status: 'pending', bookingDate: '2026-11-01' });
    const blank = movement({
      id: 'acc:hfedcba9876543210fedcba98',
      status: 'pending',
      creditorName: undefined,
    });
    expect(withoutSupersededPending([booked, otherId, far, blank]).map((row) => row.id)).toEqual([
      booked.id,
      otherId.id,
      far.id,
      blank.id,
    ]);
  });
});
