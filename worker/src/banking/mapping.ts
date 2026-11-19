import { sha256Hex } from './crypto';
import type { BankAccount, BankTransaction, ProviderAccount, ProviderBalance } from './types';

/** Subset of Enable Banking's `Transaction` schema that we read. */
export type EbAmount = { currency?: string; amount?: string | number };
export type EbParty = { name?: string | null };
export type EbTransaction = {
  entry_reference?: string | null;
  transaction_id?: string | null;
  merchant_category_code?: string | null;
  transaction_amount?: EbAmount;
  creditor?: EbParty | null;
  debtor?: EbParty | null;
  bank_transaction_code?: { description?: string | null; code?: string | null; sub_code?: string | null } | null;
  credit_debit_indicator?: 'CRDT' | 'DBIT' | string;
  status?: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  note?: string | null;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}/;

function day(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const match = DAY_RE.exec(value);
  return match ? match[0] : undefined;
}

function clean(value: string | null | undefined): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text : undefined;
}

/** Decimal string to a 2-dp number without float drift. */
export function parseAmount(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** `IT60X0542811101000000123456` -> `IT•• •••• 3456`. */
export function maskIban(iban: string | undefined): string | undefined {
  const compact = iban?.replace(/\s+/g, '').toUpperCase();
  if (!compact || compact.length < 8) return undefined;
  return `${compact.slice(0, 2)}•• •••• ${compact.slice(-4)}`;
}

export function providerSlug(institutionName: string): string {
  return /revolut/i.test(institutionName) ? 'revolut' : 'bank';
}

export function accountKind(cashAccountType: string | undefined): BankAccount['kind'] {
  switch (cashAccountType?.toUpperCase()) {
    case 'CARD':
      return 'card';
    case 'SVGS':
    case 'MOMA':
    case 'LLSV':
      return 'savings';
    default:
      return 'current';
  }
}

/** Stable app id for an account: same bank account keeps the same id after a new consent. */
export async function stableAccountId(institutionName: string, identityHash: string): Promise<string> {
  const digest = await sha256Hex(`${institutionName.toLowerCase()}|${identityHash}`);
  return `${providerSlug(institutionName)}-${digest.slice(0, 16)}`;
}

export function mapAccount(
  id: string,
  institutionName: string,
  account: ProviderAccount,
  balance: ProviderBalance | null,
  nowIso: string,
): BankAccount {
  const name = clean(account.name) ?? clean(account.product) ?? institutionName;
  return {
    id,
    provider: providerSlug(institutionName),
    name,
    institutionName,
    ...(maskIban(account.iban) ? { iban: maskIban(account.iban) } : {}),
    currency: 'EUR',
    balance: { amount: balance?.amount ?? 0, currency: balance?.currency ?? account.currency ?? 'EUR' },
    balanceUpdatedAt: balance?.referenceDate ?? nowIso,
    kind: accountKind(account.cashAccountType),
  };
}

function bankCode(tx: EbTransaction): string | undefined {
  const code = tx.bank_transaction_code;
  if (!code) return undefined;
  const joined = [clean(code.code), clean(code.sub_code)].filter(Boolean).join('-');
  return joined || clean(code.description);
}

/**
 * Content fingerprint used when the bank gives no stable transaction id.
 * Pending rows often lack ids and change when booked, so the booked copy wins on sync.
 */
export function transactionFingerprint(tx: Omit<BankTransaction, 'id'>): string {
  return [
    tx.accountId,
    tx.bookingDate,
    tx.valueDate ?? '',
    Math.round(tx.amount.amount * 100),
    tx.amount.currency,
    tx.creditorName ?? '',
    tx.debtorName ?? '',
    tx.remittanceInformation ?? '',
  ].join('|');
}

/**
 * Enable Banking transaction to the app model. Returns `null` for rows without
 * a usable date or amount. Ids: provider `transaction_id`, then
 * `entry_reference`, then a content hash with an occurrence index so two
 * identical coffees on the same day stay two rows.
 */
export async function mapEnableBankingTransactions(
  accountId: string,
  rows: readonly EbTransaction[],
): Promise<BankTransaction[]> {
  const seen = new Map<string, number>();
  const out: BankTransaction[] = [];
  for (const tx of rows) {
    const bookingDate = day(tx.booking_date) ?? day(tx.value_date) ?? day(tx.transaction_date);
    const raw = parseAmount(tx.transaction_amount?.amount);
    if (!bookingDate || raw === null) continue;
    const magnitude = Math.abs(raw);
    const signed = tx.credit_debit_indicator === 'DBIT' ? -magnitude : tx.credit_debit_indicator === 'CRDT' ? magnitude : raw;
    const remittance = (tx.remittance_information ?? []).map((line) => clean(line)).filter(Boolean).join(' ');
    const base: Omit<BankTransaction, 'id'> = {
      accountId,
      bookingDate,
      ...(day(tx.value_date) ? { valueDate: day(tx.value_date) } : {}),
      amount: { amount: signed === 0 ? 0 : signed, currency: tx.transaction_amount?.currency ?? 'EUR' },
      status: tx.status === 'PDNG' ? 'pending' : 'booked',
      ...(clean(tx.creditor?.name) ? { creditorName: clean(tx.creditor?.name) } : {}),
      ...(clean(tx.debtor?.name) ? { debtorName: clean(tx.debtor?.name) } : {}),
      ...(remittance || clean(tx.note) ? { remittanceInformation: remittance || clean(tx.note) } : {}),
      ...(clean(tx.merchant_category_code) ? { merchantCategoryCode: clean(tx.merchant_category_code) } : {}),
      ...(bankCode(tx) ? { bankTransactionCode: bankCode(tx) } : {}),
    };
    const txId = clean(tx.transaction_id);
    const entryRef = clean(tx.entry_reference);
    const providerRefs = [txId, entryRef].filter((value): value is string => !!value);
    const providerId = txId ?? entryRef;
    let id: string;
    if (providerId) {
      id = `${accountId}:${providerId}`;
    } else {
      const fp = transactionFingerprint(base);
      const n = seen.get(fp) ?? 0;
      seen.set(fp, n + 1);
      id = `${accountId}:h${(await sha256Hex(`${fp}|${n}`)).slice(0, 24)}`;
    }
    out.push({ id, ...base, ...(providerRefs.length ? { providerRefs } : {}) });
  }
  return out;
}

/** Keeps the first row per id; a booked row replaces a pending one with the same id. */
export function dedupeById(rows: readonly BankTransaction[]): BankTransaction[] {
  const byId = new Map<string, BankTransaction>();
  for (const row of rows) {
    const prev = byId.get(row.id);
    if (!prev || (prev.status === 'pending' && row.status === 'booked')) byId.set(row.id, row);
  }
  return [...byId.values()];
}

/** A pending card payment and its booked copy can sit this many days apart. */
export const PENDING_MATCH_DAYS = 5;

const HASH_ID_RE = /^h[0-9a-f]{24}$/;
const DAY_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function shiftIsoDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function dayIndex(day: string): number | null {
  if (!DAY_ONLY_RE.test(day)) return null;
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year!, (month ?? 1) - 1, date ?? 1) / 86_400_000;
}

