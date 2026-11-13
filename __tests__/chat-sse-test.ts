import { fetch as expoFetch } from 'expo/fetch';

import { parseMarkdown } from '@/features/assistant/markdown';
import { ChatError, createSseParser, streamChat } from '@/services/chat/client';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const fetchMock = expoFetch as jest.MockedFunction<typeof expoFetch>;

function eventsOf(chunks: string[]): { event: string; data: string }[] {
  const events: { event: string; data: string }[] = [];
  const parser = createSseParser((event) => events.push(event));
  for (const chunk of chunks) parser.push(chunk);
  parser.flush();
  return events;
}

describe('createSseParser', () => {
  test('joins chunks split mid-line and strips one leading data space', () => {
    const events = eventsOf(['event: delta\ndata: {"te', 'xt":"Ciao"}\n\n']);
    expect(events).toEqual([{ event: 'delta', data: '{"text":"Ciao"}' }]);
  });

  test('accepts CRLF separators, including a CR/LF pair split across chunks', () => {
    const events = eventsOf(['event: delta\r', '\ndata: {"text":"A"}\r\n\r\n']);
    expect(events).toEqual([{ event: 'delta', data: '{"text":"A"}' }]);
  });

  test('joins multi-line data fields and ignores comment lines', () => {
    const events = eventsOf([': keep-alive\n\n', 'data: line1\ndata: line2\n\n', 'event: done\ndata: {}\n\n']);
    expect(events).toEqual([
      { event: 'message', data: 'line1\nline2' },
      { event: 'done', data: '{}' },
    ]);
  });
});

describe('parseMarkdown', () => {
  test('parses bold, lists, numbered items and links', () => {
    expect(parseMarkdown('Ciao **mondo**')).toEqual([
      {
        type: 'paragraph',
        inlines: [
          { type: 'text', text: 'Ciao ' },
          { type: 'bold', text: 'mondo' },
        ],
      },
    ]);

    const bullets = parseMarkdown('- uno\n* due\n• tre');
    expect(bullets).toEqual([
      {
        type: 'bullet',
        items: [
          [{ type: 'text', text: 'uno' }],
          [{ type: 'text', text: 'due' }],
          [{ type: 'text', text: 'tre' }],
        ],
      },
    ]);

    expect(parseMarkdown('1. primo\n2. secondo')).toEqual([
      {
        type: 'numbered',
        items: [[{ type: 'text', text: 'primo' }], [{ type: 'text', text: 'secondo' }]],
      },
    ]);

    expect(parseMarkdown('Vedi [Kraken](https://kraken.com/prezzi).')).toEqual([
      {
        type: 'paragraph',
        inlines: [
          { type: 'text', text: 'Vedi ' },
          { type: 'link', text: 'Kraken', url: 'https://kraken.com/prezzi' },
          { type: 'text', text: '.' },
        ],
      },
    ]);
  });
});

describe('streamChat', () => {
  const previousApi = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'https://folio.test/api';
    fetchMock.mockReset();
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_API_URL = previousApi;
  });

  test('reads a text body when the stream is missing', async () => {
    const raw = 'event: delta\ndata: {"text":"Ciao"}\n\nevent: done\ndata: {}\n\n';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => raw,
    } as unknown as Awaited<ReturnType<typeof expoFetch>>);
    let text = '';
    await streamChat({
      messages: [{ role: 'user', content: 'ciao' }],
      onDelta: (delta) => {
        text += delta;
      },
      onSources: () => {},
    });
    expect(text).toBe('Ciao');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://folio.test/api/chat');
  });

  test('throws ChatError with the server message on JSON 401', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      body: null,
      text: async () =>
        JSON.stringify({
          error: 'login_required',
          message: 'Accesso xAI scaduto: rifai il login (npm run login:xai).',
        }),
    } as unknown as Awaited<ReturnType<typeof expoFetch>>);
    const error = await streamChat({
      messages: [{ role: 'user', content: 'ciao' }],
      onDelta: () => {},
      onSources: () => {},
    }).then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(ChatError);
    expect(error).toMatchObject({
      code: 'login_required',
      message: 'Accesso xAI scaduto: rifai il login (npm run login:xai).',
    });
  });

  test('resolves quietly when the request is aborted', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const pending = streamChat({
      messages: [{ role: 'user', content: 'ciao' }],
      signal: controller.signal,
      onDelta: () => {},
      onSources: () => {},
    });
    controller.abort();
    await expect(pending).resolves.toBeUndefined();
  });
});
