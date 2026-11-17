import { describe, expect, test, vi } from 'vitest';

import { createApp } from '../src/app';
import { base64UrlDecode, base64UrlEncode } from '../src/banking/crypto';
import { createEnableBankingProvider } from '../src/banking/enable-banking';
import { dedupeById, mapEnableBankingTransactions, maskIban, stableAccountId, type EbTransaction } from '../src/banking/mapping';
import { createConsentState, verifyConsentState } from '../src/banking/state';
import { MemoryBankStore } from '../src/banking/store';
import type { BankProvider, BankTransaction } from '../src/banking/types';
import type { Env } from '../src/env';

const TOKEN = 'test-token';
const NOW = Date.UTC(2026, 10, 17, 9, 0, 0);
const AUTH = { 'X-Folio-Token': TOKEN };

function baseEnv(extra: Partial<Env> = {}): Env {
  return { XAI_AUTH: {} as KVNamespace, APP_CHAT_TOKEN: TOKEN, ...extra };
}

function configuredEnv(): Env {
  return baseEnv({
    ENABLE_BANKING_APP_ID: 'app-id',
    ENABLE_BANKING_PRIVATE_KEY: 'unused-in-fake',
    BANK_REDIRECT_URL: 'https://folio.example/bank/callback',
    BANK_DB: {} as D1Database,
  });
}

const ROUTES: [string, string][] = [
  ['GET', '/bank/institutions?country=IT'],
  ['POST', '/bank/consents'],
  ['GET', '/bank/accounts'],
  ['GET', '/bank/accounts/x/transactions'],
  ['POST', '/bank/accounts/x/sync'],
  ['GET', '/bank/transactions'],
];

