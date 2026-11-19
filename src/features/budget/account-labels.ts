/**
 * Safe labels for open-banking accounts. The bank often sends the holder’s
 * personal name in `account.name`; screens must show the institution instead.
 * `holderKey` keeps the normalised raw name so transfer detection can still
 * recognise “I paid myself”. Never render `holderKey`.
 */

import { normalizeMerchant } from './merchant';
import { sumAmounts, type Account } from './model';

export type LabelableAccount = {
  id: string;
  provider?: string;
  name?: string;
  institutionName?: string;
  kind?: Account['kind'] | string;
  balance?: { amount?: number; currency?: string | null };
  holderKey?: string;
};

export type AccountLabelOptions = {
  /**
   * Booked movements per account id. When set, the Revolut account with the
   * most transactions is the main one. Omit it when only the account list is loaded.
   */
  transactionCounts?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
};

const ISYBANK_RE = /isybank|isy bank/i;
const REVOLUT_RE = /revolut/i;
const ING_RE = /\bing\b/i;

type Family = 'revolut' | 'ing' | 'isybank' | 'other';

function readCount(
  counts: AccountLabelOptions['transactionCounts'],
  id: string,
): number | undefined {
  if (!counts) return undefined;
  if (counts instanceof Map) return counts.get(id) ?? 0;
  const record = counts as Readonly<Record<string, number>>;
  return Object.prototype.hasOwnProperty.call(record, id) ? (record[id] ?? 0) : 0;
}

function balanceAmount(account: LabelableAccount): number {
  const amount = account.balance?.amount;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
}

/** Missing balance currency counts as euro. `Account.currency` is always EUR and is ignored. */
export function balanceCurrency(account: LabelableAccount): string {
  const raw = account.balance?.currency?.trim();
  if (!raw) return 'EUR';
  return raw.toUpperCase();
}

function isEur(account: LabelableAccount): boolean {
  return balanceCurrency(account) === 'EUR';
}

function isRevolut(account: LabelableAccount): boolean {
  if (account.provider === 'revolut') return true;
  return REVOLUT_RE.test(account.institutionName ?? '');
}

function isIng(account: LabelableAccount): boolean {
  if (account.provider?.toLowerCase() === 'ing') return true;
  return ING_RE.test(account.institutionName ?? '');
}

function isIsybank(account: LabelableAccount): boolean {
  if (ISYBANK_RE.test(account.institutionName ?? '') || ISYBANK_RE.test(account.name ?? '')) return true;
  if (isRevolut(account) || isIng(account)) return false;
  return account.provider === 'bank';
}

function familyOf(account: LabelableAccount): Family {
  if (isRevolut(account)) return 'revolut';
  if (isIng(account)) return 'ing';
  if (isIsybank(account)) return 'isybank';
  return 'other';
}

function otherLabel(account: LabelableAccount): string {
  const institution = account.institutionName?.trim() ?? '';
  const rawName = account.name?.trim() ?? '';
  if (institution && institution.toLowerCase() !== rawName.toLowerCase()) return institution;
  return 'Conto';
}

type Indexed = { account: LabelableAccount; index: number };

function isBetterMain(candidate: Indexed, current: Indexed): boolean {
  const candidateBalance = isEur(candidate.account) && balanceAmount(candidate.account) !== 0;
  const currentBalance = isEur(current.account) && balanceAmount(current.account) !== 0;
  if (candidateBalance !== currentBalance) return candidateBalance;
  const candidateCurrent = isEur(candidate.account) && (candidate.account.kind ?? 'current') === 'current';
  const currentCurrent = isEur(current.account) && (current.account.kind ?? 'current') === 'current';
  if (candidateCurrent !== currentCurrent) return candidateCurrent;
  return candidate.index < current.index;
}

