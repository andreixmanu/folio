# folio-worker

Cloudflare Worker (Hono) that proxies Kraken's free public API (no key) and normalizes it for the app. `POST /chat` is a markets-only assistant backed by xAI.

| Endpoint | Description | Cache |
| --- | --- | --- |
| `GET /prices?symbols=BTC,ETH,SOL` | Live EUR quotes (Kraken `Ticker`), `changePct` vs today's 00:00 UTC open | 30 s |
| `GET /history?symbols=BTC,ETH&range=1M` | Close prices (Kraken `OHLC`), `t` in seconds | 1 min – 6 h by range |
| `GET /logo/:symbol` | Stock/ETF logo PNG, proxied from Financial Modeling Prep's public no-key image endpoint (ETFs mapped to the issuer listing, e.g. VWCE → VWRL.L); 404 if unknown | 7 days (misses 1 day) |
| `GET /news` | Finance and crypto headlines aggregated from the RSS/Atom feeds below. Optional `?category=` of `mercati`, `crypto` or `italia` (anything else is 400). Public, no token. Body: `{ updatedAt, items, feeds }` where each feed is `{ id, source, category, ok, count, error? }` | 10 min |
| `POST /chat` | Assistente mercati (xAI). Header `X-Folio-Token`. SSE: `status` (`thinking`, `searching_web`, `searching_x`), `delta`, `sources`, `error`, `done` | – |
| `GET /wallets` | Read-only Tangem balances (Bitcoin + Ethereum + USDC/USDT). Header `X-Folio-Token`. Never returns addresses | 60 s private (in-isolate; not the public Cache API) |
| `GET /health` | Liveness | – |

Ranges → OHLC interval (≤ 720 candles): 1D 15m · 1W 1h · 1M 4h · 1Y 1d · ALL 1w.
Unknown symbols are returned in `unsupported` so the app can try a fallback source later.
Symbol map and Kraken naming quirks (XBT/XXBT, XETHZEUR, XDG…) live in `src/symbols.ts`.

## News feeds

`GET /news` fetches every feed in parallel (`src/news/feeds.ts`), parses RSS 2.0 and Atom, and caches the aggregate for 10 minutes. A failed feed does not fail the response: its `feeds[]` entry has `ok: false` and a short `error` (`http_403`, `timeout`, `parse`, `fetch_error`). Only `category` is read from the query string.

| Id | Source | Category | URL |
| --- | --- | --- | --- |
| `sole24-mercati` | Il Sole 24 Ore | italia | https://www.ilsole24ore.com/rss/finanza--quotate-italia.xml |
| `sole24-finanza` | Il Sole 24 Ore | italia | https://www.ilsole24ore.com/rss/finanza.xml |
| `ansa-economia` | ANSA | italia | https://www.ansa.it/sito/notizie/economia/economia_rss.xml |
| `repubblica-economia` | la Repubblica | italia | https://www.repubblica.it/rss/economia/rss2.0.xml |
| `cnbc-markets` | CNBC | mercati | https://www.cnbc.com/id/10000664/device/rss/rss.html |
| `marketwatch` | MarketWatch | mercati | https://feeds.content.dowjones.io/public/rss/mw_topstories |
| `ft-markets` | Financial Times | mercati | https://www.ft.com/markets?format=rss |
| `investing` | Investing.com | mercati | https://www.investing.com/rss/news_25.rss |
| `coindesk` | CoinDesk | crypto | https://www.coindesk.com/arc/outboundfeeds/rss/ |
| `cointelegraph` | Cointelegraph | crypto | https://cointelegraph.com/rss |
| `theblock` | The Block | crypto | https://www.theblock.co/rss.xml |
| `decrypt` | Decrypt | crypto | https://decrypt.co/feed |

```bash
npm install
npm test          # vitest
npm run typecheck
npm run dev       # wrangler dev on :8787 (local; no Cloudflare login)
```

In development the Expo dev server proxies `/api/*` to `http://127.0.0.1:8787` (see `../metro.config.js`),
so Expo Go reaches the Worker through the same tunnel as Metro.

## Assistente (xAI)

The Worker calls xAI with a refresh token stored in KV. The app authenticates to the Worker with `APP_CHAT_TOKEN` (header `X-Folio-Token`) on `/chat` and `/wallets`. The OAuth client is public: there is no client secret.

```bash
cp .dev.vars.example .dev.vars   # set APP_CHAT_TOKEN; `.dev.vars` is gitignored
npm run login:xai                # device flow
```

`login:xai` prints one line to stdout, the verification URL. Open it and approve access. Progress stays on stderr; the script never prints tokens. On success stdout ends with `OK` and the refresh token is stored with `wrangler kv key put --local --binding XAI_AUTH`.

Local KV state lives in `.wrangler/` and must not be committed. Local `wrangler dev` and `wrangler kv --local` persist under the `XAI_AUTH` `id` in `wrangler.toml`. After that id changed, run `npm run login:xai` again so local dev has a refresh token. `npm run login:xai -- --remote` writes remote KV (see Deploy).

Model: `XAI_MODEL` (default `grok-4.7` in `wrangler.toml`). Search tools: `XAI_SEARCH_TOOLS` (default `web_search,x_search`; set it to an empty string to disable them).

`XAI_DEBUG_EVENTS=1` (off unless set to exactly `1`) logs each upstream SSE event type as `console.log('[xai-event]', type)`. For `*_call` and `output_item` events it also logs the item `type` and `status`. It does not log deltas, reasoning text, search queries, URLs, tokens, or headers. Leave it unset for normal use; a local override belongs in `.dev.vars`, which is gitignored.

## Deploy (workers.dev)

`workers_dev` is enabled. From `worker/`:

```bash
npx wrangler kv namespace create XAI_AUTH   # already done; the id is in wrangler.toml
npx wrangler secret put APP_CHAT_TOKEN      # pipe the value in; do not paste it into shell history
# BTC_ADDRESS and ETH_ADDRESS are already set as secrets (public receive addresses only)
npx wrangler deploy
npm run login:xai -- --remote               # put the refresh token in remote KV
```

`scripts/xai-login.mjs` already supports `--remote`.

Set `EXPO_PUBLIC_API_URL` (the workers.dev URL from deploy) and `EXPO_PUBLIC_CHAT_TOKEN` (the same value as `APP_CHAT_TOKEN`) in the app `.env`.

## Wallets (Tangem)

`GET /wallets` reads Bitcoin (mempool.space, fallback blockstream.info) and Ethereum (public JSON-RPC) balances for the receive addresses in `BTC_ADDRESS` / `ETH_ADDRESS`. Those values never appear in responses, logs, or error messages. The route uses the same `X-Folio-Token` check as `/chat`, in-isolate TTL cache (~60 s, keyed by chain), and `Cache-Control: private, max-age=60`. The public Cache API is skipped for this path.
