/**
 * Provider-agnostic budget model shaped like a PSD2 / Berlin Group account
 * and transaction, so a real open-banking payload can map onto it 1:1.
 * Amounts are signed euros (negative = outflow) stored at 2 decimal places.
 * The module stays free of React: icon names are Lucide keys for the UI to resolve.
 */

export type Money = {
  /** Signed. Negative means money left the account. */
  amount: number;
  currency: string;
};

export type AccountKind = 'current' | 'card' | 'savings';

export type Account = {
  id: string;
  /** Known values: `'revolut'` and `'bank'`. Other provider ids are allowed. */
  provider: string;
  name: string;
  institutionName: string;
  /** Masked, fictional IBAN such as `IT•• •••• 4821`. */
  iban?: string;
  currency: 'EUR';
  balance: Money;
  /** ISO-8601 timestamp of the balance snapshot. */
  balanceUpdatedAt: string;
  kind: AccountKind;
};

export type TransactionStatus = 'booked' | 'pending';

export type CategoryId =
  | 'groceries'
  | 'restaurants'
  | 'transport'
  | 'shopping'
  | 'home'
  | 'subscriptions'
  | 'health'
  | 'leisure'
  | 'travel'
  | 'income'
  | 'transfers'
  | 'other';

/**
 * Who picked the category.
 * `user` is a manual override or a saved merchant rule.
 * `rule` is the same family, reserved so a future feed can tell them apart.
 */
export type CategorySource = 'user' | 'rule' | 'builtin' | 'mcc' | 'fallback';

export type CategoryIconName =
  | 'ShoppingBasket'
  | 'UtensilsCrossed'
  | 'TrainFront'
  | 'ShoppingBag'
  | 'House'
  | 'Repeat'
  | 'HeartPulse'
  | 'Ticket'
  | 'Plane'
  | 'Banknote'
  | 'ArrowLeftRight'
  | 'Ellipsis';

export type Category = {
  id: CategoryId;
  /** Italian label shown in the UI. */
  label: string;
  /** Lucide icon name. The UI maps it to a component; this file does not. */
  icon: CategoryIconName;
  color: { dark: string; light: string };
};

/**
 * Harmonised with the chart palette in `src/theme/colors.ts`.
 * Subscriptions use the budget accent `#2EC4A6` / `#0E9F84`.
 */
export const CATEGORIES: readonly Category[] = [
  { id: 'groceries', label: 'Alimentari', icon: 'ShoppingBasket', color: { dark: '#2FD08A', light: '#12A86B' } },
  { id: 'restaurants', label: 'Ristoranti', icon: 'UtensilsCrossed', color: { dark: '#FF6B8B', light: '#E04568' } },
  { id: 'transport', label: 'Trasporti', icon: 'TrainFront', color: { dark: '#35C2FF', light: '#0B8EC4' } },
  { id: 'shopping', label: 'Shopping', icon: 'ShoppingBag', color: { dark: '#B98CFF', light: '#7A52D6' } },
  { id: 'home', label: 'Casa e bollette', icon: 'House', color: { dark: '#FFB547', light: '#C4840F' } },
  { id: 'subscriptions', label: 'Abbonamenti', icon: 'Repeat', color: { dark: '#2EC4A6', light: '#0E9F84' } },
  { id: 'health', label: 'Salute', icon: 'HeartPulse', color: { dark: '#FF8A4C', light: '#D4652A' } },
  { id: 'leisure', label: 'Svago', icon: 'Ticket', color: { dark: '#F7D154', light: '#B8920A' } },
  { id: 'travel', label: 'Viaggi', icon: 'Plane', color: { dark: '#8CA3FF', light: '#4C63D6' } },
  { id: 'income', label: 'Stipendio/Entrate', icon: 'Banknote', color: { dark: '#4DE1C1', light: '#0F8F78' } },
  { id: 'transfers', label: 'Trasferimenti', icon: 'ArrowLeftRight', color: { dark: '#7C6CFF', light: '#5B4BFF' } },
  { id: 'other', label: 'Altro', icon: 'Ellipsis', color: { dark: '#9A9AA8', light: '#6B6B78' } },
];

