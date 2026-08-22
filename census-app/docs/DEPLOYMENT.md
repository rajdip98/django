# Deployment guide

Four ways to run this, from simplest to most complete. Pick the row that matches
what you need.

| You want | Use | Needs |
| --- | --- | --- |
| The app on your domain, one device per enumerator | **Static only** | Any web host |
| Everything, on one server | **Docker** | Docker |
| Everything, no Docker | **VPS / Python** | Python 3.11+ |
| App and API on separate hosts | **Split** | Both of the above |

---

## 1. Static only (no backend)

Build it:

```bash
cd frontend
npm install
npm run build
```

Upload the contents of `frontend/dist/` to your web host. See
[HOSTING-QUICKSTART.md](HOSTING-QUICKSTART.md) for step-by-step instructions.

Or run `./build-release.sh` from the project root, which produces
`release/census-app-static-1.0.0.zip` ready to unzip and upload.

Every field feature works. Data lives on each device and can be exported as
CSV/JSON or backed up to a file from **Profile → Export a backup**.

---

## 2. Docker (recommended for a real deployment)

```bash
docker compose up --build
```

Open <http://localhost:8000>. That single container serves both the API and the
installable app; MongoDB runs alongside it.

Before exposing it publicly, edit `docker-compose.yml`:

```yaml
SECRET_KEY: "<a long random string>"
ADMIN_PASSWORD: "<your own password>"
CORS_ORIGINS: "https://census.yourdomain.com"
ALLOW_SELF_REGISTRATION: "false"   # once your enumerators are registered
```

To run without MongoDB, comment out the `mongo` service and `MONGODB_URI`. The
embedded JSON store in the `census-data` volume takes over.

> **The embedded store is single-process.** It holds state in memory and
> rewrites one JSON file, so running `--workers 2` (or `WEB_CONCURRENCY=2`)
> means two processes overwriting each other — silent data loss. Run a single
> worker, or set `MONGODB_URI`. The server prints a warning at startup if it
> detects a worker count above one.

---

## 3. VPS without Docker

```bash
# Build the app
cd frontend && npm install && npm run build && cd ..

# Serve it from the API
cp -r frontend/dist backend/static

cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt          # add -optional for Mongo/SMS/AI
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then put nginx in front for TLS:

```nginx
server {
    listen 443 ssl http2;
    server_name census.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/census.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/census.yourdomain.com/privkey.pem;

    # Photos are inlined in sync payloads; the default 1 MB is too small.
    client_max_body_size 32M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Keep it running with systemd:

```ini
# /etc/systemd/system/census.service
[Unit]
Description=India Census 2026-27 API
After=network.target

[Service]
Type=simple
User=census
WorkingDirectory=/opt/census-app/backend
EnvironmentFile=/opt/census-app/backend/.env
ExecStart=/opt/census-app/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now census
```

---

## 4. App and API on separate hosts

Host `frontend/dist/` anywhere static, run the API somewhere else, then either:

* set `VITE_API_BASE=https://api.yourdomain.com` before `npm run build`, or
* leave it unset and enter the URL in the app under **Profile → Census server
  address** (this is stored per device and needs no rebuild).

Set `CORS_ORIGINS` on the API to the exact origin serving the app.

---

## Configuration

Every setting is an environment variable — see
[`backend/.env.example`](../backend/.env.example) for the annotated list. The
ones that matter most:

| Variable | Default | Notes |
| --- | --- | --- |
| `SECRET_KEY` | generated | Signs login tokens. Set it, or tokens reset on redeploy. |
| `ADMIN_PASSWORD` | `rajdip100@` | **Change this.** Or set `ADMIN_PASSWORD_HASH` instead. |
| `MONGODB_URI` | *(empty)* | Empty = embedded JSON store (single process only). |
| `MAX_REQUEST_BYTES` | `33554432` | Largest accepted body; keep in step with your proxy. |
| `ALLOW_SELF_REGISTRATION` | `true` | Set `false` after registering your team. |
| `CORS_ORIGINS` | `*` | Set to your real origin in production. |
| `TWILIO_*` | *(empty)* | Without these, OTPs are returned in the API response. |
| `AI_BASE_URL` / `AI_API_KEY` | *(empty)* | Optional; see the privacy note in SECURITY.md. |

---

## Enabling SMS OTP

1. Create a Twilio account and buy an SMS-capable number.
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`.
3. Restart. `/api/health` will report `smsEnabled: true` and the API will stop
   returning the code in its response.

Until then, the login screen shows the code on screen — deliberate, so the flow
is usable without a paid account, and disabled automatically once SMS works.

---

## Enabling AI assistance

Voice input and the data-validation rules work with no AI provider at all: voice
uses the browser's built-in speech recognition, and validation is a rule engine
that runs on the device.

An optional provider adds free-text validation and translation:

```bash
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_API_KEY=<your key>
AI_MODEL=gemini-2.0-flash
```

Any OpenAI-compatible endpoint works. Read the privacy note in
[SECURITY.md](SECURITY.md) first — this sends household data off your server.

---

## Maps

The map uses OpenStreetMap tiles, which need no API key or billing account.

To switch to another provider, change `TILE_URL` in
`frontend/src/screens/Map.tsx`:

```ts
// Google Maps (requires a key and their terms allow tile access for your use)
const TILE_URL = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

// MapmyIndia / Mappls
const TILE_URL = 'https://apis.mappls.com/advancedmaps/v1/<KEY>/still_map/{z}/{x}/{y}.png';
```

---

## Backups

**MongoDB:** `mongodump --uri "$MONGODB_URI" --out backup/`

**Embedded store:** copy `DATA_DIR/census.json` — it is a single JSON file.

**Per device:** each user can export a JSON backup from Profile, and restore it
on another device. Useful when a phone is replaced mid-survey.

---

## Upgrading

```bash
git pull
cd frontend && npm install && npm run build && cd ..
cp -r frontend/dist backend/static
sudo systemctl restart census        # or: docker compose up --build -d
```

Installed PWAs pick up the new version on their next launch — the service worker
revalidates `index.html` on every load, so an update is never more than one
refresh away.
