import { decodeXmlEntities } from './entities';

/**
 * Hand-written RSS 2.0 + Atom scanner. Workers have no DOMParser, and the feeds
 * we read are shallow, so a tag walk over the string is enough.
 */
export type RawFeedItem = {
  title: string;
  link: string;
  /** Raw date text (`pubDate`, `published`, `updated`, or `dc:date`). */
  date?: string;
  /** Description / summary / content, still possibly HTML. */
  summary: string;
  /** Best image candidate before http(s) filtering. */
  imageUrl?: string;
};

type XmlEl = {
  /** Local name, lowercased. */
  name: string;
  qname: string;
  attrs: Record<string, string>;
  inner: string;
};

const WIN_1252: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

/** Decode response bytes using the Content-Type charset, else the XML declaration, else UTF-8. */
export function decodeFeedBytes(bytes: Uint8Array, contentType: string | null): string {
  const headerCharset = charsetFromContentType(contentType);
  const declared = headerCharset ? null : encodingFromXmlDecl(bytes);
  const charset = normalizeCharset(headerCharset || declared || 'utf-8');
  if (charset === 'utf-8') return new TextDecoder('utf-8').decode(bytes);
  if (charset === 'iso-8859-1') return decodeBytes(bytes, false);
  if (charset === 'windows-1252') return decodeBytes(bytes, true);
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function parseFeedXml(xml: string): RawFeedItem[] {
  const blocks = findElements(xml, new Set(['item', 'entry']));
  const items: RawFeedItem[] = [];
  for (const block of blocks) {
    const children = directChildren(block.inner);
    const title = firstText(children, ['title']);
    const link = pickLink(children);
    const date = firstText(children, ['pubdate', 'published', 'updated', 'date']);
    const summary = summaryHtml(children);
    const imageUrl = pickImage(children, summary);
    items.push({
      title,
      link,
      ...(date ? { date } : {}),
      summary,
      ...(imageUrl ? { imageUrl } : {}),
    });
  }
  return items;
}

/**
 * RFC 822 and ISO 8601 via `Date.parse`. `YYYY-MM-DD HH:MM:SS` (Investing.com,
 * no timezone) and a timezone-less ISO datetime are UTC.
 */
export function parseFeedDate(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(value);
  if (naive) {
    const year = Number(naive[1]);
    const month = Number(naive[2]);
    const day = Number(naive[3]);
    const hour = Number(naive[4]);
    const minute = Number(naive[5]);
    const second = Number(naive[6]);
    if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
    return Date.UTC(year, month - 1, day, hour, minute, second);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function looksLikeFeed(xml: string): boolean {
  return /<(rss|feed|rdf:RDF|channel)\b/i.test(xml);
}

function charsetFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType);
  return match?.[1] ?? null;
}

function encodingFromXmlDecl(bytes: Uint8Array): string | null {
  const length = Math.min(bytes.length, 240);
  let head = '';
  for (let i = 0; i < length; i++) head += String.fromCharCode(bytes[i]! & 0xff);
  const match = /encoding\s*=\s*["']([^"']+)["']/i.exec(head);
  return match?.[1] ?? null;
}

function normalizeCharset(raw: string): string {
  const compact = raw.trim().toLowerCase().replace(/[-_\s]/g, '');
  if (compact === 'utf8') return 'utf-8';
  if (compact === 'iso88591' || compact === 'latin1' || compact === 'cp819') return 'iso-8859-1';
  if (compact === 'windows1252' || compact === 'cp1252' || compact === 'ibm1252') return 'windows-1252';
  return raw.trim().toLowerCase();
}

function decodeBytes(bytes: Uint8Array, windows1252: boolean): string {
  let out = '';
  const chunk: number[] = [];
  const flush = () => {
    if (chunk.length === 0) return;
    out += String.fromCharCode(...chunk);
    chunk.length = 0;
  };
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    const mapped = windows1252 && byte >= 0x80 && byte <= 0x9f ? (WIN_1252[byte] ?? byte) : byte;
    chunk.push(mapped);
    if (chunk.length >= 4096) flush();
  }
  flush();
  return out;
}

