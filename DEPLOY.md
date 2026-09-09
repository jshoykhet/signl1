# Deploy Signl1 on a domain you purchased

Signl1 is a long-running app: Next.js UI, a background X poller, SQLite, and a WhatsApp (Baileys) session on disk. **Do not put this on Vercel.** Vercel cannot keep the poller alive or persist SQLite / WhatsApp auth files. Use a VPS (Hetzner, DigitalOcean, Fly machines, a home box with a public IP) and Docker Compose plus Caddy for TLS.

This file assumes you already bought a hostname. The stack never hard-codes it — set `DOMAIN` in `.env`.

## What you will have

| Piece | Role |
| --- | --- |
| DNS A/AAAA | Point `app.example.com` (or the apex) at the VPS |
| Caddy | HTTP→HTTPS, reverse-proxy to the web container |
| `web` | Next.js on port 3847, internal only |
| `poller` | X search + WhatsApp, shares the data volume |
| Google sign-in | Solo sign-in. First verified Gmail owns this Signl1. |

Each Google account gets its own SignlHQ. One X bearer token and one linked WhatsApp sending number are shared on the instance.

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

Use the hostname you want to type, for example `signl1.xyz` or `signals.yourfund.com`. Point both the apex (`@`) and `www` A records at the VPS if you want the bare domain. Wait until `dig +short your.hostname` returns the VPS IP before starting Compose. Caddy will fail TLS issuance if DNS still points elsewhere. Set `REDIRECT_FROM=old.hostname` if you are moving off a subdomain.

## 3. Google sign-in

Signl1 uses [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview) with a web client ID only (no client secret).

In [Google Cloud credentials](https://console.cloud.google.com/apis/credentials), open the OAuth 2.0 Web client and add **Authorized JavaScript origins**:

- `https://YOUR_DOMAIN` (for example `https://signl1.xyz`)
- `http://127.0.0.1:3847` for local Compose / `npm run dev:web`

You do not need an authorized redirect URI for this ID-token flow. The default client ID is already in the repo; override `GOOGLE_CLIENT_ID` if you rotate it. Leave `AUTH_GOOGLE_EMAIL` and `AUTH_ALLOWED_EMAILS` empty so any verified Google account can open a SignlHQ, or set them to restrict who may join.

## 4. Secrets and the first sign-in

```bash
cp .env.example .env
nano .env
```

Set at least:

```
DOMAIN=signl1.xyz
AUTH_SECRET=          # openssl rand -base64 32
AUTH_URL=https://signl1.xyz
REDIRECT_FROM=signals.signl1.xyz   # optional; 301 the old host to DOMAIN
AUTH_DEV_LOGIN=0
X_BEARER_TOKEN=       # live X, or leave empty for demo fixtures
GOOGLE_CLIENT_ID=103020933710-3n07noae1t93om6qq96vmoarpf14hq5f.apps.googleusercontent.com
# AUTH_GOOGLE_EMAIL=you@gmail.com
# AUTH_ALLOWED_EMAILS=you@gmail.com, teammate@gmail.com
```

Generate the session secret on the VPS:

```bash
openssl rand -base64 32
```

`AUTH_DEV_LOGIN=1` shows a Skip sign-in button and enables `/skip`. Leave it `0` on a public hostname unless you want anyone who can open login to get in.

## 5. Start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy web
```

On a 2 GB VPS, add 2 GB of swap before the first `--build`. Only the `web` image runs `next build`; the poller image does not. A handful of people are fine on 2 GB. For ~1000 SignlHQs on the shared tape, use a 4–8 GB box (or split `web` and `poller`) so Feed tabs and the poller are not swapping. The data model stores each tweet once; do not give every person their own live X query set.

Caddy obtains a Let’s Encrypt certificate for `$DOMAIN` and proxies to `web:3847`. Confirm:

- `https://YOUR_DOMAIN/login` loads
- Google sign-in returns to the inbox

## 6. WhatsApp and data

The `signal-data` volume holds `/data/signal.db` and `/data/whatsapp-auth`. Link WhatsApp from the WhatsApp tab after you can log in. **Do not** `docker compose down -v` on production — that wipes matches, rules, and the WhatsApp session.

Back up the volume periodically:

```bash
docker compose -f docker-compose.prod.yml exec web sqlite3 /data/signal.db ".backup /data/signal-backup.db"
docker cp "$(docker compose -f docker-compose.prod.yml ps -q web)":/data/signal-backup.db ./signal-backup.db
```

Copy `whatsapp-auth` the same way if you need a cold spare.

## 7. After go-live

Open `https://YOUR_DOMAIN`, sign in with Google, and you land in the inbox with the seeded Fed / Mag 7 / crude rules. The next person who signs in gets their own SignlHQ. If this instance was previously owned by a phone login, the first Google sign-in rebinds that owner.

Link WhatsApp once on the WhatsApp tab. Alerts send from that linked WhatsApp to the destination number you save there.

## 8. Local vs production Compose

| File | Use |
| --- | --- |
| `docker-compose.yml` | Laptop / this preview: publishes **3847**, `AUTH_DEV_LOGIN` defaults on |
| `docker-compose.prod.yml` | VPS: Caddy 80/443, Google sign-in, `AUTH_URL=https://$DOMAIN` |

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Caddy TLS errors | DNS A record not pointing here yet, or port 80 blocked |
| `AUTH_SECRET is required` | `.env` missing `AUTH_SECRET`; recreate the web container |
| Google button missing / `The given origin is not allowed` | Add `https://YOUR_DOMAIN` as an Authorized JavaScript origin on the OAuth web client |
| “Not allowed to open a SignlHQ” | That email is not on `AUTH_ALLOWED_EMAILS` / `AUTH_GOOGLE_EMAIL` |
| Infinite login redirect | `AUTH_URL` must be `https://YOUR_DOMAIN` with no path |
| Empty live inbox | Same as README — token, recent-search product, rule `start_time` |
| WhatsApp unlinked after recreate | Volume was wiped; link the device again |

There is no hosted Signl1 service. You own the VPS, the domain, and the SQLite file.
