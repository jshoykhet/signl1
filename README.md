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

Poll interval defaults to **2 minutes**. The UI allows **15 seconds** so demos and local tests are usable. Live accounts should stay at 2 minutes or slower — recent search is rate-limited per app.

## Notifications

Every match lands in the in-app inbox.

- **Slack:** rule-level incoming webhook, else `SLACK_WEBHOOK_URL`.
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

Webhook failures are logged on the poller; they do not drop the inbox row.

The inbox and rules pages are searchable. In the inbox, `/` or Ctrl/Cmd+K focuses search; tokens match tweet text, @handle, display name, rule name, and tweet id.

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

Live matches are dropped unless they look like a real desk, not a zero-engagement account:

- **≥ 50 followers**
- **≥ 5 likes** on the tweet
- A **signal score** (0–100) from follower scale, likes, retweets/quotes, replies, and verified status. Tiny accounts that rarely draw engagement stay out even if they scrape past the floors.

A post from an account with **10k+ followers** that is less than 10 minutes old can still alert before likes accrue. Settings lists the current thresholds. The inbox shows follower and like counts on each row.

**Train the filter** with **+** (high signal) and **−** (low signal) on each match. Labels persist per tweet. After **two net-high** votes, that author is boosted (floors relax). After **two net-low** votes, new posts from that author are dropped. Click the same button again to clear. Keyboard: `+` / `-` on the selected match.

## Rate-limit troubleshooting

The poller honors `x-rate-limit-remaining`, `x-rate-limit-reset`, and `Retry-After`. On `429` it backs off exponentially (capped at 15 minutes) and records the error on **Settings**.

| Symptom | What to do |
| --- | --- |
| Settings → last error `429` | Disable unused rules, raise poll intervals, wait for the window to reset. |
| `401` / `403` | Token is wrong, revoked, or the project does not include recent search. |
| `402` / product errors | Upgrade the X API plan. Stay on demo mode until then. |
| Poller "No recent heartbeat" | The `poller` container is not running. Check `docker compose logs poller`. |
| Duplicate alerts | Should not happen. Dedup is `UNIQUE(rule_id, tweet_id)`. The same tweet can still match two different rules. |
| Empty live inbox | Rule `start_time` is the created-at of the rule. Wait for a new matching post, or tighten the query. |

Do not lower every interval to 15s on a live token. Recent search budgets are small; Signal1 spaces requests at least 400ms apart and will still 429 if you run too many enabled rules.

## Tests

```bash
npm test
```

Covers query compilation (including the accounts helper), tweet/rule dedup against SQLite, demo fixture coverage of the sample rules, webhook payload shape, and +/− training labels that boost or suppress authors.

## Layout

- `src/app` — UI routes and REST handlers
- `src/poller` — worker loop
- `src/lib` — SQLite, X client, query compiler, fixtures, webhooks
- `data/` — local SQLite (gitignored)

MIT licensed.
