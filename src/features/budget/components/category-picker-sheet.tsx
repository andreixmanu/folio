import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Icon, PressableScale } from '@/components/ui';
import { Check, Plus } from '@/components/ui/icons';
import { useKeyboardInset } from '@/lib/use-keyboard-visible';
import { useTheme } from '@/theme';

import { type CategoryId } from '../model';
import { useBudgetStore } from '../store';
import { useAllCategories } from '../use-categories';

import { CategoryBadge } from './category-badge';
import { CategoryEditorForm } from './category-editor';

export type CategoryApplyOptions = {
  applyToMerchant: boolean;
};

/**
 * Slide-up sheet. Single mode saves one category and can store a merchant rule;
 * it can also create a custom category inline and reset a manual choice.
 * Multi mode is the list filter: Azzera clears, Applica commits the selection.
 */
export function CategoryPickerSheet({
  mode,
  selected,
  onApply,
  onClose,
  showMerchantSwitch = false,
  merchantSwitchDisabled = false,
  allowCreate = false,
  onReset,
}: {
  mode: 'multi' | 'single';
  selected: CategoryId[];
  onApply: (ids: CategoryId[], options: CategoryApplyOptions) => void;
  onClose: () => void;
  showMerchantSwitch?: boolean;
  merchantSwitchDisabled?: boolean;
  /** Single mode: show “Nuova categoria”, which opens the editor inside the sheet. */
  allowCreate?: boolean;
  /** Single mode: when set, “Torna automatica” drops the manual choice. */
  onReset?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const categories = useAllCategories();
  const createCategory = useBudgetStore((state) => state.createCategory);
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<CategoryId[]>(selected);
  const [applyToMerchant, setApplyToMerchant] = useState(false);
  const merchantRule = mode === 'single' && showMerchantSwitch && !merchantSwitchDisabled && applyToMerchant;
  const saveDisabled = mode === 'single' && picked.length === 0;

  const toggle = (id: CategoryId) => {
    setPicked((current) => {
      if (mode === 'single') return [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  };

  const commit = (ids: CategoryId[]) => {
    onApply(ids, { applyToMerchant: merchantRule });
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
              paddingBottom: (keyboard.visible ? keyboard.height : insets.bottom) + theme.spacing.lg,
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
          <AppText variant="headline" accessibilityRole="header">
            {creating ? 'Nuova categoria' : mode === 'single' ? 'Categoria' : 'Categorie'}
          </AppText>
          {creating ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <CategoryEditorForm
                takenLabels={categories.map((category) => category.label)}
                submitLabel="Crea"
                onCancel={() => setCreating(false)}
                onSubmit={(input) => {
                  const id = createCategory(input);
                  if (id) setPicked(mode === 'single' ? [id] : (current) => [...current, id]);
                  setCreating(false);
                }}
              />
            </ScrollView>
          ) : (
          <>
          <ScrollView
            style={{ maxHeight: 420 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {categories.map((category) => {
              const on = picked.includes(category.id);
              return (
                <View key={category.id} style={{ width: '50%', padding: 4 }}>
                  <PressableScale
                    haptic="selection"
                    onPress={() => toggle(category.id)}
                    testID={`category-option-${category.id}`}
                    accessibilityLabel={category.label}
                    accessibilityState={{ selected: on }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        minHeight: 48,
                        paddingHorizontal: theme.spacing.sm,
                        paddingVertical: theme.spacing.sm,
                        borderRadius: theme.radii.lg,
                        borderWidth: 1,
                        borderColor: on ? theme.colors.text : theme.colors.border,
                        backgroundColor: on ? theme.colors.surfaceMuted : theme.colors.background,
                      }}>
                      <CategoryBadge categoryId={category.id} size={28} />
                      <AppText variant="label" numberOfLines={2} style={{ flex: 1 }}>
                        {category.label}
                      </AppText>
                      {on ? <Icon icon={Check} size={16} color={theme.colors.text} /> : null}
                    </View>
                  </PressableScale>
                </View>
              );
            })}
            {allowCreate && mode === 'single' ? (
              <View style={{ width: '50%', padding: 4 }}>
                <PressableScale
                  haptic="selection"
                  onPress={() => setCreating(true)}
                  testID="category-option-new"
                  accessibilityLabel="Nuova categoria">
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      minHeight: 48,
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: theme.spacing.sm,
                      borderRadius: theme.radii.lg,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: theme.colors.border,
                    }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: theme.radii.md,
                        backgroundColor: theme.colors.surfaceMuted,
                      }}>
                      <Icon icon={Plus} size={16} color={theme.colors.accent} />
                    </View>
                    <AppText variant="label" color="accent" numberOfLines={2} style={{ flex: 1 }}>
                      Nuova categoria
                    </AppText>
                  </View>
                </PressableScale>
              </View>
            ) : null}
          </ScrollView>
          {mode === 'single' && showMerchantSwitch ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                opacity: merchantSwitchDisabled ? 0.4 : 1,
              }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="body">Applica ai movimenti simili</AppText>
                <AppText variant="caption" color="textTertiary">
                  Stesso esercente, anche per i movimenti futuri
                </AppText>
              </View>
              <Switch
                testID="apply-to-merchant"
                value={applyToMerchant}
                onValueChange={setApplyToMerchant}
                disabled={merchantSwitchDisabled}
                // Off state must read on the dark sheet: a visible grey track and a light thumb.
                trackColor={{ false: theme.colors.textTertiary, true: theme.colors.accent }}
                ios_backgroundColor={theme.colors.textTertiary}
                thumbColor={applyToMerchant ? '#FFFFFF' : theme.colors.textSecondary}
                accessibilityLabel="Applica ai movimenti simili"
              />
            </View>
          ) : null}
          {mode === 'single' && onReset ? (
            <PressableScale
              haptic="selection"
              testID="category-reset"
              onPress={onReset}
              accessibilityLabel="Torna alla categoria automatica">
              <View style={{ minHeight: 36, justifyContent: 'center' }}>
                <AppText variant="bodyStrong" color="textSecondary">
                  Torna alla categoria automatica
                </AppText>
              </View>
            </PressableScale>
          ) : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {mode === 'multi' ? (
              <PressableScale
                haptic="selection"
                onPress={() => commit([])}
                accessibilityLabel="Azzera"
                style={{
                  flex: 1,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radii.pill,
                  backgroundColor: theme.colors.surfaceMuted,
                }}>
                <AppText variant="bodyStrong">Azzera</AppText>
              </PressableScale>
            ) : null}
            <PressableScale
              haptic="selection"
              testID="category-sheet-apply"
              disabled={saveDisabled}
              onPress={() => commit(mode === 'single' ? picked.slice(0, 1) : picked)}
              accessibilityLabel={mode === 'single' ? 'Salva' : 'Applica'}
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
                {mode === 'single' ? 'Salva' : 'Applica'}
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
