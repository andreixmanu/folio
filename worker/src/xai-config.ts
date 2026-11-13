/** Public xAI OAuth client. Shared by the Worker and mirrored in `scripts/xai-login.mjs`. */
export const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';

export const XAI_SCOPE = 'openid profile email offline_access grok-cli:access api:access';

export const XAI_DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code';

export const XAI_TOKEN_URL = 'https://auth.x.ai/oauth2/token';

export const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses';

export const XAI_DEFAULT_MODEL = 'grok-4.7';

/** Comma-separated tool types. Empty string disables tools. */
export const XAI_DEFAULT_SEARCH_TOOLS = 'web_search,x_search';
