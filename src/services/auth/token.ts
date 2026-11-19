import AsyncStorage from '@react-native-async-storage/async-storage';

import { resolveApiBaseUrl } from '@/services/api/config';

const KEY = 'folio-device-token';

/**
 * Device token for `X-Folio-Token`.
 * shortcut: AsyncStorage, not expo-secure-store. The 0.2.0 binary does not link
 * SecureStore; move this key there when the next APK includes that module.
 */
export async function readDeviceToken(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

/** Paired device token, or the legacy public env token until Impostazioni pairs this phone. */
export async function getAppToken(): Promise<string> {
  const device = await readDeviceToken();
  if (device) return device;
  return process.env.EXPO_PUBLIC_CHAT_TOKEN ?? '';
}

export async function pairDevice(code: string): Promise<void> {
  const base = resolveApiBaseUrl();
  if (!base) throw new Error('API non configurata');
  const res = await fetch(`${base}/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Codice non valido' : 'Accoppiamento non disponibile');
  let token: unknown;
  try {
    token = ((await res.json()) as { token?: unknown }).token;
  } catch {
    token = undefined;
  }
  if (typeof token !== 'string' || token.length < 20) throw new Error('Risposta non valida');
  await AsyncStorage.setItem(KEY, token);
}
