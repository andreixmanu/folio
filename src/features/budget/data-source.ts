/**
 * Budget feed. Categorisation stays on the client, so a real bank payload
 * and this mock go through the same `applyCategories` path.
 *
 * Switch point: replace `budgetSource` with a Worker-backed open-banking
 * source (PSD2 / Berlin Group) when that exists. No screen should import
 * the mock generator directly.
 */

import { createMockBudgetData } from './mock-data';
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
  };
}

export const budgetSource: BudgetDataSource = createMockBudgetSource();
