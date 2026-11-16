import { describe, expect, test } from 'vitest';

import { decodeFeedBytes, parseFeedDate, parseFeedXml } from '../src/news/parse';

const PUB = 'Mon, 16 Nov 2026 09:00:00 GMT';

function itemXml(inner: string, root = 'item'): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><${root}>${inner}</${root}></channel></rss>`;
}

describe('parseFeedXml', () => {
  test('reads RSS 2.0 items, CDATA titles and links', () => {
    const items = parseFeedXml(
      itemXml(`
        <title><![CDATA[Revolut commissariata, da mesi  sotto la lente]]></title>
        <link><![CDATA[https://www.repubblica.it/economia/a?rss]]></link>
        <guid isPermaLink="false">AJ3</guid>
        <pubDate>${PUB}</pubDate>
        <description><![CDATA[<p>Dopo la vigilanza. <b>Bce</b></p>]]></description>
        <enclosure url="https://i2.res.24o.it/a.jpg" type="image/jpg" length="0"/>
      `),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Revolut commissariata, da mesi sotto la lente');
    expect(items[0]?.link).toBe('https://www.repubblica.it/economia/a?rss');
    expect(items[0]?.date).toBe(PUB);
    expect(items[0]?.summary).toContain('<b>Bce</b>');
    expect(items[0]?.imageUrl).toBe('https://i2.res.24o.it/a.jpg');
  });

  test('does not close an item on </item> inside CDATA, and skips comments', () => {
    const items = parseFeedXml(`<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <!-- <item><title>Hidden</title><link>https://example.com/hidden</link></item> -->
        <item>
          <title>Safe</title>
          <description><![CDATA[literal </item> stays inside]]></description>
          <link>https://example.com/safe</link>
          <pubDate>${PUB}</pubDate>
        </item>
        <item>
          <title>Next</title>
          <link>https://example.com/next</link>
          <pubDate>${PUB}</pubDate>
        </item>
      </channel></rss>`);
    expect(items.map((item) => item.title)).toEqual(['Safe', 'Next']);
    expect(items[0]?.link).toBe('https://example.com/safe');
    expect(items[0]?.summary).toContain('</item>');
  });

  test('decodes entities in text, attributes and CDATA html', () => {
    const items = parseFeedXml(
      itemXml(`
        <title>Caff&egrave; &amp; soci &quot;A&quot; &#39;ok&#39; &#x2014; fine</title>
        <link>https://example.com/entities</link>
        <pubDate>${PUB}</pubDate>
        <description><![CDATA[<p>Hello&nbsp;<b>world</b> &egrave; <script>alert(1)</script></p>]]></description>
        <media:content url="https://cdn.example/a.jpg?fm=jpg&amp;w=800" type="image/*" medium="image" width="800"/>
      `),
    );
    expect(items[0]?.title).toBe('Caffè & soci "A" \'ok\' — fine');
    expect(items[0]?.summary).toContain('Hello\u00a0');
    expect(items[0]?.summary).toContain('è');
    expect(items[0]?.summary).not.toContain('&egrave;');
    expect(items[0]?.imageUrl).toBe('https://cdn.example/a.jpg?fm=jpg&w=800');
  });

  test('parses Atom links, preferring alternate html over self', () => {
    const items = parseFeedXml(`<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Feed</title>
        <entry>
          <title>Atom story</title>
          <link rel="self" href="https://example.com/atom/self"/>
          <link rel="alternate" type="text/html" href="https://example.com/atom"/>
          <id>tag:example.com,2026:atom</id>
          <published>2026-11-16T07:00:00Z</published>
          <updated>2026-11-16T09:00:00Z</updated>
          <summary type="html">Caff&amp;egrave; &amp; the &quot;markets&quot;</summary>
          <content type="html"><![CDATA[<p>Longer body</p>]]></content>
        </entry>
      </feed>`);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Atom story');
    expect(items[0]?.link).toBe('https://example.com/atom');
    expect(items[0]?.date).toBe('2026-11-16T07:00:00Z');
    expect(items[0]?.summary).toBe('Caffè & the "markets"');
  });

  test('uses dc:date and updated when pubDate and published are absent', () => {
    const dc = parseFeedXml(
      itemXml(`<title>DC</title><link>https://example.com/dc</link><dc:date>2026-11-16T08:00:00Z</dc:date>`),
    );
    expect(dc[0]?.date).toBe('2026-11-16T08:00:00Z');
    const updated = parseFeedXml(
      `<feed><entry><title>U</title><link href="https://example.com/u"/><updated>2026-11-16T06:00:00Z</updated></entry></feed>`,
    );
    expect(updated[0]?.date).toBe('2026-11-16T06:00:00Z');
    expect(updated[0]?.link).toBe('https://example.com/u');
  });

  test('prefers the widest image media, then enclosure, then the first img', () => {
    const media = parseFeedXml(
      itemXml(`
        <title>Pics</title><link>https://example.com/pics</link><pubDate>${PUB}</pubDate>
        <media:thumbnail url="https://cdn.example/small.jpg" width="100"/>
        <media:content url="https://cdn.example/mid.jpg" type="image/jpeg" width="400"/>
        <media:content url="https://cdn.example/big.jpg" medium="image" type="image/jpeg" width="1200">
          <media:credit>Desk</media:credit>
        </media:content>
        <media:content url="https://cdn.example/clip.mp4" type="video/mp4" width="1920"/>
        <enclosure url="https://cdn.example/enc.jpg" type="image/jpeg"/>
      `),
    );
    expect(media[0]?.imageUrl).toBe('https://cdn.example/big.jpg');

    const enclosure = parseFeedXml(
      itemXml(`
        <title>Enc</title><link>https://example.com/enc</link><pubDate>${PUB}</pubDate>
        <media:content url="https://cdn.example/clip.mp4" type="video/mp4" width="1920"/>
        <enclosure url="https://cdn.example/enc.jpg" type="image/jpeg" length="10"/>
        <description><![CDATA[<img src="https://cdn.example/inline.jpg">]]></description>
      `),
    );
    expect(enclosure[0]?.imageUrl).toBe('https://cdn.example/enc.jpg');

    const inline = parseFeedXml(
      itemXml(`
        <title>Inline</title><link>https://example.com/inline</link><pubDate>${PUB}</pubDate>
        <description>&lt;p&gt;Hi &lt;img src="https://cdn.example/inline.jpg" width="10"&gt;&lt;/p&gt;</description>
      `),
    );
    expect(inline[0]?.imageUrl).toBe('https://cdn.example/inline.jpg');
  });

  test('parses investing-style, RFC 822 and ISO dates', () => {
    expect(parseFeedDate('2026-11-16 09:53:03')).toBe(Date.parse('2026-11-16T09:53:03Z'));
    expect(parseFeedDate('2026-11-16T09:53:03')).toBe(Date.parse('2026-11-16T09:53:03Z'));
    expect(parseFeedDate('2026-11-16T09:53:03Z')).toBe(Date.parse('2026-11-16T09:53:03Z'));
    expect(parseFeedDate('Mon, 16 Nov 2026 10:57:30 +0100')).toBe(Date.parse('2026-11-16T09:57:30Z'));
    expect(parseFeedDate('Mon, 16 Nov 2026 09:39:00 GMT')).toBe(Date.parse('2026-11-16T09:39:00Z'));
    expect(parseFeedDate('not a date')).toBeNull();
  });
});

