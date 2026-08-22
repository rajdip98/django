# India Census 2026-27 — household data collection app

A mobile-first, installable web app for the Census of India 2026-27. Enumerators
record households door to door (offline, geo-tagged, in seven languages),
citizens self-enumerate, supervisors review their team's work, and
administrators manage users, zones, analytics and exports.

<p align="center">
  <img src="frontend/public/icons/icon.svg" width="88" alt="">
</p>

## What it does

**Enumerators** — assigned zone, a four-step census schedule (location, housing,
members, review), GPS geo-tagging, optional house photo, voice input in the
local language, live data-quality checks, and automatic sync when a signal
returns.

**Citizens** — fill in their own household and receive an acknowledgement
number.

**Supervisors** — coverage against target, team progress, a map of surveyed
households, a review queue, and approve/flag with a note.

**Administrators** — users, zones, analytics (sex ratio, age distribution,
literacy, category, religion, per-zone and per-enumerator progress), CSV/JSON
export, and an audit log. Password-protected.

## The thing that makes it usable in the field

Every write goes to the device first. There is no spinner waiting on a network
that isn't there: the questionnaire, validation, maps, charts and export all work
with the radio off, and an outbox syncs when connectivity returns. Revision
conflicts are merged so a supervisor's decision is never silently reverted by an
enumerator's offline edit.

## Quick start

### Just the app (no server)

```bash
cd frontend
npm install
npm run build
```

Upload the contents of `frontend/dist/` to any web host — see
[docs/HOSTING-QUICKSTART.md](docs/HOSTING-QUICKSTART.md). Fully functional in
device-only mode.

### Everything, with Docker

```bash
docker compose up --build
# → http://localhost:8000
```

### Everything, without Docker

```bash
cd frontend && npm install && npm run build && cd ..
cp -r frontend/dist backend/static

cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000
```

### Development

```bash
# terminal 1 — API on :8000
cd backend && .venv/bin/uvicorn app.main:app --reload

# terminal 2 — app on :5173 with hot reload, proxying /api
cd frontend && npm run dev
```

### Packaging it for download

```bash
./build-release.sh
```

Produces `release/census-app-static-1.0.0.zip` (upload-and-go) and
`release/census-app-full-1.0.0.zip` (app + API + docs).

## Signing in

| Role | How |
| --- | --- |
| Enumerator / Citizen / Supervisor | Mobile OTP. Without Twilio configured the code is shown on screen. |
| Administrator | Password. Default `rajdip100@` — **change it**, see [docs/SECURITY.md](docs/SECURITY.md). |

With no server reachable, the app offers device-only mode and skips the OTP
round trip entirely.

## Languages

English, हिन्दी, বাংলা, தமிழ், తెలుగు, मराठी, ગુજરાતી — the whole interface and
the whole questionnaire, with English fallback for any missing key. Adding one is
a file in `frontend/src/i18n/locales/` plus a line in `frontend/src/i18n/index.ts`.

Voice input follows the chosen language via the browser's built-in speech
recognition (`hi-IN`, `bn-IN`, `ta-IN`, …) — no API key, no audio upload.

## Technology

| | |
| --- | --- |
| Frontend | React 18 + TypeScript, Vite, installable PWA, hash routing |
| Offline | IndexedDB with a localStorage fallback, outbox sync engine |
| Backend | FastAPI (Python 3.11+), JWT auth, PBKDF2 password hashing |
| Database | MongoDB, or a built-in JSON store when `MONGODB_URI` is unset |
| Maps | Leaflet + OpenStreetMap (no API key; swappable for Google/Mappls) |
| Validation | 45-rule on-device engine; optional LLM for free-text checks |
| SMS | Twilio (optional) |

Deliberate choices worth knowing about:

* **Hash routing and relative asset paths** — the built folder works from a
  domain root, a subfolder, S3, or a double-clicked `index.html`, with no server
  rewrite rules anywhere.
* **No database required** — the embedded store means "upload it and it runs".
* **No API keys required** — OpenStreetMap for maps, the browser for speech, and
  a rule engine for validation. Every paid service is optional.

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests -q      # 41 API tests
cd frontend && npm test                                # 61 unit tests
cd frontend && npm run build                           # typecheck + production build
```

## Project layout

```
census-app/
├── frontend/            React + TypeScript PWA
│   ├── src/lib/         domain model, offline store, sync, validation, geo, voice
│   ├── src/screens/     login, home, households, form, map, supervisor, admin
│   ├── src/i18n/        seven language dictionaries
│   └── public/          service worker, manifest, icons, host configs
├── backend/             FastAPI service
│   ├── app/routers/     auth, households/sync, admin, ai
│   ├── app/store.py     MongoDB and embedded JSON stores
│   └── tests/           API test suite
├── docs/                deployment, hosting, security, API reference
├── docker-compose.yml
└── build-release.sh
```

## Documentation

* [Hosting quick start](docs/HOSTING-QUICKSTART.md) — upload it to your domain
* [Deployment guide](docs/DEPLOYMENT.md) — Docker, VPS, split hosting, config
* [Security and privacy](docs/SECURITY.md) — read before collecting real data
* [API reference](docs/API.md) — endpoints and the sync protocol

## Status and honest limits

This is a complete, working, tested application, not a government-certified
system. Before a real census deployment you would need an independent security
audit, professional review of the translations, a data-retention policy, and
whatever accreditation the Registrar General requires. Aadhaar verification is
deliberately not implemented — it needs government-level authorisation, so
identity here is a mobile number. See [docs/SECURITY.md](docs/SECURITY.md) for
the full list.
