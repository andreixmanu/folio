import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { kvPutArgs } from '../scripts/xai-login.mjs';

import type { Env } from '../src/env';
import {
  XAI_CLIENT_ID,
  XAI_DEVICE_CODE_URL,
  XAI_SCOPE,
  XAI_TOKEN_URL,
} from '../src/xai-config';
import {
  assertXaiUrl,
  getAccessToken,
  resetXaiAuthForTests,
  XaiAuthError,
  type XaiFetcher,
} from '../src/xai-auth';

import { MemoryKv } from './memory-kv';

const NOW = 1_700_000_000_000;
const SKEW_MS = 60 * 60 * 1000;

function envOf(kv: MemoryKv): Env {
  return { XAI_AUTH: kv as unknown as KVNamespace };
}

function tokenResponse(access: string, refresh: string, expiresIn?: number, status = 200): Response {
  const body: Record<string, unknown> = {
    access_token: access,
    refresh_token: refresh,
    token_type: 'Bearer',
  };
  if (expiresIn !== undefined) body.expires_in = expiresIn;
  return Response.json(body, { status });
}

function readConst(src: string, name: string): string {
  const match = new RegExp(String.raw`(?:const|let)\s+${name}\s*=\s*(['"])(.*?)\1`).exec(src);
  const value = match?.[2];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

describe('xAI config', () => {
  test('login script copies the public client constants', () => {
    const src = readFileSync(new URL('../scripts/xai-login.mjs', import.meta.url), 'utf8');
    expect(readConst(src, 'XAI_CLIENT_ID')).toBe(XAI_CLIENT_ID);
    expect(readConst(src, 'XAI_SCOPE')).toBe(XAI_SCOPE);
    expect(readConst(src, 'XAI_DEVICE_CODE_URL')).toBe(XAI_DEVICE_CODE_URL);
    expect(readConst(src, 'XAI_TOKEN_URL')).toBe(XAI_TOKEN_URL);
    expect(src.match(/console\.log\(/g)).toHaveLength(2);
    expect(src).toContain("console.log(line)");
    expect(src).toContain("console.log('OK')");
    expect(src).toContain('spawnSync');
    expect(src).toContain('shell: false');
    expect(src).not.toContain('execSync');
    expect(src).toContain("'refresh_token'");
    expect(src).toContain("'access_token'");
    expect(src).toContain('--remote');
    expect(src).toContain('--local');
    expect(src).toContain('mkdtempSync');
    expect(src).toContain('folio-xai-');
    expect(src).toContain('0o600');
    expect(src).toContain('kvPutArgs');
    expect(src).not.toContain("'--'");
    // Node accepts redirect:'error'. The worker cannot; this script stays on Node.
    expect(src).toContain("redirect: 'error'");
  });

  test('kv put reads the token from a file via --path', () => {
    const file = '/tmp/folio-xai-test/value';
    const local = kvPutArgs(file, false);
    expect(local).toContain('--path');
    expect(local).toContain('--local');
    expect(local).not.toContain('--');
    expect(local).toEqual([
      'kv',
      'key',
      'put',
      '--local',
      '--binding',
      'XAI_AUTH',
      'refresh_token',
      '--path',
      file,
    ]);

    const remote = kvPutArgs(file, true);
    expect(remote).toContain('--path');
    expect(remote).toContain('--remote');
    expect(remote).not.toContain('--');
    expect(remote).not.toContain('--local');
    expect(remote.at(-2)).toBe('--path');
    expect(remote.at(-1)).toBe(file);
  });
});

describe('assertXaiUrl', () => {
  test('rejects non-https and lookalike hosts', () => {
    expect(() => assertXaiUrl('http://api.x.ai')).toThrow(/non-xAI/);
    expect(() => assertXaiUrl('https://x.ai.evil.com')).toThrow(/non-xAI/);
    expect(() => assertXaiUrl('https://evilx.ai')).toThrow(/non-xAI/);
    expect(assertXaiUrl('https://x.ai/oauth').hostname).toBe('x.ai');
    expect(assertXaiUrl('https://auth.x.ai/oauth2/token').hostname).toBe('auth.x.ai');
    expect(assertXaiUrl('https://api.x.ai/v1/responses').hostname).toBe('api.x.ai');
  });
});

describe('getAccessToken', () => {
  beforeEach(() => resetXaiAuthForTests());

  test('rotates the refresh token, caches, and refreshes again inside the skew window', async () => {
    const kv = new MemoryKv();
    await kv.put('refresh_token', 'rt-1');
    let clock = NOW;
    const fetchMock = vi.fn<XaiFetcher>(async (_url, init) => {
      const sent = new URLSearchParams(String(init?.body ?? '')).get('refresh_token');
      if (sent === 'rt-1') return tokenResponse('acc-1', 'rt-2', 6 * 3600);
      if (sent === 'rt-2') return tokenResponse('acc-2', 'rt-3', 6 * 3600);
      throw new Error(`unexpected refresh token ${sent}`);
    });
    const deps = { now: () => clock, fetch: fetchMock, sleep: async () => {} };
    const env = envOf(kv);

    const first = await getAccessToken(env, deps);
    expect(first).toBe('acc-1');
    expect(await kv.get('refresh_token')).toBe('rt-2');
    const stored = JSON.parse((await kv.get('access_token')) ?? '') as { token: string; expiresAt: number };
    expect(stored).toEqual({ token: 'acc-1', expiresAt: NOW + 6 * 3600 * 1000 });
    const accessPut = kv.puts.filter((put) => put.key === 'access_token').at(-1);
    expect(accessPut?.options?.expirationTtl).toBe(6 * 3600 + 5 * 60);
    const refreshIdx = kv.puts.findIndex((put) => put.key === 'refresh_token' && put.value === 'rt-2');
    const accessIdx = kv.puts.findIndex((put) => put.key === 'access_token');
    expect(refreshIdx).toBeGreaterThanOrEqual(0);
    expect(accessIdx).toBeGreaterThan(refreshIdx);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe(XAI_TOKEN_URL);
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(String(init?.body ?? ''));
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('rt-1');
    expect(params.get('client_id')).toBe(XAI_CLIENT_ID);

    expect(await getAccessToken(env, deps)).toBe('acc-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clock = stored.expiresAt - SKEW_MS - 1;
    expect(await getAccessToken(env, deps)).toBe('acc-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clock = stored.expiresAt - SKEW_MS;
    expect(await getAccessToken(env, deps)).toBe('acc-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const again = new URLSearchParams(String(fetchMock.mock.calls[1]?.[1]?.body ?? ''));
    expect(again.get('refresh_token')).toBe('rt-2');
    expect(await kv.get('refresh_token')).toBe('rt-3');
  });

  test('defaults a missing expires_in to 6 hours', async () => {
    const kv = new MemoryKv();
    await kv.put('refresh_token', 'rt-1');
    const fetchMock = vi.fn<XaiFetcher>(async () => tokenResponse('acc-1', 'rt-2'));
    await getAccessToken(envOf(kv), { now: () => NOW, fetch: fetchMock, sleep: async () => {} });
    const stored = JSON.parse((await kv.get('access_token')) ?? '') as { expiresAt: number };
    expect(stored.expiresAt).toBe(NOW + 6 * 60 * 60 * 1000);
  });

  test('concurrent callers share one refresh', async () => {
    const kv = new MemoryKv();
    await kv.put('refresh_token', 'rt-1');
    let release!: (res: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn<XaiFetcher>(async () => gate);
    const deps = { now: () => NOW, fetch: fetchMock, sleep: async () => {} };
    const env = envOf(kv);

    const first = getAccessToken(env, deps);
    const second = getAccessToken(env, deps);
    for (let i = 0; i < 20 && fetchMock.mock.calls.length === 0; i++) await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(tokenResponse('acc-shared', 'rt-2', 6 * 3600));
    await expect(first).resolves.toBe('acc-shared');
    await expect(second).resolves.toBe('acc-shared');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('invalid_grant and a missing refresh token are login_required', async () => {
    const missing = new MemoryKv();
    await expect(
      getAccessToken(envOf(missing), { now: () => NOW, fetch: vi.fn(), sleep: async () => {} }),
    ).rejects.toBeInstanceOf(XaiAuthError);
    await expect(
      getAccessToken(envOf(missing), { now: () => NOW, fetch: vi.fn(), sleep: async () => {} }),
    ).rejects.toMatchObject({ code: 'login_required' });

    const kv = new MemoryKv();
    await kv.put('refresh_token', 'rt-dead');
    await kv.put('access_token', JSON.stringify({ token: 'still-valid', expiresAt: NOW + 30 * 60 * 1000 }));
    const fetchMock = vi.fn<XaiFetcher>(async () =>
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
    );
    await expect(
      getAccessToken(envOf(kv), { now: () => NOW, fetch: fetchMock, sleep: async () => {} }),
    ).rejects.toMatchObject({ code: 'login_required' });
    expect(await kv.get('access_token')).toContain('still-valid');
  });

  test('a 3xx from the token endpoint is an upstream failure and is not followed', async () => {
    const kv = new MemoryKv();
    await kv.put('refresh_token', 'rt-1');
    await kv.put('access_token', JSON.stringify({ token: 'cached', expiresAt: NOW + 30 * 60 * 1000 }));
    const fetchMock = vi.fn<XaiFetcher>(async () =>
      new Response('redirect', { status: 302, headers: { Location: 'https://evil.example/oauth2/token' } }),
    );
    let thrown: unknown;
    try {
      await getAccessToken(envOf(kv), { now: () => NOW, fetch: fetchMock, sleep: async () => {} });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(XaiAuthError);
    expect((thrown as Error).message).toBe('xAI token refresh failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(XAI_TOKEN_URL);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(await kv.get('refresh_token')).toBe('rt-1');
    expect(await kv.get('access_token')).toContain('cached');
  });

  test('a transient refresh failure returns a cached token that is still valid', async () => {
    const kv = new MemoryKv();
    await kv.put('refresh_token', 'rt-1');
    await kv.put('access_token', JSON.stringify({ token: 'cached', expiresAt: NOW + 30 * 60 * 1000 }));
    const fetchMock = vi.fn<XaiFetcher>(async () => new Response('down', { status: 500 }));
    const token = await getAccessToken(envOf(kv), {
      now: () => NOW,
      fetch: fetchMock,
      sleep: async () => {},
    });
    expect(token).toBe('cached');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a refresh lock waits and re-reads instead of rotating again', async () => {
    const kv = new MemoryKv();
    await kv.put('refresh_token', 'rt-old');
    await kv.put('refresh_lock', '1');
    await kv.put('access_token', JSON.stringify({ token: 'stale', expiresAt: NOW + 30 * 60 * 1000 }));
    const slept: number[] = [];
    const fetchMock = vi.fn<XaiFetcher>(async () => {
      throw new Error('should not refresh');
    });
    const token = await getAccessToken(envOf(kv), {
      now: () => NOW,
      fetch: fetchMock,
      sleep: async (ms) => {
        slept.push(ms);
        await kv.put('access_token', JSON.stringify({ token: 'fresh', expiresAt: NOW + 6 * 3600 * 1000 }));
      },
    });
    expect(slept).toEqual([1000]);
    expect(token).toBe('fresh');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
