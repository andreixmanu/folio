/**
 * Provider-agnostic open-banking types (AIS only, read-only).
 *
 * `BankAccount` and `BankTransaction` mirror `src/features/budget/model.ts`
 * in the app so the Worker can return rows the client uses unchanged.
 * Category fields are never set here: categorisation stays on the client.
 */

export type Money = { amount: number; currency: string };

export type BankAccount = {
  /** Stable across consent renewals (derived from the provider's account hash). */
  id: string;
  /** `'revolut'` for Revolut, `'bank'` for anything else. */
  provider: string;
  name: string;
  institutionName: string;
  /** Masked, e.g. `IT•• •••• 4821`. Never the full IBAN. */
  iban?: string;
  currency: 'EUR';
  balance: Money;
  balanceUpdatedAt: string;
  kind: 'current' | 'card' | 'savings';
};

export type BankTransaction = {
  id: string;
  accountId: string;
  bookingDate: string;
  valueDate?: string;
  amount: Money;
  status: 'booked' | 'pending';
  creditorName?: string;
  debtorName?: string;
  remittanceInformation?: string;
  merchantCategoryCode?: string;
  bankTransactionCode?: string;
};

export type Institution = {
  name: string;
  country: string;
  logo?: string;
  /** Seconds, as advertised by the provider. */
  maxConsentSeconds?: number;
  /** Days of history the provider says it can fetch, when known. */
  historyDays?: number;
  psuTypes: string[];
  beta: boolean;
};

export type InstitutionRef = { name: string; country: string };

export type StartConsentInput = {
  institution: InstitutionRef;
  psuType: 'personal' | 'business';
  validUntil: string;
  redirectUrl: string;
  state: string;
  language?: string;
};

export type StartConsentResult = { url: string; authorizationId: string };

/** Account as seen in one provider session (before it is made stable). */
export type ProviderAccount = {
  /** Session-scoped id used for provider calls. */
  providerAccountId: string;
  /** Stable hash the provider gives for the same underlying account. */
  identityHash: string;
  name?: string;
  product?: string;
  iban?: string;
  currency?: string;
  cashAccountType?: string;
};

export type ProviderSession = {
  sessionId: string;
  institution: InstitutionRef;
  validUntil?: string;
  accounts: ProviderAccount[];
};

export type ProviderBalance = { amount: number; currency: string; referenceDate?: string };

export type TransactionPageQuery = {
  dateFrom?: string;
  dateTo?: string;
  continuationKey?: string;
  /** `longest` asks the provider for the deepest history it can reach. */
  strategy?: 'default' | 'longest';
};

export type TransactionPage = {
  transactions: BankTransaction[];
  continuationKey?: string;
};

export interface BankProvider {
  readonly id: string;
  listInstitutions(country: string): Promise<Institution[]>;
  startConsent(input: StartConsentInput): Promise<StartConsentResult>;
  /** Exchange the redirect `code` for a session with its accounts. */
  createSession(code: string): Promise<ProviderSession>;
  getBalance(providerAccountId: string): Promise<ProviderBalance | null>;
  /** `accountId` is the stable app id written into each mapped row. */
  getTransactions(providerAccountId: string, accountId: string, query: TransactionPageQuery): Promise<TransactionPage>;
}

export class BankProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'BankProviderError';
  }
}
