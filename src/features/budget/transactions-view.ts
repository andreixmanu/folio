/**
 * Client-side filters for the movements list.
 * An empty account or category list means that dimension is not constrained.
 */

import { displayMerchant, foldLight } from './merchant';
import { counterpartyRaw, type CategoryId, type CategorySource, type Transaction } from './model';

export type TxFilters = {
  query: string;
  accountIds: string[];
  categoryIds: CategoryId[];
  direction: 'all' | 'in' | 'out';
};

export const EMPTY_FILTERS: TxFilters = {
  query: '',
  accountIds: [],
  categoryIds: [],
  direction: 'all',
};

function searchHaystack(tx: Transaction): string {
  const raw = counterpartyRaw(tx);
  return foldLight([displayMerchant(raw || tx.merchantKey), raw, tx.remittanceInformation ?? ''].join(' '));
}

/** Keeps the input order. Amount zero matches `all` only. */
export function filterTransactions(txs: readonly Transaction[], filters: TxFilters): Transaction[] {
  const needle = foldLight(filters.query);
  return txs.filter((tx) => {
    if (needle && !searchHaystack(tx).includes(needle)) return false;
    if (filters.accountIds.length > 0 && !filters.accountIds.includes(tx.accountId)) return false;
    if (filters.categoryIds.length > 0 && (!tx.categoryId || !filters.categoryIds.includes(tx.categoryId))) {
      return false;
    }
    if (filters.direction === 'in' && !(tx.amount.amount > 0)) return false;
    if (filters.direction === 'out' && !(tx.amount.amount < 0)) return false;
    return true;
  });
}

export function hasActiveFilters(filters: TxFilters): boolean {
  return (
    foldLight(filters.query).length > 0 ||
    filters.accountIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.direction !== 'all'
  );
}

/** A manual override or a merchant rule the user saved. */
export function isUserChosen(tx: { categorySource?: CategorySource }): boolean {
  return tx.categorySource === 'user' || tx.categorySource === 'rule';
}
