# Ponytail audit

What this repo does: Folio is a personal finance app for one person. The phone app (Expo, Android and web) shows an investment portfolio and a budget. A Cloudflare Worker fetches prices, news, wallet balances, IBKR positions, and, once configured, bank data. The Worker is on the public internet. The load assumed here is one person using the app, with strangers able to call the Worker if they know the address.

Order used: correct, safe, holds under that load, tested, fast, lean.

## Must fix

1. **A category edit can disappear on a cold start** (`src/features/budget/store.ts`)
   - **What this is:** Budget limits, custom categories, and merchant rules are saved on the phone (AsyncStorage) and read back when the app opens.
   - **Problem:** The screen can accept a tap before that read finishes. The late read then replaces what is on screen with the older saved copy. The chat history store already refuses that overwrite. The budget store does not. A recategorised payment or a new limit made in that short window is dropped for this launch, and the next save can write the old copy back over it.
   - **Fix:** Do not render the app, and do not accept budget edits, until that read has finished. Same pattern as the Investimenti / Budget mode switch.
   - **If we skip it:** A fast tap after opening the app loses a category change. It looks like the app forgot.

2. **The day change becomes infinite when a price halves to zero** (`src/services/portfolio.ts`)
   - **What this is:** The portfolio total's "today" move is derived from each holding's percent change.
   - **Problem:** The previous price is `value / (1 + changePct / 100)`. At −100% the divisor is 0, so the move is infinite and the hero can show `Infinity`. Below −100% the move flips sign and looks like a huge gain.
   - **Fix:** If that divisor is not a positive finite number, count that holding as no move. Leave every normal quote unchanged.
   - **If we skip it:** A bad or crashed quote paints a nonsense day change on the whole portfolio.

3. **A zero total prints `NaN%` next to a holding** (`src/features/portfolio/holdings-by-source.tsx`)
   - **What this is:** Each source group shows its share of the portfolio total.
   - **Problem:** The share is `subtotal / totalValue`. A quote of price 0 still counts as a holding, the total is 0, and `0 / 0` is `NaN`. The row shows `NaN%`.
   - **Fix:** If the total is 0, show 0%.
   - **If we skip it:** A zero-price quote renders a broken percentage.

4. **IBKR positions can be stored in the public edge cache** (`worker/src/index.ts`)
   - **What this is:** The Worker caches successful GET responses in Cloudflare's shared cache. `/wallets` and `/bank/` are excluded. Any request that sends `X-Folio-Token` is also excluded.
   - **Problem:** `GET /positions` is not excluded by path. It returns account holdings and sets `Cache-Control`. Today the app sends the token, so the request skips the cache and nothing private is stored. The cache key is the URL only. The day a 200 comes back without that header, the next caller of `/positions` receives the holdings.
   - **Fix:** Skip `/positions` the same way as `/wallets`.
   - **If we skip it:** One missed header later, positions are public for the cache lifetime.

5. **A pending card payment and its booked copy can both be kept** (`worker/src/banking/mapping.ts`)
   - **What this is:** Bank sync stores each movement under an id. Pending rows often have no bank id, so they get a hash of the amount and text. Once booked, the bank sends a real id.
   - **Problem:** Those are two ids for one payment. Nothing deletes the pending row. Spending counts it twice. Open banking is not switched on in the app yet (`EXPO_PUBLIC_BUDGET_SOURCE` stays on the mock unless set).
   - **Fix:** Not applied. Matching "same payment" without merging two real coffees of the same amount needs a rule Andrei should confirm. Left open.
   - **If we skip it:** After the bank link is turned on, some card payments inflate the month's spend until someone deletes a row by hand.

## Should fix

6. **A price outage hides the stocks as well** (`src/services/hooks.ts`, `src/app/(invest)/portfolio.tsx`)
   - **What this is:** The portfolio screen waits for Kraken quotes before it draws anything.
   - **Problem:** On the first open, if Kraken fails, the screen is the full error "Prezzi non disponibili" even when IBKR marks are already loaded. A later failure keeps the previous numbers (`keepPreviousData`), so this is the first load only.
   - **Fix:** Not applied. Showing stocks alone would drop crypto out of the big total and make that total look complete. That is a product choice.
   - **If we skip it:** With Kraken down at launch, the portfolio tab is an error until prices work, including the stock list.

7. **Two IBKR lines with the same symbol share one price** (`src/services/ibkr/index.ts`)
   - **What this is:** Stock quotes come from the statement mark. The comment says the symbol is suffixed when two lines share it. Only the row id is made unique. The symbol is not.
   - **Problem:** `ibkrQuotes` keeps the first mark for a symbol and skips the rest. Both quantities are then valued at that first price. Two listings of the same ticker with different marks (different currency or venue) show the wrong euro value.
   - **Fix:** Not applied. Changing the symbol changes ids, the chart, and logos. Needs a decision on how a duplicate ticker should look.
   - **If we skip it:** A second line of the same ticker is priced like the first.

8. **The app token is inside the app binary** (`EXPO_PUBLIC_CHAT_TOKEN`, Worker `requireAppToken`)
   - **What this is:** `/chat`, `/wallets`, `/positions`, and `/bank/*` require the header `X-Folio-Token`. The app ships that value as a public env var. CORS allows any origin.
   - **Problem:** Anyone who unpacks the Android app or the web bundle can call those routes. CORS does not stop a script that already has the token. This matches the current "one shared secret" design.
   - **Fix:** Not applied. A different login is a product change.
   - **If we skip it:** The secret protects casual visitors, not someone who has the installed app.

