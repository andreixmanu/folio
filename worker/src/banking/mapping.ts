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
    const providerId = clean(tx.transaction_id) ?? clean(tx.entry_reference);
    let id: string;
    if (providerId) {
      id = `${accountId}:${providerId}`;
    } else {
      const fp = transactionFingerprint(base);
      const n = seen.get(fp) ?? 0;
      seen.set(fp, n + 1);
      id = `${accountId}:h${(await sha256Hex(`${fp}|${n}`)).slice(0, 24)}`;
    }
    out.push({ id, ...base });
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
