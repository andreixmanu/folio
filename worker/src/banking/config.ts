import type { Env } from '../env';

export type BankConfig = {
  appId: string;
  privateKeyPem: string;
  /** Public URL of `GET /bank/callback`, registered as redirect URL on the provider app. */
  redirectUrl: string;
  /** Used to sign the consent `state`. */
  stateSecret: string;
  db: D1Database;
};

export type BankConfigResult = { ok: true; config: BankConfig } | { ok: false; missing: string[] };

/**
 * Reads the open-banking settings. Nothing is configured by default, so every
 * bank route answers 503 `bank_not_configured` until all of these exist.
 */
export function readBankConfig(env: Partial<Env> | undefined): BankConfigResult {
  const missing: string[] = [];
  const appId = env?.ENABLE_BANKING_APP_ID?.trim();
  const privateKeyPem = env?.ENABLE_BANKING_PRIVATE_KEY?.trim();
  const redirectUrl = env?.BANK_REDIRECT_URL?.trim();
  const stateSecret = env?.APP_CHAT_TOKEN;
  const db = env?.BANK_DB;
  if (!appId) missing.push('ENABLE_BANKING_APP_ID');
  if (!privateKeyPem) missing.push('ENABLE_BANKING_PRIVATE_KEY');
  if (!redirectUrl) missing.push('BANK_REDIRECT_URL');
  if (!stateSecret) missing.push('APP_CHAT_TOKEN');
  if (!db) missing.push('BANK_DB');
  if (!appId || !privateKeyPem || !redirectUrl || !stateSecret || !db) return { ok: false, missing };
  return { ok: true, config: { appId, privateKeyPem, redirectUrl, stateSecret, db } };
}
