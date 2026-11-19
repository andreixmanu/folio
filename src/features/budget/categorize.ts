/**
 * Pure categorisation. Order: user rule, built-in merchant/keyword, MCC, fallback.
 * Inflows with no match are income; outflows with no match are other.
 */

import { ownMerchantKeysFromAccounts, type LabelableAccount } from './account-labels';
import { daysBetween } from './dates';
import { containsPhrase, foldLight, merchantKeyFor, tokenize } from './merchant';
import {
  cashDirection,
  counterpartyRaw,
  toCents,
  type CategoryId,
  type CategorySource,
  type Rule,
  type Transaction,
} from './model';

export type BuiltinRule = {
  categoryId: CategoryId;
  phrases: readonly string[];
  /** When set, the rule only matches this direction. */
  direction?: 'in' | 'out';
};

export type CategorizeOptions = {
  userRules: readonly Rule[];
  /** Replaces the default keyword list when provided. */
  builtinRules?: readonly BuiltinRule[];
  /** Accepted so callers can pass a clock; matching itself does not use it. */
  now?: Date;
  /** Normalised holder and institution keys from the linked accounts. */
  ownMerchantKeys?: ReadonlySet<string>;
};

export type CategorizeResult = {
  categoryId: CategoryId;
  source: CategorySource;
};

/** Canonical subscription merchants. Recurring detection treats these as subscriptions. */
export const SUBSCRIPTION_MERCHANT_KEYS: readonly string[] = [
  'netflix',
  'spotify',
  'disney+',
  'amazon prime',
  'dazn',
  'youtube premium',
  'icloud',
  'google one',
  'chatgpt',
  'openai',
  'now tv',
];

const SUBSCRIPTION_MERCHANT_SET = new Set(SUBSCRIPTION_MERCHANT_KEYS);

export function isSubscriptionMerchant(merchantKey: string): boolean {
  return SUBSCRIPTION_MERCHANT_SET.has(merchantKey);
}

const OWN_ACCOUNTS = new Set(['revolut', 'banca aurora', 'isybank', 'isy bank', 'ing']);

/** Opposite legs of an internal transfer are matched inside this many calendar days. */
const TRANSFER_WINDOW_DAYS = 4;

const FUEL_NEAR_IP = new Set([
  'carburante',
  'benzina',
  'gasolio',
  'diesel',
  'gpl',
  'stazione',
  'servito',
  'eni',
  'q8',
  'tamoil',
  'esso',
]);

/**
 * Default keyword rules, first match wins.
 * Amazon Prime is listed under subscriptions and is checked before the generic Amazon shopping rule.
 * `ip` is not a phrase: it only matches as its own merchant or beside a fuel word.
 */
