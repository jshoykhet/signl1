# Deploy Signal1 on a domain you purchased

Signal1 is a long-running desk: Next.js UI, a background X poller, SQLite, and a WhatsApp (Baileys) session on disk. **Do not put this on Vercel.** Vercel cannot keep the poller alive or persist SQLite / WhatsApp auth files. Use a VPS (Hetzner, DigitalOcean, Fly machines, a home box with a public IP) and Docker Compose plus Caddy for TLS.

This file assumes you already bought a hostname. The stack never hard-codes it — set `DOMAIN` in `.env`.

## What you will have

| Piece | Role |
| --- | --- |
| DNS A/AAAA | Point `app.example.com` (or the apex) at the VPS |
| Caddy | HTTP→HTTPS, reverse-proxy to the web container |
| `web` | Next.js on port 3847, internal only |
| `poller` | X search + WhatsApp, shares the data volume |
| Google Cloud OAuth | Public sign-in (or invite-only) |
| `AUTH_PUBLIC_SIGNUP` | `1` (default): anyone with Google gets a **private desk**. `0`: allowlist only |

Signed-in people do **not** share an inbox. Each Google account has its own rules, matches, watchlist, filters, and WhatsApp destination. The instance still uses one X bearer token and one linked WhatsApp sending number (the first admin pairs it).

The hostname you bought is never hard-coded — set `DOMAIN` in `.env`.

## 1. VPS

Pick a small Linux VM (2 GB RAM is enough). Open **22**, **80**, and **443**. Install Docker Engine and the Compose plugin.

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Clone this repo onto the box (or copy the project). Stay in the repo root for the rest of the commands.

## 2. DNS

At your registrar, create:

- **A** record → the VPS IPv4
- **AAAA** record → the VPS IPv6, if the box has one

Use the hostname you want operators to type, for example `signals.yourfund.com`. Wait until `dig +short your.hostname` returns the VPS IP before starting Compose. Caddy will fail TLS issuance if DNS still points elsewhere.

## 3. Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → the project you use for this desk.
2. **APIs & Services → OAuth consent screen**. User type **External**. App name **Signal1**.
3. For a **public** domain, set publishing status to **In production**. Signal1 only requests email, profile, and OpenID (non-sensitive). Until you complete Google’s brand verification, users see an “unverified app” warning they can continue past. **Testing** mode caps you at 100 test users and is not public.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
5. Authorized JavaScript origins:
   - `https://YOUR_DOMAIN`
6. Authorized redirect URIs:
   - `https://YOUR_DOMAIN/api/auth/callback/google`
7. Copy the client ID and secret into `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Keep a second OAuth client named “Signal1 local” for `http://127.0.0.1:3847` if you develop on a laptop.

## 4. Secrets and the first admin

```bash
cp .env.example .env
nano .env
```

Set at least:

```
DOMAIN=signals.yourfund.com
AUTH_SECRET=          # openssl rand -base64 32
AUTH_URL=https://signals.yourfund.com
AUTH_DEV_LOGIN=0
AUTH_PUBLIC_SIGNUP=1
AUTH_ALLOWED_EMAILS=
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
X_BEARER_TOKEN=       # live X, or leave empty for demo fixtures
```

Generate the session secret on the VPS:

```bash
openssl rand -base64 32
```

**Leave `AUTH_PUBLIC_SIGNUP=1` for a public domain.** Anyone who signs in with Google gets a private desk. The first account becomes instance admin (they link WhatsApp). Set `AUTH_PUBLIC_SIGNUP=0` and fill `AUTH_ALLOWED_EMAILS` if you want invite-only.

`AUTH_DEV_LOGIN` is a passwordless email field for this repo’s local preview. The production Compose file forces it off.

## 5. Start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy web
```

Caddy obtains a Let’s Encrypt certificate for `$DOMAIN` and proxies to `web:3847`. Confirm:

- `https://YOUR_DOMAIN/login` loads
- Continue with Google returns to the inbox
- Settings → Access lists you as admin

If Google says `redirect_uri_mismatch`, the redirect URI in Cloud Console does not exactly match `https://YOUR_DOMAIN/api/auth/callback/google` (scheme, host, no trailing slash).

If Google says the app isn’t verified, publish the consent screen (**In production**) or users cannot get past Testing’s 100-user cap.

## 6. WhatsApp and data

The `signal-data` volume holds `/data/signal.db` and `/data/whatsapp-auth`. Link WhatsApp from Settings after you can log in. **Do not** `docker compose down -v` on production — that wipes matches, rules, and the WhatsApp session.

Back up the volume periodically:

```bash
docker compose -f docker-compose.prod.yml exec web sqlite3 /data/signal.db ".backup /data/signal-backup.db"
docker cp "$(docker compose -f docker-compose.prod.yml ps -q web)":/data/signal-backup.db ./signal-backup.db
```

Copy `whatsapp-auth` the same way if you need a cold spare.

## 7. After go-live

Public signup (`AUTH_PUBLIC_SIGNUP=1`): people open `https://YOUR_DOMAIN`, continue with Google, and land in an empty private desk with the seeded Fed / Mag 7 / crude rules.

Invite-only (`AUTH_PUBLIC_SIGNUP=0`):

1. Add their Gmail (or Google Workspace) address on **Settings → Access**.
2. They open `https://YOUR_DOMAIN` and use **Continue with Google**.

Admins can disable an account without deleting its data. You cannot disable the last admin.

The instance admin links WhatsApp once. Each user saves **their** destination number on Settings. Alerts send from the host’s linked WhatsApp to that number.

## 8. Local vs production Compose

| File | Use |
| --- | --- |
| `docker-compose.yml` | Laptop / this preview: publishes **3847**, `AUTH_DEV_LOGIN` defaults on |
| `docker-compose.prod.yml` | VPS: Caddy 80/443, Google only, `AUTH_URL=https://$DOMAIN` |

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Caddy TLS errors | DNS A record not pointing here yet, or port 80 blocked |
| `AUTH_SECRET is required` | `.env` missing `AUTH_SECRET`; recreate the web container |
| Google `AccessDenied` | Account disabled, or invite-only and not on Settings → Access |
| Google unverified-app warning | Expected until you complete brand verification; users can continue |
| Google `redirect_uri_mismatch` | Fix the Cloud Console redirect URI |
| Infinite login redirect | `AUTH_URL` must be `https://YOUR_DOMAIN` with no path |
| Empty live inbox | Same as README — token, recent-search product, rule `start_time` |
| WhatsApp unlinked after recreate | Volume was wiped; link the device again |

There is no hosted Signal1 service. You own the VPS, the domain, the Google client, and the SQLite file.