9. **A missing stock logo stays missing for a week** (`worker/src/app.ts`, `worker/src/cache.ts`)
   - **What this is:** `GET /logo/:symbol` caches the image in the Worker isolate for 7 days. A miss is supposed to last 1 day (the HTTP header says so).
   - **Problem:** The isolate stores the miss for 7 days too. After the edge copy expires (1 day), the isolate still answers "no logo" and refreshes that edge copy. A logo that appears the next day still shows initials for up to a week.
   - **Fix:** After a miss, pull that entry's expiry in to 1 day. Do not extend it on later requests.
   - **If we skip it:** New logos show as initials long after the image exists.

10. **A huge logo file is kept in memory** (`worker/src/logos.ts`)
    - **What this is:** The logo proxy reads the whole upstream body and caches it.
    - **Problem:** There is no size cap. A multi-megabyte response for one ticker stays in the isolate for 7 days. The URL is fixed to the logo host, so this is not an open proxy, but one oversized file still sits in memory.
    - **Fix:** Ignore bodies over 512 KB and treat them as a miss.
    - **If we skip it:** One fat response inflates isolate memory until the cache entry expires.

11. **Bank history stops at 25,000 rows and says nothing** (`src/features/budget/remote-data-source.ts`)
    - **What this is:** The app pages `/bank/transactions` at 500 rows, and stops after 50 pages.
    - **Problem:** Page 51 is dropped with no error. Older months vanish from totals. One personal account is unlikely to reach this. The CSV importer exists because open banking itself does not return the full past.
    - **Fix:** Not applied. Failing the whole screen versus showing a short history is a product choice, and the cap is not in reach yet.
    - **If we skip it:** A very long history silently under-counts spend.

12. **"Nascondi saldi" resets when the app restarts** (`src/store/ui-store.ts`)
    - **What this is:** The eye button hides euro amounts. The comment says persistence can be added later. Nothing saves the toggle.
    - **Problem:** After a restart the amounts are visible again.
    - **Fix:** Not applied. Remembering "hidden" versus always starting visible is a product choice.
    - **If we skip it:** Balances show again after every cold start.

13. **One bank page is written in a single database batch** (`worker/src/banking/store.ts`)
    - **What this is:** Each sync page inserts every row in one D1 `batch`.
    - **Problem:** D1 caps how many statements one batch accepts. A page larger than that cap throws, the cursor is saved, and the next sync retries the same page. If the page itself is over the cap, history never finishes. Open banking is not on yet.
    - **Fix:** Not applied. Chunking the batch is extra code on a path that is still off. Do it before the first real sync if provider pages are large.
    - **If we skip it:** A long first sync can get stuck on one page.

## Nice to have

14. **Two Italian "time ago" helpers** (`src/lib/format.ts`)
    - **What this is:** News uses `formatRelativeTimeIt` (calendar days in Europe/Rome, including "ieri"). `formatRelativeTime` is a second version and nothing in the app calls it.
    - **Problem:** Two rules for the same phrase. Only the tests call the unused one.
    - **Fix:** Delete `formatRelativeTime` and its test.
    - **If we skip it:** The next caller can pick the one that treats 27 hours as "ieri" by the clock, not by the Rome day.

15. **`HeroGlow` is an unused alias** (`src/components/ui/hero-glow.tsx`)
    - **What this is:** The background component was renamed to `AmbientBackground`. The old name is still exported and nothing imports it.
    - **Problem:** Dead export.
    - **Fix:** Delete the alias.
    - **If we skip it:** None, besides a name that looks live.

16. **The readme still says stocks are a mock** (`README.md`)
    - **What this is:** Positions come from IBKR Flex through `GET /positions`.
    - **Problem:** The readme says phase 1 is a mock and that stocks stay on the mock. That is no longer true.
    - **Fix:** Correct those two sentences.
    - **If we skip it:** The next change trusts the wrong data source.

The Revolut CSV parser (`src/features/budget/revolut-csv.ts`) is not called by any screen. It is not dead: the file says open banking will not return the full past, and the CSV is how that history gets in. Wiring a screen is a product decision. Do not delete it.

Smaller notes left out: about 4 (repeated `round2` helpers, mock data built twice per refresh, expired cache keys kept until the map is large, public `/prices` and `/history` sharing Kraken's rate limit with anyone who can hit the Worker). None of those break one person's normal use.

## Verdict

Fix the budget save race and the infinite day-change first. Then close the positions cache hole before the bank link is turned on. Do not turn on open banking until finding 5 has a rule for pending-versus-booked rows.

Lean: about −15 lines from the unused time helper and alias. About −300 more only if the CSV importer is retired, which it should not be yet. No dependency can go.

Not checked: the app was not opened in a browser or on a device for this report. Live Kraken, IBKR, xAI, and Enable Banking were not called. Generated icon pixels, the asset-icon build script, and EAS config were not reviewed line by line.

## Applied in this pass

Fixed here: 1 (budget edits wait for hydration), 2 (finite day change), 3 (0% when the total is 0), 4 (`/positions` skips the public cache), 9 (logo misses expire in a day), 10 (logos over 512 KB are dropped), 14 (unused time helper), 15 (`HeroGlow` alias), 16 (readme).

Left open: 5, 6, 7, 8, 11, 12, 13. Worker changes (4, 9, 10) need a deploy before they run in production. Deploy was not run.
