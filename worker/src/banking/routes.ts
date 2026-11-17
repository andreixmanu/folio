import type { Context, Hono } from 'hono';

import { requireAppToken } from '../auth';
import type { Env } from '../env';
import { readBankConfig, type BankConfig } from './config';
import { createEnableBankingProvider, type FetchLike } from './enable-banking';
import { dedupeById, mapAccount, stableAccountId } from './mapping';
import { createConsentState, verifyConsentState } from './state';
import { D1BankStore, type BankStore, type StoredAccount } from './store';
import { BankProviderError, type BankProvider, type Institution } from './types';

export type BankDeps = {
  now?: () => number;
  fetch?: FetchLike;
  /** Tests inject a fake provider and store; production builds them from the config. */
  createProvider?: (config: BankConfig) => BankProvider;
  createStore?: (config: BankConfig) => BankStore;
};

type Ctx = Context<{ Bindings: Env }>;

const DEFAULT_CONSENT_DAYS = 180;
const FALLBACK_CONSENT_DAYS = 90;
const MAX_SYNC_PAGES = 20;
/** Overlap re-fetched on incremental syncs, so late-booked rows are not missed. */
const SYNC_OVERLAP_DAYS = 5;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Where the callback page may send the user back to (app deep links only). */
const RETURN_TO_RE = /^(folio|exp|exps):\/\/[^\s"'<>]*$/;

function noStore(c: Ctx) {
  c.header('Cache-Control', 'no-store');
}

function notConfigured(c: Ctx, missing: string[]) {
  noStore(c);
  return c.json({ error: 'bank_not_configured', provider: 'enablebanking', missing }, 503);
}

function providerError(c: Ctx, err: unknown) {
  noStore(c);
  if (err instanceof BankProviderError) {
    const status = err.status === 401 || err.status === 403 ? 502 : err.status;
    return c.json({ error: 'bank_provider_error', status: err.status, code: err.code ?? null }, status as 400);
  }
  throw err;
}

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function resultPage(title: string, message: string, returnTo?: string): string {
  const link = returnTo ? `<p><a href="${escapeHtml(returnTo)}">Torna a Folio</a></p>` : '';
  const redirect = returnTo ? `<meta http-equiv="refresh" content="1;url=${escapeHtml(returnTo)}">` : '';
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${redirect}<title>${escapeHtml(title)}</title></head><body style="font-family:system-ui;padding:32px;max-width:480px;margin:auto"><h1 style="font-size:20px">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${link}</body></html>`;
}

/**
 * Open-banking routes (AIS, read-only). All but `/bank/callback` need
 * `X-Folio-Token`. Without the Enable Banking secrets and the `BANK_DB`
 * binding every route answers 503 `bank_not_configured`.
 */
export function registerBankRoutes(app: Hono<{ Bindings: Env }>, deps: BankDeps = {}): void {
  const now = deps.now ?? (() => Date.now());
  const makeProvider =
    deps.createProvider ??
    ((config: BankConfig) =>
      createEnableBankingProvider({ appId: config.appId, privateKeyPem: config.privateKeyPem, fetch: deps.fetch, now }));
  const makeStore = deps.createStore ?? ((config: BankConfig) => new D1BankStore(config.db));
  let institutionsCache: { at: number; country: string; list: Institution[] } | null = null;

  /** Token gate, then config gate. Returns a Response to short-circuit. */
  function gate(c: Ctx): { config: BankConfig } | Response {
    const denied = requireAppToken(c.env, c.req.header('X-Folio-Token') ?? '');
    if (denied) return denied;
    const cfg = readBankConfig(c.env);
    if (!cfg.ok) return notConfigured(c, cfg.missing);
    return { config: cfg.config };
  }

  async function institutions(provider: BankProvider, country: string): Promise<Institution[]> {
    if (institutionsCache && institutionsCache.country === country && now() - institutionsCache.at < 3_600_000) {
      return institutionsCache.list;
    }
    const list = await provider.listInstitutions(country);
    institutionsCache = { at: now(), country, list };
    return list;
  }

  app.get('/bank/status', (c) => {
    const denied = requireAppToken(c.env, c.req.header('X-Folio-Token') ?? '');
    if (denied) return denied;
    const cfg = readBankConfig(c.env);
    noStore(c);
    return c.json({ provider: 'enablebanking', configured: cfg.ok, missing: cfg.ok ? [] : cfg.missing });
  });

  /** GET /bank/institutions?country=IT&q=revolut */
  app.get('/bank/institutions', async (c) => {
    const g = gate(c);
    if (g instanceof Response) return g;
    const country = (c.req.query('country') ?? 'IT').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return c.json({ error: 'Invalid country' }, 400);
    const q = c.req.query('q')?.trim().toLowerCase();
    try {
      const list = await institutions(makeProvider(g.config), country);
      noStore(c);
      return c.json({ institutions: q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list });
    } catch (err) {
      return providerError(c, err);
    }
  });

  /** POST /bank/consents { institution: { name, country }, psuType?, days?, returnTo? } -> { url } */
  app.post('/bank/consents', async (c) => {
    const g = gate(c);
    if (g instanceof Response) return g;
    let body: { institution?: { name?: unknown; country?: unknown }; psuType?: unknown; days?: unknown; returnTo?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    const name = typeof body.institution?.name === 'string' ? body.institution.name.trim() : '';
    const country = typeof body.institution?.country === 'string' ? body.institution.country.trim().toUpperCase() : '';
    if (!name || !/^[A-Z]{2}$/.test(country)) return c.json({ error: 'institution.name and institution.country required' }, 400);
    const psuType = body.psuType === 'business' ? 'business' : 'personal';
    const days = typeof body.days === 'number' && body.days > 0 ? Math.min(body.days, DEFAULT_CONSENT_DAYS) : DEFAULT_CONSENT_DAYS;
    const returnTo = typeof body.returnTo === 'string' && RETURN_TO_RE.test(body.returnTo) ? body.returnTo : undefined;
    const provider = makeProvider(g.config);
    try {
      let maxSeconds = FALLBACK_CONSENT_DAYS * 86_400;
      try {
        const match = (await institutions(provider, country)).find((i) => i.name === name);
        if (match?.maxConsentSeconds) maxSeconds = match.maxConsentSeconds;
      } catch {
        // keep the conservative fallback
      }
      const validUntil = new Date(now() + Math.min(days * 86_400, maxSeconds) * 1000).toISOString();
      const state = await createConsentState(g.config.stateSecret, { name, country }, now(), undefined, returnTo);
      const started = await provider.startConsent({
        institution: { name, country },
        psuType,
        validUntil,
        redirectUrl: g.config.redirectUrl,
        state,
        language: 'it',
      });
      noStore(c);
      return c.json({ url: started.url, authorizationId: started.authorizationId, validUntil });
    } catch (err) {
      return providerError(c, err);
    }
  });

  /**
   * GET /bank/callback?code=…&state=… — public: the bank redirects the browser here.
   * Only a valid signed `state` is accepted. Stores the session and its accounts.
   */
  app.get('/bank/callback', async (c) => {
    noStore(c);
    const cfg = readBankConfig(c.env);
    if (!cfg.ok) return c.html(resultPage('Open banking non configurato', 'Il collegamento bancario non è ancora attivo.'), 503);
    const state = await verifyConsentState(cfg.config.stateSecret, c.req.query('state') ?? '', now());
    if (!state) return c.html(resultPage('Link non valido', 'Il collegamento è scaduto o non è valido. Riprova da Folio.'), 400);
    const back = (status: string) => (state.returnTo ? `${state.returnTo}${state.returnTo.includes('?') ? '&' : '?'}bank=${status}` : undefined);
    const error = c.req.query('error');
    const code = c.req.query('code');
    if (error || !code) {
      return c.html(resultPage('Collegamento annullato', 'Nessun conto è stato collegato.', back('cancelled')), 400);
    }
    const provider = makeProvider(cfg.config);
    const store = makeStore(cfg.config);
    try {
      const session = await provider.createSession(code);
      const nowIso = new Date(now()).toISOString();
      const institutionName = session.institution.name || state.institution.name;
      await store.saveSession({
        sessionId: session.sessionId,
        provider: provider.id,
        institutionName,
        institutionCountry: session.institution.country || state.institution.country,
        ...(session.validUntil ? { validUntil: session.validUntil } : {}),
        createdAt: nowIso,
      });
      for (const account of session.accounts) {
        const id = await stableAccountId(institutionName, account.identityHash);
        const balance = await provider.getBalance(account.providerAccountId).catch(() => null);
        const mapped = mapAccount(id, institutionName, account, balance, nowIso);
        await store.upsertAccount(
          { ...mapped, sessionId: session.sessionId, providerAccountId: account.providerAccountId },
          nowIso,
        );
      }
      const n = session.accounts.length;
      return c.html(
        resultPage('Conto collegato', `${institutionName}: ${n} ${n === 1 ? 'conto' : 'conti'} collegati. Puoi tornare a Folio.`, back('connected')),
      );
    } catch (err) {
      if (err instanceof BankProviderError) {
        return c.html(resultPage('Errore della banca', 'Il collegamento non è riuscito. Riprova più tardi.', back('error')), 502);
      }
      throw err;
    }
  });

  /** GET /bank/accounts?refresh=1 — stored accounts; `refresh=1` re-reads balances. */
  app.get('/bank/accounts', async (c) => {
    const g = gate(c);
    if (g instanceof Response) return g;
    const store = makeStore(g.config);
    let accounts = await store.listAccounts();
    if (c.req.query('refresh') === '1' && accounts.length > 0) {
      const provider = makeProvider(g.config);
      const nowIso = new Date(now()).toISOString();
      accounts = await Promise.all(
        accounts.map(async (a): Promise<StoredAccount> => {
          const balance = await provider.getBalance(a.providerAccountId).catch(() => null);
          if (!balance) return a;
          const next = {
            ...a,
            balance: { amount: balance.amount, currency: balance.currency },
            balanceUpdatedAt: balance.referenceDate ?? nowIso,
          };
          await store.upsertAccount(next, nowIso);
          return next;
        }),
      );
    }
    noStore(c);
    return c.json({ accounts: accounts.map(({ sessionId: _s, providerAccountId: _p, ...pub }) => pub) });
  });

  /**
   * GET /bank/accounts/:id/transactions?from&to&continuationKey&strategy=longest
   * One live provider page; rows are also saved (deduplicated by id).
   */
  app.get('/bank/accounts/:id/transactions', async (c) => {
    const g = gate(c);
    if (g instanceof Response) return g;
    const from = c.req.query('from');
    const to = c.req.query('to');
    if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) return c.json({ error: 'Dates must be YYYY-MM-DD' }, 400);
    const store = makeStore(g.config);
    const account = await store.getAccount(c.req.param('id'));
    if (!account) return c.json({ error: 'account_not_found' }, 404);
    try {
      const page = await makeProvider(g.config).getTransactions(account.providerAccountId, account.id, {
        ...(from ? { dateFrom: from } : {}),
        ...(to ? { dateTo: to } : {}),
        ...(c.req.query('continuationKey') ? { continuationKey: c.req.query('continuationKey') } : {}),
        strategy: c.req.query('strategy') === 'longest' ? 'longest' : 'default',
      });
      const rows = dedupeById(page.transactions);
      const added = await store.upsertTransactions(rows, new Date(now()).toISOString());
      noStore(c);
      return c.json({ transactions: rows, continuationKey: page.continuationKey ?? null, added });
    } catch (err) {
      return providerError(c, err);
    }
  });

  /**
   * POST /bank/accounts/:id/sync — first run asks for the longest history
   * (Revolut: only within minutes of consent), later runs fetch from the last
   * synced day minus a small overlap. Resumable through the saved continuation key.
   */
  app.post('/bank/accounts/:id/sync', async (c) => {
    const g = gate(c);
    if (g instanceof Response) return g;
    const store = makeStore(g.config);
    const account = await store.getAccount(c.req.param('id'));
    if (!account) return c.json({ error: 'account_not_found' }, 404);
    const provider = makeProvider(g.config);
    const cursor = await store.getCursor(account.id);
    const first = !cursor?.fullHistoryDone;
    const dateFrom = !first && cursor?.lastBookingDate ? addDays(cursor.lastBookingDate, -SYNC_OVERLAP_DAYS) : undefined;
    let continuationKey = cursor?.continuationKey;
    let latest = cursor?.lastBookingDate;
    let added = 0;
    let fetched = 0;
    let pages = 0;
    try {
      do {
        const page = await provider.getTransactions(account.providerAccountId, account.id, {
          ...(dateFrom ? { dateFrom } : {}),
          ...(continuationKey ? { continuationKey } : {}),
          strategy: first ? 'longest' : 'default',
        });
        const rows = dedupeById(page.transactions);
        fetched += rows.length;
        added += await store.upsertTransactions(rows, new Date(now()).toISOString());
        for (const row of rows) if (row.status === 'booked' && (!latest || row.bookingDate > latest)) latest = row.bookingDate;
        continuationKey = page.continuationKey;
        pages++;
      } while (continuationKey && pages < MAX_SYNC_PAGES);
    } catch (err) {
      await store.saveCursor({
        accountId: account.id,
        ...(latest ? { lastBookingDate: latest } : {}),
        ...(continuationKey ? { continuationKey } : {}),
        fullHistoryDone: cursor?.fullHistoryDone ?? false,
        lastSyncedAt: new Date(now()).toISOString(),
      });
      return providerError(c, err);
    }
    const done = !continuationKey;
    await store.saveCursor({
      accountId: account.id,
      ...(latest ? { lastBookingDate: latest } : {}),
      ...(continuationKey ? { continuationKey } : {}),
      fullHistoryDone: (cursor?.fullHistoryDone ?? false) || done,
      lastSyncedAt: new Date(now()).toISOString(),
    });
    noStore(c);
    return c.json({ accountId: account.id, fetched, added, pages, complete: done, lastBookingDate: latest ?? null });
  });

  /** GET /bank/transactions?from&to&accountId&cursor&limit — saved rows, newest first. */
  app.get('/bank/transactions', async (c) => {
    const g = gate(c);
    if (g instanceof Response) return g;
    const from = c.req.query('from');
    const to = c.req.query('to');
    if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) return c.json({ error: 'Dates must be YYYY-MM-DD' }, 400);
    const limitRaw = Number(c.req.query('limit') ?? 500);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 500;
    const page = await makeStore(g.config).listTransactions({
      limit,
      ...(c.req.query('accountId') ? { accountId: c.req.query('accountId') } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(c.req.query('cursor') ? { cursor: c.req.query('cursor') } : {}),
    });
    noStore(c);
    return c.json({ transactions: page.transactions, nextCursor: page.nextCursor ?? null });
  });
}