describe('bank routes when not configured', () => {
  test.each(ROUTES)('%s %s answers 503 bank_not_configured and lists what is missing', async (method, path) => {
    const app = createApp({ now: () => NOW });
    const res = await app.request(path, { method, headers: AUTH }, baseEnv());
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { error: string; missing: string[] };
    expect(body.error).toBe('bank_not_configured');
    expect(body.missing).toEqual(['ENABLE_BANKING_APP_ID', 'ENABLE_BANKING_PRIVATE_KEY', 'BANK_REDIRECT_URL', 'BANK_DB']);
  });

  test('token is checked before configuration', async () => {
    const app = createApp({ now: () => NOW });
    const res = await app.request('/bank/accounts', {}, baseEnv());
    expect(res.status).toBe(401);
  });

  test('callback answers 503 html without config', async () => {
    const app = createApp({ now: () => NOW });
    const res = await app.request('/bank/callback?code=a&state=b', {}, baseEnv());
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('non configurato');
  });

  test('/bank/status reports configured=false', async () => {
    const app = createApp({ now: () => NOW });
    const res = await app.request('/bank/status', { headers: AUTH }, baseEnv({ ENABLE_BANKING_APP_ID: 'x' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: 'enablebanking',
      configured: false,
      missing: ['ENABLE_BANKING_PRIVATE_KEY', 'BANK_REDIRECT_URL', 'BANK_DB'],
    });
  });
});

const EB_ROWS: EbTransaction[] = [
  {
    transaction_id: 'T1',
    transaction_amount: { currency: 'EUR', amount: '12.50' },
    credit_debit_indicator: 'DBIT',
    status: 'BOOK',
    booking_date: '2026-11-10',
    value_date: '2026-11-09',
    creditor: { name: '  Esselunga  Milano ' },
    remittance_information: ['POS 1234', 'Spesa'],
    merchant_category_code: '5411',
    bank_transaction_code: { code: 'PMNT', sub_code: 'CCRD' },
  },
  {
    entry_reference: 'E2',
    transaction_amount: { currency: 'EUR', amount: '1500.00' },
    credit_debit_indicator: 'CRDT',
    status: 'BOOK',
    booking_date: '2026-11-01',
    debtor: { name: 'ACME SRL' },
  },
  // Two identical coffees without ids stay two rows.
  { transaction_amount: { currency: 'EUR', amount: '1.20' }, credit_debit_indicator: 'DBIT', status: 'PDNG', value_date: '2026-11-12', creditor: { name: 'Bar' } },
  { transaction_amount: { currency: 'EUR', amount: '1.20' }, credit_debit_indicator: 'DBIT', status: 'PDNG', value_date: '2026-11-12', creditor: { name: 'Bar' } },
  // Unusable rows are dropped.
  { transaction_amount: { currency: 'EUR', amount: 'abc' }, booking_date: '2026-11-01' },
  { transaction_amount: { currency: 'EUR', amount: '3' } },
];

describe('Enable Banking mapping', () => {
  test('maps sign, status, names, remittance, codes and ids to the app model', async () => {
    const rows = await mapEnableBankingTransactions('acc', EB_ROWS);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      id: 'acc:T1',
      accountId: 'acc',
      bookingDate: '2026-11-10',
      valueDate: '2026-11-09',
      amount: { amount: -12.5, currency: 'EUR' },
      status: 'booked',
      creditorName: 'Esselunga Milano',
      remittanceInformation: 'POS 1234 Spesa',
      merchantCategoryCode: '5411',
      bankTransactionCode: 'PMNT-CCRD',
    });
    expect(rows[1]).toMatchObject({ id: 'acc:E2', amount: { amount: 1500 }, debtorName: 'ACME SRL' });
    expect(rows[2]?.status).toBe('pending');
    expect(rows[2]?.bookingDate).toBe('2026-11-12');
    expect(rows[2]?.id).toMatch(/^acc:h[0-9a-f]{24}$/);
    expect(rows[2]?.id).not.toBe(rows[3]?.id);
    // Deterministic: a re-fetch gives the same ids, so upserts dedupe.
    const again = await mapEnableBankingTransactions('acc', EB_ROWS);
    expect(again.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  test('dedupeById keeps one row per id and prefers booked over pending', () => {
    const pending: BankTransaction = {
      id: 'a:1',
      accountId: 'a',
      bookingDate: '2026-11-01',
      amount: { amount: -1, currency: 'EUR' },
      status: 'pending',
    };
    const out = dedupeById([pending, { ...pending, status: 'booked' }, { ...pending, id: 'a:2' }, pending]);
    expect(out.map((r) => [r.id, r.status])).toEqual([
      ['a:1', 'booked'],
      ['a:2', 'pending'],
    ]);
  });

  test('maskIban and stable ids', async () => {
    expect(maskIban('IT60 X054 2811 1010 0000 0123 456')).toBe('IT•• •••• 3456');
    expect(maskIban('short')).toBeUndefined();
    const a = await stableAccountId('Revolut', 'hash-1');
    expect(a).toMatch(/^revolut-[0-9a-f]{16}$/);
    expect(await stableAccountId('Revolut', 'hash-1')).toBe(a);
    expect(await stableAccountId('Isybank', 'hash-1')).toMatch(/^bank-/);
  });
});

describe('consent state', () => {
  test('round-trips, rejects tampering and expiry', async () => {
    const state = await createConsentState('s3cret', { name: 'Isybank', country: 'IT' }, NOW, 'n1', 'folio://budget');
    expect((await verifyConsentState('s3cret', state, NOW))?.returnTo).toBe('folio://budget');
    expect(await verifyConsentState('other', state, NOW)).toBeNull();
    expect(await verifyConsentState('s3cret', `${state}x`, NOW)).toBeNull();
    expect(await verifyConsentState('s3cret', state, NOW + 31 * 60 * 1000)).toBeNull();
  });
});

describe('Enable Banking adapter', () => {
  const algo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
  const keysPromise = crypto.subtle.generateKey(
    { ...algo, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>;
  async function testPem(): Promise<{ pem: string; publicKey: CryptoKey }> {
    const keys = await keysPromise;
    const der = (await crypto.subtle.exportKey('pkcs8', keys.privateKey)) as ArrayBuffer;
    const b64 = base64UrlEncode(der).replace(/-/g, '+').replace(/_/g, '/');
    const body = b64.match(/.{1,64}/g)!.join('\n');
    return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: keys.publicKey };
  }

  test('signs RS256 JWTs and pages transactions with continuation keys', async () => {
    const { pem, publicKey } = await testPem();
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ transactions: [EB_ROWS[0]], continuation_key: 'next-1' });
    });
    const provider = createEnableBankingProvider({ appId: 'kid-1', privateKeyPem: pem, fetch: fetchImpl, now: () => NOW });
    const page = await provider.getTransactions('uid-1', 'acc', { dateFrom: '2026-01-01', strategy: 'longest' });
    expect(page.continuationKey).toBe('next-1');
    expect(page.transactions[0]?.id).toBe('acc:T1');
    expect(calls[0]?.url).toBe(
      'https://api.enablebanking.com/accounts/uid-1/transactions?date_from=2026-01-01&strategy=longest',
    );

    const auth = new Headers(calls[0]?.init?.headers).get('Authorization') ?? '';
    const jwt = auth.replace('Bearer ', '');
    const [h, p, s] = jwt.split('.');
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(h!)));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(p!)));
    expect(header).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'kid-1' });
    expect(payload).toEqual({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: NOW / 1000, exp: NOW / 1000 + 3600 });
    const ok = await crypto.subtle.verify(algo, publicKey, base64UrlDecode(s!), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });

  test('picks the best balance and maps provider errors', async () => {
    const { pem } = await testPem();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/balances')) {
        return Response.json({
          balances: [
            { balance_type: 'CLBD', balance_amount: { amount: '10.00', currency: 'EUR' } },
            { balance_type: 'ITAV', balance_amount: { amount: '12.34', currency: 'EUR' }, reference_date: '2026-11-17' },
          ],
        });
      }
      return Response.json({ error: 'EXPIRED_SESSION' }, { status: 401 });
    });
    const provider = createEnableBankingProvider({ appId: 'k', privateKeyPem: pem, fetch: fetchImpl, now: () => NOW });
    expect(await provider.getBalance('u')).toEqual({ amount: 12.34, currency: 'EUR', referenceDate: '2026-11-17' });
    await expect(provider.getTransactions('u', 'a', {})).rejects.toMatchObject({ status: 401, code: 'EXPIRED_SESSION' });
  });
});

