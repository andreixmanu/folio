import { signRs256Jwt } from './crypto';
import { mapEnableBankingTransactions, parseAmount, type EbTransaction } from './mapping';
import {
  BankProviderError,
  type BankProvider,
  type Institution,
  type ProviderAccount,
  type ProviderBalance,
  type ProviderSession,
  type StartConsentInput,
  type StartConsentResult,
  type TransactionPage,
  type TransactionPageQuery,
} from './types';

export const ENABLE_BANKING_API = 'https://api.enablebanking.com';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type EnableBankingOptions = {
  appId: string;
  privateKeyPem: string;
  fetch?: FetchLike;
  now?: () => number;
  baseUrl?: string;
};

type EbAspsp = {
  name: string;
  country: string;
  logo?: string;
  maximum_consent_validity?: number;
  psu_types?: string[];
  beta?: boolean;
  transaction_total_days?: string | number;
};

type EbSessionAccount = {
  uid?: string;
  identification_hash?: string;
  account_id?: { iban?: string } | null;
  name?: string | null;
  product?: string | null;
  currency?: string | null;
  cash_account_type?: string | null;
};

type EbBalance = { balance_amount?: { amount?: string; currency?: string }; balance_type?: string; reference_date?: string };

/** Balance types, best first (Berlin Group / ISO 20022). */
const BALANCE_PREFERENCE = ['ITAV', 'CLAV', 'ITBD', 'XPCD', 'CLBD', 'OPAV', 'PRCD', 'OTHR'];

const JWT_TTL_SEC = 3600;

/** Enable Banking adapter. Every call is signed with an RS256 JWT (kid = application id). */
export function createEnableBankingProvider(options: EnableBankingOptions): BankProvider {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const baseUrl = options.baseUrl ?? ENABLE_BANKING_API;

  async function authHeader(): Promise<string> {
    const iat = Math.floor(now() / 1000);
    const jwt = await signRs256Jwt(
      options.privateKeyPem,
      { kid: options.appId },
      { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + JWT_TTL_SEC },
    );
    return `Bearer ${jwt}`;
  }

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: await authHeader(),
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      let code: string | undefined;
      try {
        const err = (await res.json()) as { error?: string; code?: string | number };
        code = err.error ?? (err.code !== undefined ? String(err.code) : undefined);
      } catch {
        // non-JSON error body
      }
      throw new BankProviderError(`Enable Banking HTTP ${res.status}`, res.status >= 500 ? 502 : res.status, code);
    }
    return (await res.json()) as T;
  }

  return {
    id: 'enablebanking',

    async listInstitutions(country) {
      const data = await call<{ aspsps?: EbAspsp[] }>(
        'GET',
        `/aspsps?country=${encodeURIComponent(country)}&service=AIS`,
      );
      return (data.aspsps ?? []).map(
        (a): Institution => ({
          name: a.name,
          country: a.country,
          ...(a.logo ? { logo: a.logo } : {}),
          ...(a.maximum_consent_validity ? { maxConsentSeconds: a.maximum_consent_validity } : {}),
          ...(a.transaction_total_days !== undefined && Number.isFinite(Number(a.transaction_total_days))
            ? { historyDays: Number(a.transaction_total_days) }
            : {}),
          psuTypes: a.psu_types ?? [],
          beta: a.beta ?? false,
        }),
      );
    },

    async startConsent(input: StartConsentInput): Promise<StartConsentResult> {
      const data = await call<{ url: string; authorization_id: string }>('POST', '/auth', {
        access: { valid_until: input.validUntil },
        aspsp: { name: input.institution.name, country: input.institution.country },
        state: input.state,
        redirect_url: input.redirectUrl,
        psu_type: input.psuType,
        ...(input.language ? { language: input.language } : {}),
      });
      return { url: data.url, authorizationId: data.authorization_id };
    },

    async createSession(code: string): Promise<ProviderSession> {
      const data = await call<{
        session_id: string;
        accounts?: EbSessionAccount[];
        aspsp?: { name: string; country: string };
        access?: { valid_until?: string };
      }>('POST', '/sessions', { code });
      const accounts: ProviderAccount[] = (data.accounts ?? [])
        .filter((a): a is EbSessionAccount & { uid: string } => typeof a.uid === 'string')
        .map((a) => ({
          providerAccountId: a.uid,
          identityHash: a.identification_hash ?? a.uid,
          ...(a.name ? { name: a.name } : {}),
          ...(a.product ? { product: a.product } : {}),
          ...(a.account_id?.iban ? { iban: a.account_id.iban } : {}),
          ...(a.currency ? { currency: a.currency } : {}),
          ...(a.cash_account_type ? { cashAccountType: a.cash_account_type } : {}),
        }));
      return {
        sessionId: data.session_id,
        institution: data.aspsp ?? { name: 'Unknown', country: '' },
        ...(data.access?.valid_until ? { validUntil: data.access.valid_until } : {}),
        accounts,
      };
    },

    async getBalance(providerAccountId: string): Promise<ProviderBalance | null> {
      const data = await call<{ balances?: EbBalance[] }>(
        'GET',
        `/accounts/${encodeURIComponent(providerAccountId)}/balances`,
      );
      const balances = data.balances ?? [];
      const ranked = [...balances].sort(
        (a, b) => rank(a.balance_type) - rank(b.balance_type),
      );
      const best = ranked[0];
      const amount = parseAmount(best?.balance_amount?.amount);
      if (!best || amount === null) return null;
      return {
        amount,
        currency: best.balance_amount?.currency ?? 'EUR',
        ...(best.reference_date ? { referenceDate: best.reference_date } : {}),
      };
    },

    async getTransactions(providerAccountId, accountId, query: TransactionPageQuery): Promise<TransactionPage> {
      const params = new URLSearchParams();
      if (query.dateFrom) params.set('date_from', query.dateFrom);
      if (query.dateTo) params.set('date_to', query.dateTo);
      if (query.continuationKey) params.set('continuation_key', query.continuationKey);
      if (query.strategy && query.strategy !== 'default') params.set('strategy', query.strategy);
      const qs = params.toString();
      const data = await call<{ transactions?: EbTransaction[]; continuation_key?: string | null }>(
        'GET',
        `/accounts/${encodeURIComponent(providerAccountId)}/transactions${qs ? `?${qs}` : ''}`,
      );
      return {
        transactions: await mapEnableBankingTransactions(accountId, data.transactions ?? []),
        ...(data.continuation_key ? { continuationKey: data.continuation_key } : {}),
      };
    },
  };
}

function rank(type: string | undefined): number {
  const i = BALANCE_PREFERENCE.indexOf(type ?? '');
  return i === -1 ? BALANCE_PREFERENCE.length : i;
}
