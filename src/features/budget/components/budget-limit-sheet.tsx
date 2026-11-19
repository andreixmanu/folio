import { useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PressableScale } from '@/components/ui';
import { useTheme } from '@/theme';

import { type CategoryId } from '../model';
import { useCategoryResolver } from '../use-categories';

import { CategoryBadge } from './category-badge';

const STEP = 10;

export function parseLimitInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function formatLimitInput(amount: number): string {
  const [whole, frac] = (Math.round(amount * 100) / 100).toFixed(2).split('.');
  if (!whole) return '0';
  if (!frac || frac === '00') return whole;
  return `${whole},${frac}`;
}

export function BudgetLimitSheet({
  categoryId,
  availableCategoryIds,
  initialAmount,
  hasBudget,
  onPickCategory,
  onSave,
  onRemove,
  onClose,
}: {
  categoryId: CategoryId | null;
  availableCategoryIds: readonly CategoryId[];
  initialAmount: number | null;
  hasBudget: boolean;
  onPickCategory: (categoryId: CategoryId) => void;
  onSave: (amount: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [raw, setRaw] = useState(initialAmount == null ? '' : formatLimitInput(initialAmount));
  const parsed = parseLimitInput(raw);
  const saveDisabled = parsed == null;
  const resolve = useCategoryResolver();
  const category = categoryId ? resolve(categoryId) : null;

  const step = (delta: number) => {
    const current = parsed ?? 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    setRaw(formatLimitInput(next));
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Chiudi"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        />
        <View
          style={[
            {
              maxHeight: '88%',
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radii.xl,
              borderTopRightRadius: theme.radii.xl,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.sm,
              paddingBottom: insets.bottom + theme.spacing.lg,
              gap: theme.spacing.md,
            },
            theme.elevation(3),
          ]}>
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.border,
            }}
          />
          {category && categoryId ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <CategoryBadge categoryId={categoryId} size={36} />
              <AppText variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
                {category.label}
              </AppText>
            </View>
          ) : (
            <AppText variant="headline" accessibilityRole="header">
              Aggiungi budget
            </AppText>
          )}

          {categoryId == null ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 420 }}>
              {availableCategoryIds.map((id) => {
                const item = resolve(id);
                return (
                  <PressableScale
                    key={id}
                    haptic="selection"
                    onPress={() => onPickCategory(id)}
                    testID={`limit-cat-${id}`}
                    accessibilityLabel={item.label}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        minHeight: 52,
                        paddingVertical: theme.spacing.sm,
                      }}>
                      <CategoryBadge categoryId={id} size={32} />
                      <AppText variant="body" style={{ flex: 1 }}>
                        {item.label}
                      </AppText>
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>
          ) : (
            <>
              <AppText variant="caption" color="textSecondary">
                Limite mensile
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <PressableScale
                  haptic="selection"
                  testID="limit-minus"
                  onPress={() => step(-STEP)}
                  accessibilityLabel="Diminuisci di 10 euro"
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radii.pill,
                    backgroundColor: theme.colors.surfaceMuted,
                  }}>
                  <AppText variant="title">−</AppText>
                </PressableScale>
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    minHeight: 56,
                    paddingHorizontal: theme.spacing.md,
                    borderRadius: theme.radii.lg,
                    backgroundColor: theme.colors.surfaceMuted,
                  }}>
                  <TextInput
                    testID="limit-input"
                    keyboardType="decimal-pad"
                    value={raw}
                    onChangeText={setRaw}
                    placeholder="0"
                    placeholderTextColor={theme.colors.textTertiary}
                    accessibilityLabel="Limite mensile"
                    style={{
                      flex: 1,
                      fontSize: 28,
                      fontWeight: '600',
                      color: theme.colors.text,
                      paddingVertical: theme.spacing.sm,
                    }}
                  />
                  <AppText variant="bodyStrong" color="textSecondary">
                    €
                  </AppText>
                </View>
                <PressableScale
                  haptic="selection"
                  testID="limit-plus"
                  onPress={() => step(STEP)}
                  accessibilityLabel="Aumenta di 10 euro"
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radii.pill,
                    backgroundColor: theme.colors.surfaceMuted,
                  }}>
                  <AppText variant="title">+</AppText>
                </PressableScale>
              </View>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                {hasBudget ? (
                  <PressableScale
                    haptic="selection"
                    testID="limit-remove"
                    onPress={onRemove}
                    accessibilityLabel="Rimuovi"
                    style={{
                      flex: 1,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: theme.radii.pill,
                      backgroundColor: theme.colors.surfaceMuted,
                    }}>
                    <AppText variant="bodyStrong" color="negative">
                      Rimuovi
                    </AppText>
                  </PressableScale>
                ) : null}
                <PressableScale
                  haptic="selection"
                  testID="limit-save"
                  disabled={saveDisabled}
                  onPress={() => {
                    if (parsed == null) return;
                    onSave(parsed);
                  }}
                  accessibilityLabel="Salva"
                  style={{
                    flex: 1,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radii.pill,
                    backgroundColor: theme.colors.accent,
                    opacity: saveDisabled ? 0.4 : 1,
                  }}>
                  <AppText variant="bodyStrong" color="onAccent">
                    Salva
                  </AppText>
                </PressableScale>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
