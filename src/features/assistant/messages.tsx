import { useEffect, useRef } from 'react';
import { FlatList, Platform, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText, PressableScale } from '@/components/ui';
import type { ChatMessage } from '@/services/chat/store';
import { enterFade, useTheme } from '@/theme';

import { domainOf, openExternalUrl } from './links';
import { MarkdownView } from './markdown';
import { TypingIndicator } from './typing-indicator';

function SourceChips({ sources }: { sources: { title: string; url: string }[] }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
      {sources.map((source) => {
        const domain = domainOf(source.url);
        return (
          <PressableScale
            key={source.url}
            accessibilityLabel={source.title || domain}
            haptic="selection"
            onPress={() => openExternalUrl(source.url)}
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.surfaceMuted,
            }}>
            <AppText variant="micro" color="textSecondary">
              {domain}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

function MessageRow({
  message,
  typing,
  onRetry,
}: {
  message: ChatMessage;
  typing: boolean;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const isUser = message.role === 'user';
  const hasBody = message.content.trim().length > 0;
  const hasSources = (message.sources?.length ?? 0) > 0;
  if (!isUser && !hasBody && !typing && !message.error && !hasSources) return null;

  if (isUser) {
    return (
      <Animated.View entering={enterFade(0)} style={{ alignItems: 'flex-end' }}>
        <View
          style={{
            maxWidth: '86%',
            backgroundColor: theme.colors.accentMuted,
            borderRadius: theme.radii.lg,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
          }}>
          <AppText variant="callout" selectable>
            {message.content}
          </AppText>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={enterFade(0)}>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.xl,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
        }}>
        {hasBody ? <MarkdownView source={message.content} /> : null}
        {typing ? <TypingIndicator /> : null}
        {hasSources && message.sources ? <SourceChips sources={message.sources} /> : null}
        {message.error ? (
          <View style={{ marginTop: hasBody || hasSources ? theme.spacing.sm : 0, gap: theme.spacing.xs }}>
            <AppText variant="caption" color="negative" accessibilityLiveRegion="polite">
              {message.error.message}
            </AppText>
            <PressableScale
              onPress={onRetry}
              accessibilityLabel="Riprova"
              haptic="selection"
              style={{ alignSelf: 'flex-start' }}>
              <AppText variant="label" color="accent">
                Riprova
              </AppText>
            </PressableScale>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

export function MessageList({
  messages,
  typingId,
  onRetry,
  keyboardVisible = false,
  keyboardHeight = 0,
}: {
  messages: ChatMessage[];
  typingId?: string;
  onRetry: () => void;
  /** When the keyboard opens or its overlap changes, keep the latest message in view. */
  keyboardVisible?: boolean;
  keyboardHeight?: number;
}) {
  const theme = useTheme();
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages, typingId]);

  useEffect(() => {
    if (!keyboardVisible) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [keyboardVisible, keyboardHeight]);

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.sm }}
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      onLayout={() => {
        if (keyboardVisible) listRef.current?.scrollToEnd({ animated: true });
      }}
      renderItem={({ item }) => (
        <MessageRow message={item} typing={item.id === typingId} onRetry={onRetry} />
      )}
    />
  );
}
