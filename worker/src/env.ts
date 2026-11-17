export type Env = {
  XAI_AUTH: KVNamespace;
  APP_CHAT_TOKEN?: string;
  XAI_MODEL?: string;
  XAI_SEARCH_TOOLS?: string;
  /** Set to `"1"` to log upstream SSE event type names. Off unless exactly `"1"`. */
  XAI_DEBUG_EVENTS?: string;
  /** Public Bitcoin receive address (never logged or returned). */
  BTC_ADDRESS?: string;
  /** Public Ethereum receive address (never logged or returned). */
  ETH_ADDRESS?: string;
  /**
   * Optional comma-separated https Ethereum JSON-RPC URLs.
   * Empty or unset keeps the built-in public endpoints. Non-https entries are ignored.
   */
  ETH_RPC_URLS?: string;
  /** Open banking (Enable Banking). All unset by default: bank routes answer 503. */
  ENABLE_BANKING_APP_ID?: string;
  /** PKCS#8 PEM private key of the Enable Banking application (Worker secret). */
  ENABLE_BANKING_PRIVATE_KEY?: string;
  /** Public URL of `GET /bank/callback`, e.g. `https://folio-api.<sub>.workers.dev/bank/callback`. */
  BANK_REDIRECT_URL?: string;
  /** D1 database with `migrations/0001_banking.sql` applied. */
  BANK_DB?: D1Database;
};
