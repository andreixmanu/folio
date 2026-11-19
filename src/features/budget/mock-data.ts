/**
 * Deterministic Italian household, relative to `now`.
 * Names, IBANs and the employer are fictional. Nothing here is a real person.
 * Structural amounts (rent, salary, subscriptions, the current-month shop)
 * stay fixed so budget states are stable; the seeded PRNG only jitters
 * groceries and Saturday dinners by about one euro.
 */

import { createRandom } from '@/lib/random';

import { addDays, addMonths, daysInMonth, startOfMonth, toISODate, weekday, yearMonth } from './dates';
import {
  DEFAULT_BUDGETS,
  moneyFromCents,
  type Account,
  type Budget,
  type Transaction,
} from './model';

export type MockBudgetData = {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
};

export const MOCK_ACCOUNT_IDS = {
  revolut: 'acc-revolut',
  aurora: 'acc-aurora',
} as const;

const REVOLUT = MOCK_ACCOUNT_IDS.revolut;
const AURORA = MOCK_ACCOUNT_IDS.aurora;

/** Opening balances in cents, before the generated window. */
const OPENING_CENTS = { revolut: 250_000, aurora: 400_000 };

const MESI = [
  'GENNAIO',
  'FEBBRAIO',
  'MARZO',
  'APRILE',
  'MAGGIO',
  'GIUGNO',
  'LUGLIO',
  'AGOSTO',
  'SETTEMBRE',
  'OTTOBRE',
  'NOVEMBRE',
  'DICEMBRE',
] as const;

const GROCERS = [
  'PAGAMENTO POS ESSELUNGA 123 MILANO',
  'CONAD CITY ROMA 45',
  'LIDL ITALIA SRL',
  'COOP LOMBARDIA MI',
  'EUROSPIN 8821',
  'CARREFOUR EXPRESS',
  'PAM PANORAMA',
  'BENNET DRIVE',
  'DESPAR',
  'IPER MILANO',
] as const;

/** Six trips per month, amounts far enough apart that a weekly rhythm still is not "the same bill". */
const GROCERY_CENTS: readonly (readonly number[])[] = [
  [2840, 7120, 1930, 8450, 3560, 5290],
  [9100, 2480, 6370, 1750, 7840, 4120],
  [2210, 5680, 3890, 9720, 2640, 6150],
  [4780, 1890, 7340, 3210, 8560, 2470],
];

const GROCERY_DAYS = [3, 8, 13, 18, 23, 28] as const;

const DINNERS: readonly { name: string; cents: number; mcc: string }[] = [
  { name: 'PIZZERIA DA GINO', cents: 3600, mcc: '5812' },
  { name: 'TRATTORIA DEL NORD', cents: 4400, mcc: '5812' },
  { name: 'GLOVO *SUSHI HOUSE', cents: 2240, mcc: '5812' },
  { name: 'DELIVEROO', cents: 1890, mcc: '5814' },
  { name: 'BURGER KING MILANO', cents: 1290, mcc: '5814' },
  { name: "MCDONALD'S ROMA", cents: 980, mcc: '5814' },
];

const LOCALI = ['LOCALE NORD', 'LOCALE SUD', 'LOCALE EST', 'LOCALE OVEST'] as const;

type MonthSlice = {
  index: number;
  ym: string;
  month: number;
  lastDay: number;
};

type Draft = {
  seq: number;
  accountId: string;
  bookingDate: string;
  amountCents: number;
  creditorName?: string;
  debtorName?: string;
  remittanceInformation?: string;
  merchantCategoryCode?: string;
  bankTransactionCode?: string;
};

function monthsEnding(today: string): MonthSlice[] {
  const start = addMonths(startOfMonth(today), -3);
  const slices: MonthSlice[] = [];
  let cursor = start;
  let index = 0;
  const end = yearMonth(today);
  while (yearMonth(cursor) <= end) {
    const year = Number(cursor.slice(0, 4));
    const month = Number(cursor.slice(5, 7));
    const length = daysInMonth(year, month - 1);
    const monthEnd = `${cursor.slice(0, 7)}-${String(length).padStart(2, '0')}`;
    const lastIso = monthEnd < today ? monthEnd : today;
    slices.push({
      index,
      ym: yearMonth(cursor),
      month,
      lastDay: Number(lastIso.slice(8, 10)),
    });
    cursor = addMonths(cursor, 1);
    index += 1;
  }
  return slices;
}