const DEFAULT_RULES: readonly BuiltinRule[] = [
  {
    categoryId: 'income',
    direction: 'in',
    phrases: ['stipendio', 'emolumenti', 'salary', 'rimborso'],
  },
  {
    categoryId: 'subscriptions',
    phrases: [
      'netflix',
      'spotify',
      'disney+',
      'disney plus',
      'amazon prime',
      'prime video',
      'dazn',
      'youtube premium',
      'icloud',
      'google one',
      'chatgpt',
      'chat gpt',
      'openai',
      'open ai',
      'now tv',
      'nowtv',
    ],
  },
  {
    categoryId: 'groceries',
    phrases: [
      'esselunga',
      'conad',
      'coop',
      'lidl',
      'carrefour',
      'pam',
      'eurospin',
      'aldi',
      'despar',
      'iper',
      'bennet',
    ],
  },
  {
    categoryId: 'transport',
    phrases: [
      'trenitalia',
      'italo',
      'atm',
      'atac',
      'uber',
      'freenow',
      'free now',
      'taxi',
      'telepass',
      'autostrade',
      'carburante',
      'benzina',
      'gasolio',
      'eni',
      'q8',
      'tamoil',
      'esso',
      'parcheggio',
      'mycicero',
      'my cicero',
    ],
  },
  {
    categoryId: 'home',
    phrases: [
      'enel',
      'a2a',
      'iren',
      'hera',
      'edison',
      'sorgenia',
      'tim',
      'iliad',
      'vodafone',
      'windtre',
      'wind tre',
      'fastweb',
      'affitto',
      'condominio',
    ],
  },
  {
    categoryId: 'health',
    phrases: ['farmacia', 'parafarmacia', 'ospedale', 'dentista', 'ticket sanitario'],
  },
  {
    categoryId: 'restaurants',
    phrases: [
      'ristorante',
      'pizzeria',
      'trattoria',
      'osteria',
      'bar',
      'caffe',
      'cafe',
      'mcdonalds',
      'mc donalds',
      'burger king',
      'deliveroo',
      'glovo',
      'just eat',
      'justeat',
      'sushi',
    ],
  },
  {
    categoryId: 'leisure',
    phrases: [
      'cinema',
      'uci',
      'the space',
      'ticketone',
      'ticket one',
      'steam',
      'playstation',
      'palestra',
      'mcfit',
      'mc fit',
      'virgin active',
    ],
  },
  {
    categoryId: 'travel',
    phrases: ['ryanair', 'easyjet', 'easy jet', 'ita airways', 'booking', 'airbnb', 'hotel', 'trainline'],
  },
  {
    categoryId: 'shopping',
    phrases: ['amazon', 'zalando', 'ikea', 'decathlon', 'mediaworld', 'media world', 'unieuro', 'h&m', 'zara', 'shein'],
  },
];

/**
 * MCC hints. 5816 is listed both in the 5815–5818 subscription range and as leisure;
 * the explicit leisure code wins (digital games).
 */
const MCC_EXACT: Record<number, CategoryId> = {
  5411: 'groceries',
  5422: 'groceries',
  5499: 'groceries',
  5812: 'restaurants',
  5813: 'restaurants',
  5814: 'restaurants',
  4111: 'transport',
  4121: 'transport',
  4131: 'transport',
  5541: 'transport',
  5542: 'transport',
  7523: 'transport',
  4511: 'travel',
  7011: 'travel',
  4722: 'travel',
  4899: 'subscriptions',
  5968: 'subscriptions',
  5815: 'subscriptions',
  5817: 'subscriptions',
  5818: 'subscriptions',
  5816: 'leisure',
  5912: 'health',
  8011: 'health',
  8021: 'health',
  8062: 'health',
  8099: 'health',
  4900: 'home',
  4814: 'home',
  5311: 'shopping',
  5651: 'shopping',
  5691: 'shopping',
  5732: 'shopping',
  5942: 'shopping',
  5999: 'shopping',
  7832: 'leisure',
  7997: 'leisure',
  7941: 'leisure',
};

function haystackFor(tx: Transaction, merchantKey: string): string {
  const light = foldLight(`${counterpartyRaw(tx)} ${tx.remittanceInformation ?? ''}`);
  return `${merchantKey} ${light}`.trim();
}

function isFundingCode(code: string | undefined): boolean {
  const normalized = code?.trim().toUpperCase() ?? '';
  return normalized === 'TOPUP' || normalized === 'EXCHANGE';
}

function isOwnTransfer(merchantKey: string, haystack: string, ownKeys?: ReadonlySet<string>): boolean {
  if (OWN_ACCOUNTS.has(merchantKey) || (ownKeys?.has(merchantKey) ?? false)) return true;
  if (containsPhrase(haystack, 'giroconto')) return true;
  if (containsPhrase(haystack, 'top up') || containsPhrase(haystack, 'topup')) return true;
  if (containsPhrase(haystack, 'isybank') || containsPhrase(haystack, 'isy bank') || containsPhrase(haystack, 'ing')) {
    return true;
  }
  const tokens = tokenize(haystack);
  const has = (word: string) => tokens.includes(word);
  if ((has('ricarica') || has('topup')) && has('revolut')) return true;
  if (has('bonifico') && (has('revolut') || (has('banca') && has('aurora')))) return true;
  return false;
}

/**
 * `IP` is a fuel brand and a common letter pair. It matches only as the whole
 * merchant key, or as a standalone token next to a fuel word.
 */
