import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { AppText, Icon, IconBadge, PressableScale } from '@/components/ui';
import { Check } from '@/components/ui/icons';
import { useKeyboardInset } from '@/lib/use-keyboard-visible';
import { useTheme } from '@/theme';

import {
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_ICONS,
  type Category,
  type CategoryIconName,
} from '../model';
import { CUSTOM_LABEL_MAX, cleanCategoryLabel, type CustomCategoryInput } from '../store';

import { categoryIcon } from './category-badge';

export type CategoryFormValues = {
  label: string;
  icon: CategoryIconName;
  colorIndex: number;
};

/** Name is required, at most 32 characters, and unique among all categories (case-insensitive). */
export function categoryFormSchema(takenLabels: readonly string[]) {
  const taken = new Set(takenLabels.map((label) => cleanCategoryLabel(label).toLowerCase()));
  return z.object({
    label: z
      .string()
      .transform(cleanCategoryLabel)
      .pipe(
        z
          .string()
          .min(1, 'Scrivi un nome')
          .max(CUSTOM_LABEL_MAX, `Massimo ${CUSTOM_LABEL_MAX} caratteri`)
          .refine((label) => !taken.has(label.toLowerCase()), 'Esiste già una categoria con questo nome'),
      ),
    icon: z.enum(CUSTOM_CATEGORY_ICONS as unknown as [CategoryIconName, ...CategoryIconName[]]),
    colorIndex: z
      .number()
      .int()
      .min(0)
      .max(CUSTOM_CATEGORY_COLORS.length - 1),
  });
}

function colorIndexOf(color: Category['color'] | undefined): number {
  if (!color) return 0;
  const index = CUSTOM_CATEGORY_COLORS.findIndex(
    (item) => item.dark.toLowerCase() === color.dark.toLowerCase(),
  );
  return index >= 0 ? index : 0;
}

export function toCategoryInput(values: CategoryFormValues): CustomCategoryInput {
  const color = CUSTOM_CATEGORY_COLORS[values.colorIndex] ?? CUSTOM_CATEGORY_COLORS[0];
  return {
    label: cleanCategoryLabel(values.label),
    icon: values.icon,
    color: color ? { ...color } : { dark: '#9A9AA8', light: '#6B6B78' },
  };
}

function SheetButton({
  label,
  onPress,
  tone,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone: 'accent' | 'muted' | 'danger';
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      haptic="selection"
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radii.pill,
        backgroundColor: tone === 'accent' ? theme.colors.accent : theme.colors.surfaceMuted,
        opacity: disabled ? 0.4 : 1,
      }}>
      <AppText
        variant="bodyStrong"
        color={tone === 'accent' ? 'onAccent' : tone === 'danger' ? 'negative' : 'text'}>
        {label}
      </AppText>
    </PressableScale>
  );
}

/**
 * Name, icon and colour for a custom category. Live preview on top.
 * Used inside the editor sheet and inline in the category picker.
 */
