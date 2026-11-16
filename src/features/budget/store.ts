import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createRuleFromTransaction } from './categorize';
import { normalizeMerchant } from './merchant';
import {
  DEFAULT_BUDGETS,
  fromCents,
  isCategoryId,
  toCents,
  type Budget,
  type CategoryId,
  type Rule,
} from './model';

type BudgetState = {
  userRules: Rule[];
  /** Single-transaction corrections. A merchant rule outranks these once it covers that shop. */
  categoryOverrides: Record<string, CategoryId>;
  /**
   * txId → merchantKey for each override, so applying a merchant rule can drop
   * the per-transaction overrides that rule makes redundant.
   */
  overrideMerchants: Record<string, string>;
  budgets: Budget[];
  setCategoryForTransaction: (
    txId: string,
    categoryId: CategoryId,
    options: { applyToMerchant: boolean; merchantKey?: string },
  ) => void;
  removeRule: (ruleId: string) => void;
  setBudgetLimit: (categoryId: CategoryId, monthlyLimit: number) => void;
};

type Stored = {
  userRules?: unknown;
  categoryOverrides?: unknown;
  overrideMerchants?: unknown;
  budgets?: unknown;
};

const STORAGE_KEY = 'folio-budget';

function cloneBudgets(budgets: readonly Budget[]): Budget[] {
  return budgets.map((budget) => ({ ...budget }));
}

function sanitizeRules(value: unknown): Rule[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return [];
  const rules: Rule[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rule = item as Partial<Rule>;
    if (typeof rule.id !== 'string' || typeof rule.merchantKey !== 'string') continue;
    if (!isCategoryId(rule.categoryId) || typeof rule.createdAt !== 'string') continue;
    const merchantKey = normalizeMerchant(rule.merchantKey);
    if (!merchantKey) continue;
    rules.push({ id: rule.id, merchantKey, categoryId: rule.categoryId, createdAt: rule.createdAt });
  }
  return rules;
}

function sanitizeOverrides(value: unknown): Record<string, CategoryId> | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const overrides: Record<string, CategoryId> = {};
  for (const [txId, categoryId] of Object.entries(value)) {
    if (typeof txId !== 'string' || !txId) continue;
    if (!isCategoryId(categoryId)) continue;
    overrides[txId] = categoryId;
  }
  return overrides;
}

function sanitizeMerchants(value: unknown): Record<string, string> | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const merchants: Record<string, string> = {};
  for (const [txId, merchantKey] of Object.entries(value)) {
    if (typeof txId !== 'string' || typeof merchantKey !== 'string') continue;
    const key = normalizeMerchant(merchantKey);
    if (!key) continue;
    merchants[txId] = key;
  }
  return merchants;
}

function sanitizeBudgets(value: unknown): Budget[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return cloneBudgets(DEFAULT_BUDGETS);
  const budgets: Budget[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const budget = item as Partial<Budget>;
    if (!isCategoryId(budget.categoryId) || typeof budget.monthlyLimit !== 'number') continue;
    if (!Number.isFinite(budget.monthlyLimit) || budget.monthlyLimit < 0) continue;
    budgets.push({
      categoryId: budget.categoryId,
      monthlyLimit: fromCents(toCents(budget.monthlyLimit)),
      currency: typeof budget.currency === 'string' && budget.currency ? budget.currency : 'EUR',
    });
  }
  return budgets.length > 0 ? budgets : cloneBudgets(DEFAULT_BUDGETS);
}

function dropMerchantOverrides(
  overrides: Record<string, CategoryId>,
  merchants: Record<string, string>,
  merchantKey: string,
  txId: string,
): { overrides: Record<string, CategoryId>; merchants: Record<string, string> } {
  const nextOverrides = { ...overrides };
  const nextMerchants = { ...merchants };
  for (const [id, key] of Object.entries(nextMerchants)) {
    if (key === merchantKey) {
      delete nextOverrides[id];
      delete nextMerchants[id];
    }
  }
  delete nextOverrides[txId];
  delete nextMerchants[txId];
  return { overrides: nextOverrides, merchants: nextMerchants };
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      userRules: [],
      categoryOverrides: {},
      overrideMerchants: {},
      budgets: cloneBudgets(DEFAULT_BUDGETS),
      setCategoryForTransaction(txId, categoryId, options) {
        const merchantKey = options.merchantKey ? normalizeMerchant(options.merchantKey) : '';
        set((state) => {
          if (options.applyToMerchant && merchantKey) {
            const rule = createRuleFromTransaction(
              { amount: { amount: -1, currency: 'EUR' }, merchantKey },
              categoryId,
            );
            const cleared = dropMerchantOverrides(
              state.categoryOverrides,
              state.overrideMerchants,
              merchantKey,
              txId,
            );
            return {
              userRules: [...state.userRules.filter((item) => item.merchantKey !== merchantKey), rule],
              categoryOverrides: cleared.overrides,
              overrideMerchants: cleared.merchants,
            };
          }
          return {
            categoryOverrides: { ...state.categoryOverrides, [txId]: categoryId },
            overrideMerchants: merchantKey
              ? { ...state.overrideMerchants, [txId]: merchantKey }
              : state.overrideMerchants,
          };
        });
      },
      removeRule(ruleId) {
        set((state) => ({ userRules: state.userRules.filter((rule) => rule.id !== ruleId) }));
      },
      setBudgetLimit(categoryId, monthlyLimit) {
        const limit = fromCents(Math.max(0, toCents(monthlyLimit)));
        set((state) => {
          const exists = state.budgets.some((budget) => budget.categoryId === categoryId);
          const budgets = exists
            ? state.budgets.map((budget) =>
                budget.categoryId === categoryId ? { ...budget, monthlyLimit: limit } : budget,
              )
            : [...state.budgets, { categoryId, monthlyLimit: limit, currency: 'EUR' }];
          return { budgets };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        userRules: state.userRules,
        categoryOverrides: state.categoryOverrides,
        overrideMerchants: state.overrideMerchants,
        budgets: state.budgets,
      }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Stored;
        return {
          ...current,
          userRules: sanitizeRules(stored.userRules) ?? current.userRules,
          categoryOverrides: sanitizeOverrides(stored.categoryOverrides) ?? current.categoryOverrides,
          overrideMerchants: sanitizeMerchants(stored.overrideMerchants) ?? current.overrideMerchants,
          budgets: sanitizeBudgets(stored.budgets) ?? current.budgets,
        };
      },
    },
  ),
);
