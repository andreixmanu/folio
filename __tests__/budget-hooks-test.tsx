import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAccounts, useBudgetProgress, useCategorizedTransactions, useRecurring } from '@/features/budget/hooks';
import { DEFAULT_BUDGETS } from '@/features/budget/model';
import { useBudgetStore } from '@/features/budget/store';

jest.mock('@/features/budget/data-source', () => {
  const actual = jest.requireActual<typeof import('@/features/budget/data-source')>(
    '@/features/budget/data-source',
  );
  return {
    ...actual,
    budgetSource: actual.createMockBudgetSource(() => new Date('2026-11-16T12:00:00.000Z'), 0),
  };
});

const NOW = new Date('2026-11-16T12:00:00.000Z');

let client = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity } },
});

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function emptyBudgetState() {
  return {
    userRules: [],
    categoryOverrides: {},
    overrideMerchants: {},
    budgets: DEFAULT_BUDGETS.map((budget) => ({ ...budget })),
  };
}

beforeEach(async () => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  await AsyncStorage.clear();
  useBudgetStore.setState(emptyBudgetState());
  await act(async () => {
    await useBudgetStore.persist.rehydrate();
  });
  useBudgetStore.setState(emptyBudgetState());
});

describe('budget hooks', () => {
  test('loads the two fictional accounts', async () => {
    const { result } = await renderHook(() => useAccounts(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((account) => account.institutionName).sort()).toEqual([
      'Banca Aurora',
      'Revolut',
    ]);
  });

  test('categorises on the client and lets an override win without a refetch', async () => {
    const { result } = await renderHook(() => useCategorizedTransactions(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const netflix = result.current.data?.filter((tx) => tx.merchantKey === 'netflix') ?? [];
    expect(netflix.length).toBeGreaterThanOrEqual(4);
    expect(netflix.every((tx) => tx.categoryId === 'subscriptions' && tx.categorySource === 'builtin')).toBe(true);
    const target = netflix[0];
    expect(target).toBeDefined();
    const updatedAt = result.current.dataUpdatedAt;

    await act(() => {
      useBudgetStore.getState().setCategoryForTransaction(target?.id ?? '', 'health', {
        applyToMerchant: false,
        merchantKey: 'netflix',
      });
    });

    const overridden = result.current.data?.find((tx) => tx.id === target?.id);
    expect(overridden).toMatchObject({ categoryId: 'health', categorySource: 'user' });
    expect(
      result.current.data
        ?.filter((tx) => tx.merchantKey === 'netflix' && tx.id !== target?.id)
        .every((tx) => tx.categoryId === 'subscriptions'),
    ).toBe(true);
    expect(result.current.dataUpdatedAt).toBe(updatedAt);

    await act(() => {
      useBudgetStore.getState().setCategoryForTransaction(target?.id ?? '', 'leisure', {
        applyToMerchant: true,
        merchantKey: 'NETFLIX.COM',
      });
    });
    expect(
      result.current.data
        ?.filter((tx) => tx.merchantKey === 'netflix')
        .every((tx) => tx.categoryId === 'leisure' && tx.categorySource === 'user'),
    ).toBe(true);
    expect(useBudgetStore.getState().categoryOverrides).toEqual({});
  });

  test('refetch reloads the raw query', async () => {
    const { result } = await renderHook(() => useCategorizedTransactions(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const updatedAt = result.current.dataUpdatedAt;

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.dataUpdatedAt).toBeGreaterThanOrEqual(updatedAt);
    expect((result.current.data ?? []).length).toBeGreaterThan(0);
  });

  test('reports recurring series and the current-month budget states', async () => {
    const recurring = await renderHook(() => useRecurring(NOW), { wrapper: Wrapper });
    await waitFor(() => expect(recurring.result.current.data).toBeDefined());
    expect(recurring.result.current.data?.find((series) => series.merchantKey === 'netflix')).toMatchObject({
      cadence: 'monthly',
      nextDate: '2026-12-02',
      isSubscription: true,
      averageAmount: 13.99,
    });
    expect(recurring.result.current.data?.some((series) => series.categoryId === 'groceries')).toBe(false);

    const progress = await renderHook(() => useBudgetProgress(NOW), { wrapper: Wrapper });
    await waitFor(() => expect(progress.result.current.data).toBeDefined());
    const byId = Object.fromEntries((progress.result.current.data ?? []).map((row) => [row.categoryId, row]));
    expect(byId.subscriptions?.state).toBe('warning');
    expect(byId.shopping?.state).toBe('over');
  });
});
