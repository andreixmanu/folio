-- Folio open banking (AIS, read-only). Apply later with:
--   npx wrangler d1 migrations apply folio-bank --remote
-- Nothing here is created automatically.

-- One row per consent (provider session). A new consent for the same bank
-- adds a row; accounts move to the newest session.
CREATE TABLE IF NOT EXISTS bank_sessions (
  session_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  institution_country TEXT NOT NULL,
  valid_until TEXT,
  created_at TEXT NOT NULL
);

-- Stable account id (hash of the provider identification hash), so history
-- survives consent renewals. provider_account_id is session-scoped.
CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES bank_sessions(session_id),
  provider_account_id TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  name TEXT NOT NULL,
  iban_masked TEXT,
  kind TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  balance_cents INTEGER NOT NULL DEFAULT 0,
  balance_currency TEXT NOT NULL DEFAULT 'EUR',
  balance_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Dedup: the primary key is `<accountId>:<provider tx id>` or a content hash.
-- Re-syncs use INSERT ... ON CONFLICT(id) DO UPDATE, so overlap is harmless.
CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  booking_date TEXT NOT NULL,
  value_date TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked', 'pending')),
  creditor_name TEXT,
  debtor_name TEXT,
  remittance_information TEXT,
  merchant_category_code TEXT,
  bank_transaction_code TEXT,
  source TEXT NOT NULL DEFAULT 'openbanking',
  imported_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_account_date ON bank_transactions (account_id, booking_date DESC, id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions (booking_date DESC, id);

-- Incremental sync per account: the last fully synced booking day, plus a
-- provider continuation key when a sync stopped mid-way.
CREATE TABLE IF NOT EXISTS bank_sync_cursors (
  account_id TEXT PRIMARY KEY REFERENCES bank_accounts(id),
  last_booking_date TEXT,
  continuation_key TEXT,
  full_history_done INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT NOT NULL
);
