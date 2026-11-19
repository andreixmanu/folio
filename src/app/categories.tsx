import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  AppText,
  Icon,
  IconButton,
  IslandCard,
  ListRow,
  PressableScale,
  RowSeparator,
  Screen,
  ScreenHeader,
  SectionTitle,
} from '@/components/ui';
import { ChevronLeft, Plus, X } from '@/components/ui/icons';
import { CategoryBadge } from '@/features/budget/components';
import { CategoryEditorSheet } from '@/features/budget/components/category-editor';
import { useCategorizedTransactions } from '@/features/budget/hooks';
import { displayMerchant } from '@/features/budget/merchant';
import { CATEGORIES, type Category, type CustomCategoryId } from '@/features/budget/model';
import { useBudgetStore } from '@/features/budget/store';
import { useAllCategories, useCategoryResolver, useCustomCategories } from '@/features/budget/use-categories';
import { useSyncMode } from '@/store/use-sync-mode';
import { useTheme } from '@/theme';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/budgets');
}

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

type Editing = { mode: 'create' } | { mode: 'edit'; category: Category };

/**
 * Category management, reached from Budget → Categorie → Gestisci.
 * Custom categories can be created, renamed, recoloured and deleted;
 * merchant rules (“movimenti simili”) are listed and can be removed.
 */
export default function CategoriesScreen() {
  const theme = useTheme();
  useSyncMode('budget');
  const custom = useCustomCategories();
  const all = useAllCategories();
  const resolve = useCategoryResolver();
  const userRules = useBudgetStore((state) => state.userRules);
  const createCategory = useBudgetStore((state) => state.createCategory);
  const updateCategory = useBudgetStore((state) => state.updateCategory);
  const deleteCategory = useBudgetStore((state) => state.deleteCategory);
  const removeRule = useBudgetStore((state) => state.removeRule);
  const transactions = useCategorizedTransactions().data;
  const [editing, setEditing] = useState<Editing | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactions ?? []) {
      const id = tx.categoryId ?? 'other';
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [transactions]);

  const rulesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const rule of userRules) map.set(rule.categoryId, (map.get(rule.categoryId) ?? 0) + 1);
    return map;
  }, [userRules]);

  const takenLabels = (except?: string) =>
    all.filter((category) => category.id !== except).map((category) => category.label);

  const rules = [...userRules].sort((a, b) => a.merchantKey.localeCompare(b.merchantKey));

  return (
    <Screen testID="budget-categories-screen">
      <IconButton icon={ChevronLeft} accessibilityLabel="Indietro" onPress={goBack} />
      <ScreenHeader title="Categorie" />

      <IslandCard index={0} testID="custom-categories">
        <SectionTitle title="Le tue categorie" />
        {custom.length === 0 ? (
          <AppText variant="caption" color="textSecondary" style={{ marginBottom: theme.spacing.sm }}>
            Crea categorie tue, per esempio Regali o Auto, e assegnale ai movimenti.
          </AppText>
        ) : null}
        {custom.map((category, index) => {
          const txCount = counts.get(category.id) ?? 0;
          const ruleCount = rulesByCategory.get(category.id) ?? 0;
          const subtitle = [
            countLabel(txCount, 'movimento', 'movimenti'),
            ruleCount > 0 ? countLabel(ruleCount, 'regola', 'regole') : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={category.id}>
              {index > 0 ? <RowSeparator /> : null}
              <ListRow
                leading={<CategoryBadge categoryId={category.id} />}
                title={category.label}
                subtitle={subtitle}
                showChevron
                onPress={() => setEditing({ mode: 'edit', category })}
                testID={`custom-category-${category.id}`}
              />
            </View>
          );
        })}
        {custom.length > 0 ? <RowSeparator /> : null}
        <PressableScale
          haptic="selection"
          testID="category-create"
          onPress={() => setEditing({ mode: 'create' })}
          accessibilityLabel="Nuova categoria">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 52 }}>
            <Icon icon={Plus} size={18} color={theme.colors.accent} />
            <AppText variant="bodyStrong" color="accent">
              Nuova categoria
            </AppText>
          </View>
        </PressableScale>
      </IslandCard>

      <IslandCard index={1} testID="category-rules">
        <SectionTitle title="Movimenti simili" />
        {rules.length === 0 ? (
          <AppText variant="caption" color="textSecondary">
            Nessuna regola. Nel dettaglio di un movimento scegli la categoria e attiva “Applica ai movimenti
            simili”.
          </AppText>
        ) : (
          rules.map((rule, index) => {
            const category = resolve(rule.categoryId);
            return (
              <View key={rule.id}>
                {index > 0 ? <RowSeparator /> : null}
                <View
                  testID={`rule-${rule.id}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 52 }}>
                  <CategoryBadge categoryId={category.id} size={32} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {displayMerchant(rule.merchantKey) || rule.merchantKey}
                    </AppText>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                      {category.label}
                    </AppText>
                  </View>
                  <PressableScale
                    haptic="selection"
                    onPress={() => removeRule(rule.id)}
                    testID={`rule-remove-${rule.id}`}
                    accessibilityLabel={`Rimuovi regola ${displayMerchant(rule.merchantKey)}`}
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon icon={X} size={18} color={theme.colors.textTertiary} />
                  </PressableScale>
                </View>
              </View>
            );
          })
        )}
      </IslandCard>

      <IslandCard index={2} testID="builtin-categories">
        <SectionTitle title="Predefinite" />
        {CATEGORIES.map((category, index) => (
          <View key={category.id}>
            {index > 0 ? <RowSeparator /> : null}
            <ListRow
              leading={<CategoryBadge categoryId={category.id} size={32} />}
              title={category.label}
              subtitle={countLabel(counts.get(category.id) ?? 0, 'movimento', 'movimenti')}
              testID={`builtin-category-${category.id}`}
            />
          </View>
        ))}
      </IslandCard>

      {editing ? (
        <CategoryEditorSheet
          key={editing.mode === 'edit' ? editing.category.id : 'create'}
          initial={editing.mode === 'edit' ? editing.category : undefined}
          takenLabels={takenLabels(editing.mode === 'edit' ? editing.category.id : undefined)}
          onClose={() => setEditing(null)}
          onSubmit={(input) => {
            if (editing.mode === 'edit') updateCategory(editing.category.id as CustomCategoryId, input);
            else createCategory(input);
            setEditing(null);
          }}
          onDelete={
            editing.mode === 'edit'
              ? () => {
                  deleteCategory(editing.category.id as CustomCategoryId);
                  setEditing(null);
                }
              : undefined
          }
        />
      ) : null}
    </Screen>
  );
}
