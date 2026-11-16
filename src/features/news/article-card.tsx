import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, PressableScale } from '@/components/ui';
import { formatRelativeTimeIt } from '@/lib/format';
import type { NewsArticle } from '@/services/types';
import { useTheme } from '@/theme';

/** Dense news row used inside a single grouped island. */
export function ArticleRow({ article, onPress }: { article: NewsArticle; onPress: () => void }) {
  const theme = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = !imageFailed ? article.imageUrl : undefined;

  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      accessibilityLabel={article.title}
      testID={`article-${article.id}`}
      style={{ paddingVertical: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="caption" color="textTertiary" numberOfLines={1}>
            {article.source} · {formatRelativeTimeIt(article.publishedAt)}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {article.title}
          </AppText>
          {article.summary ? (
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {article.summary}
            </AppText>
          ) : null}
        </View>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: 56, height: 56, borderRadius: theme.radii.sm, backgroundColor: theme.colors.surfaceMuted }}
            contentFit="cover"
            transition={150}
            accessibilityIgnoresInvertColors
            onError={() => setImageFailed(true)}
            testID={`article-image-${article.id}`}
          />
        ) : null}
      </View>
    </PressableScale>
  );
}
