export type Env = {
  XAI_AUTH: KVNamespace;
  APP_CHAT_TOKEN?: string;
  XAI_MODEL?: string;
  XAI_SEARCH_TOOLS?: string;
  /** Set to `"1"` to log upstream SSE event type names. Off unless exactly `"1"`. */
  XAI_DEBUG_EVENTS?: string;
};
