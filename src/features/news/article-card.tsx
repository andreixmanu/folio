import { View } from 'react-native';

import { AppText, IslandCard } from '@/components/ui';
import { formatRelativeTime } from '@/lib/format';
import type { NewsArticle } from '@/services/types';
import { useTheme } from '@/theme';

const CATEGORY_LABEL = { markets: 'Mercati', crypto: 'Crypto' } as const;

export function ArticleCard({
  article,
  index,
  onPress,
}: {
  article: NewsArticle;
  index: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tint = article.category === 'crypto' ? theme.colors.assetClass.crypto : theme.colors.accent;
  return (
    <IslandCard index={index} onPress={onPress} accessibilityLabel={article.title} testID={`article-${article.id}`}>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: theme.radii.pill,
              backgroundColor: `${tint}24`,
            }}>
            <AppText variant="micro" style={{ color: tint }}>
              {CATEGORY_LABEL[article.category].toUpperCase()}
            </AppText>
          </View>
          <AppText variant="caption" color="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
            {article.source} · {formatRelativeTime(article.publishedAt)}
          </AppText>
        </View>
        <AppText variant="headline">{article.title}</AppText>
        <AppText variant="callout" color="textSecondary" numberOfLines={2}>
          {article.summary}
        </AppText>
      </View>
    </IslandCard>
  );
}
