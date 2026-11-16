import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  AppText,
  ErrorState,
  FilterChips,
  IslandCard,
  RowSeparator,
  Screen,
  ScreenHeader,
  Skeleton,
} from '@/components/ui';
import { ArticleRow } from '@/features/news/article-card';
import { openInAppBrowser } from '@/lib/open-in-app-browser';
import { useNews } from '@/services/hooks';
import { useUiStore, type NewsFilter } from '@/store/ui-store';
import { enterFade, useTheme } from '@/theme';

const FILTERS: { value: NewsFilter; label: string }[] = [
  { value: 'all', label: 'Tutte' },
  { value: 'mercati', label: 'Mercati' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'italia', label: 'Italia' },
];

export default function NewsScreen() {
  const theme = useTheme();
  const filter = useUiStore((s) => s.newsFilter);
  const setFilter = useUiStore((s) => s.setNewsFilter);
  const news = useNews(filter);

  const openArticle = (url: string) => {
    void openInAppBrowser(url, {
      background: theme.colors.background,
      surface: theme.colors.surface,
      accent: theme.colors.accent,
    });
  };

  return (
    <Screen testID="news-screen" refreshing={news.isRefetching} onRefresh={() => void news.refetch()}>
      <ScreenHeader eyebrow="Mercati, crypto e Italia" title="Notizie" />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} testID="news-filter" />

      {news.isError && !news.data ? (
        <ErrorState
          title="Notizie non disponibili"
          message="Impossibile aggiornare i feed. Riprova tra poco."
          onRetry={() => void news.refetch()}
          testID="news-error"
        />
      ) : news.data ? (
        news.data.length === 0 ? (
          <IslandCard index={0}>
            <AppText variant="body" color="textSecondary" align="center">
              Nessuna notizia in questo momento.
            </AppText>
          </IslandCard>
        ) : (
          <IslandCard index={0} padding="lg" style={{ paddingVertical: theme.spacing.xs }}>
            {news.data.map((article, i) => (
              <Animated.View key={article.id} entering={enterFade(i)}>
                {i > 0 ? <RowSeparator inset={0} /> : null}
                <ArticleRow article={article} onPress={() => openArticle(article.url)} />
              </Animated.View>
            ))}
          </IslandCard>
        )
      ) : (
        <IslandCard index={0} padding="lg" style={{ paddingVertical: theme.spacing.xs }}>
          <View style={{ gap: theme.spacing.lg, paddingVertical: theme.spacing.md }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ gap: 6 }}>
                <Skeleton width={120} height={10} />
                <Skeleton height={16} />
                <Skeleton width="75%" height={12} />
              </View>
            ))}
          </View>
        </IslandCard>
      )}
    </Screen>
  );
}