describe('decodeFeedBytes', () => {
  test('decodes ISO-8859-1 from the XML declaration', () => {
    const text =
      '<?xml version="1.0" encoding="ISO-8859-1"?><rss version="2.0"><channel><item>' +
      '<title>Caff' +
      String.fromCharCode(0xe8) +
      ' gi' +
      String.fromCharCode(0xe0) +
      '</title><link>https://example.com/cafe</link>' +
      `<pubDate>${PUB}</pubDate><description>Perch` +
      String.fromCharCode(0xe9) +
      '</description></item></channel></rss>';
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    const xml = decodeFeedBytes(bytes, 'text/xml');
    const items = parseFeedXml(xml);
    expect(items[0]?.title).toBe('Caffè già');
    expect(items[0]?.summary).toBe('Perché');
  });

  test('Content-Type charset wins and windows-1252 maps smart quotes', () => {
    const text = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><item><title>L${String.fromCharCode(0x92)}Europa</title><link>https://example.com/q</link><pubDate>${PUB}</pubDate></item></channel></rss>`;
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    const xml = decodeFeedBytes(bytes, 'text/xml; charset=windows-1252');
    expect(parseFeedXml(xml)[0]?.title).toBe('L\u2019Europa');
  });

  test('defaults to utf-8', () => {
    const xml = '<?xml version="1.0"?><rss><channel><item><title>Città</title><link>https://example.com/u</link></item></channel></rss>';
    const bytes = new TextEncoder().encode(xml);
    expect(parseFeedXml(decodeFeedBytes(bytes, null))[0]?.title).toBe('Città');
  });
});
