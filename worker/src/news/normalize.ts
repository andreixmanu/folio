import { decodeXmlEntities } from './entities';
import type { NewsCategory, NewsFeed } from './feeds';
import { parseFeedDate, type RawFeedItem } from './parse';

/** Newest headlines kept in one response. */
export const MAX_ITEMS = 100;
/** Cap per outlet name so one source cannot fill the list. */
export const MAX_PER_SOURCE = 20;
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;
const SUMMARY_MAX = 240;

export type NewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  category: NewsCategory;
  publishedAt: string;
  summary: string;
  imageUrl?: string;
};

type Candidate = NewsItem & { publishedMs: number };

/**
 * Plain text for a card: drop scripts/styles and tags, decode entities,
 * collapse whitespace, then cut to ~240 characters on a word boundary.
 */
export function toPlainText(html: string, max = SUMMARY_MAX): string {
  let text = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_full, body: string) => body);
  text = decodeXmlEntities(text);
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<script\b[^>]*>[\s\S]*/gi, ' ');
  text = text.replace(/<style\b[^>]*>[\s\S]*/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeXmlEntities(text);
  text = text.replace(/[\u00a0\u2009\u200a\u202f]+/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return truncate(text, max);
}

/** http(s) only. Strips fragments and `utm_*` query params. */
export function canonicalLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase().startsWith('utm_')) continue;
    kept.append(key, value);
  }
  const query = kept.toString();
  url.search = query ? `?${query}` : '';
  return url.toString();
}

/** Keep https images. Upgrade `http:` to `https:`. Drop anything else. */
export function httpsImage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return undefined;
  return url.toString();
}

/** Stable FNV-1a 64-bit id of the canonical link. */
export function hashId(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(input);
  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i]!);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Merge parsed items: drop empty title/link and dates more than 24h ahead,
 * dedupe by canonical link and normalized title, keep the newest,
 * at most 20 per source name and 100 overall.
 */
export function normalizeItems(groups: { feed: NewsFeed; items: RawFeedItem[] }[], now: number): NewsItem[] {
  const candidates: Candidate[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      const title = toPlainText(item.title, 500);
      const link = canonicalLink(item.link);
      if (!title || !link) continue;
      if (!item.date) continue;
      const publishedMs = parseFeedDate(item.date);
      if (publishedMs === null) continue;
      if (publishedMs > now + FUTURE_SLACK_MS) continue;
      const imageUrl = httpsImage(item.imageUrl);
      candidates.push({
        id: hashId(link),
        title,
        link,
        source: group.feed.source,
        category: group.feed.category,
        publishedAt: new Date(publishedMs).toISOString(),
        summary: toPlainText(item.summary),
        publishedMs,
        ...(imageUrl ? { imageUrl } : {}),
      });
    }
  }

  candidates.sort((a, b) => b.publishedMs - a.publishedMs || a.source.localeCompare(b.source));

  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const perSource = new Map<string, number>();
  const items: NewsItem[] = [];

  for (const candidate of candidates) {
    if (seenLinks.has(candidate.link)) continue;
    const titleKey = normalizeTitle(candidate.title);
    if (titleKey && seenTitles.has(titleKey)) continue;
    const used = perSource.get(candidate.source) ?? 0;
    if (used >= MAX_PER_SOURCE) continue;
    seenLinks.add(candidate.link);
    if (titleKey) seenTitles.add(titleKey);
    perSource.set(candidate.source, used + 1);
    const { publishedMs: _publishedMs, ...item } = candidate;
    items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }

  return items;
}

function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const space = slice.lastIndexOf(' ');
  const base = (space >= Math.floor(max * 0.6) ? slice.slice(0, space) : slice).trimEnd();
  return `${base}…`;
}
