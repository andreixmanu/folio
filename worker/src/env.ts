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
};