function fakeProvider(pages: BankTransaction[][]): BankProvider & { txCalls: unknown[] } {
  const txCalls: unknown[] = [];
  return {
    id: 'enablebanking',
    txCalls,
    async listInstitutions() {
      return [{ name: 'Revolut', country: 'IT', psuTypes: ['personal'], beta: false, maxConsentSeconds: 90 * 86_400 }];
    },
    async startConsent(input) {
      return { url: `https://auth.example/start?state=${encodeURIComponent(input.state)}`, authorizationId: 'auth-1' };
    },
    async createSession() {
      return {
        sessionId: 'sess-1',
        institution: { name: 'Revolut', country: 'IT' },
        validUntil: '2027-02-15T00:00:00Z',
        accounts: [{ providerAccountId: 'uid-1', identityHash: 'h1', name: 'Conto EUR', iban: 'LT123456789012345678', cashAccountType: 'CACC' }],
      };
    },
    async getBalance() {
      return { amount: 321.5, currency: 'EUR' };
    },
    async getTransactions(_uid, _acc, query) {
      txCalls.push(query);
      const i = query.continuationKey ? Number(query.continuationKey) : 0;
      return { transactions: pages[i] ?? [], ...(i + 1 < pages.length ? { continuationKey: String(i + 1) } : {}) };
    },
  };
}

