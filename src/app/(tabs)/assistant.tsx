import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, IconButton, ScreenHeader } from '@/components/ui';
import { Composer } from '@/features/assistant/composer';
import { MessageList } from '@/features/assistant/messages';
import { Suggestions } from '@/features/assistant/suggestions';
import { useKeyboardVisible } from '@/lib/use-keyboard-visible';
import { rememberPortfolio, useChatStore } from '@/services/chat/store';
import { usePortfolio } from '@/services/hooks';
import { useTheme } from '@/theme';

export default function AssistantScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
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

  // While the keyboard is open the tab bar is covered (iOS) or hidden (Android, where
  // the window resizes). A small gap is enough; the full clearance would sit empty
  // above the composer. Web has no overlay keyboard, so it keeps the clearance.
  const tabClearance = insets.bottom + theme.layout.tabBarHeight + theme.layout.tabBarBottomGap;
  const bottomGap = keyboardVisible && Platform.OS !== 'web' ? theme.spacing.sm : tabClearance;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="assistant-screen">
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
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1 }}>
              <Suggestions onSelect={submit} />
            </ScrollView>
          ) : (
            <MessageList
              messages={messages}
              typingId={typingId}
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
        <AppText
          variant="micro"
          color="textTertiary"
          align="center"
          style={{ marginTop: theme.spacing.xs }}>
          Non è consulenza finanziaria.
        </AppText>
        <View style={{ height: bottomGap }} />
      </View>
    </KeyboardAvoidingView>
  );
}
