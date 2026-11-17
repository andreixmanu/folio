import { base64UrlDecode, base64UrlEncode, hmacSign, hmacVerify } from './crypto';
import type { InstitutionRef } from './types';

/**
 * Consent `state`: the institution plus an expiry, HMAC-signed with a Worker
 * secret. The public callback trusts nothing else, so a forged redirect cannot
 * attach a session to Folio.
 */
export type ConsentState = { institution: InstitutionRef; exp: number; nonce: string; returnTo?: string };

const STATE_TTL_MS = 30 * 60 * 1000;

export async function createConsentState(
  secret: string,
  institution: InstitutionRef,
  nowMs: number,
  nonce: string = crypto.randomUUID(),
  returnTo?: string,
): Promise<string> {
  const payload = base64UrlEncode(
    JSON.stringify({ institution, exp: nowMs + STATE_TTL_MS, nonce, ...(returnTo ? { returnTo } : {}) }),
  );
  return `${payload}.${await hmacSign(secret, payload)}`;
}

export async function verifyConsentState(secret: string, state: string, nowMs: number): Promise<ConsentState | null> {
  const [payload, sig, extra] = state.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  if (!(await hmacVerify(secret, payload, sig))) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as ConsentState;
    if (typeof parsed.exp !== 'number' || parsed.exp < nowMs) return null;
    if (typeof parsed.institution?.name !== 'string' || typeof parsed.institution?.country !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