function findElements(xml: string, names: Set<string>): XmlEl[] {
  const out: XmlEl[] = [];
  const length = xml.length;
  let i = 0;
  while (i < length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) break;
    if (xml.startsWith('<!--', lt)) {
      i = indexEnd(xml, lt + 4, '-->');
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      i = indexEnd(xml, lt + 9, ']]>');
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      i = indexEnd(xml, lt + 2, '?>');
      continue;
    }
    if (xml.startsWith('<!', lt)) {
      i = indexEnd(xml, lt + 2, '>');
      continue;
    }
    if (xml[lt + 1] === '/') {
      i = lt + 2;
      continue;
    }
    const gt = xml.indexOf('>', lt + 1);
    if (gt < 0) break;
    const qname = readName(xml, lt + 1);
    if (!qname) {
      i = gt + 1;
      continue;
    }
    const local = localName(qname);
    const selfClosing = isSelfClosing(xml.slice(lt + 1, gt));
    if (!names.has(local)) {
      i = lt + 1;
      continue;
    }
    const attrs = parseAttrs(xml.slice(lt + 1, gt).replace(/\/\s*$/, ''));
    if (selfClosing) {
      out.push({ name: local, qname, attrs, inner: '' });
      i = gt + 1;
      continue;
    }
    const close = findClose(xml, gt + 1, qname);
    if (!close) {
      i = gt + 1;
      continue;
    }
    out.push({ name: local, qname, attrs, inner: xml.slice(gt + 1, close.start) });
    i = close.end;
  }
  return out;
}

function directChildren(xml: string): XmlEl[] {
  const out: XmlEl[] = [];
  const length = xml.length;
  let i = 0;
  while (i < length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) break;
    if (xml.startsWith('<!--', lt)) {
      i = indexEnd(xml, lt + 4, '-->');
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      i = indexEnd(xml, lt + 9, ']]>');
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      i = indexEnd(xml, lt + 2, '?>');
      continue;
    }
    if (xml.startsWith('<!', lt)) {
      i = indexEnd(xml, lt + 2, '>');
      continue;
    }
    if (xml[lt + 1] === '/') {
      i = indexEnd(xml, lt + 2, '>');
      continue;
    }
    const gt = xml.indexOf('>', lt + 1);
    if (gt < 0) break;
    const qname = readName(xml, lt + 1);
    if (!qname) {
      i = gt + 1;
      continue;
    }
    const selfClosing = isSelfClosing(xml.slice(lt + 1, gt));
    const attrs = parseAttrs(xml.slice(lt + 1, gt).replace(/\/\s*$/, ''));
    if (selfClosing) {
      out.push({ name: localName(qname), qname, attrs, inner: '' });
      i = gt + 1;
      continue;
    }
    const close = findClose(xml, gt + 1, qname);
    if (!close) {
      i = gt + 1;
      continue;
    }
    out.push({ name: localName(qname), qname, attrs, inner: xml.slice(gt + 1, close.start) });
    i = close.end;
  }
  return out;
}

function findClose(xml: string, from: number, qname: string): { start: number; end: number } | null {
  let depth = 1;
  let i = from;
  const length = xml.length;
  while (i < length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) return null;
    if (xml.startsWith('<!--', lt)) {
      i = indexEnd(xml, lt + 4, '-->');
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      i = indexEnd(xml, lt + 9, ']]>');
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      i = indexEnd(xml, lt + 2, '?>');
      continue;
    }
    if (xml[lt + 1] === '/') {
      const name = readName(xml, lt + 2);
      if (name && sameName(name, qname)) {
        depth -= 1;
        const gt = xml.indexOf('>', lt + 2);
        const end = gt < 0 ? length : gt + 1;
        if (depth === 0) return { start: lt, end };
      }
      i = lt + 2;
      continue;
    }
    const name = readName(xml, lt + 1);
    if (name && sameName(name, qname)) {
      const gt = xml.indexOf('>', lt + 1);
      if (gt < 0) return null;
      if (!isSelfClosing(xml.slice(lt + 1, gt))) depth += 1;
      i = gt + 1;
      continue;
    }
    i = lt + 1;
  }
  return null;
}

function indexEnd(value: string, from: number, marker: string): number {
  const at = value.indexOf(marker, from);
  return at < 0 ? value.length : at + marker.length;
}

function readName(value: string, index: number): string | null {
  const start = value[index];
  if (!start || !/[A-Za-z_:]/.test(start)) return null;
  let end = index + 1;
  while (end < value.length && /[A-Za-z0-9_:.\-]/.test(value[end]!)) end += 1;
  return value.slice(index, end);
}

