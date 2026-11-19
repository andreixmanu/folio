import { describe, expect, test } from 'vitest';

import { createApp } from '../src/app';
import { sha256Hex } from '../src/banking/crypto';
import type { Env } from '../src/env';
import { MemoryKv } from './memory-kv';

const STATIC = 'static-token';
const CODE = 'pairing-code-1';

function envOf(kv: MemoryKv, extra: Partial<Env> = {}): Env {
  return { XAI_AUTH: kv as unknown as KVNamespace, APP_CHAT_TOKEN: STATIC, ...extra };
}

function pair(app: ReturnType<typeof createApp>, env: Env, code: string) {
  return app.request(
    '/auth/pair',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) },
    env,
  );
}

describe('app auth', () => {
  test('the static token keeps working until the flag is off, then only a paired device works', async () => {
    const kv = new MemoryKv();
    const app = createApp();
    const open = await app.request('/bank/status', { headers: { 'X-Folio-Token': STATIC } }, envOf(kv));
    expect(open.status).toBe(200);

    const wrong = await pair(app, envOf(kv, { APP_PAIRING_CODE: CODE }), 'not-the-code');
    expect(wrong.status).toBe(401);

    const paired = await pair(app, envOf(kv, { APP_PAIRING_CODE: CODE }), CODE);
    expect(paired.status).toBe(200);
    expect(paired.headers.get('cache-control')).toBe('no-store');
    const body = (await paired.json()) as { token?: string };
    const token = body.token ?? '';
    expect(token.length).toBeGreaterThan(20);

    const hash = await sha256Hex(token);
    expect(kv.store.get(`folio-device:${hash}`)).toBe('1');
    for (const [key, value] of kv.store) {
      expect(key.includes(token)).toBe(false);
      expect(value.includes(token)).toBe(false);
    }

    const locked = envOf(kv, { APP_PAIRING_CODE: CODE, ALLOW_STATIC_APP_TOKEN: '0' });
    expect((await app.request('/bank/status', { headers: { 'X-Folio-Token': STATIC } }, locked)).status).toBe(401);
    expect((await app.request('/bank/status', { headers: { 'X-Folio-Token': token } }, locked)).status).toBe(200);
    const chat = await app.request(
      '/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Folio-Token': STATIC },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'ciao' }] }),
      },
      locked,
    );
    expect(chat.status).toBe(401);
  });

  test('pairing stays disabled until the secret is at least 8 characters', async () => {
    const app = createApp();
    const res = await pair(app, envOf(new MemoryKv(), { APP_PAIRING_CODE: 'short' }), 'short');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'pairing_disabled' });
  });
});
