import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createRuleFromTransaction } from './categorize';
import { normalizeMerchant } from './merchant';
import {
  CUSTOM_CATEGORY_COLORS,
  DEFAULT_BUDGETS,
  fromCents,
  isBuiltinCategoryId,
  isCategoryIconName,
  isCategoryId,
  isCustomCategoryId,
  toCents,
  type Budget,
  type Category,
  type CategoryIconName,
  type CategoryId,
  type CustomCategoryId,
  type Rule,
} from './model';

export type CustomCategoryInput = {
  label: string;
  icon: CategoryIconName;
  color: { dark: string; light: string };
};

/** Longest custom label kept, in characters. */
export const CUSTOM_LABEL_MAX = 32;

export function cleanCategoryLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, CUSTOM_LABEL_MAX);
}

function slugify(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'categoria'
  );
}

/** Unique `custom-` id from a label. A time suffix keeps ids stable across renames. */
export function newCustomCategoryId(
  label: string,
  taken: ReadonlySet<string>,
  now: Date = new Date(),
): CustomCategoryId {
  const base = `custom-${slugify(label)}-${now.getTime().toString(36)}`;
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id as CustomCategoryId;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

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
  /** Categories Andrei created. Built-ins are not stored. */
  customCategories: Category[];
  /** Returns the new id, or null when the label is empty. */
  createCategory: (input: CustomCategoryInput) => CustomCategoryId | null;
  updateCategory: (id: CustomCategoryId, patch: Partial<CustomCategoryInput>) => void;
  /** Drops the category, its rules, overrides and budget: those movements go back to auto. */
  deleteCategory: (id: CustomCategoryId) => void;
  /** Removes a single-transaction override so auto-categorisation applies again. */
  clearCategoryForTransaction: (txId: string) => void;
  setCategoryForTransaction: (
    txId: string,
    categoryId: CategoryId,
    options: { applyToMerchant: boolean; merchantKey?: string },
  ) => void;
  removeRule: (ruleId: string) => void;
  setBudgetLimit: (categoryId: CategoryId, monthlyLimit: number) => void;
  removeBudget: (categoryId: CategoryId) => void;
};

type Stored = {
  userRules?: unknown;
  categoryOverrides?: unknown;
  overrideMerchants?: unknown;
  budgets?: unknown;
  customCategories?: unknown;
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

function sanitizeCustomCategories(value: unknown): Category[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: Category[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<Category>;
    if (!isCustomCategoryId(raw.id) || seen.has(raw.id)) continue;
    const label = typeof raw.label === 'string' ? cleanCategoryLabel(raw.label) : '';
    if (!label) continue;
    const icon = isCategoryIconName(raw.icon) ? raw.icon : 'Tag';
    const fallback = CUSTOM_CATEGORY_COLORS[0] ?? { dark: '#9A9AA8', light: '#6B6B78' };
    const dark = typeof raw.color?.dark === 'string' && HEX_RE.test(raw.color.dark) ? raw.color.dark : fallback.dark;
    const light = typeof raw.color?.light === 'string' && HEX_RE.test(raw.color.light) ? raw.color.light : fallback.light;
    seen.add(raw.id);
    out.push({ id: raw.id, label, icon, color: { dark, light }, custom: true });
  }
  return out;
}

/** Keeps built-in ids and custom ids that still exist. */
function knownId(id: CategoryId, customIds: ReadonlySet<string>): boolean {
  return isBuiltinCategoryId(id) || customIds.has(id);
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
      customCategories: [],
      createCategory(input) {
        const label = cleanCategoryLabel(input.label);
        if (!label) return null;
        let created: CustomCategoryId | null = null;
        set((state) => {
          const taken = new Set(state.customCategories.map((category) => category.id));
          const id = newCustomCategoryId(label, taken);
          created = id;
          return {
            customCategories: [
              ...state.customCategories,
              { id, label, icon: input.icon, color: { ...input.color }, custom: true },
            ],
          };
        });
        return created;
      },
      updateCategory(id, patch) {
        set((state) => ({
          customCategories: state.customCategories.map((category) => {
            if (category.id !== id) return category;
            const label = patch.label != null ? cleanCategoryLabel(patch.label) : category.label;
            return {
              ...category,
              label: label || category.label,
              icon: patch.icon ?? category.icon,
              color: patch.color ? { ...patch.color } : category.color,
            };
          }),
        }));
      },
      deleteCategory(id) {
        set((state) => {
          const categoryOverrides: Record<string, CategoryId> = {};
          const overrideMerchants = { ...state.overrideMerchants };
          for (const [txId, categoryId] of Object.entries(state.categoryOverrides)) {
            if (categoryId === id) delete overrideMerchants[txId];
            else categoryOverrides[txId] = categoryId;
          }
          return {
            customCategories: state.customCategories.filter((category) => category.id !== id),
            userRules: state.userRules.filter((rule) => rule.categoryId !== id),
            categoryOverrides,
            overrideMerchants,
            budgets: state.budgets.filter((budget) => budget.categoryId !== id),
          };
        });
      },
      clearCategoryForTransaction(txId) {
        set((state) => {
          if (!(txId in state.categoryOverrides)) return {};
          const categoryOverrides = { ...state.categoryOverrides };
          const overrideMerchants = { ...state.overrideMerchants };
          delete categoryOverrides[txId];
          delete overrideMerchants[txId];
          return { categoryOverrides, overrideMerchants };
        });
      },
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
      removeBudget(categoryId) {
        set((state) => ({
          budgets: state.budgets.filter((budget) => budget.categoryId !== categoryId),
        }));
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
        customCategories: state.customCategories,
      }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Stored;
        const customCategories = sanitizeCustomCategories(stored.customCategories) ?? current.customCategories;
        const customIds = new Set<string>(customCategories.map((category) => category.id));
        const userRules = (sanitizeRules(stored.userRules) ?? current.userRules).filter((rule) =>
          knownId(rule.categoryId, customIds),
        );
        const overrides = sanitizeOverrides(stored.categoryOverrides) ?? current.categoryOverrides;
        const categoryOverrides = Object.fromEntries(
          Object.entries(overrides).filter(([, id]) => knownId(id, customIds)),
        ) as Record<string, CategoryId>;
        const budgets = (sanitizeBudgets(stored.budgets) ?? current.budgets).filter((budget) =>
          knownId(budget.categoryId, customIds),
        );
        return {
          ...current,
          customCategories,
          userRules,
          categoryOverrides,
          overrideMerchants: sanitizeMerchants(stored.overrideMerchants) ?? current.overrideMerchants,
          budgets,
        };
      },
    },
  ),
);
