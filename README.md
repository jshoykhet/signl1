# Signl1

Signl1 watches X for what matters to you. You choose what to follow. It keeps the useful posts and can text you on WhatsApp. Slack can fire on each match.

Sign in with your phone and a 6-digit code from an open-source authenticator ([Ente Auth](https://ente.io/auth/) on iOS/Android, or [Aegis](https://github.com/beemdevelopment/Aegis) on Android). The first number to enroll owns this Signl1. There is no team or invite list.

You run it with Docker Compose (or `npm run dev`) against a local SQLite file. To put Signl1 on a domain you purchased, use a VPS — not Vercel. See [DEPLOY.md](DEPLOY.md) for DNS, Caddy TLS, and first-time authenticator setup.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:3847](http://localhost:3847).

Leave `X_BEARER_TOKEN` empty for **demo mode**. Signl1 shows sample posts so you can look around without paid X API access. The UI labels this clearly.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `X_BEARER_TOKEN` | No | X API v2 app bearer token. If unset, demo mode runs. Never pasted into the UI. |
| `SLACK_WEBHOOK_URL` | No | Global Slack incoming webhook. Per-rule Slack URLs in the database override nothing — a rule-level URL is used when set, otherwise this fallback. |
| `DATABASE_PATH` | No | SQLite file path. Defaults to `./data/signal.db`. Compose sets `/data/signal.db` on a named volume. |
| `KOL_HANDLES` | No | Extra Key Account handles (comma, space, or newline; `@` optional). Unioned with the seeded list for the active Focus (markets, both, or venture). |
| `KOL_HANDLES_MODE` | No | `append` (default) keeps the seed and adds `KOL_HANDLES`. `replace` uses only the env list. |
| `BLOCKED_HANDLES` | No | Accounts to drop from inbox and alerts (comma, space, or newline; `@` optional). Also editable on Settings. |
| `WHATSAPP_TO` | No | Default WhatsApp destination (country code + digits, or a group JID). Editable on Settings. |
| `WHATSAPP_AUTH_DIR` | No | Baileys session folder. Defaults next to the SQLite file; Compose uses `/data/whatsapp-auth`. |
| `AUTH_SECRET` | Prod | Session secret (`openssl rand -base64 32`). Optional locally. |
| `AUTH_URL` | Prod | Public URL, e.g. `https://signals.example.com`. |
| `AUTH_DEV_LOGIN` | No | `1` shows **Skip sign-in** on the login page. Default off in production Compose (`AUTH_DEV_LOGIN=0`). |
| `DOMAIN` | Prod | Hostname for `docker-compose.prod.yml` + Caddy. |

Copy `.env.example` to `.env` and fill in what you need. Compose interpolates those values; an empty token is demo mode.

```bash
# .env
X_BEARER_TOKEN=
SLACK_WEBHOOK_URL=
DATABASE_PATH=./data/signal.db
```

Do not commit `.env`. Per-rule Slack and generic webhook URLs live in SQLite so different instances can fan out without extra env vars.

On first visit, enter your mobile number, scan the QR with Ente Auth or Aegis, and confirm the 6-digit code. Later visits only ask for the current code. Local preview can still **Skip sign-in** when `AUTH_DEV_LOGIN=1`.

## X bearer token (live mode)

1. Create a developer project at [https://developer.x.com](https://developer.x.com).
2. Attach an app that has **Read** access.
3. Your plan must include **recent search** (`GET /2/tweets/search/recent`). This is a paid X API product; Essential-only apps will get `401`/`403`.
4. Copy the **Bearer Token** (app-only auth). This is not a user access token.
5. Put it in `.env` as `X_BEARER_TOKEN=...` and restart Compose.

Signl1 talks only to `https://api.x.com/2/tweets/search/recent` (falling back to `api.twitter.com`). It does not scrape `x.com` or `twitter.com`.

On the first live poll of a new rule, the client uses `start_time` equal to the rule's created timestamp so you are not backfilled with seven days of hits. After that it pages with `since_id`.

## Demo mode

If the bearer token is missing:

- The poller writes a heartbeat and injects matching fixtures on the Inbox & WhatsApp interval (and on Re-poll).
- Fixtures are realistic Fed, oil, and macro posts, plus funding, launch, and tech-leader posts for VC mode.
- Dedup still applies (`rule_id` + `tweet_id`). After the pool is exhausted, ids cycle with a suffix so sample posts keep arriving.
- Settings shows **Bearer token: Missing** and **Demo mode**. The secret is never displayed because it is never stored.

Seeded monitors live on **Rules**, split into two modes. Each monitor is independently on/off. **Markets**:

| Name | Query |
| --- | --- |
| Key Leaders | `from:` searches of Markets Key Accounts (wires, squawk, desks). Edited on Accounts. |
| Watchlist | User cashtags from the Watchlist page |
| Fed | `(FOMC OR "interest rate" OR "fed funds" OR Powell) lang:en -is:retweet` |
| Oil | `(OPEC OR "crude oil" OR WTI OR Brent) lang:en -is:retweet` |
| Macro | CPI, PCE, NFP, GDP, Treasury yields, DXY, tariffs, ISM/PMI, and other market-moving prints |

**VC**:

| Name | Query |
| --- | --- |
| Tech Leaders | People — founders and investors (editable). Not publications. |
| Funding Announcements | `raised` / `raising`, Seed / Series A–D, term sheet, valuation, led the round |
| Product Launches | product launch, out of stealth, open sourced, generally available, demo day, new model/API/platform |

Disable or edit these like any other rule. **Focus** (Markets / Both / Venture) decides which monitors the poller actually searches. Markets searches Key Leaders, Watchlist, Fed, Oil, and Macro. Venture searches Tech Leaders, Funding, and Product Launches. Both searches all of them. Switching Focus does not turn the other mode’s monitors off in Rules — it only changes what is polled and shown in the inbox.

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

**Watchlist** is a list of stock tickers you want FinTwit alerts on. Paste `NVDA, AAPL, TSLA` — you do not type the `$`. Signl1 compiles an extra recent-search rule:

```
($AAPL OR $NVDA OR $TSLA) lang:en -is:retweet
```

Long lists are split into multiple Watchlist rules so each query stays under the X 512-character limit. Matches land in the inbox like any other rule, named **Watchlist**. Pause screening on that page without deleting the names.

## Key Accounts

**Accounts** is the people list — posts from them come through more readily. Markets and Venture are **separate lists**. Focus picks which list is live: Markets, Venture, or Both (the union of the two **active** sets). Removing DeItaone from Markets does not take TechCrunch off Venture. Adding a handle to Venture does not put it on Markets.

Paste handles the same way you paste tickers. The table is the list chrome (search, seed/added/removed, restore). Reset restores that pack’s seed. `KOL_HANDLES` still unions with both seeds; `KOL_HANDLES_MODE=replace` still replaces the seed.

Poll interval is the **Updates** setting (5 / 10 / 15 / 30 / 45 minutes, or 1 / 2 / 3 / 4 / 5 / 10 hours). Live mode **packs every enabled rule** into as few `recent search` requests as possible, and identical queries (shared default monitors) are searched once. Each search asks for up to **100** tweets (`max_results`) **since the last cursor**, or a two-window lookback on first poll — not days of history.

X pay-per-use bills **per resource returned**, not per HTTP call: about **$0.005 per post** and **$0.010 per author** (`expansions=author_id`). Repeats of the same post or user id are not rebilled the same UTC day. Settings → Updates shows last-search and session upper-bound cost. Shorter intervals cost more because each window is new posts.

## Focus (Settings)

These apply when posts arrive and again whenever you change them, so the inbox and Slack/WhatsApp stay in sync.

- **Focus:** Markets (rates, earnings, policy), Venture (funding, launches, announcements), or **Both**. Switching picks which Key Accounts list is live (Both unions the two active lists). Monitor on/off state lives on Rules and is not changed by Focus.
- **Key accounts only:** keep posts from Key Accounts (plus anything you marked to keep).
- **Key Accounts:** edit Markets and Venture separately on **Accounts**. Both is the union of whatever is active on each list.
- **Blocked:** mute handles so they never land in the inbox or fire Slack/WhatsApp, even if they are a Key Account.
- **Signal:** Lower (more posts, still needs news or analysis), Standard, or Higher (fewer posts).
- **Min likes:** set the engagement floor (0–10000, or inherit the level default). A number you pick applies to every account, including Key Accounts. Changing it re-filters the inbox.
- **Recent tweets:** let brand-new posts from 10k+ accounts through before likes arrive.
- **Require likes:** also apply the score floor to Key Accounts and new posts from large accounts. An explicit min-likes number already covers those accounts.

Inbox + / − labels still train author priors.

## Notifications

Every match lands in the in-app inbox.

- **Slack:** rule-level incoming webhook, else `SLACK_WEBHOOK_URL`.
- **WhatsApp:** link a phone on **Settings** with a QR or pairing code ([Baileys](https://baileys.wiki/) WhatsApp Web API). Optional destination (`WHATSAPP_TO` or the Settings field). If that number is the linked account, the text lands in WhatsApp **Message yourself** and often will not push-notify — use another number or a group JID for a normal chat ping. Alerts send only after status is **Linked**. Timing is the same **Updates** interval as X: every 5 / 10 / 15 / 30 / 45 minutes or every 1 / 2 / 3 / 4 / 5 / 10 hours, sending the best 20 posts from that window. After you enter the pairing code, WhatsApp sends a stream restart (code 515); Signl1 reconnects immediately with the new session and does not treat that as an error. Session files live on the data volume so you do not scan again after restart.
- **Generic webhook:** `POST` JSON:

```json
{
  "event": "signal.match",
  "rule": { "id": "...", "name": "Fed", "query": "..." },
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
- `poller` — continuous worker on **host networking** so X and WhatsApp use the machine’s public path (some Docker bridges never NAT compose networks)
- `signal-data` volume — SQLite at `/data/signal.db`

Both containers share the volume. WAL mode and a busy timeout are enabled so the UI and poller can write without extra services. Production adds Caddy in front (`docker-compose.prod.yml`) and does not publish 3847. After changing `network_mode`, recreate the poller (`docker compose up -d --force-recreate poller`) — Compose sometimes keeps the old bridge attachment.

```bash
docker compose up --build
docker compose logs -f poller
docker compose down          # keeps the volume
docker compose down -v       # wipes matches, rules, and WhatsApp session
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

The inbox is tuned per **Focus**. **Markets** keeps news, filings, policy, and sourced takes. **Venture** keeps funding, launches, acquisitions, and tech announcements. **Both** keeps either. Ticker-only posts, empty flashes, and dunks stay out.

Floors still apply to unknown accounts:

- **≥ 50 followers**
- **≥ 5 likes** on the tweet
- A **signal score** (0–100) from follower scale, likes, retweets/quotes, replies, and verified status
- A **relevance score** from the tweet text, plus a **substance** gate (news or a real point of view)

**Key Accounts** skip the like floor and get a score bump unless **Require likes** is on in Settings. They still need news or analysis for the active Focus — someone saying “watching” does not come through. Sourced news from mid-size accounts also skips the default 5-like floor. Edit people on **Accounts**, or with `KOL_HANDLES` (append) / `KOL_HANDLES_MODE=replace`. Promo spam is dropped even from a Key Account. **Blocked** accounts stay out.

A post from an account with **10k+ followers** that is less than the current fresh window (10 minutes on Standard) can still alert before likes arrive, if the text is relevant and **Recent tweets** is on.

**Train** with **+** (keep) and **−** (hide) on each match. Labels persist per tweet. After **two keep** votes, that author is boosted. After **two hide** votes, new posts from that author stay out. Click the same button again to clear. Keyboard: `+` / `-` on the selected match.

## Rate-limit troubleshooting

The poller honors `x-rate-limit-remaining`, `x-rate-limit-reset`, and `Retry-After`. On `429` it backs off exponentially (capped at 15 minutes) and records the error on **Settings**. Settings also shows search-call count, remaining quota, and how many packed queries ran last cycle.

| Symptom | What to do |
| --- | --- |
| Settings → last error `429` | Disable unused rules, wait for the window to reset. Packing already avoids one request per rule. |
| `401` / `403` | Token is wrong, revoked, or the project does not include recent search. |
| `402` / product errors | Upgrade the X API plan. Stay on demo mode until then. |
| Settings → Updates “Not responding” | The `poller` container is not running. Check `docker compose logs poller`. |
| `fetch failed` / connect timeout on `api.x.com` | The poller cannot open outbound HTTPS. Recreate it on host networking (`docker compose up -d --force-recreate poller`). Host curl to `api.x.com` working while the container times out is this bug. |
| Duplicate alerts | Should not happen. Dedup is `UNIQUE(rule_id, tweet_id)`. The same tweet can still match two different rules. |
| Empty live inbox | If Settings shows an Updates error, fix that first — Signl1 is not reading X. Otherwise wait for a new matching post, or loosen Higher / Require likes. |

Do not lower every interval to 15s on a live token. Signl1 floors live polls at 60s and packs rules together; the 15s UI value is for demo mode.

## Tests

```bash
npm test
```

Covers query compilation (including the accounts helper), tweet/rule dedup against SQLite, demo fixture coverage of the sample rules, webhook payload shape, +/− training labels, watchlist cashtags, packed live-search query budgets, relevance scoring, Key Accounts, the blocked list, Focus floors, WhatsApp digest copy, WhatsApp JID formatting, solo OTP admission, and per-user isolation.

## Layout

- `src/app` — UI routes and REST handlers
- `src/poller` — worker loop
- `src/lib` — SQLite, X client, query compiler, fixtures, webhooks
- `data/` — local SQLite (gitignored)

MIT licensed.
