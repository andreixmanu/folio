import { applyCategories } from '@/features/budget/categorize';
import type { Transaction } from '@/features/budget/model';
import {
  crossSourceKey,
  mergeTransactions,
  parseCsv,
  parseRevolutCsv,
  parseRevolutNumber,
  RevolutCsvError,
} from '@/features/budget/revolut-csv';

const HEADER = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';

const CSV = [
  HEADER,
  'CARD_PAYMENT,Current,2025-03-01 12:01:02,2025-03-02 08:00:00,Esselunga,-42.30,0.00,EUR,COMPLETED,957.70',
  'TOPUP,Current,2025-02-28 09:00:00,2025-02-28 09:00:01,Top-Up by *1234,1000.00,0.00,EUR,COMPLETED,1000.00',
  'CARD_PAYMENT,Current,2025-03-03 19:00:00,2025-03-03 19:00:00,"Bar ""Da Mario"", Milano",-1.20,0.00,EUR,COMPLETED,956.50',
  'CARD_PAYMENT,Current,2025-03-03 19:00:00,2025-03-03 19:00:00,"Bar ""Da Mario"", Milano",-1.20,0.00,EUR,COMPLETED,956.50',
  'ATM,Current,2025-03-04 10:00:00,2025-03-04 10:00:00,Cash at Intesa,-100.00,2.00,EUR,COMPLETED,854.50',
  'CARD_PAYMENT,Current,2025-03-05 10:00:00,,Netflix,-12.99,0.00,EUR,PENDING,',
  'CARD_PAYMENT,Current,2025-03-05 10:00:00,2025-03-05 10:00:00,Declined shop,-50.00,0.00,EUR,DECLINED,854.50',
  'CARD_PAYMENT,Current,2025-03-06 10:00:00,2025-03-06 10:00:00,Amazon UK,-20.00,0.00,GBP,COMPLETED,30.00',
  'TRANSFER,Savings,2025-03-07 10:00:00,2025-03-07 10:00:00,To pocket EUR Vacanze,200.00,0.00,EUR,COMPLETED,200.00',
  'CARD_PAYMENT,Current,not-a-date,,Broken,-1,0,EUR,COMPLETED,1',
].join('\r\n');

