import Ionicons from '@expo/vector-icons/Ionicons';
import { TextInput, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { useTheme } from '@/theme';

const MAX_INPUT_HEIGHT = 20 * 5;

export function Composer({
  value,
  onChangeText,
  streaming,
  onSend,
  onStop,
}: {
  value: string;
  onChangeText: (text: string) => void;
  streaming: boolean;
  onSend: () => void;
  onStop: () => void;
}) {
  const theme = useTheme();
  const canSend = value.trim().length > 0;
  const active = streaming || canSend;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: theme.spacing.sm,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.xl,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingLeft: theme.spacing.md,
          paddingRight: theme.spacing.xs,
          paddingVertical: theme.spacing.xs,
        },
        theme.elevation(2),
      ]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Chiedi dei mercati…"
        placeholderTextColor={theme.colors.textTertiary}
        multiline
        testID="chat-input"
        accessibilityLabel="Messaggio"
        selectionColor={theme.colors.accent}
        cursorColor={theme.colors.accent}
        style={{
          flex: 1,
          maxHeight: MAX_INPUT_HEIGHT,
          margin: 0,
          paddingVertical: theme.spacing.sm,
          color: theme.colors.text,
          fontFamily: theme.fonts.medium,
          fontSize: 15,
          lineHeight: 20,
          textAlignVertical: 'top',
        }}
      />
      <PressableScale
        testID={streaming ? 'chat-stop' : 'chat-send'}
        accessibilityLabel={streaming ? 'Interrompi' : 'Invia'}
        accessibilityState={{ disabled: !streaming && !canSend }}
        disabled={!streaming && !canSend}
        haptic="selection"
        onPress={streaming ? onStop : onSend}
        style={{
          width: 36,
          height: 36,
          marginBottom: 2,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? theme.colors.accent : theme.colors.surfaceMuted,
        }}>
        <Ionicons
          name={streaming ? 'stop' : 'arrow-up'}
          size={18}
          color={active ? theme.colors.onAccent : theme.colors.textSecondary}
        />
      </PressableScale>
    </View>
  );
}
