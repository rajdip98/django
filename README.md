# Club & Organisation Website

A complete website for a registered club, with a two-tier administration system.

```
frontend/
  website/       ← plain HTML. Upload this. It works on any host.
  react-app/     ← the same site in React (needs a build step)
backend/         ← Python, Java, C#, Dash and C++ services
PANEL-GUIDE.txt  ← the admin panels: passwords, sections, publishing
PRD.md           ← what this product is meant to do
TRD.md           ← how it is built
_test/           ← tests for the panel system (needs Node)
```

## The two panels

`yourdomain.com/adminpanel/login/` and `yourdomain.com/superadminpanel/login/`.

Between them they set the club name and logo, the home-page banners and their
pictures, the typefaces and text size, every colour, the header wording and main
menu, the footer, gallery photographs, contact details and the notice strip. The
Super Admin Panel adds password changes, a server-side lock, backup and restore,
and an activity log.

Pictures are chosen from your computer or dragged onto the panel.

**The passwords are in `PANEL-GUIDE.txt`** — kept out of `frontend/website/`
on purpose, because everything in that folder gets uploaded to your web host.

A panel never touches your website on its own. It writes `content.js`; you
upload that to `assets/js/` and the change appears on every page at once. That
is also the honest answer to how much the password protects: it is a lock on an
office door, not a bank vault, because on a static site the check has to run in
the browser. What really protects the site is that publishing needs your hosting
login. `PANEL-GUIDE.txt` explains this properly, and shows how to add a real
server-side lock through cPanel in about a minute.

### Testing it

```
npm install jsdom
bash _test/run-all.sh
```

Four suites: both panels sign in and show the right sections for their role;
published settings reach every page; a full round trip from editing in the panel
to the change appearing on the site; and `check.html` reporting correctly on a
complete and an incomplete upload.

---

## Putting the website online — 4 steps

You need nothing installed. No Node.js, no command line.

1. **Extract** the zip on your computer.
2. Open your hosting control panel → **File Manager** → the **`public_html`** folder.
   (Some hosts call it `htdocs` or `www`.) Delete anything left from a previous attempt.
3. Upload **everything inside** `frontend/website/` — the files, not the folder.

   ✅ `public_html/index.html`
   ❌ `public_html/website/index.html` ← one level too deep

   Check that **`index.html` itself arrived** — it is the home page, and without
   it the bare domain shows "Page not found". Each page carries its own design,
   so if the upload is awkward, get the `.html` files up first: they work on
   their own, and `assets/` only adds the photographs.

4. Visit your domain.

**Then open `yourdomain.com/check.html`.** It tests your own installation and
tells you in plain words whether anything is missing.

### If you see a blank page

| What you see | Cause | Fix |
|---|---|---|
| **"Page not found" on the bare domain** | `index.html` did not upload | Upload `index.html` into `public_html`. It is the home page — nothing else can stand in for it |
| Blank white page | The React version was uploaded | Upload `frontend/website/` instead — React must be compiled first, and web hosts cannot do that |
| Blank page or "500" on **every** page | `.htaccess` | **Delete `.htaccess`.** The site works without it |
| Giant logo, plain links, no colours | Old version, before the design was built into each page | Use this build — every page now carries its own styling |
| Photographs missing | `assets` folder missing | Upload `assets`. The pages still look correct without it |
| Site is at `yourdomain.com/website/` | Uploaded one folder too deep | Move the files up into `public_html` |
| Old page still showing | Browser cache | Hard refresh: Ctrl+F5, or open in a private window |
| Admin Panel link shows "Page not found" | Old build, before the panel pages existed | Use this build — `/adminpanel/login/` is a real page now |
| Edited details not appearing | `content.js` not uploaded, or uploaded to the wrong folder | It belongs at `assets/js/content.js` |

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

**The panels are not shown anywhere on the website.** No page links to them and
no page mentions them. You reach them by typing the address:

```
www.studentcartonline.in/adminpanel/login
www.studentcartonline.in/superadminpanel/login
```

Both work with or without a trailing slash. Each has its own password, and the
Admin password will not open the Super Admin panel.

| | Admin Panel | Super Admin Panel |
|---|---|---|
| Name, logo, banners, photographs | yes | yes |
| Header, footer, colours, typefaces | yes | yes |
| Office details and notices | yes | yes |
| Publish changes | yes | yes |
| **Change either password** | no | **yes** |
| **Server lock** (a password on the folder itself) | no | **yes** |
| **Backup and restore** | no | **yes** |
| **Activity log** | no | **yes** |

The Super Admin panel contains everything the Admin panel does, plus the four
rows above — so it can change, remove or edit anything the Admin panel controls.

Hiding the addresses is not by itself protection. The password is the lock, and
"Server lock" in the Super Admin panel adds a second one at the host.


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
