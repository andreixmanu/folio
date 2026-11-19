/**
 * Budget feed. Categorisation stays on the client, so a real bank payload
 * and this mock go through the same `applyCategories` path.
 *
 * Switch point: `selectBudgetSource` picks the mock (default) or the
 * Worker-backed open-banking source in `remote-data-source.ts`. No screen
 * should import the mock generator directly.
 */

import { resolveApiBaseUrl } from '@/services/api/config';
import { getAppToken } from '@/services/auth/token';

import { createMockBudgetData } from './mock-data';
import { createRemoteBudgetSource } from './remote-data-source';
import type { Account, Transaction } from './model';

export type TransactionQuery = {
  from?: string;
  to?: string;
  accountId?: string;
};

export interface BudgetDataSource {
  getAccounts(): Promise<Account[]>;
  /** Raw movements. Category fields are left empty on purpose. */
  getTransactions(params?: TransactionQuery): Promise<Transaction[]>;
  /**
   * Ask the bank for new movements and fresh balances, then return.
   * The mock does nothing. Callers refetch accounts and transactions afterwards.
   */
  refreshFromBank(): Promise<void>;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function rawTransaction(tx: Transaction): Transaction {
  return {
    id: tx.id,
    accountId: tx.accountId,
    bookingDate: tx.bookingDate,
    ...(tx.valueDate ? { valueDate: tx.valueDate } : {}),
    amount: { ...tx.amount },
    status: tx.status,
    ...(tx.creditorName ? { creditorName: tx.creditorName } : {}),
    ...(tx.debtorName ? { debtorName: tx.debtorName } : {}),
    ...(tx.remittanceInformation ? { remittanceInformation: tx.remittanceInformation } : {}),
    ...(tx.merchantCategoryCode ? { merchantCategoryCode: tx.merchantCategoryCode } : {}),
    ...(tx.bankTransactionCode ? { bankTransactionCode: tx.bankTransactionCode } : {}),
  };
}

export function createMockBudgetSource(
  now: () => Date = () => new Date(),
  latencyMs = 250,
): BudgetDataSource {
  return {
    async getAccounts() {
      await delay(latencyMs);
      return createMockBudgetData(now()).accounts.map((account) => ({
        ...account,
        balance: { ...account.balance },
      }));
    },
    async getTransactions(params) {
      await delay(latencyMs);
      return createMockBudgetData(now())
        .transactions.filter((tx) => {
          if (params?.accountId && tx.accountId !== params.accountId) return false;
          if (params?.from && tx.bookingDate < params.from) return false;
          if (params?.to && tx.bookingDate > params.to) return false;
          return true;
        })
        .map(rawTransaction);
    },
    async refreshFromBank() {
      // The mock has nothing to sync. Keep this immediate so tests stay fast.
    },
  };
}

/**
 * Mock by default. `EXPO_PUBLIC_BUDGET_SOURCE=remote` switches to the Worker
 * `/bank/*` routes (open banking), which answer 503 until they are configured.
 */
export function selectBudgetSource(env: {
  source?: string;
  apiUrl?: () => string | null;
  token?: string | (() => Promise<string>);
}): BudgetDataSource {
  const apiUrl = env.source === 'remote' ? env.apiUrl?.() : null;
  if (apiUrl) return createRemoteBudgetSource({ baseUrl: apiUrl, token: env.token ?? getAppToken });
  return createMockBudgetSource();
}

export const budgetSource: BudgetDataSource = selectBudgetSource({
  source: process.env.EXPO_PUBLIC_BUDGET_SOURCE,
  apiUrl: resolveApiBaseUrl,
  token: getAppToken,
});
