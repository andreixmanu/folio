import type { BankAccount, BankTransaction } from './types';

export type StoredAccount = BankAccount & { sessionId: string; providerAccountId: string };

export type SyncCursor = {
  accountId: string;
  lastBookingDate?: string;
  continuationKey?: string;
  fullHistoryDone: boolean;
  lastSyncedAt: string;
};

export type SessionRow = {
  sessionId: string;
  provider: string;
  institutionName: string;
  institutionCountry: string;
  validUntil?: string;
  createdAt: string;
};

export type TransactionListQuery = {
  accountId?: string;
  from?: string;
  to?: string;
  limit: number;
  /** Opaque cursor from a previous page. */
  cursor?: string;
};

export type TransactionListPage = { transactions: BankTransaction[]; nextCursor?: string };

/** Storage port. `D1BankStore` in production, an in-memory store in tests. */
export interface BankStore {
  saveSession(session: SessionRow): Promise<void>;
  getSession(sessionId: string): Promise<SessionRow | null>;
  upsertAccount(account: StoredAccount, nowIso: string): Promise<void>;
  listAccounts(): Promise<StoredAccount[]>;
  getAccount(id: string): Promise<StoredAccount | null>;
  /** Returns how many ids were new. */
  upsertTransactions(rows: readonly BankTransaction[], nowIso: string): Promise<number>;
  listTransactions(query: TransactionListQuery): Promise<TransactionListPage>;
  getCursor(accountId: string): Promise<SyncCursor | null>;
  saveCursor(cursor: SyncCursor): Promise<void>;
}

/** Cursor = `<booking_date>|<id>` of the last row; order is date DESC, id DESC. */
export function encodeListCursor(tx: Pick<BankTransaction, 'bookingDate' | 'id'>): string {
  return btoa(`${tx.bookingDate}|${tx.id}`);
}

export function decodeListCursor(cursor: string | undefined): { date: string; id: string } | null {
  if (!cursor) return null;
  try {
    const text = atob(cursor);
    const sep = text.indexOf('|');
    if (sep !== 10) return null;
    return { date: text.slice(0, 10), id: text.slice(11) };
  } catch {
    return null;
  }
}

type TxRow = {
  id: string;
  account_id: string;
  booking_date: string;
  value_date: string | null;
  amount_cents: number;
  currency: string;
  status: 'booked' | 'pending';
  creditor_name: string | null;
  debtor_name: string | null;
  remittance_information: string | null;
  merchant_category_code: string | null;
  bank_transaction_code: string | null;
};

type AccountRow = {
  id: string;
  provider: string;
  session_id: string;
  provider_account_id: string;
  institution_name: string;
  name: string;
  iban_masked: string | null;
  kind: BankAccount['kind'];
  balance_cents: number;
  balance_currency: string;
  balance_updated_at: string;
};

function rowToTx(row: TxRow): BankTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    bookingDate: row.booking_date,
    ...(row.value_date ? { valueDate: row.value_date } : {}),
    amount: { amount: row.amount_cents / 100, currency: row.currency },
    status: row.status,
    ...(row.creditor_name ? { creditorName: row.creditor_name } : {}),
    ...(row.debtor_name ? { debtorName: row.debtor_name } : {}),
    ...(row.remittance_information ? { remittanceInformation: row.remittance_information } : {}),
    ...(row.merchant_category_code ? { merchantCategoryCode: row.merchant_category_code } : {}),
    ...(row.bank_transaction_code ? { bankTransactionCode: row.bank_transaction_code } : {}),
  };
}

function rowToAccount(row: AccountRow): StoredAccount {
  return {
    id: row.id,
    provider: row.provider,
    sessionId: row.session_id,
    providerAccountId: row.provider_account_id,
    name: row.name,
    institutionName: row.institution_name,
    ...(row.iban_masked ? { iban: row.iban_masked } : {}),
    currency: 'EUR',
    balance: { amount: row.balance_cents / 100, currency: row.balance_currency },
    balanceUpdatedAt: row.balance_updated_at,
    kind: row.kind,
  };
}

export class D1BankStore implements BankStore {
  constructor(private readonly db: D1Database) {}

