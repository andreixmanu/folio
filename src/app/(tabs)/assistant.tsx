import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, IconButton, ScreenHeader } from '@/components/ui';
import { Composer } from '@/features/assistant/composer';
import { MessageList } from '@/features/assistant/messages';
import { Suggestions } from '@/features/assistant/suggestions';
import { useKeyboardInset } from '@/lib/use-keyboard-visible';
import { rememberPortfolio, useChatStore } from '@/services/chat/store';
import { usePortfolio } from '@/services/hooks';
import { easings, timings, useTheme } from '@/theme';

/**
 * Bottom spacer under the composer.
 *
 * iOS `keyboardWill*` fires before the keyboard moves and includes `duration`,
 * so the spacer tracks it with `withTiming` (ease from the motion tokens, no
 * spring). Android only emits `keyboardDid*` after the keyboard is already
 * covering the window — edge-to-edge does not resize — so a trailing
 * `timings.fade` tween would keep the composer hidden. The height is applied
 * on that commit instead.
 */
function AssistantBottomSpacer({ height, duration }: { height: number; duration: number }) {
  if (Platform.OS !== 'ios') {
    return <View testID="assistant-bottom-spacer" style={{ height }} />;
  }
  return <IosKeyboardSpacer height={height} duration={duration} />;
}

function IosKeyboardSpacer({ height, duration }: { height: number; duration: number }) {
  const animatedHeight = useSharedValue(height);

  useEffect(() => {
    animatedHeight.set(
      withTiming(height, {
        duration: duration > 0 ? duration : timings.fade.duration,
        easing: easings.standard,
      }),
    );
  }, [animatedHeight, duration, height]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: animatedHeight.get(),
  }));

  return <Animated.View testID="assistant-bottom-spacer" style={animatedStyle} />;
}

export default function AssistantScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const snapshot = usePortfolio().data;
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const newChat = useChatStore((s) => s.newChat);
  const retry = useChatStore((s) => s.retry);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    rememberPortfolio(snapshot);
  }, [snapshot]);

  const streaming = status === 'streaming';
  let typingId: string | undefined;
  if (streaming) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role !== 'assistant') continue;
      if (!message.content && !message.error) typingId = message.id;
      break;
    }
  }

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setDraft('');
    void send(trimmed, snapshot);
  };

  // Expo SDK 58 / RN 0.88 is edge-to-edge on Android, including Expo Go.
  // app.json does not set `softwareKeyboardLayoutMode`, and with edge-to-edge
  // the window is not resized for the keyboard (`adjustResize` has no effect).
  // KeyboardAvoidingView therefore cannot lift this screen. Pad by the measured
  // overlap instead. That overlap already covers the nav bar / home indicator,
  // so do not add `insets.bottom` again — unless the measured gap would be
  // smaller than the inset plus a little breathing room.
  const keyboardOpen = keyboard.visible && Platform.OS !== 'web';
  const tabClearance = insets.bottom + theme.layout.tabBarHeight + theme.layout.tabBarBottomGap;
  const bottomGap = keyboardOpen
    ? Math.max(keyboard.height + theme.spacing.sm, insets.bottom + theme.spacing.sm)
    : tabClearance;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID="assistant-screen">
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: theme.layout.maxContentWidth,
          alignSelf: 'center',
          paddingTop: insets.top + theme.spacing.xs,
          paddingHorizontal: theme.layout.screenPadding,
        }}>
        <ScreenHeader
          eyebrow="Mercati e portafoglio"
          title="Assistente"
          right={
            <IconButton
              name="create-outline"
              accessibilityLabel="Nuova chat"
              disabled={messages.length === 0}
              onPress={newChat}
            />
          }
        />
        <View style={{ flex: 1, marginTop: theme.spacing.sm }}>
          {messages.length === 0 ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1 }}>
              <Suggestions onSelect={submit} />
            </ScrollView>
          ) : (
            <MessageList
              messages={messages}
              typingId={typingId}
              keyboardVisible={keyboardOpen}
              keyboardHeight={keyboard.height}
              onRetry={() => {
                rememberPortfolio(snapshot);
                retry();
              }}
            />
          )}
        </View>
        <View style={{ marginTop: theme.spacing.sm }}>
          <Composer
            value={draft}
            onChangeText={setDraft}
            streaming={streaming}
            onSend={() => submit(draft)}
            onStop={stop}
          />
        </View>
        {keyboardOpen ? null : (
          <AppText
            variant="micro"
            color="textTertiary"
            align="center"
            style={{ marginTop: theme.spacing.xs }}>
            Non è consulenza finanziaria.
          </AppText>
        )}
        <AssistantBottomSpacer height={bottomGap} duration={keyboard.duration} />
      </View>
    </View>
  );
}