function matchesIp(merchantKey: string, haystack: string): boolean {
  if (merchantKey === 'ip') return true;
  const tokens = tokenize(haystack);
  if (!tokens.includes('ip')) return false;
  return tokens.some((token) => FUEL_NEAR_IP.has(token));
}

function matchPhrases(
  rules: readonly BuiltinRule[],
  haystack: string,
  direction: 'in' | 'out',
  merchantKey: string,
  withSpecials: boolean,
): CategoryId | null {
  for (const rule of rules) {
    if (rule.direction && rule.direction !== direction) continue;
    if (withSpecials && rule.categoryId === 'transport' && matchesIp(merchantKey, haystack)) {
      return 'transport';
    }
    if (rule.phrases.some((phrase) => containsPhrase(haystack, phrase))) return rule.categoryId;
  }
  return null;
}

export function mccCategory(code: string | undefined): CategoryId | null {
  if (!code) return null;
  const digits = code.trim();
  if (!/^\d{3,4}$/.test(digits)) return null;
  const value = Number(digits);
  if (value >= 3000 && value <= 3299) return 'travel';
  return MCC_EXACT[value] ?? null;
}

export function categorize(tx: Transaction, options: CategorizeOptions): CategorizeResult {
  const direction = cashDirection(tx.amount.amount);
  const merchantKey = merchantKeyFor(tx);
  const haystack = haystackFor(tx, merchantKey);

  if (merchantKey) {
    const rule = [...options.userRules].reverse().find((item) => item.merchantKey === merchantKey);
    if (rule) return { categoryId: rule.categoryId, source: 'user' };
  }

  if (options.builtinRules) {
    const custom = matchPhrases(options.builtinRules, haystack, direction, merchantKey, false);
    if (custom) return { categoryId: custom, source: 'builtin' };
  } else {
    // TOPUP / EXCHANGE are Revolut funding and FX, not payments to other people.
    // A plain TRANSFER code is left alone: most of those are payments to someone else.
    if (isFundingCode(tx.bankTransactionCode) || isOwnTransfer(merchantKey, haystack, options.ownMerchantKeys)) {
      return { categoryId: 'transfers', source: 'builtin' };
    }
    const builtin = matchPhrases(DEFAULT_RULES, haystack, direction, merchantKey, true);
    if (builtin) return { categoryId: builtin, source: 'builtin' };
  }

  const fromMcc = mccCategory(tx.merchantCategoryCode);
  if (fromMcc) return { categoryId: fromMcc, source: 'mcc' };

  return {
    categoryId: direction === 'in' ? 'income' : 'other',
    source: 'fallback',
  };
}

/**
 * Pairs of opposite legs across two accounts: same currency, same absolute cents,
 * at most 4 days apart. Greedy by smallest gap, then by sorted id.
 * Grouped by amount so a 1.5k feed does not compare every row with every other row.
 * Same-account +X/−X is ignored (too many coincidental amounts).
 */
