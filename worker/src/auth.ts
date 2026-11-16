import type { Env } from './env';

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

/**
 * Shared `X-Folio-Token` gate for `/chat` and `/wallets`.
 * 503 when `APP_CHAT_TOKEN` is unset, 401 when the header does not match.
 */
export function requireAppToken(env: Pick<Env, 'APP_CHAT_TOKEN'> | undefined, tokenHeader: string): Response | null {
  const secret = env?.APP_CHAT_TOKEN;
  if (!secret) return Response.json({ error: 'chat_disabled' }, { status: 503 });
  if (!timingSafeEqual(tokenHeader, secret)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return null;
}
