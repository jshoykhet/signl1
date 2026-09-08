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
| Firebase phone | Solo sign-in. First number to verify the SMS owns this Signl1. |

This instance is **solo**. Sign in with your phone. Firebase texts a 6-digit code. One X bearer token and one linked WhatsApp sending number.

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

## 3. Firebase phone auth

Create a Firebase project and add a **web** app. Copy the config snippet from Project settings.

1. Authentication → Sign-in method → enable **Phone**.
2. Authentication → Settings → SMS region policy — allow the countries you will text.
3. Authentication → Settings → Authorized domains — add `YOUR_DOMAIN` (for example `signl1.xyz`).
4. Optional: Authentication → Sign-in method → Phone → Phone numbers for testing, for local checks without SMS.

See [Firebase phone auth](https://firebase.google.com/docs/auth/web/phone-auth).

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
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=   # your-project.firebaseapp.com
FIREBASE_PROJECT_ID=
FIREBASE_APP_ID=
FIREBASE_MESSAGING_SENDER_ID=
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

On a 2 GB VPS, add 2 GB of swap before the first `--build`. Only the `web` image runs `next build`; the poller image does not.

Caddy obtains a Let’s Encrypt certificate for `$DOMAIN` and proxies to `web:3847`. Confirm:

- `https://YOUR_DOMAIN/login` loads
- Phone SMS code returns to the inbox

## 6. WhatsApp and data

The `signal-data` volume holds `/data/signal.db` and `/data/whatsapp-auth`. Link WhatsApp from the WhatsApp tab after you can log in. **Do not** `docker compose down -v` on production — that wipes matches, rules, and the WhatsApp session.

Back up the volume periodically:

```bash
docker compose -f docker-compose.prod.yml exec web sqlite3 /data/signal.db ".backup /data/signal-backup.db"
docker cp "$(docker compose -f docker-compose.prod.yml ps -q web)":/data/signal-backup.db ./signal-backup.db
```

Copy `whatsapp-auth` the same way if you need a cold spare.

## 7. After go-live

Open `https://YOUR_DOMAIN`, enter your number, confirm the SMS code, and you land in the inbox with the seeded Fed / Mag 7 / crude rules. Nobody else can sign in.

Link WhatsApp once on the WhatsApp tab. Alerts send from that linked WhatsApp to the destination number you save there.

## 8. Local vs production Compose

| File | Use |
| --- | --- |
| `docker-compose.yml` | Laptop / this preview: publishes **3847**, `AUTH_DEV_LOGIN` defaults on |
| `docker-compose.prod.yml` | VPS: Caddy 80/443, Firebase phone auth, `AUTH_URL=https://$DOMAIN` |

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Caddy TLS errors | DNS A record not pointing here yet, or port 80 blocked |
| `AUTH_SECRET is required` | `.env` missing `AUTH_SECRET`; recreate the web container |
| SMS never arrives | Phone provider enabled? Domain authorized? SMS region policy allow your country? |
| reCAPTCHA / `auth/operation-not-allowed` | Enable Phone in Firebase and add `YOUR_DOMAIN` to authorized domains |
| “Already linked to another number” | This instance is solo — only the enrolled phone can sign in |
| Infinite login redirect | `AUTH_URL` must be `https://YOUR_DOMAIN` with no path |
| Empty live inbox | Same as README — token, recent-search product, rule `start_time` |
| WhatsApp unlinked after recreate | Volume was wiped; link the device again |

There is no hosted Signl1 service. You own the VPS, the domain, and the SQLite file.