export function matchInternalTransferIds(txs: readonly Transaction[]): ReadonlySet<string> {
  const buckets = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const cents = Math.abs(toCents(tx.amount.amount));
    if (cents === 0 || tx.amount.amount === 0) continue;
    const currency = tx.amount.currency?.trim().toUpperCase() || 'EUR';
    const key = `${currency}:${cents}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(tx);
    else buckets.set(key, [tx]);
  }

  const matched = new Set<string>();
  for (const bucket of buckets.values()) {
    const positives: Transaction[] = [];
    const negatives: Transaction[] = [];
    for (const tx of bucket) {
      if (tx.amount.amount > 0) positives.push(tx);
      else if (tx.amount.amount < 0) negatives.push(tx);
    }
    if (positives.length === 0 || negatives.length === 0) continue;

    const candidates: { gap: number; order: string; left: string; right: string }[] = [];
    for (const inflow of positives) {
      for (const outflow of negatives) {
        if (inflow.accountId === outflow.accountId) continue;
        const gap = Math.abs(daysBetween(inflow.bookingDate, outflow.bookingDate));
        if (!Number.isFinite(gap) || gap > TRANSFER_WINDOW_DAYS) continue;
        const first = inflow.id < outflow.id ? inflow.id : outflow.id;
        const second = inflow.id < outflow.id ? outflow.id : inflow.id;
        candidates.push({ gap, order: `${first}\0${second}`, left: inflow.id, right: outflow.id });
      }
    }
    candidates.sort((a, b) => {
      if (a.gap !== b.gap) return a.gap - b.gap;
      if (a.order < b.order) return -1;
      if (a.order > b.order) return 1;
      return 0;
    });
    const used = new Set<string>();
    for (const candidate of candidates) {
      if (used.has(candidate.left) || used.has(candidate.right)) continue;
      used.add(candidate.left);
      used.add(candidate.right);
      matched.add(candidate.left);
      matched.add(candidate.right);
    }
  }
  return matched;
}

/**
 * Fallback rows, and rows already marked as transfers, can still be the other
 * leg of an internal move. A keyword or MCC spend (a card payment, a bill) is
 * left alone so an unrelated inflow of the same size does not absorb it.
 */
function canPairAsTransfer(tx: Transaction): boolean {
  if (tx.categoryId === 'transfers') return true;
  if (tx.categorySource === 'user') return false;
  return tx.categorySource === 'fallback';
}

export type ApplyCategoriesContext = {
  /** Linked accounts. Raw `name` or `holderKey` supplies the own-party merchant key. */
  accounts?: readonly Pick<LabelableAccount, 'name' | 'institutionName' | 'holderKey'>[];
  /** Extra own-party keys. Combined with keys derived from `accounts`. */
  ownMerchantKeys?: readonly string[];
};

function collectOwnKeys(context?: ApplyCategoriesContext): ReadonlySet<string> | undefined {
  if (!context) return undefined;
  const keys = new Set<string>();
  if (context.ownMerchantKeys) {
    for (const key of context.ownMerchantKeys) {
      if (key) keys.add(key);
    }
  }
  if (context.accounts) {
    for (const key of ownMerchantKeysFromAccounts(context.accounts)) keys.add(key);
  }
  return keys.size > 0 ? keys : undefined;
}

/**
 * New array. Fills `merchantKey`, `categoryId`, and `categorySource`.
 * Per-transaction overrides win over rules and keywords, with source `user`.
 * Cross-account amount pairs are tagged as transfers after the keyword pass.
 */
export function applyCategories(
  txs: readonly Transaction[],
  userRules: readonly Rule[],
  overrides: Readonly<Record<string, CategoryId>> = {},
  context?: ApplyCategoriesContext,
): Transaction[] {
  const ownMerchantKeys = collectOwnKeys(context);
  const categorised = txs.map((tx) => {
    const merchantKey = merchantKeyFor(tx);
    const override = overrides[tx.id];
    if (override) {
      return { ...tx, merchantKey, categoryId: override, categorySource: 'user' as const };
    }
    const result = categorize({ ...tx, merchantKey }, { userRules, ownMerchantKeys });
    return { ...tx, merchantKey, categoryId: result.categoryId, categorySource: result.source };
  });
  const matched = matchInternalTransferIds(categorised.filter(canPairAsTransfer));
  if (matched.size === 0) return categorised;
  return categorised.map((tx) =>
    matched.has(tx.id) && tx.categoryId !== 'transfers'
      ? { ...tx, categoryId: 'transfers' as const, categorySource: 'builtin' as const }
      : tx,
  );
}

export function createRuleFromTransaction(
  tx: Pick<
    Transaction,
    'amount' | 'creditorName' | 'debtorName' | 'remittanceInformation' | 'merchantKey'
  >,
  categoryId: CategoryId,
  now: Date = new Date(),
): Rule {
  const merchantKey = merchantKeyFor(tx);
  const slug = merchantKey.replace(/[^a-z0-9+]+/gi, '-') || 'merchant';
  return {
    id: `rule-${slug}-${now.getTime()}`,
    merchantKey,
    categoryId,
    createdAt: now.toISOString(),
  };
}
