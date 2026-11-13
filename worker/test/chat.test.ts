import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createApp } from '../src/app';
import { statusPhaseFor, toClientSse } from '../src/chat';
import type { Env } from '../src/env';
import { resetXaiAuthForTests, type XaiFetcher } from '../src/xai-auth';

import { MemoryKv } from './memory-kv';

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const APP_TOKEN = 'local-dev-token';
const ACCESS = 'acc-test';

const LOGIN_REQUIRED = {
  error: 'login_required',
  message: 'Accesso xAI scaduto: rifai il login (npm run login:xai).',
};
const SUBSCRIPTION = {
  error: 'subscription',
  message: 'Abbonamento SuperGrok o credito xAI non disponibile per questa richiesta.',
};
const RATE_LIMITED = {
  error: 'rate_limited',
  message: 'Troppe richieste, riprova tra poco.',
};
const UPSTREAM = {
  error: 'upstream',
  message: 'Servizio xAI non disponibile.',
};

function envOf(kv: MemoryKv, extra: Partial<Env> = {}): Env {
  return { XAI_AUTH: kv as unknown as KVNamespace, APP_CHAT_TOKEN: APP_TOKEN, ...extra };
}

async function seedAccess(kv: MemoryKv, token = ACCESS): Promise<void> {
  await kv.put('access_token', JSON.stringify({ token, expiresAt: NOW + 3 * 60 * 60 * 1000 }));
}

const portfolio = {
  totalValue: 1000,
  currency: 'EUR',
  holdings: [
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      assetClass: 'crypto',
      quantity: 0.1,
      value: 1000,
      weightPct: 100,
      changePct: 1.5,
    },
  ],
  allocation: [{ label: 'Crypto', percent: 100 }],
};

const messages = [{ role: 'user' as const, content: 'Come va il mercato oggi?' }];

function chunkedSse(text: string, status = 200): Response {
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const size = 5;
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const UPSTREAM_SSE = [
  'event: response.output_text.delta',
  'data: {"type":"response.output_text.delta","delta":"Ciao"}',
  '',
  'event: response.output_text.delta',
  'data: {"type":"response.output_text.delta","delta":" mondo"}',
  '',
  'event: response.completed',
  'data: {"type":"response.completed","response":{"output":[{"content":[{"type":"output_text","text":"Ciao mondo","annotations":[{"type":"url_citation","url":"https://example.com/a","title":"Esempio"}]}]}]}}',
  '',
].join('\n');

function parseEvents(text: string): { event: string; data: unknown }[] {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      return { event, data: JSON.parse(data.join('\n')) as unknown };
    });
}

function post(
  app: ReturnType<typeof createApp>,
  env: Env | Record<string, never>,
  body: unknown,
  token?: string,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== undefined) headers['X-Folio-Token'] = token;
  return app.request(
    '/chat',
    { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) },
    env,
  );
}

