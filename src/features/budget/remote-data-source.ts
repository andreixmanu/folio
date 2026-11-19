/**
 * Worker-backed budget source (`/bank/*` on folio-api). Not used by default:
 * `budgetSource` in `data-source.ts` stays on the mock until open banking is
 * configured and switched on with `EXPO_PUBLIC_BUDGET_SOURCE=remote`.
 */

import { labelBudgetAccounts } from './account-labels';
import type { BudgetDataSource, TransactionQuery } from './data-source';
import type { Account, Transaction } from './model';
import { withoutSupersededPending } from './pending-dedupe';

export type RemoteBudgetSourceOptions = {
  baseUrl: string;
  token: string | (() => Promise<string>);
  fetch?: typeof fetch;
  /** Page size for `/bank/transactions`. Max 1000 on the Worker. */
  pageSize?: number;
  /** Safety stop for runaway pagination. */
  maxPages?: number;
};

export class RemoteBudgetError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'RemoteBudgetError';
  }
}

export function createRemoteBudgetSource(options: RemoteBudgetSourceOptions): BudgetDataSource {
  const fetchImpl = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  const pageSize = options.pageSize ?? 500;
  const maxPages = options.maxPages ?? 50;

  async function request<T>(path: string, method: 'GET' | 'POST'): Promise<T> {
    const token = typeof options.token === 'function' ? await options.token() : options.token;
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { 'X-Folio-Token': token, Accept: 'application/json' },
    });
    if (!res.ok) {
      let code: string | undefined;
      try {
        code = ((await res.json()) as { error?: string }).error;
      } catch {
        // ignore non-JSON bodies
      }
      const message =
        code === 'bank_not_configured'
          ? 'Collegamento bancario non configurato'
          : code === 'unauthorized'
            ? 'Token non valido'
            : `Errore ${res.status} dal server`;
      throw new RemoteBudgetError(message, res.status, code);
    }
    return (await res.json()) as T;
  }

  function get<T>(path: string): Promise<T> {
    return request<T>(path, 'GET');
  }

  return {
    async getAccounts() {
      const body = await get<{ accounts: Account[] }>('/bank/accounts');
      return labelBudgetAccounts(body.accounts);
    },

    async refreshFromBank() {
      const listed = await get<{ accounts: { id: string }[] }>('/bank/accounts');
      // One rejected sync must not skip the other accounts or the balance refresh.
      await Promise.allSettled(
        listed.accounts.map((account) =>
          request(`/bank/accounts/${encodeURIComponent(account.id)}/sync`, 'POST'),
        ),
      );
      await get('/bank/accounts?refresh=1');
    },

    async getTransactions(params?: TransactionQuery) {
      const out: Transaction[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < maxPages; page++) {
        const qs = new URLSearchParams({ limit: String(pageSize) });
        if (params?.from) qs.set('from', params.from);
        if (params?.to) qs.set('to', params.to);
        if (params?.accountId) qs.set('accountId', params.accountId);
        if (cursor) qs.set('cursor', cursor);
        const body: { transactions: Transaction[]; nextCursor: string | null } = await get(
          `/bank/transactions?${qs.toString()}`,
        );
        // Raw rows only: categories are applied client-side.
        for (const tx of body.transactions) {
          const { categoryId: _c, categorySource: _s, merchantKey: _m, ...raw } = tx;
          out.push(raw);
        }
        cursor = body.nextCursor;
        if (!cursor) break;
      }
      return withoutSupersededPending(out);
    },
  };
}
