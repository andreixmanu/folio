import { base64UrlEncode, sha256Hex } from './banking/crypto';
import type { Env } from './env';

const DEVICE_PREFIX = 'folio-device:';
const noStore = { 'Cache-Control': 'no-store' };

/** XOR over the longer input so a mismatch does not return early. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  let diff = left.length ^ right.length;
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

function staticAllowed(env: Env | undefined): boolean {
  return env?.ALLOW_STATIC_APP_TOKEN !== '0';
}

function pairingConfigured(env: Env | undefined): boolean {
  return (env?.APP_PAIRING_CODE?.length ?? 0) >= 8;
}

async function deviceTokenOk(env: Env | undefined, token: string): Promise<boolean> {
  if (!env?.XAI_AUTH || !token) return false;
  try {
    const hash = await sha256Hex(token);
    return (await env.XAI_AUTH.get(`${DEVICE_PREFIX}${hash}`)) !== null;
  } catch {
    return false;
  }
}

/**
 * Gate for `/chat`, `/wallets`, `/positions` and `/bank/*`.
 * A paired device token always works. The static `APP_CHAT_TOKEN` works until
 * `ALLOW_STATIC_APP_TOKEN` is `"0"`. 503 when neither secret is configured.
 */
export async function requireAppToken(env: Env | undefined, tokenHeader: string): Promise<Response | null> {
  const token = tokenHeader.trim();
  const secret = env?.APP_CHAT_TOKEN;
  if (secret && staticAllowed(env) && token && timingSafeEqual(token, secret)) return null;
  if (token && (await deviceTokenOk(env, token))) return null;
  if (!secret && !pairingConfigured(env)) return Response.json({ error: 'chat_disabled' }, { status: 503, headers: noStore });
  return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
}

/**
 * Exchange Andrei's pairing code for a device token. The raw token is returned once.
 * KV stores only its SHA-256. The code itself is a Worker secret, never logged.
 */
export async function handlePair(env: Env | undefined, body: unknown): Promise<Response> {
  const code = typeof (body as { code?: unknown } | null)?.code === 'string' ? (body as { code: string }).code.trim() : '';
  const secret = env?.APP_PAIRING_CODE ?? '';
  if (!env?.XAI_AUTH || secret.length < 8) return Response.json({ error: 'pairing_disabled' }, { status: 503, headers: noStore });
  if (!timingSafeEqual(code, secret)) return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = base64UrlEncode(bytes);
  const hash = await sha256Hex(token);
  await env.XAI_AUTH.put(`${DEVICE_PREFIX}${hash}`, '1');
  return Response.json({ token }, { headers: noStore });
}
