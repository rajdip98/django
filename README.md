# Club & Organisation Website

A complete website for a registered club, with a two-tier administration system.

```
frontend/
  website/     ← plain HTML. Upload this. It works on any host.
  react-app/   ← the same site in React (needs a build step)
backend/       ← Python, Java, C#, Dash and C++ services
PRD.md         ← what this product is meant to do
TRD.md         ← how it is built
```

---

## Putting the website online — 4 steps

You need nothing installed. No Node.js, no command line.

1. **Extract** the zip on your computer.
2. Open your hosting control panel → **File Manager** → the **`public_html`** folder.
   (Some hosts call it `htdocs` or `www`.) Delete anything left from a previous attempt.
3. Upload **everything inside** `frontend/website/` — the files, not the folder.

   ✅ `public_html/index.html`
   ❌ `public_html/website/index.html` ← one level too deep

4. Visit your domain.

**Then open `yourdomain.com/check.html`.** It tests your own installation and
tells you in plain words whether anything is missing.

### If you see a blank page

| What you see | Cause | Fix |
|---|---|---|
| Blank white page | The React version was uploaded | Upload `frontend/website/` instead — React must be compiled first, and web hosts cannot do that |
| Blank page or "500" on **every** page | `.htaccess` | **Delete `.htaccess`.** The site works without it |
| Page loads but has no colours | `assets` folder missing | Re-upload `assets` so it sits beside `index.html` |
| Site is at `yourdomain.com/website/` | Uploaded one folder too deep | Move the files up into `public_html` |
| Old page still showing | Browser cache | Hard refresh: Ctrl+F5, or open in a private window |

`check.html` diagnoses all of these for you.

---

## What is in the website

Twelve pages, each a real HTML file:

Home · About Us · Committee · Members · Events · News · Notice Board ·
Gallery · Downloads · Membership · Contact · Not-found

Home has an image slider, a scrolling notice ticker, statistics, the President's
message, activities, upcoming events, a gallery extract and latest news.

Also included: three appearance modes (light, dark, high contrast), three text
sizes, searchable member and notice tables, gallery filters with a lightbox,
a working contact form, and a layout that reads properly on a phone.

### Changing the content

The text sits in the `.html` files. Open one in any text editor, change the
words, upload that file again.

To change the club's details everywhere, use "find in all files" for:

```
Krishnanagar Youth & Cultural Club
14 Rabindra Sarani, Krishnanagar, Nadia — 741101
+91 33 2555 0100
office@example.org
```

Photographs in `assets/img/` are placeholders — replace them keeping the same
file names, or update the `src="..."` in the pages. PDFs go in `assets/files/`
and are linked from `downloads.html`.

---

## The admin panels

```
yourdomain.com/adminpanel/login/          website content
yourdomain.com/superadminpanel/login/     administers websites and administrators
```

These are served by the **backend**, not by the website. On plain hosting with
no backend those two links show a 404 — expected, not a fault.

| | Admin | Super Admin |
|---|---|---|
| Edit content, banners, logo, files | ✅ | ✅ |
| Create or remove administrators | ❌ | ✅ |
| Platform panel | ❌ | separate sign-in |

Every administrator must replace the shared default password at first sign-in
before the panel will show anything.

### Running the backend

```bash
export DATABASE_URL="mysql://clubapp:password@127.0.0.1:3306/club"
export REPORTS_DATABASE_URL="mysql://clubreports:password@127.0.0.1:3306/club"
cd backend && ./start-all.sh
```

Needs MySQL 8, Python 3.11, Java 21 and .NET 8. `backend/README.md` has the
database setup and what each service does.

**Before real data goes in:** the three default passwords are visible in this
repository, so treat them as public. Override them —
`PANEL_DEFAULT_PASSWORD`, `PANEL_ELEVATION_SECRET`, `PLATFORM_DEFAULT_PASSWORD`.

---

## Tests

```bash
cd backend && ./run-tests.sh
```

100 Django · 24 Java gateway · 22 C# API · 13 C++ vault.

The website itself was verified under real Apache and under a plain file server:
13 pages, no console errors, no failed requests, and still readable with the
stylesheet deliberately removed.

---

## Documents

- **`PRD.md`** — goals, users, scope, requirements and how each was verified.
- **`TRD.md`** — architecture, data model, API, security controls, deployment.
- **`frontend/website/README.txt`** — upload instructions, at the keyboard.
- **`backend/README.md`** — services, database setup, security posture.
