# Technical Requirements Document

**System:** Club & Organisation Website with Tiered Administration
**Version:** 1.0
**Last updated:** 23 August 2026
**Companion document:** `PRD.md`

---

## 1. Architecture

Two deployable halves. The website can run entirely on its own; the backend adds
the panels, the database and the API.

```
                          visitor's browser
                                 │
              ┌──────────────────┴───────────────────┐
              │                                      │
      static hosting                        Java gateway  :8080
   frontend/website/                    (the only port open)
   12 .html + assets                            │
   no runtime at all             ┌──────────────┼───────────────┐
                                 ▼              ▼               ▼
                          Django :8000   C# API :5081   Dash :8050
                          panels, auth,  read-only      analytics
                          uploads, QR    content API    dashboard
                                 └──────────────┴───────────────┘
                                                │
                                             MySQL 8
                                                │
                                     C++ vault (secrets at rest)
```

Everything except the gateway binds to `127.0.0.1`. The gateway's filters are
only worth something if there is no route around them.

## 2. Components

| Component | Technology | Responsibility |
|---|---|---|
| `frontend/website/` | HTML5, CSS3, ES5 JavaScript | The deployable public site. No dependencies, no build. |
| `frontend/react-app/` | React 19, Vite 8 | The same site as an SPA, for hosts that run a build. |
| `backend/python-api/` | Python 3.11, Django 5.0 | Schema, both panels, accounts, sessions, uploads, QR codes. Authority on identity. |
| `backend/java-gateway/` | Java 21, Spring Boot 3.3 | Edge: request guard, rate limits, security headers, routing, dashboard authorisation. |
| `backend/csharp-api/` | C# 12, .NET 8, MySqlConnector | Read-only public content API. |
| `backend/dash-analytics/` | Python, Plotly Dash 4 | Administrators' charts, on a read-only DB account. |
| `backend/cpp-secretvault/` | C++17, OpenSSL 3 | AES-256-GCM store for keys and passwords. |

### 2.1 Why the website is plain HTML

A single-page application must be compiled before a browser can use it. Its
`index.html` contains no content — only a script tag pointing at source. Shared
hosting has no compiler, so the browser renders an empty root element: a blank
page.

The deployed website therefore ships as finished HTML. Content lives in the
markup, so it is readable before any CSS or JavaScript loads, and remains
readable if either fails. This is a hard requirement (PRD R1, R2), not a
preference.

## 3. Data model

Nineteen content types, all owned by a tenant except where noted.

| Model | Key fields | Tenant-scoped |
|---|---|---|
| `Tenant` | name, host, is_default | — |
| `SiteSettings` | organization_name, slogan, logo, emblem, address, phone, email | yes |
| `Event` | title, slug, category, start, end, venue, summary, image, registration_open | yes |
| `EventRegistration` | event, full_name, email, phone, attended | via event |
| `Article` | title, slug, category, published_at, excerpt, body, image | yes |
| `Announcement` | title, published_at, target_url | yes |
| `GalleryItem` | title, category, media_type, image, video_url, caption, taken_on | yes |
| `TeamMember` | name, slug, position, category, bio, photo, tenure | yes |
| `Activity` | title, category, icon, frequency, summary | yes |
| `Statistic` | label, value, suffix, order | yes |
| `Resource` | title, category, file, updated_on | yes |
| `ContactMessage` | name, email, phone, subject, message | yes |
| `MemberProfile` | user, membership_id, status, department, phone | installation-wide |
| `Certificate` | member, title, reference_no, issued_on, file | installation-wide |
| `QRCode` | label, payload, is_active | yes |
| `Banner`, `Category`, `CoreValue`, `Milestone` | content and ordering | yes |
| `StaffProfile` | user, role, must_change_password, is_enabled | yes |
| `PlatformProfile` | user, must_change_password | — |
| `AuditLog` | actor, action, target, at, ip | yes |

Character set `utf8mb4` throughout, so Bengali text and emoji store correctly.
Primary keys are `BigAutoField`, which is `bigint` in MySQL — the C# layer reads
them as `long`.

## 4. Interfaces

### 4.1 Public API — served by C#, read-only

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | service and database reachability |
| GET | `/api/site` | name, slogan, address, contact, established |
| GET | `/api/events?scope=upcoming\|past\|all&limit=` | events, with image paths |
| GET | `/api/notices?limit=` | announcements |
| GET | `/api/articles?limit=` | news |
| GET | `/api/activities` | club wings |
| GET | `/api/gallery?limit=` | photographs |
| GET | `/api/team` | office bearers |
| GET | `/api/statistics` | counter tiles |
| POST | `/api/enquiries` | stores a contact enquiry |

`POST /api/enquiries` is the only write, and the only path where CORS permits a
POST. Tenant is resolved from the `Host` header, falling back to the default.

### 4.2 Internal

`GET /adminpanel/session-check/` returns `{authenticated, role, elevated,
must_change_password}` and nothing identifying. The gateway calls it before
proxying the analytics dashboard.

## 5. Security

### 5.1 Authentication and roles

