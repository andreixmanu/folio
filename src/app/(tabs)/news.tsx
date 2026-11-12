import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  AppText,
  FilterChips,
  IslandCard,
  RowSeparator,
  Screen,
  ScreenHeader,
  Skeleton,
} from '@/components/ui';
import { ArticleRow } from '@/features/news/article-card';
import { useNews } from '@/services/hooks';
import { useUiStore, type NewsFilter } from '@/store/ui-store';
import { enterFade, useTheme } from '@/theme';

const FILTERS: { value: NewsFilter; label: string }[] = [
  { value: 'all', label: 'Tutte' },
  { value: 'markets', label: 'Mercati' },
  { value: 'crypto', label: 'Crypto' },
];

export default function NewsScreen() {
  const theme = useTheme();
  const filter = useUiStore((s) => s.newsFilter);
  const setFilter = useUiStore((s) => s.setNewsFilter);
  const news = useNews(filter);

  return (
    <Screen testID="news-screen" refreshing={news.isRefetching} onRefresh={() => void news.refetch()}>
      <ScreenHeader eyebrow="Mercati e crypto" title="Notizie" />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} testID="news-filter" />

      <IslandCard index={0} padding="lg" style={{ paddingVertical: theme.spacing.xs }}>
        {news.data ? (
          news.data.map((article, i) => (
            <Animated.View key={article.id} entering={enterFade(i)}>
              {i > 0 ? <RowSeparator inset={0} /> : null}
              <ArticleRow
                article={article}
                onPress={() => void WebBrowser.openBrowserAsync(article.url)}
              />
            </Animated.View>
          ))
        ) : (
          <View style={{ gap: theme.spacing.lg, paddingVertical: theme.spacing.md }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ gap: 6 }}>
                <Skeleton width={120} height={10} />
                <Skeleton height={16} />
                <Skeleton width="75%" height={12} />
              </View>
            ))}
          </View>
        )}
      </IslandCard>
      <AppText variant="micro" color="textTertiary" align="center">
        Dati di esempio · Feed RSS in arrivo
      </AppText>
    </Screen>
  );
}
