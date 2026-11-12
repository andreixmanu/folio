import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import {
  AppText,
  FilterChips,
  IslandCard,
  Screen,
  ScreenHeader,
  Skeleton,
} from '@/components/ui';
import { ArticleCard } from '@/features/news/article-card';
import { useNews } from '@/services/hooks';
import { useUiStore, type NewsFilter } from '@/store/ui-store';
import { useTheme } from '@/theme';

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

      {news.data ? (
        <Animated.View layout={LinearTransition.springify().damping(22)} style={{ gap: theme.spacing.lg }}>
          {news.data.map((article, i) => (
            <Animated.View
              key={article.id}
              entering={FadeIn.delay(i * 30)}
              exiting={FadeOut.duration(120)}
              layout={LinearTransition.springify().damping(22)}>
              <ArticleCard
                article={article}
                index={i}
                onPress={() => void WebBrowser.openBrowserAsync(article.url)}
              />
            </Animated.View>
          ))}
          <AppText variant="caption" color="textTertiary" align="center">
            Dati di esempio · Feed RSS in arrivo
          </AppText>
        </Animated.View>
      ) : (
        <View style={{ gap: theme.spacing.lg }}>
          {[0, 1, 2].map((i) => (
            <IslandCard key={i}>
              <View style={{ gap: theme.spacing.sm }}>
                <Skeleton width={140} height={12} />
                <Skeleton height={18} />
                <Skeleton width="80%" height={14} />
              </View>
            </IslandCard>
          ))}
        </View>
      )}
    </Screen>
  );
}
