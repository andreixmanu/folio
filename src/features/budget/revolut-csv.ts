/**
 * Revolut statement import (CSV exported from the Revolut app: Statement ->
 * Excel/CSV). Open banking gives Revolut history only in the first minutes
 * after consent and then 90 days, so the CSV is the reliable way to bring in
 * the full past before closing the account.
 *
 * Columns (English export): Type, Product, Started Date, Completed Date,
 * Description, Amount, Fee, Currency, State, Balance. Column order does not
 * matter; Italian header names are accepted too.
 */

import type { Account, Transaction } from './model';
import { fromCents, toCents } from './model';

export type RevolutCsvColumn =
  | 'type'
  | 'product'
  | 'startedDate'
  | 'completedDate'
  | 'description'
  | 'amount'
  | 'fee'
  | 'currency'
  | 'state'
  | 'balance';

const HEADER_ALIASES: Record<RevolutCsvColumn, readonly string[]> = {
  type: ['type', 'tipo'],
  product: ['product', 'prodotto'],
  startedDate: ['started date', 'data di inizio', 'data inizio'],
  completedDate: ['completed date', 'data di completamento', 'data completamento'],
  description: ['description', 'descrizione'],
  amount: ['amount', 'importo'],
  fee: ['fee', 'commissione', 'commissioni', 'costo', 'tariffa'],
  currency: ['currency', 'valuta'],
  state: ['state', 'stato'],
  balance: ['balance', 'saldo'],
};

const REQUIRED: readonly RevolutCsvColumn[] = ['type', 'startedDate', 'description', 'amount', 'currency', 'state'];

export type RevolutSkipReason = 'not-completed' | 'currency' | 'invalid-row';

export type RevolutImportResult = {
  accounts: Account[];
  transactions: Transaction[];
  skipped: { line: number; reason: RevolutSkipReason }[];
};

export type RevolutImportOptions = {
  /** Only these currencies are imported. Default `['EUR']` (the budget is in euros). */
  currencies?: readonly string[];
  /** Used as `balanceUpdatedAt` fallback. */
  now?: Date;
};

export class RevolutCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevolutCsvError';
  }
}

/** RFC 4180 CSV: quotes, escaped quotes, CRLF, BOM, newlines inside quotes. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = delimiter ?? (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function mapRevolutHeader(header: readonly string[]): Partial<Record<RevolutCsvColumn, number>> {
  const out: Partial<Record<RevolutCsvColumn, number>> = {};
  header.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    for (const [column, aliases] of Object.entries(HEADER_ALIASES) as [RevolutCsvColumn, readonly string[]][]) {
      if (out[column] === undefined && aliases.includes(name)) out[column] = index;
    }
  });
  return out;
}

/** `-12.50`, `1,234.56`, `-12,50`, `1.234,56` -> number (2 dp), or `null`. */
export function parseRevolutNumber(raw: string | undefined): number | null {
  let text = raw?.trim().replace(/\s|€/g, '') ?? '';
  if (!text) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
  else text = text.replace(/,/g, '');
  const n = Number(text);
  return Number.isFinite(n) ? fromCents(toCents(n)) : null;
}

/** `2024-01-15 10:23:45` (or ISO, or `15/01/2024 10:23`) -> `2024-01-15`. */
export function revolutDay(raw: string | undefined): string | null {
  const text = raw?.trim() ?? '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const eu = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(text);
  if (eu) return `${eu[3]}-${eu[2]!.padStart(2, '0')}-${eu[1]!.padStart(2, '0')}`;
  return null;
}

const COMPLETED = new Set(['COMPLETED', 'COMPLETATO', 'COMPLETATA', 'COMPLETATE']);
const PENDING = new Set(['PENDING', 'IN SOSPESO', 'IN ATTESA', 'IN CORSO']);