  async saveSession(s: SessionRow): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO bank_sessions (session_id, provider, institution_name, institution_country, valid_until, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(session_id) DO UPDATE SET valid_until = excluded.valid_until`,
      )
      .bind(s.sessionId, s.provider, s.institutionName, s.institutionCountry, s.validUntil ?? null, s.createdAt)
      .run();
  }

  async getSession(sessionId: string): Promise<SessionRow | null> {
    const row = await this.db
      .prepare('SELECT * FROM bank_sessions WHERE session_id = ?1')
      .bind(sessionId)
      .first<{
        session_id: string;
        provider: string;
        institution_name: string;
        institution_country: string;
        valid_until: string | null;
        created_at: string;
      }>();
    if (!row) return null;
    return {
      sessionId: row.session_id,
      provider: row.provider,
      institutionName: row.institution_name,
      institutionCountry: row.institution_country,
      ...(row.valid_until ? { validUntil: row.valid_until } : {}),
      createdAt: row.created_at,
    };
  }

  async upsertAccount(a: StoredAccount, nowIso: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO bank_accounts (id, provider, session_id, provider_account_id, institution_name, name, iban_masked, kind,
           currency, balance_cents, balance_currency, balance_updated_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'EUR', ?9, ?10, ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, provider_account_id = excluded.provider_account_id,
           name = excluded.name, iban_masked = excluded.iban_masked, kind = excluded.kind,
           balance_cents = excluded.balance_cents, balance_currency = excluded.balance_currency,
           balance_updated_at = excluded.balance_updated_at, updated_at = excluded.updated_at`,
      )
      .bind(
        a.id,
        a.provider,
        a.sessionId,
        a.providerAccountId,
        a.institutionName,
        a.name,
        a.iban ?? null,
        a.kind,
        Math.round(a.balance.amount * 100),
        a.balance.currency,
        a.balanceUpdatedAt,
        nowIso,
      )
      .run();
  }

  async listAccounts(): Promise<StoredAccount[]> {
    const { results } = await this.db.prepare('SELECT * FROM bank_accounts ORDER BY institution_name, name').all<AccountRow>();
    return results.map(rowToAccount);
  }

  async getAccount(id: string): Promise<StoredAccount | null> {
    const row = await this.db.prepare('SELECT * FROM bank_accounts WHERE id = ?1').bind(id).first<AccountRow>();
    return row ? rowToAccount(row) : null;
  }

  async upsertTransactions(rows: readonly BankTransaction[], nowIso: string): Promise<number> {
    if (rows.length === 0) return 0;
    const ids = rows.map((r) => r.id);
    const existing = new Set<string>();
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const { results } = await this.db
        .prepare(`SELECT id FROM bank_transactions WHERE id IN (${chunk.map((_, j) => `?${j + 1}`).join(',')})`)
        .bind(...chunk)
        .all<{ id: string }>();
      for (const r of results) existing.add(r.id);
    }
    const stmt = this.db.prepare(
      `INSERT INTO bank_transactions (id, account_id, booking_date, value_date, amount_cents, currency, status,
         creditor_name, debtor_name, remittance_information, merchant_category_code, bank_transaction_code, source, imported_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'openbanking', ?13)
       ON CONFLICT(id) DO UPDATE SET booking_date = excluded.booking_date, value_date = excluded.value_date,
         amount_cents = excluded.amount_cents, status = excluded.status, creditor_name = excluded.creditor_name,
         debtor_name = excluded.debtor_name, remittance_information = excluded.remittance_information,
         merchant_category_code = excluded.merchant_category_code, bank_transaction_code = excluded.bank_transaction_code`,
    );
    await this.db.batch(
      rows.map((t) =>
        stmt.bind(
          t.id,
          t.accountId,
          t.bookingDate,
          t.valueDate ?? null,
          Math.round(t.amount.amount * 100),
          t.amount.currency,
          t.status,
          t.creditorName ?? null,
          t.debtorName ?? null,
          t.remittanceInformation ?? null,
          t.merchantCategoryCode ?? null,
          t.bankTransactionCode ?? null,
          nowIso,
        ),
      ),
    );
    return ids.filter((id, i) => !existing.has(id) && ids.indexOf(id) === i).length;
  }

  async listTransactions(q: TransactionListQuery): Promise<TransactionListPage> {
    const where: string[] = [];
    const args: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      args.push(value);
      where.push(sql.replace('?', `?${args.length}`));
    };
    if (q.accountId) add('account_id = ?', q.accountId);
    if (q.from) add('booking_date >= ?', q.from);
    if (q.to) add('booking_date <= ?', q.to);
    const after = decodeListCursor(q.cursor);
    if (after) {
      args.push(after.date, after.id);
      where.push(`(booking_date < ?${args.length - 1} OR (booking_date = ?${args.length - 1} AND id < ?${args.length}))`);
    }
    args.push(q.limit + 1);
    const sql = `SELECT * FROM bank_transactions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY booking_date DESC, id DESC LIMIT ?${args.length}`;
    const { results } = await this.db.prepare(sql).bind(...args).all<TxRow>();
    const page = results.slice(0, q.limit).map(rowToTx);
    const last = page[page.length - 1];
    return { transactions: page, ...(results.length > q.limit && last ? { nextCursor: encodeListCursor(last) } : {}) };
  }

  async getCursor(accountId: string): Promise<SyncCursor | null> {
    const row = await this.db
      .prepare('SELECT * FROM bank_sync_cursors WHERE account_id = ?1')
      .bind(accountId)
      .first<{
        account_id: string;
        last_booking_date: string | null;
        continuation_key: string | null;
        full_history_done: number;
        last_synced_at: string;
      }>();
    if (!row) return null;
    return {
      accountId: row.account_id,
      ...(row.last_booking_date ? { lastBookingDate: row.last_booking_date } : {}),
      ...(row.continuation_key ? { continuationKey: row.continuation_key } : {}),
      fullHistoryDone: row.full_history_done === 1,
      lastSyncedAt: row.last_synced_at,
    };
  }

  async saveCursor(c: SyncCursor): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO bank_sync_cursors (account_id, last_booking_date, continuation_key, full_history_done, last_synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(account_id) DO UPDATE SET last_booking_date = excluded.last_booking_date,
           continuation_key = excluded.continuation_key, full_history_done = excluded.full_history_done,
           last_synced_at = excluded.last_synced_at`,
      )
      .bind(c.accountId, c.lastBookingDate ?? null, c.continuationKey ?? null, c.fullHistoryDone ? 1 : 0, c.lastSyncedAt)
      .run();
  }
}

/** In-memory store with the same ordering and dedup rules (tests, local experiments). */
export class MemoryBankStore implements BankStore {
  sessions = new Map<string, SessionRow>();
  accounts = new Map<string, StoredAccount>();
  transactions = new Map<string, BankTransaction>();
  cursors = new Map<string, SyncCursor>();

  async saveSession(s: SessionRow) {
    this.sessions.set(s.sessionId, s);
  }
  async getSession(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async upsertAccount(a: StoredAccount) {
    this.accounts.set(a.id, a);
  }
  async listAccounts() {
    return [...this.accounts.values()];
  }
  async getAccount(id: string) {
    return this.accounts.get(id) ?? null;
  }
  async upsertTransactions(rows: readonly BankTransaction[]) {
    let added = 0;
    for (const row of rows) {
      if (!this.transactions.has(row.id)) added++;
      this.transactions.set(row.id, row);
    }
    return added;
  }
  async listTransactions(q: TransactionListQuery): Promise<TransactionListPage> {
    const after = decodeListCursor(q.cursor);
    const all = [...this.transactions.values()]
      .filter((t) => (!q.accountId || t.accountId === q.accountId) && (!q.from || t.bookingDate >= q.from) && (!q.to || t.bookingDate <= q.to))
      .sort((a, b) => (a.bookingDate === b.bookingDate ? (a.id < b.id ? 1 : -1) : a.bookingDate < b.bookingDate ? 1 : -1))
      .filter((t) => !after || t.bookingDate < after.date || (t.bookingDate === after.date && t.id < after.id));
    const page = all.slice(0, q.limit);
    const last = page[page.length - 1];
    return { transactions: page, ...(all.length > q.limit && last ? { nextCursor: encodeListCursor(last) } : {}) };
  }
  async getCursor(id: string) {
    return this.cursors.get(id) ?? null;
  }
  async saveCursor(c: SyncCursor) {
    this.cursors.set(c.accountId, c);
  }
}