function dayIso(ym: string, day: number): string {
  return `${ym}-${String(day).padStart(2, '0')}`;
}

/**
 * About four months of booked movements up to `now`.
 * The last one or two days are pending. Nothing is booked in the future.
 */
export function createMockBudgetData(now: Date): MockBudgetData {
  const rng = createRandom(0xf0110);
  const today = toISODate(now);
  const yesterday = addDays(today, -1);
  const slices = monthsEnding(today);
  const currentIndex = slices.length - 1;
  const drafts: Draft[] = [];
  let seq = 0;
  let saturdayIndex = 0;
  const todayDay = Number(today.slice(8, 10));
  // Netflix, Spotify and Iliad track today's day-of-month so the next due
  // date stays inside 14 days. Wrapped into 1..28 (every month has those
  // days). add() skips a day past slice.lastDay, so a still-future day of
  // the current month is not booked.
  const billDay = (offset: number): number => {
    let day = todayDay + offset;
    while (day > 28) day -= 28;
    return day;
  };

  const jitter = (cents: number): number => cents + Math.round((rng() - 0.5) * 200);

  const add = (slice: MonthSlice, day: number, draft: Omit<Draft, 'seq' | 'bookingDate'>): void => {
    if (day < 1 || day > slice.lastDay) return;
    drafts.push({ ...draft, seq: seq++, bookingDate: dayIso(slice.ym, day) });
  };

  for (const slice of slices) {
    const mese = MESI[slice.month - 1] ?? 'MESE';
    const card = 'PMNT-CCRD-POSD';
    const sdd = 'PMNT-RDDT-ESDD';

    add(slice, billDay(3), {
      accountId: REVOLUT,
      amountCents: -1399,
      creditorName: 'NETFLIX.COM',
      merchantCategoryCode: '4899',
      bankTransactionCode: card,
    });
    add(slice, billDay(6), {
      accountId: REVOLUT,
      amountCents: -1099,
      creditorName: 'PAYPAL *SPOTIFY',
      merchantCategoryCode: '4899',
      bankTransactionCode: card,
    });
    add(slice, 1, {
      accountId: REVOLUT,
      amountCents: -299,
      creditorName: 'APPLE.COM/BILL',
      merchantCategoryCode: '5818',
      bankTransactionCode: card,
    });
    add(slice, 1, {
      accountId: REVOLUT,
      amountCents: -1399,
      creditorName: 'DISNEY PLUS',
      merchantCategoryCode: '4899',
      bankTransactionCode: card,
    });
    add(slice, 1, {
      accountId: REVOLUT,
      amountCents: -299,
      creditorName: 'GOOGLE *GOOGLE ONE',
      merchantCategoryCode: '5818',
      bankTransactionCode: card,
    });
    add(slice, billDay(10), {
      accountId: AURORA,
      amountCents: -999,
      creditorName: 'ILIAD ITALIA',
      remittanceInformation: 'Canone mobile Iliad',
      merchantCategoryCode: '4814',
      bankTransactionCode: sdd,
    });
    add(slice, 2, {
      accountId: AURORA,
      amountCents: -75_000,
      creditorName: 'Rossi Casa S.r.l.',
      remittanceInformation: `AFFITTO ${mese}`,
      bankTransactionCode: 'PMNT-ICDT-ESCT',
    });
    // MCC only: no keyword in the name, so the MCC path has to fire.
    add(slice, 2, {
      accountId: REVOLUT,
      amountCents: -1650,
      creditorName: LOCALI[slice.index] ?? 'LOCALE NORD',
      remittanceInformation: 'SCONTRINO 4412',
      merchantCategoryCode: '5812',
      bankTransactionCode: card,
    });

    GROCERY_DAYS.forEach((day, trip) => {
      const base = GROCERY_CENTS[slice.index]?.[trip] ?? 3_000;
      const name = GROCERS[(slice.index * 3 + trip) % GROCERS.length] ?? GROCERS[0];
      add(slice, day, {
        accountId: REVOLUT,
        amountCents: -jitter(base),
        creditorName: name,
        merchantCategoryCode: '5411',
        bankTransactionCode: card,
      });
    });

    add(slice, 3, {
      accountId: REVOLUT,
      amountCents: -2200,
      creditorName: 'SATISPAY *GIULIA R.',
      remittanceInformation: 'Satispay Giulia R.',
      bankTransactionCode: card,
    });

    const taxiCents = [900, 2400, 1500, 3200][slice.index] ?? 1500;
    add(slice, 4, {
      accountId: REVOLUT,
      amountCents: -taxiCents,
      creditorName: `TAXI MILANO ${4000 + slice.index}`,
      merchantCategoryCode: '4121',
      bankTransactionCode: card,
    });

    const amazonCents = slice.index === currentIndex ? 14_999 : ([4230, 8750, 2390][slice.index] ?? 4230);
    add(slice, 4, {
      accountId: REVOLUT,
      amountCents: -amazonCents,
      creditorName: 'AMZN MKTP IT*1A2B3C',
      merchantCategoryCode: '5999',
      bankTransactionCode: card,
    });
    if (slice.index === currentIndex) {
      add(slice, 4, {
        accountId: REVOLUT,
        amountCents: -6990,
        creditorName: 'ZALANDO PAYMENTS',
        merchantCategoryCode: '5691',
        bankTransactionCode: card,
      });
    }

    if (slice.index % 2 === 0) {
      add(slice, 3, {
        accountId: REVOLUT,
        amountCents: -180,
        creditorName: 'BAR CENTRALE MILANO',
        merchantCategoryCode: '5812',
        bankTransactionCode: card,
      });
    } else {
      add(slice, 4, {
        accountId: REVOLUT,
        amountCents: -220,
        creditorName: 'CAFFE DEL CORSO',
        merchantCategoryCode: '5813',
        bankTransactionCode: card,
      });
    }

    add(slice, 5, {
      accountId: REVOLUT,
      amountCents: -3900,
      creditorName: 'MCFIT MILANO',
      merchantCategoryCode: '7997',
      bankTransactionCode: card,
    });
    add(slice, 6, {
      accountId: REVOLUT,
      amountCents: -1430,
      creditorName: 'FARMACIA COMUNALE 12',
      merchantCategoryCode: '5912',
      bankTransactionCode: card,
    });

    add(slice, 7, {
      accountId: AURORA,
      amountCents: -60_000,
      creditorName: 'Revolut',
      remittanceInformation: 'Bonifico a Revolut',
      bankTransactionCode: 'PMNT-ICDT-ESCT',
    });
    add(slice, 7, {
      accountId: REVOLUT,
      amountCents: 60_000,
      debtorName: 'Banca Aurora',
      remittanceInformation: 'Ricarica Revolut',
      bankTransactionCode: 'PMNT-RCDT-ESCT',
    });

    // Revolut savings: principal to the deposit pot is a giroconto, the interest is income.
    add(slice, 8, {
      accountId: REVOLUT,
      amountCents: -20_000,
      remittanceInformation: 'To Conto deposito senza vincoli',
      bankTransactionCode: 'TRANSFER',
    });
    add(slice, 1, {
      accountId: REVOLUT,
      amountCents: 112,
      remittanceInformation: 'Interessi Conto deposito',
      bankTransactionCode: 'TRANSFER',
    });

    add(slice, 9, {
      accountId: AURORA,
      amountCents: -3500,
      creditorName: 'Marco B.',
      remittanceInformation: 'Bonifico a Marco B.',
      bankTransactionCode: 'PMNT-ICDT-ESCT',
    });
    add(slice, 10, {
      accountId: REVOLUT,
      amountCents: -2790,
      creditorName: 'TRENITALIA',
      remittanceInformation: 'TRENITALIA *MILANO ROMA',
      merchantCategoryCode: '4111',
      bankTransactionCode: card,
    });
    add(slice, 11, {
      accountId: REVOLUT,
      amountCents: -4000,
      creditorName: 'ATM MILANO PORTA GARIBALDI',
      bankTransactionCode: card,
    });
    add(slice, 11, {
      accountId: AURORA,
      amountCents: 4000,
      debtorName: 'Giulia R.',
      remittanceInformation: 'Per la cena',
    });
    add(slice, 12, {
      accountId: REVOLUT,
      amountCents: -1890,
      creditorName: 'DELIVEROO',
      merchantCategoryCode: '5814',
      bankTransactionCode: card,
    });

    if (slice.index % 2 === 0) {
      const enel = slice.index === 0 ? 9240 : 10_150;
      add(slice, 14, {
        accountId: AURORA,
        amountCents: -enel,
        creditorName: 'ENEL ENERGIA S.P.A.',
        remittanceInformation: 'BOLLETTA LUCE',
        merchantCategoryCode: '4900',
        bankTransactionCode: sdd,
      });
      const fuel = slice.index === 0 ? 4620 : 6120;
      add(slice, 16, {
        accountId: REVOLUT,
        amountCents: -fuel,
        creditorName: 'ENI STAZIONE CARBURANTE',
        merchantCategoryCode: '5541',
        bankTransactionCode: card,
      });
    } else {
      add(slice, 18, {
        accountId: AURORA,
        amountCents: -4870,
        creditorName: 'A2A ENERGIA',
        remittanceInformation: 'BOLLETTA GAS',
        merchantCategoryCode: '4900',
        bankTransactionCode: sdd,
      });
    }

    add(slice, 15, {
      accountId: REVOLUT,
      amountCents: -1250,
      creditorName: 'TABACCHI DA VINCI',
      bankTransactionCode: card,
    });

    const ambulatorio = [890, 2400, 1200, 3100][slice.index] ?? 890;
    add(slice, 21, {
      accountId: REVOLUT,
      amountCents: -ambulatorio,
      creditorName: 'AMBULATORIO 4',
      remittanceInformation: 'TICKET 19',
      merchantCategoryCode: '8011',
      bankTransactionCode: card,
    });

    if (slice.index === 0) {
      add(slice, 12, {
        accountId: REVOLUT,
        amountCents: -5400,
        creditorName: 'COMPAGNIA ALFA',
        remittanceInformation: 'BIGLIETTO',
        merchantCategoryCode: '3001',
        bankTransactionCode: card,
      });
      add(slice, 17, {
        accountId: REVOLUT,
        amountCents: -2490,
        creditorName: 'NEGOZIO ALFA',
        remittanceInformation: 'ACQUISTO',
        merchantCategoryCode: '5732',
        bankTransactionCode: card,
      });
    }
    if (slice.index === 1) {
      add(slice, 8, {
        accountId: REVOLUT,
        amountCents: -8499,
        creditorName: 'RYANAIR',
        merchantCategoryCode: '4511',
        bankTransactionCode: card,
      });
      add(slice, 8, {
        accountId: REVOLUT,
        amountCents: -18_600,
        creditorName: 'BOOKING.COM',
        remittanceInformation: 'HOTEL ARISTON',
        merchantCategoryCode: '7011',
        bankTransactionCode: card,
      });
      add(slice, 9, {
        accountId: REVOLUT,
        amountCents: -1890,
        creditorName: 'ITALO TRENO',
        merchantCategoryCode: '4111',
        bankTransactionCode: card,
      });
      add(slice, 17, {
        accountId: REVOLUT,
        amountCents: -1830,
        creditorName: 'NEGOZIO BETA',
        remittanceInformation: 'ACQUISTO',
        merchantCategoryCode: '5732',
        bankTransactionCode: card,
      });
      add(slice, 19, {
        accountId: REVOLUT,
        amountCents: -1600,
        creditorName: 'UCI CINEMAS',
        merchantCategoryCode: '7832',
        bankTransactionCode: card,
      });
    }
    if (slice.index === 2) {
      add(slice, 17, {
        accountId: REVOLUT,
        amountCents: -4200,
        creditorName: 'NEGOZIO GAMMA',
        remittanceInformation: 'ACQUISTO',
        merchantCategoryCode: '5732',
        bankTransactionCode: card,
      });
      add(slice, 20, {
        accountId: REVOLUT,
        amountCents: -4500,
        creditorName: 'STUDIO DENTISTICO BIANCHI',
        merchantCategoryCode: '8021',
        bankTransactionCode: card,
      });
      add(slice, 22, {
        accountId: REVOLUT,
        amountCents: -999,
        creditorName: 'STEAM GAMES',
        merchantCategoryCode: '5816',
        bankTransactionCode: card,
      });
      add(slice, 25, {
        accountId: REVOLUT,
        amountCents: -1800,
        creditorName: 'SALA 9',
        remittanceInformation: 'INGRESSO',
        merchantCategoryCode: '7997',
        bankTransactionCode: card,
      });
    }

    add(slice, 27, {
      accountId: AURORA,
      amountCents: 235_000,
      debtorName: 'Officine Helios S.p.A.',
      remittanceInformation: `EMOLUMENTI MESE ${mese}`,
      bankTransactionCode: 'PMNT-RCDT-SALA',
    });

    for (let day = 1; day <= slice.lastDay; day += 1) {
      if (weekday(dayIso(slice.ym, day)) !== 6) continue;
      const dinner = DINNERS[saturdayIndex % DINNERS.length];
      saturdayIndex += 1;
      if (!dinner) continue;
      add(slice, day, {
        accountId: REVOLUT,
        amountCents: -jitter(dinner.cents),
        creditorName: dinner.name,
        merchantCategoryCode: dinner.mcc,
        bankTransactionCode: card,
      });
    }
  }

  const pushDated = (date: string, draft: Omit<Draft, 'seq' | 'bookingDate'>): void => {
    if (date > today) return;
    drafts.push({ ...draft, seq: seq++, bookingDate: date });
  };
  pushDated(today, {
    accountId: REVOLUT,
    amountCents: -170,
    creditorName: "CAFFE' DEL CORSO",
    merchantCategoryCode: '5813',
    bankTransactionCode: 'PMNT-CCRD-POSD',
  });
  pushDated(yesterday, {
    accountId: REVOLUT,
    amountCents: -1860,
    creditorName: 'PAGAMENTO POS LIDL 44 MILANO',
    merchantCategoryCode: '5411',
    bankTransactionCode: 'PMNT-CCRD-POSD',
  });

  const pendingFrom = yesterday;
  const chronological = [...drafts].sort(
    (a, b) => a.bookingDate.localeCompare(b.bookingDate) || a.seq - b.seq,
  );

  const transactions: Transaction[] = chronological.map((draft, index) => ({
    id: `tx-${String(index + 1).padStart(4, '0')}`,
    accountId: draft.accountId,
    bookingDate: draft.bookingDate,
    valueDate: draft.bookingDate,
    amount: moneyFromCents(draft.amountCents),
    status: draft.bookingDate >= pendingFrom ? 'pending' : 'booked',
    ...(draft.creditorName ? { creditorName: draft.creditorName } : {}),
    ...(draft.debtorName ? { debtorName: draft.debtorName } : {}),
    ...(draft.remittanceInformation ? { remittanceInformation: draft.remittanceInformation } : {}),
    ...(draft.merchantCategoryCode ? { merchantCategoryCode: draft.merchantCategoryCode } : {}),
    ...(draft.bankTransactionCode ? { bankTransactionCode: draft.bankTransactionCode } : {}),
  }));
  transactions.sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || b.id.localeCompare(a.id));

  const balanceOf = (accountId: string, opening: number): number => {
    let cents = opening;
    for (const draft of chronological) {
      if (draft.accountId === accountId) cents += draft.amountCents;
    }
    return cents;
  };
  const updatedAt = now.toISOString();

  const accounts: Account[] = [
    {
      id: REVOLUT,
      provider: 'revolut',
      name: 'Revolut',
      institutionName: 'Revolut',
      iban: 'IT•• •••• 7390',
      currency: 'EUR',
      balance: moneyFromCents(balanceOf(REVOLUT, OPENING_CENTS.revolut)),
      balanceUpdatedAt: updatedAt,
      kind: 'card',
    },
    {
      id: AURORA,
      provider: 'bank',
      name: 'Conto corrente',
      institutionName: 'Banca Aurora',
      iban: 'IT•• •••• 4821',
      currency: 'EUR',
      balance: moneyFromCents(balanceOf(AURORA, OPENING_CENTS.aurora)),
      balanceUpdatedAt: updatedAt,
      kind: 'current',
    },
  ];

  const budgets: Budget[] = DEFAULT_BUDGETS.map((budget) => ({ ...budget }));
  return { accounts, transactions, budgets };
}
