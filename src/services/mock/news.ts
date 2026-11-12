import type { NewsArticle, NewsDataSource } from '../types';

const MIN = 60_000;
const HOUR = 60 * MIN;

type Draft = Omit<NewsArticle, 'publishedAt'> & { ageMs: number };

const DRAFTS: Draft[] = [
  { id: 'n1', category: 'markets', source: 'Reuters', url: 'https://www.reuters.com/markets/', ageMs: 12 * MIN, title: 'European shares edge higher as investors weigh central bank signals', summary: 'The STOXX 600 rose 0.4% with tech and industrials leading, while bond yields eased ahead of key inflation data.' },
  { id: 'n2', category: 'crypto', source: 'CoinDesk', url: 'https://www.coindesk.com/', ageMs: 25 * MIN, title: 'Bitcoin holds above key support as ETF inflows resume', summary: 'Spot bitcoin ETFs recorded a third straight day of net inflows, as derivatives data points to easing leverage.' },
  { id: 'n3', category: 'markets', source: 'CNBC', url: 'https://www.cnbc.com/markets/', ageMs: 48 * MIN, title: 'Nvidia leads chipmakers higher on strong data center demand', summary: 'Semiconductor stocks rallied after upbeat guidance from suppliers lifted expectations for AI infrastructure spending.' },
  { id: 'n4', category: 'crypto', source: 'The Block', url: 'https://www.theblock.co/', ageMs: 1.5 * HOUR, title: 'Ethereum layer-2 activity hits record as fees fall', summary: 'Combined transactions across major rollups reached a new high, with average fees down more than 60% this quarter.' },
  { id: 'n5', category: 'markets', source: 'Financial Times', url: 'https://www.ft.com/markets', ageMs: 2 * HOUR, title: 'Bond markets price in slower pace of rate cuts', summary: 'Traders scaled back bets on aggressive easing after resilient labour market figures on both sides of the Atlantic.' },
  { id: 'n6', category: 'crypto', source: 'Decrypt', url: 'https://decrypt.co/', ageMs: 3 * HOUR, title: 'Solana network upgrade promises faster finality', summary: 'Validators began rolling out the client update, which developers say cuts confirmation times significantly.' },
  { id: 'n7', category: 'markets', source: 'Bloomberg', url: 'https://www.bloomberg.com/markets', ageMs: 5 * HOUR, title: 'Global ETF flows tilt toward broad-market trackers', summary: 'All-world and S&P 500 trackers captured the bulk of new money last month, according to industry data.' },
  { id: 'n8', category: 'markets', source: 'Il Sole 24 Ore', url: 'https://www.ilsole24ore.com/finanza', ageMs: 7 * HOUR, title: 'Piazza Affari chiude in rialzo, bene banche e utility', summary: 'Il FTSE MIB guadagna lo 0,6% sostenuto dai titoli bancari, mentre lo spread BTP-Bund resta stabile.' },
  { id: 'n9', category: 'crypto', source: 'CoinTelegraph', url: 'https://cointelegraph.com/', ageMs: 9 * HOUR, title: 'Stablecoin supply climbs to new all-time high', summary: 'The combined market cap of dollar-pegged tokens continued to grow, a sign of fresh liquidity entering crypto markets.' },
  { id: 'n10', category: 'markets', source: 'MarketWatch', url: 'https://www.marketwatch.com/', ageMs: 26 * HOUR, title: 'Apple shares slip as investors await product cycle details', summary: 'The stock underperformed the Nasdaq as analysts debated the timing of the next upgrade cycle.' },
];

export function buildMockArticles(now: number = Date.now()): NewsArticle[] {
  return DRAFTS.map(({ ageMs, ...rest }) => ({
    ...rest,
    publishedAt: new Date(now - ageMs).toISOString(),
  }));
}

export const mockNewsSource: NewsDataSource = {
  async getArticles(category) {
    await new Promise((r) => setTimeout(r, 250));
    const all = buildMockArticles();
    return category ? all.filter((a) => a.category === category) : all;
  },
};
