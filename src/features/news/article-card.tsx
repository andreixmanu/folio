import { View } from 'react-native';

import { AppText, PressableScale } from '@/components/ui';
import { formatRelativeTime } from '@/lib/format';
import type { NewsArticle } from '@/services/types';
import { useTheme } from '@/theme';

const CATEGORY_LABEL = { markets: 'Mercati', crypto: 'Crypto' } as const;

/** Dense news row used inside a single grouped island. */
export function ArticleRow({ article, onPress }: { article: NewsArticle; onPress: () => void }) {
  const theme = useTheme();
  const tint = article.category === 'crypto' ? theme.colors.assetClass.crypto : theme.colors.accent;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={article.title}
      testID={`article-${article.id}`}
      style={{ paddingVertical: theme.spacing.md, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} />
        <AppText variant="micro" style={{ color: tint }}>
          {CATEGORY_LABEL[article.category].toUpperCase()}
        </AppText>
        <AppText variant="micro" color="textTertiary" style={{ flex: 1 }} numberOfLines={1}>
          {article.source} · {formatRelativeTime(article.publishedAt)}
        </AppText>
      </View>
      <AppText variant="bodyStrong" numberOfLines={2}>
        {article.title}
      </AppText>
      <AppText variant="caption" color="textSecondary" numberOfLines={1}>
        {article.summary}
      </AppText>
    </PressableScale>
  );
}