| Control | Implementation |
|---|---|
| Roles | `admin`, `super_admin` (StaffProfile); platform accounts are separate (PlatformProfile) |
| First sign-in | `must_change_password` blocks every panel page until the password is replaced |
| Elevation | Super Admin sections require a passphrase; the window lasts 30 minutes, then lapses |
| Platform panel | Separate sign-in and separate passphrase; an Admin cannot enter it |
| Lockout | Five failed attempts locks the account |
| Passwords | Django PBKDF2; secrets stored hashed, never in plain text |
| Audit | Sign-ins, elevation attempts and content changes are recorded with actor and time |

### 5.2 Gateway controls

| Control | Setting |
|---|---|
| Rate limit — browsing | 300 requests/minute per address |
| Rate limit — sign-in and elevation | 10/minute per address |
| Request guard | Rejects unknown verbs, path traversal (plain and encoded), embedded nulls, over-long URLs, scanner paths (`/.env`, `/wp-login.php`) |
| Response headers | CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, COOP/CORP; `no-store` on panels |
| CORS | Closed by default; reads from named origins; POST only on `/api/enquiries`; credentials never allowed; `*` refused |
| Dashboard authorisation | Django must confirm a staff session whose password change is complete |
| Body handling | Forwarded byte for byte; Spring multipart parsing disabled so uploads are not consumed |

### 5.3 Database privileges

Two accounts. The application account has full rights on its schema; the
dashboard account has `SELECT` only, so a defect in reporting code cannot alter
club data.

### 5.4 Secrets

`DJANGO_SECRET_KEY`, `PANEL_DEFAULT_PASSWORD`, `PANEL_ELEVATION_SECRET`,
`PLATFORM_DEFAULT_PASSWORD` and `DATABASE_URL` are read from the environment, or
from the C++ vault (AES-256-GCM, PBKDF2-HMAC-SHA256 at 600,000 iterations, keys
wiped with `OPENSSL_cleanse`). The shipped defaults are public and must be
replaced before the system holds real data.

## 6. Deployment

### 6.1 Website only — shared hosting

Copy the contents of `frontend/website/` into `public_html`. Nothing else. No
runtime, no database. `check.html` reports whether the upload succeeded.

`.htaccess` is optional and every directive in it is wrapped in `<IfModule>`.
This matters: an unguarded directive that the server does not recognise makes
Apache return HTTP 500 for every request, which presents as a blank site. The
file can be deleted with no loss beyond the custom 404 page.

### 6.2 Full system

```bash
export DATABASE_URL="mysql://clubapp:…@127.0.0.1:3306/club"
export REPORTS_DATABASE_URL="mysql://clubreports:…@127.0.0.1:3306/club"
cd backend && ./start-all.sh
```

Ports: Django 8000, C# 5081, Dash 8050, gateway 8080. Only 8080 is exposed.
Behind TLS termination, forward `X-Forwarded-Proto`; Django reads the visitor's
host from `X-Forwarded-Host` (`USE_X_FORWARDED_HOST`), which is safe only
because Django is not reachable directly.

### 6.3 Requirements

| | Website only | Full system |
|---|---|---|
| Web server | Any | Any, plus a reverse proxy for TLS |
| Runtime | none | Python 3.11, Java 21, .NET 8 |
| Database | none | MySQL 8 or MariaDB 10.6+ |
| Memory | negligible | 2 GB |

## 7. Testing

| Suite | Count | Covers |
|---|---|---|
| Django | 100 | Role separation, forced password change, elevation and expiry, administrator management, content CRUD and removal, QR codes, panel visibility, session-check |
| Java gateway | 24 | Routing, request guard, rate limits, CORS ordering, dashboard authorisation, body passthrough |
| C# API | 22 | Every endpoint, limit clamping, enquiry validation, injection safety, media URL shape |
| C++ vault | 13 | Round trip, wrong passphrase, tamper detection, no plaintext at rest, permissions, rotation |

Run with `cd backend && ./run-tests.sh`.

Browser verification, on Chromium: all 13 pages under Apache and under a plain
file server; slider, filters, lightbox, table search, mobile menu at 390 px, dark
mode; both panels signing in and forcing the password change; content added and
removed; the dashboard opening for staff and refusing an anonymous or forged
session.

Deliberate failure cases exercised: `assets/` deleted (page stays readable),
site uploaded one level too deep (`check.html` reports it), backend absent
(contact form offers e-mail instead), and an Apache without the modules the
`.htaccess` asks for.

## 8. Performance

| | Measured |
|---|---|
| Home page HTML | 21 KB |
| Stylesheet | 15 KB (4 KB compressed) |
| JavaScript | 8 KB |
| Total first view | under 60 KB with placeholder images |
| Requests for a first view | 4 |

Images below the fold use `loading="lazy"`. Pages are cacheable; HTML always
revalidates so an edit by the office is seen immediately.

## 9. Maintenance

Content changes go through the admin panel, or by editing the HTML directly if
the site is running without a backend. Replacement photographs keep the existing
file names in `assets/img/`, or the `src` attributes are updated. PDFs go in
`assets/files/` and are linked from `downloads.html`.
