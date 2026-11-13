# folio-worker

Cloudflare Worker (Hono) that proxies Kraken's free public API (no key) and normalizes it for the app. `POST /chat` is a markets-only assistant backed by xAI.

| Endpoint | Description | Cache |
| --- | --- | --- |
| `GET /prices?symbols=BTC,ETH,SOL` | Live EUR quotes (Kraken `Ticker`), `changePct` vs today's 00:00 UTC open | 30 s |
| `GET /history?symbols=BTC,ETH&range=1M` | Close prices (Kraken `OHLC`), `t` in seconds | 1 min – 6 h by range |
| `GET /logo/:symbol` | Stock/ETF logo PNG, proxied from Financial Modeling Prep's public no-key image endpoint (ETFs mapped to the issuer listing, e.g. VWCE → VWRL.L); 404 if unknown | 7 days (misses 1 day) |
| `POST /chat` | Assistente mercati (xAI). Header `X-Folio-Token`. SSE: `delta`, `sources`, `error`, `done` | – |
| `GET /health` | Liveness | – |

Ranges → OHLC interval (≤ 720 candles): 1D 15m · 1W 1h · 1M 4h · 1Y 1d · ALL 1w.
Unknown symbols are returned in `unsupported` so the app can try a fallback source later.
Symbol map and Kraken naming quirks (XBT/XXBT, XETHZEUR, XDG…) live in `src/symbols.ts`.

```bash
npm install
npm test          # vitest
npm run typecheck
npm run dev       # wrangler dev on :8787 (local only, no Cloudflare login, no deploy)
```

In development the Expo dev server proxies `/api/*` to `http://127.0.0.1:8787` (see `../metro.config.js`),
so Expo Go reaches the Worker through the same tunnel as Metro.

## Assistente (xAI)

The Worker calls xAI with a refresh token stored in KV. The app authenticates to the Worker with `APP_CHAT_TOKEN` (header `X-Folio-Token`). The OAuth client is public: there is no client secret.

```bash
cp .dev.vars.example .dev.vars   # set APP_CHAT_TOKEN; `.dev.vars` is gitignored
npm run login:xai                # device flow
```

`login:xai` prints one line to stdout, the verification URL. Open it and approve access. Progress stays on stderr; the script never prints tokens. On success stdout ends with `OK` and the refresh token is stored with `wrangler kv key put --local --binding XAI_AUTH`.

Local KV state lives in `.wrangler/` and must not be committed. `npm run login:xai -- --remote` writes remote KV and is for a future deploy only.

Model: `XAI_MODEL` (default `grok-4.7` in `wrangler.toml`). Search tools: `XAI_SEARCH_TOOLS` (default `web_search,x_search`; set it to an empty string to disable them). A real `XAI_AUTH` namespace id is needed only for a future deploy; the placeholder in `wrangler.toml` is enough for local dev.
