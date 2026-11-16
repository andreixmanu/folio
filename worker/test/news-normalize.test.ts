import { describe, expect, test } from 'vitest';

import type { NewsFeed } from '../src/news/feeds';
import { canonicalLink, hashId, httpsImage, MAX_ITEMS, MAX_PER_SOURCE, normalizeItems, toPlainText } from '../src/news/normalize';
import type { RawFeedItem } from '../src/news/parse';

const NOW = Date.parse('2026-11-16T12:00:00Z');

function feed(id: string, source = id, category: NewsFeed['category'] = 'mercati'): NewsFeed {
  return { id, source, url: `https://example.com/${id}.xml`, category, lang: 'en' };
}

function raw(partial: Partial<RawFeedItem> & Pick<RawFeedItem, 'title' | 'link'>): RawFeedItem {
  return {
    summary: 'A short summary about markets today.',
    date: 'Mon, 16 Nov 2026 10:00:00 GMT',
    ...partial,
  };
}

describe('toPlainText', () => {
  test('strips tags, scripts and entities, then truncates on a word boundary', () => {
    expect(toPlainText('<p>Hello&nbsp;<b>world</b> &egrave; <script>alert(1)</script><style>.x{}</style> fine</p>')).toBe(
      'Hello world è fine',
    );
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const summary = toPlainText(`<p>${words}</p>`);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(241);
    expect(summary.slice(0, -1)).not.toMatch(/\s$/);
    expect(summary.includes('word0')).toBe(true);
    const cut = summary.slice(0, -1);
    expect(words.startsWith(cut)).toBe(true);
  });
});

describe('canonicalLink and images', () => {
  test('strips utm params and fragments and hashes the canonical url', () => {
    const a = canonicalLink('https://Example.com/news/a?utm_source=rss&utm_medium=rss&b=1#top');
    const b = canonicalLink('https://example.com/news/a?b=1&utm_campaign=x');
    expect(a).toBe('https://example.com/news/a?b=1');
    expect(b).toBe(a);
    expect(hashId(a!)).toBe(hashId(b!));
    expect(hashId(a!)).toMatch(/^[0-9a-f]{16}$/);
    expect(canonicalLink('javascript:alert(1)')).toBeNull();
    expect(canonicalLink('mailto:desk@example.com')).toBeNull();
  });

  test('upgrades http images and drops non-http urls', () => {
    expect(httpsImage('http://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
    expect(httpsImage('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
    expect(httpsImage('data:image/png;base64,aaaa')).toBeUndefined();
    expect(httpsImage('/relative.jpg')).toBeUndefined();
  });
});

describe('normalizeItems', () => {
  test('sorts newest first, dedupes link and title, drops future dates and bad links', () => {
    const items = normalizeItems(
      [
        {
          feed: feed('cnbc', 'CNBC'),
          items: [
            raw({
              title: 'Older unique story',
              link: 'https://example.com/old',
              date: 'Mon, 16 Nov 2026 08:00:00 GMT',
            }),
            raw({
              title: 'Shared headline',
              link: 'https://example.com/shared?utm_source=rss',
              date: 'Mon, 16 Nov 2026 09:00:00 GMT',
            }),
            raw({
              title: 'Shared headline',
              link: 'https://example.com/shared-other',
              date: 'Mon, 16 Nov 2026 07:00:00 GMT',
            }),
            raw({
              title: 'Way ahead',
              link: 'https://example.com/future',
              date: 'Wed, 18 Nov 2026 12:00:00 GMT',
            }),
            raw({
              title: 'Soon',
              link: 'https://example.com/soon',
              date: 'Tue, 17 Nov 2026 11:00:00 GMT',
            }),
            raw({ title: '   ', link: 'https://example.com/blank' }),
            raw({ title: 'No link', link: 'javascript:void(0)' }),
            raw({
              title: 'Investing clock',
              link: 'http://example.com/inv',
              date: '2026-11-16 09:53:03',
              imageUrl: 'http://cdn.example/inv.jpg',
            }),
          ],
        },
        {
          feed: feed('ft', 'Financial Times'),
          items: [
            raw({
              title: 'Shared headline',
              link: 'https://example.com/shared#frag',
              date: 'Mon, 16 Nov 2026 11:00:00 GMT',
              summary: '<p>Bond desks <b>trimmed</b> duration.</p>',
            }),
          ],
        },
      ],
      NOW,
    );

    expect(items.map((item) => item.title)).toEqual([
      'Soon',
      'Shared headline',
      'Investing clock',
      'Older unique story',
    ]);
    const shared = items.find((item) => item.title === 'Shared headline');
    expect(shared?.link).toBe('https://example.com/shared');
    expect(shared?.source).toBe('Financial Times');
    expect(shared?.id).toBe(hashId('https://example.com/shared'));
    expect(shared?.summary).toBe('Bond desks trimmed duration.');
    expect(shared?.publishedAt).toBe('2026-11-16T11:00:00.000Z');
    const investing = items.find((item) => item.title === 'Investing clock');
    expect(investing?.publishedAt).toBe('2026-11-16T09:53:03.000Z');
    expect(investing?.link).toBe('http://example.com/inv');
    expect(investing?.imageUrl).toBe('https://cdn.example/inv.jpg');
    expect(items.some((item) => item.title === 'Way ahead')).toBe(false);
  });

  test('keeps at most 20 items per source and 100 overall', () => {
    const soleA = feed('sole-a', 'Il Sole 24 Ore', 'italia');
    const soleB = feed('sole-b', 'Il Sole 24 Ore', 'italia');
    const groups = [
      {
        feed: soleA,
        items: Array.from({ length: 15 }, (_, i) =>
          raw({
            title: `Sole A ${i}`,
            link: `https://example.com/sole-a/${i}`,
            date: new Date(NOW - (30 + i) * 60_000).toUTCString(),
          }),
        ),
      },
      {
        feed: soleB,
        items: Array.from({ length: 15 }, (_, i) =>
          raw({
            title: `Sole B ${i}`,
            link: `https://example.com/sole-b/${i}`,
            date: new Date(NOW - i * 60_000).toUTCString(),
          }),
        ),
      },
    ];
    const sole = normalizeItems(groups, NOW);
    expect(sole).toHaveLength(MAX_PER_SOURCE);
    expect(sole.filter((item) => item.link.includes('/sole-b/'))).toHaveLength(15);
    expect(sole.filter((item) => item.link.includes('/sole-a/'))).toHaveLength(5);

    const many = Array.from({ length: 8 }, (_, source) => ({
      feed: feed(`src-${source}`, `Source ${source}`),
      items: Array.from({ length: 20 }, (_, i) =>
        raw({
          title: `S${source} story ${i}`,
          link: `https://example.com/s${source}/${i}`,
          date: new Date(NOW - (source * 20 + i) * 60_000).toUTCString(),
        }),
      ),
    }));
    const capped = normalizeItems(many, NOW);
    expect(capped).toHaveLength(MAX_ITEMS);
    const counts = new Map<string, number>();
    for (const item of capped) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(MAX_PER_SOURCE);
    expect(capped[0]!.publishedAt >= capped[1]!.publishedAt).toBe(true);
  });
});
