import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { FEEDS, type NewsFeed } from '../src/news/feeds';
import { normalizeItems } from '../src/news/normalize';
import { decodeFeedBytes, parseFeedXml } from '../src/news/parse';

/** First three items of captured public feeds, next to this file. */
const FIXTURES: { id: string; file: string }[] = [
  { id: 'sole24-mercati', file: 'sole24-mercati.xml' },
  { id: 'cnbc-markets', file: 'cnbc-markets.xml' },
  { id: 'investing', file: 'investing.xml' },
  { id: 'coindesk', file: 'coindesk.xml' },
];

function readFixture(file: string): Uint8Array {
  return readFileSync(new URL(`./fixtures/news/${file}`, import.meta.url));
}

function feedById(id: string): NewsFeed {
  const feed = FEEDS.find((item) => item.id === id);
  if (!feed) throw new Error(id);
  return feed;
}

describe('feed fixtures', () => {
  test('each fixture yields titled https links', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    const groups = FIXTURES.map(({ id, file }) => {
      const feed = feedById(id);
      const xml = decodeFeedBytes(readFixture(file), null);
      const items = parseFeedXml(xml);
      expect(items, feed.id).toHaveLength(3);
      const withLink = items.filter((item) => item.title && item.link.startsWith('http'));
      expect(withLink, feed.id).toHaveLength(3);
      return { feed, items };
    });
    const normalized = normalizeItems(groups, now);
    expect(normalized.length).toBeGreaterThan(10);
    expect(normalized.length).toBeLessThanOrEqual(100);
    const perSource = new Map<string, number>();
    for (const item of normalized) perSource.set(item.source, (perSource.get(item.source) ?? 0) + 1);
    for (const count of perSource.values()) expect(count).toBeLessThanOrEqual(20);
    expect(normalized.some((item) => item.category === 'italia')).toBe(true);
    expect(normalized.some((item) => item.category === 'crypto')).toBe(true);
    expect(normalized.some((item) => item.category === 'mercati')).toBe(true);
    expect(normalized.some((item) => item.imageUrl?.startsWith('https://'))).toBe(true);
  });
});
