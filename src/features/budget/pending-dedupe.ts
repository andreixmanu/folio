import type { Transaction } from './model';

/**
 * Same rule as `worker/src/banking/mapping.ts`: one pending card payment and its
 * later booked copy count once. The worker deletes the stale row; this is the
 * guard for rows already stored or returned before that cleanup.
 */

/** A pending card payment and its booked copy can sit this many days apart. */
const PENDING_MATCH_DAYS = 5;
const HASH_ID_RE = /^h[0-9a-f]{24}$/;
const DAY_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

type Row = Pick<
  Transaction,
  'id' | 'accountId' | 'bookingDate' | 'amount' | 'status' | 'creditorName' | 'debtorName' | 'remittanceInformation' | 'providerRefs'
>;

function dayIndex(day: string): number | null {
  if (!DAY_ONLY_RE.test(day)) return null;
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year!, (month ?? 1) - 1, date ?? 1) / 86_400_000;
}

function refsOf(tx: Row): string[] {
  const prefix = `${tx.accountId}:`;
  const suffix = tx.id.startsWith(prefix) ? tx.id.slice(prefix.length) : '';
  const fromId = suffix && !HASH_ID_RE.test(suffix) ? [suffix] : [];
  return [...new Set([...(tx.providerRefs ?? []), ...fromId])];
}

function descriptionKey(tx: Row): string {
  return [tx.creditorName, tx.debtorName, tx.remittanceInformation]
    .map((part) => part?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
    .join('|');
}

function softMatch(pending: Row, booked: Row): boolean {
  if (pending.accountId !== booked.accountId) return false;
  if (pending.amount.currency !== booked.amount.currency) return false;
  if (Math.round(pending.amount.amount * 100) !== Math.round(booked.amount.amount * 100)) return false;
  const left = dayIndex(pending.bookingDate);
  const right = dayIndex(booked.bookingDate);
  if (left === null || right === null || Math.abs(left - right) > PENDING_MATCH_DAYS) return false;
  const text = descriptionKey(pending);
  return text.length > 0 && text === descriptionKey(booked);
}

function supersededIds(rows: readonly Row[]): Set<string> {
  const pendingById = new Map<string, Row>();
  const bookedById = new Map<string, Row>();
  for (const row of rows) {
    if (row.status === 'pending' && !pendingById.has(row.id)) pendingById.set(row.id, row);
    if (row.status === 'booked' && !bookedById.has(row.id)) bookedById.set(row.id, row);
  }
  const pending = [...pendingById.values()];
  const booked = [...bookedById.values()].sort((a, b) =>
    a.bookingDate === b.bookingDate ? (a.id < b.id ? -1 : 1) : a.bookingDate < b.bookingDate ? -1 : 1,
  );
  const used = new Set<string>();
  const drop = new Set<string>();
  for (const book of booked) {
    const bookRefs = refsOf(book);
    let best: Row | undefined;
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
      drop.add(best.id);
    }
  }
  return drop;
}

export function withoutSupersededPending<T extends Row>(rows: readonly T[]): T[] {
  const drop = supersededIds(rows);
  return drop.size === 0 ? rows.slice() : rows.filter((row) => !drop.has(row.id));
}
