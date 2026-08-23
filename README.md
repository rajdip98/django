# Government / Political Club Website

A complete club website with two staff panels, in two folders:

```
frontend/
  website/     ← plain HTML. Upload this to your web host; it just works.
  react-app/   ← the React version (needs a build step)
backend/       Python, Java, C#, Dash and C++ — the services behind it
```

**Putting it on ordinary web hosting?** Upload everything inside
`frontend/website/` into your `public_html` folder. There is nothing to compile
and no Node.js needed. `frontend/website/README.txt` walks through it.

- **`frontend/README.md`** — the website, its pages and how to build it.
- **`backend/README.md`** — what each service does, how they fit together, and
  what to change before putting it on a server.

## Quick start

```bash
# 1. Backend (needs MySQL, Java 21, .NET 8, Python 3.11)
export DATABASE_URL="mysql://clubapp:password@127.0.0.1:3306/club"
export REPORTS_DATABASE_URL="mysql://clubreports:password@127.0.0.1:3306/club"
cd backend && ./start-all.sh

# 2. Frontend — nothing to install
cd ../frontend/website && python3 -m http.server 8000
```

| | Address |
|---|---|
| Website | `/` |
| Admin panel | `/adminpanel/login/` |
| Super Admin panel | `/superadminpanel/login/` |
| Analytics dashboard | `/analytics/` (staff sign-in required) |

## What is here

| Folder | Language | Responsible for |
|---|---|---|
| `frontend/website/` | HTML + CSS + JS | The deployable website: twelve pages, three appearance modes, no build step. |
| `frontend/react-app/` | React 19 + Vite | The same site as a single-page application, for hosts that run a build. |
| `backend/python-api/` | Python (Django 5) | The schema, both panels, every account, sessions, uploads, QR codes. |
| `backend/java-gateway/` | Java 21 (Spring Boot) | The only process open to the internet: filters, rate-limits and routes every request. |
| `backend/csharp-api/` | C# (.NET 8) | The read-only public API the website reads from. |
| `backend/dash-analytics/` | Python (Plotly Dash) | Administrators' charts, on a read-only database account. |
| `backend/cpp-secretvault/` | C++17 + OpenSSL | An encrypted store for keys and passwords. |

Every service except the gateway binds to `127.0.0.1`. That is what makes the
gateway's checks worth anything — expose Django or the C# API directly and you
have taken the front door off.

## Before you put this on a server

The three default passwords are visible in this repository, so treat them as
public. The panels force each administrator to replace theirs at first sign-in,
but set your own defaults first — `backend/README.md` lists the variables.

## Tests

```bash
cd backend && ./run-tests.sh
```

100 Django tests, 24 Java gateway tests, 22 C# API tests, 13 C++ vault tests.

---

This repository began as the Defang Django sample; `compose.yaml` still builds
the Django service for that deployment path.