/** Short text the categoriser reads (own transfers, savings moves, FX). */
function remittanceFor(type: string, description: string): string | undefined {
  const t = type.toUpperCase();
  if (t === 'TOPUP' || t === 'RICARICA') return 'Top up Revolut';
  if (t === 'EXCHANGE' || t === 'CAMBIO') return 'Giroconto Revolut cambio valuta';
  if (/^(to|from|verso|da)\s+(pocket|savings|risparmi|salvadanaio|vault)/i.test(description)) return 'Giroconto Revolut risparmi';
  return undefined;
}

/** cyrb53: fast, stable 53-bit string hash as hex (no crypto or BigInt needed). */
export function hashString(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

function accountIdFor(product: string, currency: string): string {
  const slug = (product || 'current').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'current';
  return `revolut-csv-${slug}-${currency.toLowerCase()}`;
}

function accountName(product: string): string {
  const p = product.trim().toLowerCase();
  if (!p || p === 'current' || p === 'corrente') return 'Revolut (storico)';
  if (p === 'savings' || p === 'risparmi') return 'Revolut Risparmi (storico)';
  return `Revolut ${product.trim()} (storico)`;
}

/**
 * Parses a Revolut statement. Completed rows become `booked`, pending rows
 * `pending`; reverted, declined and failed rows are skipped. Amounts are net
 * of the fee. Ids are a hash of the row content plus an occurrence index, so
 * importing the same (or an overlapping) file twice yields the same ids.
 */
export function parseRevolutCsv(text: string, options: RevolutImportOptions = {}): RevolutImportResult {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) throw new RevolutCsvError('File vuoto');
  const cols = mapRevolutHeader(header);
  const missing = REQUIRED.filter((c) => cols[c] === undefined);
  if (missing.length > 0) throw new RevolutCsvError(`Colonne mancanti: ${missing.join(', ')}`);

  const currencies = new Set((options.currencies ?? ['EUR']).map((c) => c.toUpperCase()));
  const get = (row: readonly string[], column: RevolutCsvColumn) => {
    const index = cols[column];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  const transactions: Transaction[] = [];
  const skipped: RevolutImportResult['skipped'] = [];
  const seen = new Map<string, number>();
  const latestBalance = new Map<string, { at: string; amount: number; product: string; currency: string }>();

  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const state = get(row, 'state').toUpperCase();
    const status = COMPLETED.has(state) ? 'booked' : PENDING.has(state) ? 'pending' : null;
    if (!status) {
      skipped.push({ line, reason: 'not-completed' });
      return;
    }
    const currency = get(row, 'currency').toUpperCase();
    if (!currencies.has(currency)) {
      skipped.push({ line, reason: 'currency' });
      return;
    }
    const amount = parseRevolutNumber(get(row, 'amount'));
    const startedRaw = get(row, 'startedDate');
    const completedRaw = get(row, 'completedDate');
    const started = revolutDay(startedRaw);
    const completed = revolutDay(completedRaw);
    const bookingDate = completed ?? started;
    if (amount === null || !bookingDate) {
      skipped.push({ line, reason: 'invalid-row' });
      return;
    }
    const fee = parseRevolutNumber(get(row, 'fee')) ?? 0;
    const net = fromCents(toCents(amount) - toCents(Math.abs(fee)));
    const type = get(row, 'type');
    const product = get(row, 'product');
    const description = get(row, 'description').replace(/\s+/g, ' ');
    const accountId = accountIdFor(product, currency);
    const balanceRaw = get(row, 'balance');

    const fingerprint = [accountId, type, startedRaw, completedRaw, description, amount, fee, balanceRaw].join('|');
    const occurrence = seen.get(fingerprint) ?? 0;
    seen.set(fingerprint, occurrence + 1);
    const remittance = remittanceFor(type, description);

    transactions.push({
      id: `rvcsv-${hashString(`${fingerprint}|${occurrence}`)}`,
      accountId,
      bookingDate,
      ...(started && started !== bookingDate ? { valueDate: started } : {}),
      amount: { amount: net === 0 ? 0 : net, currency },
      status,
      ...(description ? (net < 0 ? { creditorName: description } : { debtorName: description }) : {}),
      ...(remittance ? { remittanceInformation: remittance } : {}),
      ...(type ? { bankTransactionCode: type.toUpperCase() } : {}),
    });

    const balance = parseRevolutNumber(balanceRaw);
    const at = completedRaw || startedRaw;
    const prev = latestBalance.get(accountId);
    if (status === 'booked' && balance !== null && (!prev || at >= prev.at)) {
      latestBalance.set(accountId, { at, amount: balance, product, currency });
    }
  });

  const accountIds = [...new Set(transactions.map((t) => t.accountId))];
  const fallbackAt = (options.now ?? new Date()).toISOString();
  const accounts: Account[] = accountIds.map((id) => {
    const bal = latestBalance.get(id);
    const sample = transactions.find((t) => t.accountId === id);
    const product = bal?.product ?? id.replace(/^revolut-csv-|-[a-z]{3}$/g, '');
    const isSavings = /savings|risparmi/i.test(product);
    return {
      id,
      provider: 'revolut',
      name: accountName(product),
      institutionName: 'Revolut',
      currency: 'EUR',
      balance: { amount: bal?.amount ?? 0, currency: bal?.currency ?? sample?.amount.currency ?? 'EUR' },
      balanceUpdatedAt: bal ? toIso(bal.at) ?? fallbackAt : fallbackAt,
      kind: isSavings ? 'savings' : 'current',
    };
  });

  return { accounts, transactions, skipped };
}

