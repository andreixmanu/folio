import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Icon, PressableScale } from '@/components/ui';
import { Check } from '@/components/ui/icons';
import { useTheme } from '@/theme';

import { CATEGORIES, type CategoryId } from '../model';

import { CategoryBadge } from './category-badge';

export type CategoryApplyOptions = {
  applyToMerchant: boolean;
};

/**
 * Slide-up sheet. Single mode saves one category and can store a merchant rule.
 * Multi mode is the list filter: Azzera clears, Applica commits the selection.
 */
export function CategoryPickerSheet({
  mode,
  selected,
  onApply,
  onClose,
  showMerchantSwitch = false,
  merchantSwitchDisabled = false,
}: {
  mode: 'multi' | 'single';
  selected: CategoryId[];
  onApply: (ids: CategoryId[], options: CategoryApplyOptions) => void;
  onClose: () => void;
  showMerchantSwitch?: boolean;
  merchantSwitchDisabled?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
          <AppText variant="headline" accessibilityRole="header">
            {mode === 'single' ? 'Categoria' : 'Categorie'}
          </AppText>
          <ScrollView
            style={{ maxHeight: 420 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {CATEGORIES.map((category) => {
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
          </ScrollView>
          {mode === 'single' && showMerchantSwitch ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                opacity: merchantSwitchDisabled ? 0.4 : 1,
              }}>
              <AppText variant="body" style={{ flex: 1 }}>
                Applica sempre a questo esercente
              </AppText>
              <Switch
                testID="apply-to-merchant"
                value={applyToMerchant}
                onValueChange={setApplyToMerchant}
                disabled={merchantSwitchDisabled}
                trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.accent }}
                thumbColor={theme.colors.surface}
                accessibilityLabel="Applica sempre a questo esercente"
              />
            </View>
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
        </View>
      </View>
    </Modal>
  );
}
