import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';

import { budgetProgress } from './analytics';
import { applyCategories } from './categorize';
import { budgetSource } from './data-source';
import { budgetKeys } from './keys';
import { detectRecurring } from './recurring';
import { useBudgetStore } from './store';

const STALE_MS = 60_000;

export function useAccounts() {
  return useQuery({
    queryKey: budgetKeys.accounts,
    queryFn: () => budgetSource.getAccounts(),
    staleTime: STALE_MS,
  });
}

/**
 * Raw query plus client-side categories. Overrides win over merchant rules.
 * Own-account names come from the loaded accounts (re-run when they arrive).
 * Amount pairing only needs the transactions.
 */
export function useCategorizedTransactions() {
  const userRules = useBudgetStore((state) => state.userRules);
  const overrides = useBudgetStore((state) => state.categoryOverrides);
  const accountsQuery = useAccounts();
  const query = useQuery({
    queryKey: budgetKeys.transactions,
    queryFn: () => budgetSource.getTransactions(),
    staleTime: STALE_MS,
  });
  const accounts = accountsQuery.data;
  const data = useMemo(
    () => (query.data ? applyCategories(query.data, userRules, overrides, { accounts }) : undefined),
    [query.data, userRules, overrides, accounts],
  );
  return { ...query, data };
}

/**
 * Sync every linked account, refresh balances, then reload accounts and transactions.
 * A failed sync still reloads whatever is already stored.
 */
export function useRefreshBudget() {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef(0);

  const refresh = useCallback(async () => {
    pending.current += 1;
    setRefreshing(true);
    try {
      try {
        await budgetSource.refreshFromBank();
      } catch {
        // Stored rows are still shown after the refetch below.
      }
      try {
        await Promise.all([
          client.refetchQueries({ queryKey: budgetKeys.accounts }),
          client.refetchQueries({ queryKey: budgetKeys.transactions }),
        ]);
      } catch {
        // The query keeps the error; screens render ErrorState.
      }
    } finally {
      pending.current -= 1;
      if (pending.current === 0) setRefreshing(false);
    }
  }, [client]);

  return { refresh, refreshing };
}

export function useRecurring(now?: Date) {
  const query = useCategorizedTransactions();
  const data = useMemo(
    () => (query.data ? detectRecurring(query.data, now ?? new Date()) : undefined),
    [query.data, now],
  );
  return { ...query, data };
}

export function useBudgetProgress(now?: Date) {
  const query = useCategorizedTransactions();
  const budgets = useBudgetStore((state) => state.budgets);
  const data = useMemo(
    () => (query.data ? budgetProgress(budgets, query.data, now ?? new Date()) : undefined),
    [query.data, budgets, now],
  );
  return { ...query, data };
}