function toIso(raw: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(raw);
  if (m) return `${m[1]}T${m[2]!.length === 5 ? `${m[2]}:00` : m[2]}`;
  const day = revolutDay(raw);
  return day ? `${day}T00:00:00` : null;
}

/**
 * Content key for cross-source dedup (CSV vs open banking): same day, same
 * signed cents, same counterparty, regardless of account id or source.
 */
export function crossSourceKey(tx: Pick<Transaction, 'bookingDate' | 'amount' | 'creditorName' | 'debtorName'>): string {
  const party = (tx.amount.amount < 0 ? tx.creditorName : tx.debtorName) ?? '';
  return [tx.bookingDate, toCents(tx.amount.amount), tx.amount.currency, party.toLowerCase().replace(/[^a-z0-9]+/g, '')].join('|');
}

export type MergeResult = { transactions: Transaction[]; added: number; duplicates: number };

/**
 * Adds `incoming` to `existing`. Same id: the booked copy wins (pending ->
 * booked updates in place). With `crossSource`, an incoming row that matches
 * an existing row from another account on day, amount and counterparty is
 * treated as a duplicate (e.g. the CSV overlaps an open-banking sync).
 * Counts per key, so two identical coffees on the same day stay two.
 */
export function mergeTransactions(
  existing: readonly Transaction[],
  incoming: readonly Transaction[],
  options: { crossSource?: boolean } = {},
): MergeResult {
  const byId = new Map(existing.map((t) => [t.id, t] as const));
  const keyBudget = new Map<string, number>();
  if (options.crossSource) {
    for (const t of existing) keyBudget.set(crossSourceKey(t), (keyBudget.get(crossSourceKey(t)) ?? 0) + 1);
  }
  let added = 0;
  let duplicates = 0;
  for (const tx of incoming) {
    const prev = byId.get(tx.id);
    if (prev) {
      if (prev.status === 'pending' && tx.status === 'booked') byId.set(tx.id, tx);
      duplicates++;
      continue;
    }
    if (options.crossSource) {
      const key = crossSourceKey(tx);
      const left = keyBudget.get(key) ?? 0;
      if (left > 0) {
        keyBudget.set(key, left - 1);
        duplicates++;
        continue;
      }
    }
    byId.set(tx.id, tx);
    added++;
  }
  const transactions = [...byId.values()].sort((a, b) =>
    a.bookingDate === b.bookingDate ? a.id.localeCompare(b.id) : a.bookingDate < b.bookingDate ? 1 : -1,
  );
  return { transactions, added, duplicates };
}