describe('parseCsv', () => {
  test('handles quotes, escaped quotes, CRLF, BOM and semicolons', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, ""y""",z\n')).toEqual([
      ['a', 'b'],
      ['x, "y"', 'z'],
    ]);
    expect(parseCsv('a;b\n1,5;2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
    expect(parseCsv('a\n"multi\nline"')).toEqual([['a'], ['multi\nline']]);
  });

  test('parses numbers in both decimal styles', () => {
    expect(parseRevolutNumber('-1,234.56')).toBe(-1234.56);
    expect(parseRevolutNumber('-1.234,56')).toBe(-1234.56);
    expect(parseRevolutNumber('12,5')).toBe(12.5);
    expect(parseRevolutNumber('')).toBeNull();
    expect(parseRevolutNumber('abc')).toBeNull();
  });
});

describe('parseRevolutCsv', () => {
  const now = new Date('2026-11-17T09:00:00Z');
  const result = parseRevolutCsv(CSV, { now });

  test('maps rows to the budget model', () => {
    const [esselunga] = result.transactions;
    expect(esselunga).toEqual({
      id: expect.stringMatching(/^rvcsv-[0-9a-f]{14}$/),
      accountId: 'revolut-csv-current-eur',
      bookingDate: '2025-03-02',
      valueDate: '2025-03-01',
      amount: { amount: -42.3, currency: 'EUR' },
      status: 'booked',
      creditorName: 'Esselunga',
      bankTransactionCode: 'CARD_PAYMENT',
    });
    const topup = result.transactions.find((t) => t.bankTransactionCode === 'TOPUP');
    expect(topup).toMatchObject({ debtorName: 'Top-Up by *1234', amount: { amount: 1000 }, remittanceInformation: 'Top up Revolut' });
  });

  test('nets the fee, keeps pending, skips declined, foreign currency and broken rows', () => {
    const atm = result.transactions.find((t) => t.bankTransactionCode === 'ATM');
    expect(atm?.amount.amount).toBe(-102);
    const netflix = result.transactions.find((t) => t.creditorName === 'Netflix');
    expect(netflix).toMatchObject({ status: 'pending', bookingDate: '2025-03-05' });
    expect(netflix).not.toHaveProperty('valueDate');
    expect(result.skipped).toEqual([
      { line: 8, reason: 'not-completed' },
      { line: 9, reason: 'currency' },
      { line: 11, reason: 'invalid-row' },
    ]);
    expect(result.transactions).toHaveLength(7);
  });

  test('two identical rows stay two, with stable distinct ids across re-imports', () => {
    const bars = result.transactions.filter((t) => t.creditorName === 'Bar "Da Mario", Milano');
    expect(bars).toHaveLength(2);
    expect(bars[0]!.id).not.toBe(bars[1]!.id);
    const again = parseRevolutCsv(CSV, { now });
    expect(again.transactions.map((t) => t.id)).toEqual(result.transactions.map((t) => t.id));
  });

  test('builds one account per product with the latest booked balance', () => {
    expect(result.accounts).toEqual([
      {
        id: 'revolut-csv-current-eur',
        provider: 'revolut',
        name: 'Revolut (storico)',
        institutionName: 'Revolut',
        currency: 'EUR',
        balance: { amount: 854.5, currency: 'EUR' },
        balanceUpdatedAt: '2025-03-04T10:00:00',
        kind: 'current',
      },
      expect.objectContaining({ id: 'revolut-csv-savings-eur', kind: 'savings', name: 'Revolut Risparmi (storico)' }),
    ]);
  });

  test('top-ups and pocket moves are categorised as own transfers', () => {
    const categorized = applyCategories(result.transactions, [], {});
    const pocket = categorized.find((t) => t.debtorName === 'To pocket EUR Vacanze');
    const topup = categorized.find((t) => t.bankTransactionCode === 'TOPUP');
    expect(pocket?.categoryId).toBe('transfers');
    expect(topup?.categoryId).toBe('transfers');
  });

  test('accepts Italian headers in any order', () => {
    const it = [
      'Descrizione,Tipo,Prodotto,Data di inizio,Data di completamento,Importo,Commissione,Valuta,Stato,Saldo',
      'Coop,PAGAMENTO_CARTA,Corrente,2025-01-10 10:00:00,2025-01-10 10:00:00,"-15,40",0,EUR,COMPLETATO,"100,00"',
    ].join('\n');
    const parsed = parseRevolutCsv(it, { now });
    expect(parsed.transactions[0]).toMatchObject({ creditorName: 'Coop', amount: { amount: -15.4 }, status: 'booked' });
    expect(parsed.accounts[0]).toMatchObject({ id: 'revolut-csv-corrente-eur', balance: { amount: 100 } });
  });

  test('rejects files without the required columns', () => {
    expect(() => parseRevolutCsv('foo,bar\n1,2')).toThrow(RevolutCsvError);
    expect(() => parseRevolutCsv('')).toThrow('File vuoto');
  });
});

describe('mergeTransactions', () => {
  const tx = (over: Partial<Transaction>): Transaction => ({
    id: 'a',
    accountId: 'acc',
    bookingDate: '2025-03-01',
    amount: { amount: -10, currency: 'EUR' },
    status: 'booked',
    creditorName: 'Shop',
    ...over,
  });

  test('dedupes by id; booked replaces pending', () => {
    const merged = mergeTransactions([tx({ status: 'pending' })], [tx({}), tx({ id: 'b', bookingDate: '2025-03-02' })]);
    expect(merged.added).toBe(1);
    expect(merged.duplicates).toBe(1);
    expect(merged.transactions.map((t) => [t.id, t.status])).toEqual([
      ['b', 'booked'],
      ['a', 'booked'],
    ]);
  });

  test('re-importing an overlapping CSV adds only new rows', () => {
    const first = parseRevolutCsv(CSV).transactions;
    const extra = `${CSV}\r\nCARD_PAYMENT,Current,2025-03-09 10:00:00,2025-03-09 10:00:00,Coop,-5.00,0.00,EUR,COMPLETED,849.50`;
    const merged = mergeTransactions(first, parseRevolutCsv(extra).transactions);
    expect(merged.added).toBe(1);
    expect(merged.transactions).toHaveLength(first.length + 1);
  });

  test('cross-source dedup matches day, amount and counterparty across accounts, one for one', () => {
    const csvRows = [tx({ id: 'csv-1', accountId: 'revolut-csv-current-eur', creditorName: 'BAR DA MARIO' })];
    const bank = [
      tx({ id: 'ob-1', accountId: 'revolut-abc', creditorName: 'Bar da Mario' }),
      tx({ id: 'ob-2', accountId: 'revolut-abc', creditorName: 'Bar da Mario' }),
    ];
    expect(crossSourceKey(csvRows[0]!)).toBe(crossSourceKey(bank[0]!));
    const merged = mergeTransactions(csvRows, bank, { crossSource: true });
    expect(merged.added).toBe(1);
    expect(merged.duplicates).toBe(1);
  });
});
