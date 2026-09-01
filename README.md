# Signal1

Self-hosted X (Twitter) alerts for investment and research operators. You define watch rules in a web UI; a background poller hits the official X API v2 recent-search endpoint and writes matches into an inbox. Optional Slack and generic webhooks fire on each new tweet.

There is no hosted service. You run it with Docker Compose (or `npm run dev`) against a local SQLite file.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:3847](http://localhost:3847).

Leave `X_BEARER_TOKEN` empty for **demo mode**. Signal1 injects fixture markets posts on a timer so the inbox, rules, and settings work without paid X API access. The UI labels this clearly.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `X_BEARER_TOKEN` | No | X API v2 app bearer token. If unset, demo mode runs. Never pasted into the UI. |
| `SLACK_WEBHOOK_URL` | No | Global Slack incoming webhook. Per-rule Slack URLs in the database override nothing — a rule-level URL is used when set, otherwise this fallback. |
| `DATABASE_PATH` | No | SQLite file path. Defaults to `./data/signal.db`. Compose sets `/data/signal.db` on a named volume. |
| `KOL_HANDLES` | No | Extra key-opinion-leader handles (comma, space, or newline; `@` optional). Unioned with the seeded markets-desk list. |
| `KOL_HANDLES_MODE` | No | `append` (default) keeps the seed and adds `KOL_HANDLES`. `replace` uses only the env list. |
| `WHATSAPP_TO` | No | Default WhatsApp destination (country code + digits, or a group JID). Editable on Settings. |
| `WHATSAPP_AUTH_DIR` | No | Baileys session folder. Defaults next to the SQLite file; Compose uses `/data/whatsapp-auth`. |

Copy `.env.example` to `.env` and fill in what you need. Compose interpolates those values; an empty token is demo mode.

```bash
# .env
X_BEARER_TOKEN=
SLACK_WEBHOOK_URL=
DATABASE_PATH=./data/signal.db
```

Do not commit `.env`. Per-rule Slack and generic webhook URLs live in SQLite on purpose so different desks can fan out without extra env vars.

## X bearer token (live mode)

1. Create a developer project at [https://developer.x.com](https://developer.x.com).
2. Attach an app that has **Read** access.
3. Your plan must include **recent search** (`GET /2/tweets/search/recent`). This is a paid X API product; Essential-only apps will get `401`/`403`.
4. Copy the **Bearer Token** (app-only auth). This is not a user access token.
5. Put it in `.env` as `X_BEARER_TOKEN=...` and restart Compose.

Signal1 talks only to `https://api.x.com/2/tweets/search/recent` (falling back to `api.twitter.com`). It does not scrape `x.com` or `twitter.com`.

On the first live poll of a new rule, the client uses `start_time` equal to the rule's created timestamp so you are not backfilled with seven days of hits. After that it pages with `since_id`.

## Demo mode

If the bearer token is missing:

- The poller writes a heartbeat and injects one matching fixture every 10 seconds.
- Fixtures are realistic Fed, Mag 7, and crude/OPEC posts.
- Dedup still applies (`rule_id` + `tweet_id`). After the pool is exhausted, ids cycle with a suffix so the tape keeps moving.
- Settings shows **Bearer token: Missing** and **Demo mode**. The secret is never displayed because it is never stored.

Seeded sample rules (15s interval so the demo is obvious):

| Name | Query |
| --- | --- |
| Fed Watch | `(FOMC OR "interest rate" OR "fed funds" OR Powell) lang:en -is:retweet` |
| Mag 7 tape | `(from:nvidia OR from:apple OR from:meta OR from:microsoft) (earnings OR guidance OR GPU OR AI) lang:en -is:retweet` |
| Crude & OPEC | `(OPEC OR "crude oil" OR WTI OR Brent) lang:en -is:retweet` |

Disable or edit these like any other rule.

## Example rules

Recent-search syntax is passed through to X. A helper in the rule form documents the operators.

```
from:federalreserve OR from:newyorkfed -is:retweet
NVDA (earnings OR guidance) lang:en -is:retweet
"interest rate" (cut OR hike) lang:en -is:retweet
(from:iea OR from:opecsecretariat) (OPEC OR Brent OR WTI)
```

The **accounts helper** compiles `nvidia, apple` into `(from:nvidia OR from:apple)` and prepends it to the free-text query.

## Watchlist (cashtags)

**Watchlist** is a list of stock tickers you want FinTwit alerts on. Paste `NVDA, AAPL, TSLA` — you do not type the `$`. Signal1 compiles an extra recent-search rule:

```
($AAPL OR $NVDA OR $TSLA) lang:en -is:retweet
```

Long lists are split into multiple Watchlist rules so each query stays under the X 512-character limit. Matches land in the inbox like any other rule, named **Watchlist**. Pause screening or change the poll interval on that page without deleting the names.

Poll interval defaults to **2 minutes**. Live mode **packs every enabled rule** (including Watchlist) into as few `recent search` requests as possible — typically one call per cycle instead of one per rule — and will not poll faster than **60 seconds**, even if a rule is set to 15s. Empty cycles back off further (capped at +4 minutes) so quiet tape does not keep spending credits. Each search asks for up to **100** tweets (`max_results`).

## Notifications

Every match lands in the in-app inbox.

- **Slack:** rule-level incoming webhook, else `SLACK_WEBHOOK_URL`.
- **WhatsApp:** link a phone on **Settings** with a QR or pairing code ([Baileys](https://baileys.wiki/) WhatsApp Web API). Optional destination (`WHATSAPP_TO` or the Settings field). If that number is the linked account, the text lands in WhatsApp **Message yourself** and often will not push-notify — use another number or a group JID for a normal chat ping. Alerts send only after status is **Linked**. After you enter the pairing code, WhatsApp sends a stream restart (code 515); Signal1 reconnects immediately with the new session and does not treat that as an error. Session files live on the data volume so you do not scan again after restart.
- **Generic webhook:** `POST` JSON:

```json
{
  "event": "signal.match",
  "rule": { "id": "...", "name": "Fed Watch", "query": "..." },
  "tweet": {
    "id": "...",
    "author_handle": "reuters",
    "author_name": "Reuters",
    "text": "...",
    "created_at": "2026-08-31T15:02:00.000Z",
    "permalink": "https://x.com/reuters/status/..."
  }
}
```

Webhook failures are logged on the poller; they do not drop the inbox row. WhatsApp send failures are the same.

The inbox and rules pages are searchable. In the inbox, `/` or Ctrl/Cmd+K focuses search; tokens match tweet text, @handle, display name, rule name, and tweet id. **Re-poll** asks the worker to run the next packed search immediately (still rate-limited); in demo mode it injects the next fixture.

## Docker Compose

`docker compose up --build` starts:

- `web` — Next.js UI + REST on port **3847**
- `poller` — continuous worker
- `signal-data` volume — SQLite at `/data/signal.db`

Both containers share the volume. WAL mode and a busy timeout are enabled so the UI and poller can write without extra services.

```bash
docker compose up --build
docker compose logs -f poller
docker compose down          # keeps the volume
docker compose down -v       # wipes matches and rules
```

## Local development

Requires Node 22+.

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

`npm run dev` starts the UI and poller together on port 3847.

```
npm run dev:web      # UI only
npm run dev:poller   # poller only
npm run build && npm start
npm run poller
```

## Quality filter

The inbox is tuned for an **event-driven trader**, **fundamental investor**, or **market maker**. A match has to look like a catalyst — FOMC/CPI, earnings and guidance, M&A, filings, OPEC/flow, cashtags, sized numbers — not lifestyle chatter.

Floors still apply to unknown accounts:

- **≥ 50 followers**
- **≥ 5 likes** on the tweet
- A **signal score** (0–100) from follower scale, likes, retweets/quotes, replies, and verified status
- A **desk-relevance score** from the tweet text (cashtags, catalysts, percent moves)

**KOLs** (key opinion leaders) skip the like floor and get a score bump. They still need a catalyst. The seed list is wires, squawk, All-In, CNBC/FT talent, and official desks. Edit it with `KOL_HANDLES` (append) or `KOL_HANDLES_MODE=replace`. Promo spam (giveaways, signal groups) is dropped even from a KOL.

A post from an account with **10k+ followers** that is less than 10 minutes old can still alert before likes accrue, if the text is desk-relevant. Settings lists the current thresholds and KOL count.

**Train the filter** with **+** (high signal) and **−** (low signal) on each match. Labels persist per tweet. After **two net-high** votes, that author is boosted (floors relax). After **two net-low** votes, new posts from that author are dropped. Click the same button again to clear. Keyboard: `+` / `-` on the selected match.

## Rate-limit troubleshooting

The poller honors `x-rate-limit-remaining`, `x-rate-limit-reset`, and `Retry-After`. On `429` it backs off exponentially (capped at 15 minutes) and records the error on **Settings**. Settings also shows search-call count, remaining quota, and how many packed queries ran last cycle.

| Symptom | What to do |
| --- | --- |
| Settings → last error `429` | Disable unused rules, wait for the window to reset. Packing already avoids one request per rule. |
| `401` / `403` | Token is wrong, revoked, or the project does not include recent search. |
| `402` / product errors | Upgrade the X API plan. Stay on demo mode until then. |
| Poller "No recent heartbeat" | The `poller` container is not running. Check `docker compose logs poller`. |
| Duplicate alerts | Should not happen. Dedup is `UNIQUE(rule_id, tweet_id)`. The same tweet can still match two different rules. |
| Empty live inbox | Rule `start_time` is the created-at of the rule. Wait for a new matching post, or tighten the query. |

Do not lower every interval to 15s on a live token. Signal1 floors live polls at 60s and packs rules together; the 15s UI value is for demo mode.

## Tests

```bash
npm test
```

Covers query compilation (including the accounts helper), tweet/rule dedup against SQLite, demo fixture coverage of the sample rules, webhook payload shape, +/− training labels, watchlist cashtags, packed live-search query budgets, desk-relevance scoring, the KOL seed list, and WhatsApp JID formatting.

## Layout

- `src/app` — UI routes and REST handlers
- `src/poller` — worker loop
- `src/lib` — SQLite, X client, query compiler, fixtures, webhooks
- `data/` — local SQLite (gitignored)

MIT licensed.
