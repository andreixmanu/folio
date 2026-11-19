import AsyncStorage from '@react-native-async-storage/async-storage';

import { getAppToken, pairDevice } from '@/services/auth/token';

describe('device token', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await AsyncStorage.clear();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example';
    process.env.EXPO_PUBLIC_CHAT_TOKEN = 'legacy-token';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_CHAT_TOKEN;
  });

  test('uses the legacy env token until pairing stores a device token', async () => {
    expect(await getAppToken()).toBe('legacy-token');
    const calls: [string, RequestInit | undefined][] = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push([String(url), init]);
      return { ok: true, status: 200, json: async () => ({ token: 'device-token-value-123456' }) };
    }) as typeof fetch;

    await pairDevice('  pairing-code  ');

    expect(calls[0]?.[0]).toBe('https://api.example/auth/pair');
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ code: 'pairing-code' });
    expect(await getAppToken()).toBe('device-token-value-123456');
    delete process.env.EXPO_PUBLIC_CHAT_TOKEN;
    expect(await getAppToken()).toBe('device-token-value-123456');
  });

  test('a rejected code does not replace the legacy token', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(pairDevice('wrong-code')).rejects.toThrow('Codice non valido');
    expect(await getAppToken()).toBe('legacy-token');
  });
});