function refsOf(tx: BankTransaction): string[] {
  const prefix = `${tx.accountId}:`;
  const suffix = tx.id.startsWith(prefix) ? tx.id.slice(prefix.length) : '';
  const fromId = suffix && !HASH_ID_RE.test(suffix) ? [suffix] : [];
  return [...new Set([...(tx.providerRefs ?? []), ...fromId])];
}

/** Empty when the bank sent no counterparty and no remittance. Those rows are not soft-matched. */
function descriptionKey(tx: BankTransaction): string {
  return [tx.creditorName, tx.debtorName, tx.remittanceInformation]
    .map((part) => part?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
    .join('|');
}

function sameMoney(a: BankTransaction, b: BankTransaction): boolean {
  return a.amount.currency === b.amount.currency && Math.round(a.amount.amount * 100) === Math.round(b.amount.amount * 100);
}

function softMatch(pending: BankTransaction, booked: BankTransaction): boolean {
  if (pending.accountId !== booked.accountId || !sameMoney(pending, booked)) return false;
  const left = dayIndex(pending.bookingDate);
  const right = dayIndex(booked.bookingDate);
  if (left === null || right === null || Math.abs(left - right) > PENDING_MATCH_DAYS) return false;
  const text = descriptionKey(pending);
  return text.length > 0 && text === descriptionKey(booked);
}

/**
 * Pending ids replaced by a later booked copy of the same payment.
 * A shared bank transaction id or entry reference matches even if the text changed.
 * A pending row with only a content-hash id matches one booked row on amount,
 * a 5-day window and the description. Two booked payments are never merged.
 */
export function supersededPendingIds(rows: readonly BankTransaction[]): string[] {
  const pendingById = new Map<string, BankTransaction>();
  const bookedById = new Map<string, BankTransaction>();
  for (const row of rows) {
    if (row.status === 'pending' && !pendingById.has(row.id)) pendingById.set(row.id, row);
    if (row.status === 'booked' && !bookedById.has(row.id)) bookedById.set(row.id, row);
  }
  const pending = [...pendingById.values()];
  const booked = [...bookedById.values()].sort((a, b) =>
    a.bookingDate === b.bookingDate ? (a.id < b.id ? -1 : 1) : a.bookingDate < b.bookingDate ? -1 : 1,
  );
  const used = new Set<string>();
  const drop: string[] = [];
  for (const book of booked) {
    const bookRefs = refsOf(book);
    let best: BankTransaction | undefined;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const row of pending) {
      if (used.has(row.id) || row.accountId !== book.accountId) continue;
      const rowRefs = refsOf(row);
      if (rowRefs.length > 0 && bookRefs.some((ref) => rowRefs.includes(ref))) {
        best = row;
        break;
      }
      if (rowRefs.length > 0 || !softMatch(row, book)) continue;
      const rank = Math.abs((dayIndex(row.bookingDate) ?? 0) - (dayIndex(book.bookingDate) ?? 0));
      if (rank < bestRank || (rank === bestRank && best !== undefined && row.id < best.id)) {
        best = row;
        bestRank = rank;
      }
    }
    if (best) {
      used.add(best.id);
      drop.push(best.id);
    }
  }
  return drop;
}

export function withoutSupersededPending(rows: readonly BankTransaction[]): BankTransaction[] {
  const drop = new Set(supersededPendingIds(rows));
  return drop.size === 0 ? rows.slice() : rows.filter((row) => !drop.has(row.id));
}
