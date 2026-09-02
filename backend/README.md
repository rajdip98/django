# Backend

Five components. Each one has a job it is actually better at than the others —
none of them is here to lengthen a list.

| Folder | Language | What it is responsible for |
|---|---|---|
| `python-api/` | Python (Django 5) | The schema, both admin panels, every account, sessions, uploads, QR codes. The security core. |
| `java-gateway/` | Java 21 (Spring Boot) | The only process open to the internet: filters, rate limits and routes every request. |
| `csharp-api/` | C# (.NET 8) | The read-only public API the website reads from. |
| `dash-analytics/` | Python (Plotly Dash) | The administrators' charts, on a read-only database account. |
| `cpp-secretvault/` | C++17 + OpenSSL | An encrypted store for API keys and passwords, so they need not sit in the environment. |

## How a request travels

```
        browser
           │
           ▼
   ┌───────────────┐   the only port you open
   │ java-gateway  │   :8080   guard → rate limit → security headers → route
   └───────┬───────┘
           │
     ┌─────┴──────┬─────────────────┐
     ▼            ▼                 ▼
 python-api    csharp-api      dash-analytics
   :8000         :5081             :8050
     │             │                 │
     └─────────────┴────────┬────────┘
                            ▼
                          MySQL
```

Everything except the gateway binds to `127.0.0.1`. That is not decoration: the
gateway's checks are only worth something if there is no way around them. If you
expose Django or the C# API directly, you have removed the front door and left
the wall standing.

## Running it

```bash
export DATABASE_URL="mysql://clubapp:password@127.0.0.1:3306/club"
export REPORTS_DATABASE_URL="mysql://clubreports:password@127.0.0.1:3306/club"

./start-all.sh      # starts all four services in order
./run-tests.sh      # runs every suite
./stop-all.sh
```

First-time database setup:

```sql
CREATE DATABASE club CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'clubapp'@'127.0.0.1' IDENTIFIED BY 'a long random password';
GRANT ALL ON club.* TO 'clubapp'@'127.0.0.1';

-- The dashboard only ever reads. Give it an account that cannot do anything else.
CREATE USER 'clubreports'@'127.0.0.1' IDENTIFIED BY 'a different long password';
GRANT SELECT ON club.* TO 'clubreports'@'127.0.0.1';
```

Then, in `python-api/`:

```bash
python3 manage.py migrate
python3 manage.py bootstrap_panel      # creates the first Super Admin
python3 manage.py bootstrap_platform   # creates the platform owner
python3 manage.py seed_demo            # optional sample content
```

## The two panels

| | Address | Who signs in |
|---|---|---|
| Admin panel | `/adminpanel/login/` | Admins and Super Admins of one website |
| Super Admin panel | `/superadminpanel/login/` | The platform owner, who administers every website |

They are separate systems with separate accounts, as they should be. An Admin
cannot walk into the platform panel; reaching the Super Admin sections *inside*
the admin panel needs a separate passphrase, and that elevation lasts thirty
minutes before it lapses on its own.

## Read this before you put it on a server

The three shipped passwords are in the repository, so **treat them as public**.
They exist so you can sign in the first time, and the panel forces you to
replace yours before it will show you anything. Override them at deployment:

```bash
export PANEL_DEFAULT_PASSWORD="…"      # currently: rajdip10
export PANEL_ELEVATION_SECRET="…"      # currently: rajdip2007
export PLATFORM_DEFAULT_PASSWORD="…"   # currently: rajdip@100
export DJANGO_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')"
export DJANGO_DEBUG=0
export ALLOWED_HOSTS="club.example.org"
```

Or keep them in the C++ vault instead of the environment, where a stray
`env` or a crash dump cannot show them:

```bash
cd cpp-secretvault && make
./secretvault set PANEL_DEFAULT_PASSWORD
eval "$(./secretvault export)"
```

## What the gateway actually enforces

- **Rate limits** — 300 requests a minute per caller for browsing, 10 a minute
  for sign-in and elevation. Django's own lockout after five failed attempts
  still applies underneath.
- **A request guard** — unknown HTTP verbs, path traversal (plain and encoded),
  embedded nulls, over-long URLs, and the scanner paths (`/.env`, `/wp-login.php`)
  that arrive within minutes of a host going live.
- **Security headers** on every response: a content security policy,
  `X-Content-Type-Options`, `X-Frame-Options: DENY`, a referrer policy, a
  permissions policy, and `no-store` on anything under a panel.
- **Authorisation for the dashboard** — Dash has no login of its own, so the
  gateway asks Django whether the caller is signed-in staff whose first-login
  password change is done, and refuses to proxy otherwise.
- **CORS** closed by default; reads are allowed from the named origins and the
  contact form is the single path that may accept a POST.

None of this replaces Django's own checks — sessions, CSRF, permissions and the
audit log all still run. It is a second wall, not the only one.