describe('POST /chat', () => {
  beforeEach(() => resetXaiAuthForTests());

  test('GET / lists /chat and CORS allows the assistant headers', async () => {
    const app = createApp({ now: () => NOW });
    const root = (await (await app.request('/')).json()) as { endpoints: string[] };
    expect(root.endpoints).toContain('/chat');

    const preflight = await app.request('/chat', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8081',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-folio-token',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-methods')).toMatch(/POST/);
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/Content-Type/);
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/X-Folio-Token/);
  });

  test('503 when the app token is unset, 401 when the header does not match', async () => {
    const kv = new MemoryKv();
    const fetchUpstream = vi.fn<XaiFetcher>(async () => {
      throw new Error('upstream should not be called');
    });
    const app = createApp({ now: () => NOW, fetchUpstream, sleep: async () => {} });

    const disabled = await post(app, { XAI_AUTH: kv as unknown as KVNamespace }, { messages }, APP_TOKEN);
    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toEqual({ error: 'chat_disabled' });

    const wrong = await post(app, envOf(kv), { messages }, 'nope');
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'unauthorized' });
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  test('400 on an invalid body', async () => {
    const kv = new MemoryKv();
    const app = createApp({ now: () => NOW, fetchUpstream: vi.fn(), sleep: async () => {} });
    const env = envOf(kv);
    const cases: unknown[] = [
      'not-json',
      {},
      { messages: [] },
      { messages: [{ role: 'assistant', content: 'prima' }] },
      { messages: [{ role: 'user', content: 'x'.repeat(8001) }] },
      { messages: Array.from({ length: 41 }, () => ({ role: 'user', content: 'hi' })) },
      {
        messages,
        portfolio: {
          totalValue: 1,
          currency: 'EUR',
          holdings: [
            {
              symbol: 'BTC',
              name: 'n'.repeat(21_000),
              assetClass: 'crypto',
              quantity: 1,
              value: 1,
              weightPct: 100,
            },
          ],
        },
      },
      { messages, portfolio: { totalValue: null, currency: 'EUR', holdings: [] } },
      { messages, portfolio: { totalValue: '1000', currency: 'EUR', holdings: [] } },
      {
        messages,
        portfolio: {
          currency: 'EUR',
          holdings: [{ symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', weightPct: 100, quantity: null }],
        },
      },
      {
        messages,
        portfolio: {
          currency: 'EUR',
          holdings: [{ symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', weightPct: 100, value: '1' }],
        },
      },
      {
        messages,
        portfolio: {
          currency: 'EUR',
          holdings: [{ symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto' }],
        },
      },
    ];
    for (const body of cases) {
      const res = await post(app, env, body, APP_TOKEN);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_body' });
    }
  });

  test('401 login_required when KV has no refresh token', async () => {
    const kv = new MemoryKv();
    const fetchUpstream = vi.fn<XaiFetcher>(async () => {
      throw new Error('upstream should not be called');
    });
    const app = createApp({ now: () => NOW, fetchUpstream, sleep: async () => {} });
    const res = await post(app, envOf(kv), { messages }, APP_TOKEN);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(LOGIN_REQUIRED);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  test('maps upstream 403 to 402 and 429 to 429 without leaking the token', async () => {
    const kv = new MemoryKv();
    await seedAccess(kv);
    const fetchUpstream = vi.fn<XaiFetcher>(async () => new Response(`no ${ACCESS}`, { status: 403 }));
    const app = createApp({ now: () => NOW, fetchUpstream, sleep: async () => {} });
    const forbidden = await post(app, envOf(kv), { messages }, APP_TOKEN);
    expect(forbidden.status).toBe(402);
    const forbiddenBody = await forbidden.json();
    expect(forbiddenBody).toEqual(SUBSCRIPTION);
    expect(JSON.stringify(forbiddenBody)).not.toContain(ACCESS);

    fetchUpstream.mockResolvedValueOnce(new Response('slow', { status: 429 }));
    const limited = await post(app, envOf(kv), { messages }, APP_TOKEN);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual(RATE_LIMITED);
  });

  test('a 3xx from the responses API is a 502 and is not followed', async () => {
    const kv = new MemoryKv();
    await seedAccess(kv);
    const fetchUpstream = vi.fn<XaiFetcher>(async (url, init) => {
      expect(url).toBe('https://api.x.ai/v1/responses');
      expect(init?.redirect).toBe('manual');
      return new Response('redirect', { status: 302, headers: { Location: 'https://evil.example/v1/responses' } });
    });
    const app = createApp({ now: () => NOW, fetchUpstream, sleep: async () => {} });
    const res = await post(app, envOf(kv), { messages }, APP_TOKEN);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual(UPSTREAM);
    expect(JSON.stringify(body)).not.toContain(ACCESS);
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
  });

  test('streams deltas, deduped sources, and done', async () => {
    const kv = new MemoryKv();
    await seedAccess(kv);
    const fetchUpstream = vi.fn<XaiFetcher>(async (url, init) => {
      expect(url).toBe('https://api.x.ai/v1/responses');
      expect(init?.redirect).toBe('manual');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${ACCESS}`);
      const payload = JSON.parse(String(init?.body)) as {
        model: string;
        stream: boolean;
        store: boolean;
        tools: { type: string }[];
        input: { role: string; content: string }[];
      };
      expect(payload.stream).toBe(true);
      expect(payload.store).toBe(false);
      expect(payload.model).toBe('grok-4.7');
      expect(payload.tools).toEqual([{ type: 'web_search' }, { type: 'x_search' }]);
      expect(payload.input[0]?.role).toBe('system');
      expect(payload.input[0]?.content).toContain('Folio Assistente');
      expect(payload.input[0]?.content).toContain('Data di oggi: 2026-11-13.');
      expect(payload.input[0]?.content).not.toContain('valori assoluti nascosti');
      expect(payload.input[0]?.content).toContain(JSON.stringify(portfolio));
      expect(payload.input[1]).toEqual(messages[0]);
      return chunkedSse(UPSTREAM_SSE);
    });
    const app = createApp({ now: () => NOW, fetchUpstream, sleep: async () => {} });
    const res = await post(app, envOf(kv), { messages, portfolio }, APP_TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');

    const events = parseEvents(await res.text());
    expect(events.map((event) => event.event)).toEqual(['status', 'delta', 'delta', 'sources', 'done']);
    expect(events[0]?.data).toEqual({ phase: 'thinking' });
    expect(events[1]?.data).toEqual({ text: 'Ciao' });
    expect(events[2]?.data).toEqual({ text: ' mondo' });
    expect(events[3]?.data).toEqual({
      sources: [{ title: 'Esempio', url: 'https://example.com/a' }],
    });
    expect(events[4]?.data).toEqual({});
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
  });

  test('streams a weights-only portfolio when absolute amounts are omitted', async () => {
    const kv = new MemoryKv();
    await seedAccess(kv);
    const weightsOnly = {
      currency: 'EUR',
      holdings: [
        {
          symbol: 'VWCE',
          name: 'Vanguard FTSE All-World',
          assetClass: 'stocks',
          weightPct: 60,
          changePct: 1.26,
        },
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          assetClass: 'crypto',
          weightPct: 40,
        },
      ],
      allocation: [
        { label: 'Azioni & ETF', percent: 60 },
        { label: 'Crypto', percent: 40 },
      ],
    };
    const fetchUpstream = vi.fn<XaiFetcher>(async (_url, init) => {
      const payload = JSON.parse(String(init?.body)) as {
        input: { role: string; content: string }[];
      };
      const system = payload.input[0]?.content ?? '';
      expect(system).toContain('valori assoluti nascosti dall\'utente: usa solo i pesi');
      expect(system).toContain(JSON.stringify(weightsOnly));
      expect(system).not.toContain('totalValue');
      return chunkedSse(UPSTREAM_SSE);
    });
    const app = createApp({ now: () => NOW, fetchUpstream, sleep: async () => {} });
    const res = await post(app, envOf(kv), { messages, portfolio: weightsOnly }, APP_TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const events = parseEvents(await res.text());
    expect(events.map((event) => event.event)).toEqual(['status', 'delta', 'delta', 'sources', 'done']);
    expect(events[0]?.data).toEqual({ phase: 'thinking' });
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
  });

  test('retries once without tools when upstream rejects them', async () => {
    const kv = new MemoryKv();
    await seedAccess(kv);
    const fetchUpstream = vi.fn<XaiFetcher>();
    fetchUpstream.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unknown tool type' }), { status: 400 }),
    );
    fetchUpstream.mockImplementationOnce(async (_url, init) => {
      const payload = JSON.parse(String(init?.body)) as { tools?: unknown };
      expect(payload.tools).toBeUndefined();
      return chunkedSse(
        ['event: response.output_text.delta', 'data: {"delta":"ok"}', '', 'event: response.completed', 'data: {}', ''].join(
          '\n',
        ),
      );
    });
    const app = createApp({ now: () => NOW, fetchUpstream, sleep: async () => {} });
    const res = await post(app, envOf(kv), { messages }, APP_TOKEN);
    expect(res.status).toBe(200);
    const events = parseEvents(await res.text());
    expect(events.map((event) => event.event)).toEqual(['status', 'delta', 'done']);
    expect(events[0]?.data).toEqual({ phase: 'thinking' });
    expect(fetchUpstream).toHaveBeenCalledTimes(2);
  });
});

describe('toClientSse', () => {
  test('accepts citations URL arrays and dedupes them with url_citation annotations', async () => {
    const completed = {
      type: 'response.completed',
      response: {
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: 'Ciao',
                annotations: [{ type: 'url_citation', url: 'https://example.com/a', title: 'Esempio' }],
              },
            ],
          },
        ],
        citations: [
          'https://www.reuters.com/markets/a',
          '',
          'not a url',
          'https://example.com/a',
          'https://www.reuters.com/markets/a',
          'https://blog.example.com/x',
        ],
      },
    };
    const sse = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Ciao"}',
      '',
      'event: response.completed',
      `data: ${JSON.stringify(completed)}`,
      '',
    ].join('\n');
    const body = chunkedSse(sse).body;
    expect(body).not.toBeNull();
    const events = parseEvents(await new Response(toClientSse(body as ReadableStream<Uint8Array>)).text());
    expect(events.map((event) => event.event)).toEqual(['status', 'delta', 'sources', 'done']);
    expect(events[0]?.data).toEqual({ phase: 'thinking' });
    expect(events[1]?.data).toEqual({ text: 'Ciao' });
    expect(events[2]?.data).toEqual({
      sources: [
        { title: 'Esempio', url: 'https://example.com/a' },
        { title: 'reuters.com', url: 'https://www.reuters.com/markets/a' },
        { title: 'blog.example.com', url: 'https://blog.example.com/x' },
      ],
    });
  });

  test('emits thinking before upstream produces any bytes', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const upstream = new ReadableStream<Uint8Array>({
      async pull() {
        await gate;
      },
    });
    const reader = toClientSse(upstream).getReader();
    const first = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('status blocked on upstream')), 300);
      }),
    ]);
    expect(first.done).toBe(false);
    expect(new TextDecoder().decode(first.value)).toContain('"phase":"thinking"');
    release?.();
    await reader.cancel('stop');
  });

  test('cancelling the client stream cancels the upstream', async () => {
    let cancelReason: unknown;
    let releaseSecond: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let pulls = 0;
    const enc = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(
            enc.encode('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Ciao"}\n\n'),
          );
          return;
        }
        await gate;
        if (cancelReason !== undefined) return;
        controller.enqueue(
          enc.encode('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":" no"}\n\n'),
        );
      },
      cancel(reason) {
        cancelReason = reason;
      },
    });

    const client = toClientSse(upstream);
    const reader = client.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    // The opening status event is queued before upstream is read. The delta
    // pulls the stream into the second upstream read, which waits on `gate`.
    const second = await reader.read();
    expect(second.done).toBe(false);
    await reader.cancel('client closed');
    expect(cancelReason).toBe('client closed');
    releaseSecond?.();
    const next = await reader.read();
    expect(next.done).toBe(true);
  });
});

describe('statusPhaseFor', () => {
  test('maps the observed xAI event names and ignores unknown ones', () => {
    const secret = 'QUERY_SENTINEL_7f3a';
    expect(statusPhaseFor('response.created', { type: 'response.created' })).toBe('thinking');
    expect(statusPhaseFor('response.in_progress', { type: 'response.in_progress' })).toBe('thinking');
    expect(
      statusPhaseFor('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'reasoning', status: 'in_progress' },
      }),
    ).toBe('thinking');
    expect(
      statusPhaseFor('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'reasoning', status: 'completed' },
      }),
    ).toBe('thinking');
    expect(
      statusPhaseFor('response.reasoning_summary_part.added', { type: 'response.reasoning_summary_part.added' }),
    ).toBe('thinking');
    expect(
      statusPhaseFor('response.reasoning_summary_text.delta', {
        type: 'response.reasoning_summary_text.delta',
        delta: secret,
      }),
    ).toBe('thinking');
    expect(
      statusPhaseFor('response.reasoning_summary_text.done', { type: 'response.reasoning_summary_text.done' }),
    ).toBe('thinking');
    expect(
      statusPhaseFor('response.reasoning_summary_part.done', { type: 'response.reasoning_summary_part.done' }),
    ).toBe('thinking');
    expect(
      statusPhaseFor('response.output_item.done', {
        type: 'response.output_item.done',
        item: { type: 'reasoning', status: 'completed' },
      }),
    ).toBe('thinking');

    expect(
      statusPhaseFor('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'web_search_call', status: 'in_progress' },
      }),
    ).toBe('searching_web');
    expect(statusPhaseFor('response.web_search_call.in_progress', { type: 'response.web_search_call.in_progress' })).toBe(
      'searching_web',
    );
    expect(
      statusPhaseFor('response.web_search_call.searching', {
        type: 'response.web_search_call.searching',
        item: { type: 'web_search_call', status: 'searching', action: { query: secret } },
      }),
    ).toBe('searching_web');
    expect(
      statusPhaseFor('response.web_search_call.completed', {
        type: 'response.web_search_call.completed',
        item: { type: 'web_search_call', status: 'completed', action: { query: secret } },
      }),
    ).toBe('thinking');
    expect(
      statusPhaseFor('response.output_item.done', {
        type: 'response.output_item.done',
        item: { type: 'web_search_call', status: 'completed' },
      }),
    ).toBe('thinking');

    expect(
      statusPhaseFor('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'custom_tool_call', status: 'in_progress', name: 'x_keyword_search', call_id: 'xs_1' },
      }),
    ).toBe('searching_x');
    expect(
      statusPhaseFor('response.custom_tool_call_input.delta', {
        type: 'response.custom_tool_call_input.delta',
        delta: secret,
      }),
    ).toBe('searching_x');
    expect(
      statusPhaseFor('response.custom_tool_call_input.done', { type: 'response.custom_tool_call_input.done' }),
    ).toBe('searching_x');
    expect(
      statusPhaseFor('response.output_item.done', {
        type: 'response.output_item.done',
        item: { type: 'custom_tool_call', status: 'completed', name: 'x_semantic_search' },
      }),
    ).toBe('thinking');
    expect(statusPhaseFor('response.x_search_call.searching', { type: 'response.x_search_call.searching' })).toBe(
      'searching_x',
    );
    expect(statusPhaseFor('response.x_search_call.completed', { type: 'response.x_search_call.completed' })).toBe(
      'thinking',
    );
    expect(
      statusPhaseFor('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'custom_tool_call', name: 'x_user_search', status: 'in_progress' },
      }),
    ).toBe('searching_x');
    expect(
      statusPhaseFor('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'custom_tool_call', name: 'x_thread_fetch', status: 'in_progress' },
      }),
    ).toBe('searching_x');

    expect(statusPhaseFor('response.output_text.delta', { type: 'response.output_text.delta', delta: secret })).toBe(
      null,
    );
    expect(statusPhaseFor('response.content_part.added', { type: 'response.content_part.added' })).toBeNull();
    expect(statusPhaseFor('response.output_text.annotation.added', {})).toBeNull();
    expect(statusPhaseFor('response.output_text.done', {})).toBeNull();
    expect(statusPhaseFor('response.content_part.done', {})).toBeNull();
    expect(statusPhaseFor('response.completed', {
      type: 'response.completed',
      response: { output: [{ type: 'web_search_call', status: 'completed', action: { query: secret } }] },
    })).toBeNull();
    expect(
      statusPhaseFor('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'message', status: 'in_progress' },
      }),
    ).toBeNull();
    expect(
      statusPhaseFor('response.output_item.done', {
        type: 'response.output_item.done',
        item: { type: 'message', status: 'completed' },
      }),
    ).toBeNull();
    expect(
      statusPhaseFor('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'custom_tool_call', call_id: 'as_attachment', status: 'in_progress' },
      }),
    ).toBeNull();
    expect(statusPhaseFor('response.foo', { delta: secret })).toBeNull();
    expect(statusPhaseFor('', {})).toBeNull();
  });
});

describe('toClientSse status', () => {
  const reason = 'REASONING_SENTINEL_7f3a';
  const query = 'QUERY_SENTINEL_7f3a';

  function block(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  test('emits phase changes, dedupes, and stops after the first delta without leaking text', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sse = [
      block('response.created', { type: 'response.created' }),
      block('response.in_progress', { type: 'response.in_progress' }),
      block('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'reasoning', status: 'in_progress' },
      }),
      block('response.reasoning_summary_text.delta', {
        type: 'response.reasoning_summary_text.delta',
        delta: reason,
      }),
      block('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'web_search_call', status: 'in_progress' },
      }),
      block('response.web_search_call.in_progress', { type: 'response.web_search_call.in_progress' }),
      block('response.web_search_call.searching', {
        type: 'response.web_search_call.searching',
        item: { type: 'web_search_call', status: 'searching', action: { type: 'search', query } },
      }),
      block('response.web_search_call.searching', { type: 'response.web_search_call.searching' }),
      block('response.web_search_call.completed', {
        type: 'response.web_search_call.completed',
        item: { type: 'web_search_call', status: 'completed', action: { query } },
      }),
      block('response.output_item.added', {
        type: 'response.output_item.added',
        item: { type: 'custom_tool_call', status: 'in_progress', name: 'x_keyword_search', call_id: 'xs_abc' },
      }),
      block('response.custom_tool_call_input.delta', {
        type: 'response.custom_tool_call_input.delta',
        delta: query,
      }),
      block('response.custom_tool_call_input.done', { type: 'response.custom_tool_call_input.done' }),
      block('response.output_item.done', {
        type: 'response.output_item.done',
        item: { type: 'custom_tool_call', status: 'completed', name: 'x_keyword_search' },
      }),
      block('response.output_text.delta', { type: 'response.output_text.delta', delta: 'Ciao' }),
      block('response.web_search_call.searching', {
        type: 'response.web_search_call.searching',
        item: { action: { query } },
      }),
      block('response.reasoning_summary_text.delta', {
        type: 'response.reasoning_summary_text.delta',
        delta: reason,
      }),
      block('response.output_text.delta', { type: 'response.output_text.delta', delta: ' mondo' }),
    ].join('');

    const body = chunkedSse(sse).body;
    expect(body).not.toBeNull();
    const raw = await new Response(toClientSse(body as ReadableStream<Uint8Array>, { debugEvents: true })).text();
    const events = parseEvents(raw);
    expect(events.map((event) => event.event)).toEqual([
      'status',
      'status',
      'status',
      'status',
      'status',
      'delta',
      'delta',
      'done',
    ]);
    expect(events.map((event) => event.data)).toEqual([
      { phase: 'thinking' },
      { phase: 'searching_web' },
      { phase: 'thinking' },
      { phase: 'searching_x' },
      { phase: 'thinking' },
      { text: 'Ciao' },
      { text: ' mondo' },
      {},
    ]);
    expect(raw).not.toContain(reason);
    expect(raw).not.toContain(query);
    const logged = log.mock.calls.flat().map((part) => String(part)).join('\n');
    expect(logged).toContain('response.web_search_call.searching');
    expect(logged).toContain('response.custom_tool_call_input.delta');
    expect(logged).not.toContain(reason);
    expect(logged).not.toContain(query);
    log.mockRestore();
  });
});