export function CategoryEditorForm({
  initial,
  takenLabels,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: Category;
  /** Labels already in use, excluding the category being edited. */
  takenLabels: readonly string[];
  submitLabel: string;
  onSubmit: (input: CustomCategoryInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const theme = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { control, handleSubmit, formState } = useForm<CategoryFormValues>({
    defaultValues: {
      label: initial?.label ?? '',
      icon: initial?.icon && (CUSTOM_CATEGORY_ICONS as readonly string[]).includes(initial.icon) ? initial.icon : 'Tag',
      colorIndex: colorIndexOf(initial?.color),
    },
    resolver: zodResolver(categoryFormSchema(takenLabels)) as never,
    mode: 'onChange',
  });
  const icon = useWatch({ control, name: 'icon' });
  const colorIndex = useWatch({ control, name: 'colorIndex' });
  const label = useWatch({ control, name: 'label' });
  const color = CUSTOM_CATEGORY_COLORS[colorIndex] ?? CUSTOM_CATEGORY_COLORS[0];
  const swatch = color ? color[theme.scheme] : theme.colors.textTertiary;
  const error = formState.errors.label?.message;
  const submit = handleSubmit((values) => onSubmit(toCategoryInput(values)));

  return (
    <View style={{ gap: theme.spacing.md }} testID="category-editor">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <IconBadge icon={categoryIcon(icon)} color={swatch} size={44} />
        <AppText variant="headline" numberOfLines={1} style={{ flex: 1 }}>
          {cleanCategoryLabel(label) || 'Nuova categoria'}
        </AppText>
      </View>

      <View style={{ gap: 4 }}>
        <Controller
          control={control}
          name="label"
          render={({ field }) => (
            <TextInput
              testID="category-name-input"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="Nome, per esempio Regali"
              placeholderTextColor={theme.colors.textTertiary}
              maxLength={CUSTOM_LABEL_MAX + 8}
              autoFocus={!initial}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              accessibilityLabel="Nome categoria"
              style={{
                minHeight: 48,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radii.lg,
                backgroundColor: theme.colors.surfaceMuted,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />
          )}
        />
        {error ? (
          <AppText variant="caption" color="negative" testID="category-name-error">
            {error}
          </AppText>
        ) : null}
      </View>

      <AppText variant="caption" color="textSecondary">
        Icona
      </AppText>
      <Controller
        control={control}
        name="icon"
        render={({ field }) => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {CUSTOM_CATEGORY_ICONS.map((name) => {
              const on = field.value === name;
              return (
                <PressableScale
                  key={name}
                  haptic="selection"
                  onPress={() => field.onChange(name)}
                  testID={`category-icon-${name}`}
                  accessibilityLabel={`Icona ${name}`}
                  accessibilityState={{ selected: on }}
                  style={{
                    width: 40,
                    height: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderColor: on ? swatch : theme.colors.border,
                    backgroundColor: on ? theme.colors.surfaceMuted : 'transparent',
                  }}>
                  <Icon icon={categoryIcon(name)} size={18} color={on ? swatch : theme.colors.textSecondary} />
                </PressableScale>
              );
            })}
          </View>
        )}
      />

      <AppText variant="caption" color="textSecondary">
        Colore
      </AppText>
      <Controller
        control={control}
        name="colorIndex"
        render={({ field }) => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CUSTOM_CATEGORY_COLORS.map((item, index) => {
              const on = field.value === index;
              return (
                <PressableScale
                  key={item.dark}
                  haptic="selection"
                  onPress={() => field.onChange(index)}
                  testID={`category-color-${index}`}
                  accessibilityLabel={`Colore ${index + 1}`}
                  accessibilityState={{ selected: on }}
                  style={{
                    width: 32,
                    height: 32,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radii.pill,
                    backgroundColor: item[theme.scheme],
                    borderWidth: on ? 2 : 0,
                    borderColor: theme.colors.text,
                  }}>
                  {on ? <Icon icon={Check} size={14} color="#FFFFFF" /> : null}
                </PressableScale>
              );
            })}
          </View>
        )}
      />

      {onDelete ? (
        <PressableScale
          haptic="selection"
          testID={confirmDelete ? 'category-delete-confirm' : 'category-delete'}
          onPress={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          accessibilityLabel={confirmDelete ? 'Conferma eliminazione' : 'Elimina categoria'}>
          <View style={{ minHeight: 40, justifyContent: 'center', gap: 2 }}>
            <AppText variant="bodyStrong" color="negative">
              {confirmDelete ? 'Tocca di nuovo per eliminare' : 'Elimina categoria'}
            </AppText>
            {confirmDelete ? (
              <AppText variant="caption" color="textSecondary">
                I movimenti tornano alla categoria automatica
              </AppText>
            ) : null}
          </View>
        </PressableScale>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <SheetButton label="Annulla" tone="muted" onPress={onCancel} testID="category-editor-cancel" />
        <SheetButton
          label={submitLabel}
          tone="accent"
          disabled={!cleanCategoryLabel(label) || error != null}
          onPress={() => void submit()}
          testID="category-editor-save"
        />
      </View>
    </View>
  );
}

/** Bottom sheet around {@link CategoryEditorForm}, padded above the keyboard. */
export function CategoryEditorSheet({
  initial,
  takenLabels,
  onSubmit,
  onDelete,
  onClose,
}: {
  initial?: Category;
  takenLabels: readonly string[];
  onSubmit: (input: CustomCategoryInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Chiudi"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
        />
        <View
          style={[
            {
              maxHeight: '92%',
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
            {initial ? 'Modifica categoria' : 'Nuova categoria'}
          </AppText>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <CategoryEditorForm
              initial={initial}
              takenLabels={takenLabels}
              submitLabel={initial ? 'Salva' : 'Crea'}
              onSubmit={onSubmit}
              onCancel={onClose}
              onDelete={onDelete}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
