# Deploy Signl1 on a domain you purchased

Signl1 is a long-running desk: Next.js UI, a background X poller, SQLite, and a WhatsApp (Baileys) session on disk. **Do not put this on Vercel.** Vercel cannot keep the poller alive or persist SQLite / WhatsApp auth files. Use a VPS (Hetzner, DigitalOcean, Fly machines, a home box with a public IP) and Docker Compose plus Caddy for TLS.

This file assumes you already bought a hostname. The stack never hard-codes it — set `DOMAIN` in `.env`.

## What you will have

| Piece | Role |
| --- | --- |
| DNS A/AAAA | Point `app.example.com` (or the apex) at the VPS |
| Caddy | HTTP→HTTPS, reverse-proxy to the web container |
| `web` | Next.js on port 3847, internal only |
| `poller` | X search + WhatsApp, shares the data volume |
| Phone + authenticator | Solo sign-in. First number to scan the QR owns the desk. |

This instance is **solo**. Sign in with your phone and a 6-digit code from [Ente Auth](https://ente.io/auth/) or [Aegis](https://github.com/beemdevelopment/Aegis). One X bearer token and one linked WhatsApp sending number.

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

## 3. Authenticator app

Install an open-source TOTP app on your phone before the first sign-in:

- **[Ente Auth](https://ente.io/auth/)** — iOS, Android, desktop. End-to-end encrypted sync. [GitHub](https://github.com/ente-io/ente/tree/main/auth).
- **[Aegis](https://github.com/beemdevelopment/Aegis)** — Android, local vault, no account.

On first visit to `/login`, enter your number, scan the QR, and confirm the code. Later visits only ask for the current 6-digit code.

## 4. Secrets and the first sign-in

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
X_BEARER_TOKEN=       # live X, or leave empty for demo fixtures
```

Generate the session secret on the VPS:

```bash
openssl rand -base64 32
```

`AUTH_DEV_LOGIN` is a Skip sign-in button for this repo’s local preview. The production Compose file forces it off.

## 5. Start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy web
```

Caddy obtains a Let’s Encrypt certificate for `$DOMAIN` and proxies to `web:3847`. Confirm:

- `https://YOUR_DOMAIN/login` loads
- Phone + authenticator code returns to the inbox

## 6. WhatsApp and data

The `signal-data` volume holds `/data/signal.db` and `/data/whatsapp-auth`. Link WhatsApp from Settings after you can log in. **Do not** `docker compose down -v` on production — that wipes matches, rules, and the WhatsApp session.

Back up the volume periodically:

```bash
docker compose -f docker-compose.prod.yml exec web sqlite3 /data/signal.db ".backup /data/signal-backup.db"
docker cp "$(docker compose -f docker-compose.prod.yml ps -q web)":/data/signal-backup.db ./signal-backup.db
```

Copy `whatsapp-auth` the same way if you need a cold spare.

## 7. After go-live

Open `https://YOUR_DOMAIN`, enroll your phone with Ente Auth or Aegis, and you land in the desk with the seeded Fed / Mag 7 / crude rules. Nobody else can sign in.

Link WhatsApp once on Settings. Alerts send from that linked WhatsApp to the destination number you save there.

## 8. Local vs production Compose

| File | Use |
| --- | --- |
| `docker-compose.yml` | Laptop / this preview: publishes **3847**, `AUTH_DEV_LOGIN` defaults on |
| `docker-compose.prod.yml` | VPS: Caddy 80/443, phone + authenticator, `AUTH_URL=https://$DOMAIN` |

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Caddy TLS errors | DNS A record not pointing here yet, or port 80 blocked |
| `AUTH_SECRET is required` | `.env` missing `AUTH_SECRET`; recreate the web container |
| Authenticator code rejected | Wait for the next 30s code; confirm the QR was scanned into Ente Auth or Aegis |
| “Already linked to another number” | This instance is solo — only the enrolled phone can sign in |
| Infinite login redirect | `AUTH_URL` must be `https://YOUR_DOMAIN` with no path |
| Empty live inbox | Same as README — token, recent-search product, rule `start_time` |
| WhatsApp unlinked after recreate | Volume was wiped; link the device again |

There is no hosted Signl1 service. You own the VPS, the domain, and the SQLite file.