describe('bank routes with a fake provider', () => {
  const tx = (id: string, day: string): BankTransaction => ({
    id,
    accountId: 'ignored',
    bookingDate: day,
    amount: { amount: -5, currency: 'EUR' },
    status: 'booked',
  });

  test('consent -> callback -> sync -> list, deduplicated and paginated', async () => {
    const store = new MemoryBankStore();
    const provider = fakeProvider([
      [tx('a:1', '2026-11-10'), tx('a:2', '2026-11-09')],
      [tx('a:2', '2026-11-09'), tx('a:3', '2026-08-01')],
    ]);
    const app = createApp({ now: () => NOW, bank: { createProvider: () => provider, createStore: () => store } });
    const env = configuredEnv();

    const consent = await app.request(
      '/bank/consents',
      { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ institution: { name: 'Revolut', country: 'it' }, returnTo: 'folio://budget' }) },
      env,
    );
    expect(consent.status).toBe(200);
    const consentBody = (await consent.json()) as { url: string; validUntil: string };
    // Clamped to the bank's 90-day maximum.
    expect(consentBody.validUntil).toBe(new Date(NOW + 90 * 86_400_000).toISOString());
    const state = new URL(consentBody.url).searchParams.get('state')!;

    const forged = await app.request('/bank/callback?code=c&state=bad', {}, env);
    expect(forged.status).toBe(400);

    const cb = await app.request(`/bank/callback?code=c&state=${encodeURIComponent(state)}`, {}, env);
    expect(cb.status).toBe(200);
    expect(await cb.text()).toContain('folio://budget?bank=connected');

    const accounts = (await (await app.request('/bank/accounts', { headers: AUTH }, env)).json()) as {
      accounts: { id: string; iban: string; balance: { amount: number } }[];
    };
    expect(accounts.accounts).toHaveLength(1);
    const account = accounts.accounts[0]!;
    expect(account).not.toHaveProperty('providerAccountId');
    expect(account.iban).toBe('LT•• •••• 5678');
    expect(account.balance.amount).toBe(321.5);

    const sync = await app.request(`/bank/accounts/${account.id}/sync`, { method: 'POST', headers: AUTH }, env);
    expect(await sync.json()).toMatchObject({ fetched: 4, added: 3, pages: 2, complete: true, lastBookingDate: '2026-11-10' });
    expect(provider.txCalls[0]).toMatchObject({ strategy: 'longest' });

    // Second sync is incremental with a 5-day overlap.
    await app.request(`/bank/accounts/${account.id}/sync`, { method: 'POST', headers: AUTH }, env);
    expect(provider.txCalls[2]).toMatchObject({ strategy: 'default', dateFrom: '2026-11-05' });
    expect(store.transactions.size).toBe(3);

    const page1 = (await (await app.request('/bank/transactions?limit=2', { headers: AUTH }, env)).json()) as {
      transactions: BankTransaction[];
      nextCursor: string;
    };
    expect(page1.transactions.map((t) => t.id)).toEqual(['a:1', 'a:2']);
    const page2 = (await (
      await app.request(`/bank/transactions?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`, { headers: AUTH }, env)
    ).json()) as { transactions: BankTransaction[]; nextCursor: string | null };
    expect(page2.transactions.map((t) => t.id)).toEqual(['a:3']);
    expect(page2.nextCursor).toBeNull();
  });

  test('rejects unknown returnTo schemes and bad bodies', async () => {
    const provider = fakeProvider([]);
    const app = createApp({ now: () => NOW, bank: { createProvider: () => provider, createStore: () => new MemoryBankStore() } });
    const bad = await app.request('/bank/consents', { method: 'POST', headers: AUTH, body: '{' }, configuredEnv());
    expect(bad.status).toBe(400);
    const res = await app.request(
      '/bank/consents',
      { method: 'POST', headers: AUTH, body: JSON.stringify({ institution: { name: 'Revolut', country: 'IT' }, returnTo: 'https://evil.example' }) },
      configuredEnv(),
    );
    const state = new URL(((await res.json()) as { url: string }).url).searchParams.get('state')!;
    expect((await verifyConsentState(TOKEN, state, NOW))?.returnTo).toBeUndefined();
  });
});