function pickMainRevolut(rows: readonly Indexed[], counts: AccountLabelOptions['transactionCounts']): Indexed {
  const first = rows[0];
  if (!first) throw new Error('revolut list is empty');
  if (!counts) {
    const nonZero = rows.find((row) => isEur(row.account) && balanceAmount(row.account) !== 0);
    if (nonZero) return nonZero;
    const current = rows.find((row) => isEur(row.account) && (row.account.kind ?? 'current') === 'current');
    return current ?? first;
  }
  let best = first;
  let bestCount = readCount(counts, first.account.id) ?? 0;
  for (const row of rows.slice(1)) {
    const count = readCount(counts, row.account.id) ?? 0;
    if (count > bestCount || (count === bestCount && isBetterMain(row, best))) {
      best = row;
      bestCount = count;
    }
  }
  return best;
}

function revolutLabels(rows: readonly Indexed[], counts: AccountLabelOptions['transactionCounts']): Map<string, string> {
  const labels = new Map<string, string>();
  if (rows.length === 0) return labels;
  const main = pickMainRevolut(rows, counts);
  const currencySeen = new Map<string, number>();
  let extra = 2;
  for (const row of rows) {
    if (row.account.id === main.account.id && row.index === main.index) {
      labels.set(row.account.id, 'Revolut');
      continue;
    }
    const currency = balanceCurrency(row.account);
    if (currency !== 'EUR') {
      const seen = (currencySeen.get(currency) ?? 0) + 1;
      currencySeen.set(currency, seen);
      labels.set(row.account.id, seen === 1 ? `Revolut ${currency}` : `Revolut ${currency} ${seen}`);
      continue;
    }
    labels.set(row.account.id, `Revolut ${extra}`);
    extra += 1;
  }
  return labels;
}

/**
 * New account objects, same order. Personal names are replaced.
 * With no transaction counts: main Revolut is the first non-zero EUR balance,
 * otherwise the first EUR current account.
 */
export function labelBudgetAccounts<T extends LabelableAccount>(
  accounts: readonly T[],
  options?: AccountLabelOptions,
): T[] {
  const indexed = accounts.map((account, index) => ({ account, index }));
  const revolut = indexed.filter((row) => familyOf(row.account) === 'revolut');
  const revolutNames = revolutLabels(revolut, options?.transactionCounts);
  return accounts.map((account) => {
    const holderKey = normalizeMerchant(account.name);
    const family = familyOf(account);
    let name: string;
    if (family === 'revolut') name = revolutNames.get(account.id) ?? 'Revolut';
    else if (family === 'ing') name = 'ING';
    else if (family === 'isybank') name = 'Isybank';
    else name = otherLabel(account);
    return {
      ...account,
      name,
      ...(holderKey ? { holderKey } : {}),
    };
  });
}

/**
 * Merchant keys that mean “this is me”: the raw account name (before relabel)
 * and the institution. `holderKey` wins over the display name when present.
 */
export function ownMerchantKeysFromAccounts(
  accounts: readonly Pick<LabelableAccount, 'name' | 'institutionName' | 'holderKey'>[],
): string[] {
  const keys = new Set<string>();
  for (const account of accounts) {
    const fromHolder = account.holderKey?.trim();
    if (fromHolder) keys.add(fromHolder);
    else {
      const fromName = normalizeMerchant(account.name);
      if (fromName) keys.add(fromName);
    }
    const fromInstitution = normalizeMerchant(account.institutionName);
    if (fromInstitution) keys.add(fromInstitution);
  }
  return [...keys];
}

/** Euro balances only. A missing currency counts as EUR, so a USD pocket is left out. */
export function sumEurBalances(
  accounts: readonly { balance?: { amount?: number; currency?: string | null } }[],
): number {
  return sumAmounts(
    accounts
      .filter((account) => {
        const currency = account.balance?.currency?.trim().toUpperCase();
        return !currency || currency === 'EUR';
      })
      .map((account) => {
        const amount = account.balance?.amount;
        return typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
      }),
  );
}
