import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

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
 * Pull-to-refresh calls `refetch` on the raw query; rules apply again in the memo.
 */
export function useCategorizedTransactions() {
  const userRules = useBudgetStore((state) => state.userRules);
  const overrides = useBudgetStore((state) => state.categoryOverrides);
  const query = useQuery({
    queryKey: budgetKeys.transactions,
    queryFn: () => budgetSource.getTransactions(),
    staleTime: STALE_MS,
  });
  const data = useMemo(
    () => (query.data ? applyCategories(query.data, userRules, overrides) : undefined),
    [query.data, userRules, overrides],
  );
  return { ...query, data };
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
