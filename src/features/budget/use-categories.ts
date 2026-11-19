import { useMemo } from 'react';

import { CATEGORIES, resolveCategory, type Category, type CategoryId } from './model';
import { useBudgetStore } from './store';

/** Categories Andrei created, in creation order. */
export function useCustomCategories(): Category[] {
  return useBudgetStore((state) => state.customCategories);
}

/** Built-ins first, then custom categories. */
export function useAllCategories(): Category[] {
  const custom = useCustomCategories();
  return useMemo(() => [...CATEGORIES, ...custom], [custom]);
}

/** Stable lookup that resolves custom ids and falls back to “Altro”. */
export function useCategoryResolver(): (id: CategoryId | undefined) => Category {
  const custom = useCustomCategories();
  return useMemo(() => (id: CategoryId | undefined) => resolveCategory(id, custom), [custom]);
}

export function useCategory(id: CategoryId | undefined): Category {
  const custom = useCustomCategories();
  return useMemo(() => resolveCategory(id, custom), [id, custom]);
}