function localName(qname: string): string {
  const colon = qname.lastIndexOf(':');
  return (colon >= 0 ? qname.slice(colon + 1) : qname).toLowerCase();
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isSelfClosing(openInside: string): boolean {
  return /\/\s*$/.test(openInside);
}

function parseAttrs(openInside: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(openInside))) {
    const key = match[1];
    if (!key) continue;
    attrs[key.toLowerCase()] = decodeXmlEntities(match[2] ?? match[3] ?? '');
  }
  return attrs;
}

function unwrap(inner: string): string {
  return inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_full, body: string) => body);
}

function textContent(inner: string): string {
  const unwrapped = unwrap(inner).replace(/<[^>]+>/g, ' ');
  return decodeXmlEntities(unwrapped).replace(/\s+/g, ' ').trim();
}

function htmlContent(inner: string): string {
  return decodeXmlEntities(unwrap(inner)).trim();
}

function firstText(children: XmlEl[], names: string[]): string {
  for (const name of names) {
    const el = children.find((child) => child.name === name && !child.qname.toLowerCase().startsWith('media:'));
    if (!el) continue;
    const text = textContent(el.inner);
    if (text) return text;
  }
  return '';
}

function summaryHtml(children: XmlEl[]): string {
  for (const name of ['description', 'summary', 'encoded', 'content']) {
    const el = children.find((child) => child.name === name && !child.qname.toLowerCase().startsWith('media:'));
    if (!el) continue;
    const html = htmlContent(el.inner);
    if (html) return html;
  }
  return '';
}

function urlText(inner: string): string {
  return textContent(inner).replace(/\s+/g, '');
}

function pickLink(children: XmlEl[]): string {
  for (const link of children) {
    if (link.name !== 'link') continue;
    const text = urlText(link.inner);
    if (/^https?:\/\//i.test(text)) return text;
  }
  let bestHref = '';
  let bestRank = -Infinity;
  for (const link of children) {
    if (link.name !== 'link') continue;
    const href = link.attrs.href ?? '';
    if (!href) continue;
    const rel = (link.attrs.rel ?? 'alternate').toLowerCase();
    const type = (link.attrs.type ?? '').toLowerCase();
    let rank = 0;
    if (rel === 'alternate' || rel === '') rank += 4;
    if (rel === 'self' || rel === 'enclosure' || rel === 'related' || rel === 'replies' || rel === 'via') rank -= 6;
    if (!type || type.includes('html')) rank += 2;
    if (rank > bestRank) {
      bestRank = rank;
      bestHref = href;
    }
  }
  if (bestHref) return bestHref;
  const guid = children.find((child) => child.name === 'guid' || child.name === 'id');
  const permalink = guid ? urlText(guid.inner) : '';
  return /^https?:\/\//i.test(permalink) ? permalink : '';
}

function pickImage(children: XmlEl[], summary: string): string | undefined {
  let best: { url: string; score: number } | undefined;
  for (const child of children) {
    const qname = child.qname.toLowerCase();
    if (qname !== 'media:content' && qname !== 'media:thumbnail') continue;
    const url = child.attrs.url || child.attrs.href || '';
    if (!url || !isImageMedia(child)) continue;
    const width = Number.parseInt(child.attrs.width ?? '', 10);
    const score = (Number.isFinite(width) ? width : 0) * 2 + (qname === 'media:content' ? 1 : 0);
    if (!best || score > best.score) best = { url, score };
  }
  if (best) return best.url;
  for (const child of children) {
    if (child.name !== 'enclosure') continue;
    const type = (child.attrs.type ?? '').toLowerCase();
    const url = child.attrs.url ?? '';
    if (url && type.startsWith('image/')) return url;
  }
  return firstImgSrc(summary);
}

function isImageMedia(el: XmlEl): boolean {
  const type = (el.attrs.type ?? '').toLowerCase();
  const medium = (el.attrs.medium ?? '').toLowerCase();
  const url = el.attrs.url ?? '';
  if (type.startsWith('video/') || type.startsWith('audio/') || medium === 'video' || medium === 'audio') return false;
  if (type.startsWith('image/') || medium === 'image') return true;
  if (el.qname.toLowerCase() === 'media:thumbnail') return true;
  if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url)) return true;
  return !type && !medium;
}

function firstImgSrc(html: string): string | undefined {
  const match = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html);
  const src = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
  return src || undefined;
}