export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((category) => category.id);

export const CATEGORY_BY_ID: Record<CategoryId, Category> = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as Record<CategoryId, Category>;

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value);
}

export type Transaction = {
  id: string;
  accountId: string;
  /** Civil booking day, `YYYY-MM-DD`. */
  bookingDate: string;
  valueDate?: string;
  amount: Money;
  status: TransactionStatus;
  creditorName?: string;
  debtorName?: string;
  remittanceInformation?: string;
  /** ISO 18245 merchant category code, when the bank sends one. */
  merchantCategoryCode?: string;
  /** Berlin Group bank transaction code, when present. */
  bankTransactionCode?: string;
  /** Filled client-side. Raw bank payloads leave it empty. */
  categoryId?: CategoryId;
  categorySource?: CategorySource;
  /** Normalised counterparty. Filled client-side with the category. */
  merchantKey?: string;
};

export type CashDirection = 'in' | 'out';

/** Negative amounts leave the account. Zero is treated as an inflow. */
export function cashDirection(amount: number): CashDirection {
  return amount < 0 ? 'out' : 'in';
}

/**
 * Counterparty shown to the user: the creditor on an outflow, the debtor on an inflow.
 */
export function counterpartyRaw(
  tx: Pick<Transaction, 'amount' | 'creditorName' | 'debtorName'>,
): string {
  const name = tx.amount.amount < 0 ? tx.creditorName : tx.debtorName;
  return name?.trim() ?? '';
}

export type Rule = {
  id: string;
  merchantKey: string;
  categoryId: CategoryId;
  /** ISO-8601. */
  createdAt: string;
};

export type Budget = {
  categoryId: CategoryId;
  /** Positive monthly cap in major units (euros). */
  monthlyLimit: number;
  currency: string;
};

/** Starting caps. Tuned against the deterministic mock so the open month is not all "ok". */
export const DEFAULT_BUDGETS: readonly Budget[] = [
  { categoryId: 'groceries', monthlyLimit: 400, currency: 'EUR' },
  { categoryId: 'restaurants', monthlyLimit: 200, currency: 'EUR' },
  { categoryId: 'transport', monthlyLimit: 150, currency: 'EUR' },
  { categoryId: 'shopping', monthlyLimit: 200, currency: 'EUR' },
  { categoryId: 'home', monthlyLimit: 950, currency: 'EUR' },
  { categoryId: 'subscriptions', monthlyLimit: 50, currency: 'EUR' },
  { categoryId: 'health', monthlyLimit: 80, currency: 'EUR' },
  { categoryId: 'leisure', monthlyLimit: 100, currency: 'EUR' },
  { categoryId: 'travel', monthlyLimit: 300, currency: 'EUR' },
  { categoryId: 'other', monthlyLimit: 120, currency: 'EUR' },
];

export type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type RecurringPayment = {
  merchantKey: string;
  displayName: string;
  categoryId: CategoryId;
  /** Positive average charge in major units. */
  averageAmount: number;
  cadence: RecurringCadence;
  /** Latest booking day, `YYYY-MM-DD`. */
  lastDate: string;
  /** Next expected day, rolled forward when a cycle was missed. */
  nextDate: string;
  occurrences: number;
  isSubscription: boolean;
  accountId: string;
};

/** Integer cents. `Math.round` round-trips every 2-decimal amount we store. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function money(amount: number, currency = 'EUR'): Money {
  return { amount: fromCents(toCents(amount)), currency };
}

export function moneyFromCents(cents: number, currency = 'EUR'): Money {
  return { amount: fromCents(cents), currency };
}

/** Sum major-unit amounts in cents so `0.1 + 0.2` stays `0.3`. */
export function sumAmounts(amounts: readonly number[]): number {
  let cents = 0;
  for (const amount of amounts) cents += toCents(amount);
  return fromCents(cents);
}
