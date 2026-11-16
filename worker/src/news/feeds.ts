/** Public news categories. `GET /news?category=` rejects anything else. */
export const NEWS_CATEGORIES = ['mercati', 'crypto', 'italia'] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export type NewsFeed = {
  /** Stable id used for caching and the `feeds` status array. */
  id: string;
  /** Outlet name shown in the app. */
  source: string;
  url: string;
  category: NewsCategory;
  /** Feed language. Italian outlets are `it`; the rest are `en`. */
  lang: 'it' | 'en';
};

/**
 * Easy-to-edit list of public RSS/Atom feeds.
 * Add a row to include another outlet; the loader picks it up on the next refresh.
 */
export const FEEDS: readonly NewsFeed[] = [
  {
    id: 'sole24-mercati',
    source: 'Il Sole 24 Ore',
    url: 'https://www.ilsole24ore.com/rss/finanza--quotate-italia.xml',
    category: 'italia',
    lang: 'it',
  },
  {
    id: 'sole24-finanza',
    source: 'Il Sole 24 Ore',
    url: 'https://www.ilsole24ore.com/rss/finanza.xml',
    category: 'italia',
    lang: 'it',
  },
  {
    id: 'ansa-economia',
    source: 'ANSA',
    url: 'https://www.ansa.it/sito/notizie/economia/economia_rss.xml',
    category: 'italia',
    lang: 'it',
  },
  {
    id: 'repubblica-economia',
    source: 'la Repubblica',
    url: 'https://www.repubblica.it/rss/economia/rss2.0.xml',
    category: 'italia',
    lang: 'it',
  },
  {
    id: 'cnbc-markets',
    source: 'CNBC',
    url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',
    category: 'mercati',
    lang: 'en',
  },
  {
    id: 'marketwatch',
    source: 'MarketWatch',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    category: 'mercati',
    lang: 'en',
  },
  {
    id: 'ft-markets',
    source: 'Financial Times',
    url: 'https://www.ft.com/markets?format=rss',
    category: 'mercati',
    lang: 'en',
  },
  {
    id: 'investing',
    source: 'Investing.com',
    url: 'https://www.investing.com/rss/news_25.rss',
    category: 'mercati',
    lang: 'en',
  },
  {
    id: 'coindesk',
    source: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: 'crypto',
    lang: 'en',
  },
  {
    id: 'cointelegraph',
    source: 'Cointelegraph',
    url: 'https://cointelegraph.com/rss',
    category: 'crypto',
    lang: 'en',
  },
  {
    id: 'theblock',
    source: 'The Block',
    url: 'https://www.theblock.co/rss.xml',
    category: 'crypto',
    lang: 'en',
  },
  {
    id: 'decrypt',
    source: 'Decrypt',
    url: 'https://decrypt.co/feed',
    category: 'crypto',
    lang: 'en',
  },
];

export function isNewsCategory(value: string): value is NewsCategory {
  return (NEWS_CATEGORIES as readonly string[]).includes(value);
}
