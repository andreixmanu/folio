import { displayMerchant, merchantKeyFor, normalizeMerchant } from '@/features/budget/merchant';
import { money, type Transaction } from '@/features/budget/model';

const CASES: readonly [string, string][] = [
  ['PAGAMENTO POS ESSELUNGA 123 MILANO', 'esselunga'],
  ['Esselunga S.p.A.', 'esselunga'],
  ['ESSELUNGA SPA', 'esselunga'],
  ['esselunga 123', 'esselunga'],
  ['CONAD CITY ROMA 45', 'conad'],
  ['LIDL ITALIA SRL', 'lidl'],
  ['COOP LOMBARDIA MI', 'coop lombardia'],
  ['EUROSPIN 8821', 'eurospin'],
  ['CARREFOUR EXPRESS', 'carrefour'],
  ['PAM PANORAMA', 'pam panorama'],
  ['BENNET DRIVE', 'bennet'],
  ['IPER MILANO', 'iper'],
  ['amazon.it', 'amazon'],
  ['AMZN MKTP IT', 'amazon'],
  ['AMZN MKTP IT*1A2B3C', 'amazon'],
  ['PAYPAL *NETFLIX', 'netflix'],
  ['PAYPAL *SPOTIFY', 'spotify'],
  ['NETFLIX.COM', 'netflix'],
  ['AMAZON PRIME', 'amazon prime'],
  ['AMZN PRIME IT', 'amazon prime'],
  ['PRIME VIDEO', 'amazon prime'],
  ['APPLE.COM/BILL', 'icloud'],
  ['iCloud', 'icloud'],
  ['GOOGLE *GOOGLE ONE', 'google one'],
  ['GOOGLE *YOUTUBE PREMIUM', 'youtube premium'],
  ['DISNEY+', 'disney+'],
  ['DISNEY PLUS', 'disney+'],
  ['NOW TV', 'now tv'],
  ['NOWTV', 'now tv'],
  ['OPENAI *CHATGPT', 'chatgpt'],
  ['H&M MILANO', 'h&m'],
  ['H & M Roma', 'h&m'],
  ["McDonald's Roma", 'mcdonalds'],
  ['ENEL ENERGIA S.P.A.', 'enel'],
  ['ENEL ENERGIA S.R.L.', 'enel'],
  ['ILIAD ITALIA', 'iliad'],
  ['WIND TRE', 'windtre'],
  ['WINDTRE', 'windtre'],
  ['JUST EAT', 'just eat'],
  ['JUSTEAT', 'just eat'],
  ['FREE NOW', 'freenow'],
  ['FREENOW', 'freenow'],
  ['MY CICERO', 'mycicero'],
  ['EASY JET', 'easyjet'],
  ['easyJet', 'easyjet'],
  ['VIRGIN ACTIVE MILANO', 'virgin active'],
  ['MC FIT', 'mcfit'],
  ['ATM MILANO', 'atm'],
  ['Q8', 'q8'],
  ['IP', 'ip'],
  ['Caffè Napoli', 'caffe'],
  ['BAR CENTRALE', 'bar centrale'],
  ['IL BARBIERE', 'il barbiere'],
  ['BARILLA', 'barilla'],
  ['COOPERATIVA EDILIZIA', 'cooperativa edilizia'],
  ['ZALANDO PAYMENTS', 'zalando'],
  ['BOOKING.COM', 'booking'],
  ['ITA AIRWAYS', 'ita airways'],
  ['SATISPAY *GIULIA R.', 'satispay giulia r'],
  ['Rossi Casa S.r.l.', 'rossi casa'],
  ['Officine Helios S.p.A.', 'officine helios'],
  ['Banca Aurora', 'banca aurora'],
  ['Revolut', 'revolut'],
];

describe('normalizeMerchant', () => {
  test.each(CASES)('%s → %s', (raw, key) => {
    expect(normalizeMerchant(raw)).toBe(key);
    expect(normalizeMerchant(key)).toBe(key);
  });

  test('empty input', () => {
    expect(normalizeMerchant('')).toBe('');
    expect(normalizeMerchant(null)).toBe('');
    expect(normalizeMerchant(undefined)).toBe('');
    expect(normalizeMerchant('   ***  ')).toBe('');
  });

  test('strips a card reference but keeps short fuel brands', () => {
    expect(normalizeMerchant('ENI *4821')).toBe('eni');
    expect(normalizeMerchant('Q8 MILANO')).toBe('q8');
    expect(normalizeMerchant('A2A ENERGIA')).toBe('a2a');
  });
});

describe('displayMerchant', () => {
  test('title-cases and keeps brand spelling', () => {
    expect(displayMerchant('PAGAMENTO POS ESSELUNGA 123 MILANO')).toBe('Esselunga');
    expect(displayMerchant('PAYPAL *NETFLIX')).toBe('Netflix');
    expect(displayMerchant('AMZN MKTP IT')).toBe('Amazon');
    expect(displayMerchant('AMAZON PRIME')).toBe('Amazon Prime');
    expect(displayMerchant('APPLE.COM/BILL')).toBe('iCloud');
    expect(displayMerchant('H&M MILANO')).toBe('H&M');
    expect(displayMerchant('ATM MILANO')).toBe('ATM');
    expect(displayMerchant("McDonald's")).toBe("McDonald's");
    expect(displayMerchant('DISNEY+')).toBe('Disney+');
    expect(displayMerchant('NOW TV')).toBe('NOW TV');
    expect(displayMerchant('GOOGLE *YOUTUBE PREMIUM')).toBe('YouTube Premium');
    expect(displayMerchant('easyJet')).toBe('easyJet');
    expect(displayMerchant('BAR CENTRALE')).toBe('Bar Centrale');
    expect(displayMerchant('Caffè del Corso')).toBe('Caffe del Corso');
    expect(displayMerchant('')).toBe('');
  });
});

describe('merchantKeyFor', () => {
  function tx(partial: Partial<Transaction>): Transaction {
    return {
      id: 'tx-1',
      accountId: 'acc',
      bookingDate: '2026-11-01',
      amount: money(-10),
      status: 'booked',
      ...partial,
    };
  }

  test('uses the creditor on an outflow and the debtor on an inflow', () => {
    expect(merchantKeyFor(tx({ creditorName: 'NETFLIX.COM', debtorName: 'Ignored' }))).toBe('netflix');
    expect(
      merchantKeyFor(tx({ amount: money(2350), debtorName: 'Officine Helios S.p.A.', creditorName: 'Ignored' })),
    ).toBe('officine helios');
  });

  test('falls back to the remittance when the counterparty is missing', () => {
    expect(merchantKeyFor(tx({ remittanceInformation: 'PAYPAL *SPOTIFY' }))).toBe('spotify');
  });

  test('keeps an explicit merchant key', () => {
    expect(merchantKeyFor(tx({ merchantKey: 'esselunga', creditorName: 'OTHER' }))).toBe('esselunga');
  });
});
