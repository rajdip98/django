# Frontend

Two versions of the same website. **Which one you need depends on your host.**

| | `website/` | `react-app/` |
|---|---|---|
| Upload and it works | **Yes** | No — must be built first |
| Needs Node.js | No | Yes, to build |
| Works on cPanel / Hostinger / GoDaddy | **Yes** | Only after `npm run build` |
| Pages | 12 real `.html` files | One page, routed in JavaScript |

**If you are putting this on ordinary web hosting, upload `website/`.**
Its `README.txt` walks through it step by step.

---

## `website/` — the one to upload

Plain HTML, CSS and one small JavaScript file. No build step, no framework, no
dependencies. Every page is a finished file that a browser can display on its own.

```
website/
  index.html         Home — slider, notices, activities, events, gallery, news
  about.html         History, objectives, milestones, values
  committee.html     Executive committee and office bearers
  members.html       Register of members, searchable
  events.html        Programmes, filterable by upcoming and past
  news.html          Reports, announcements and press notes
  notices.html       Official notice board, searchable
  gallery.html       Photographs with filters and a lightbox
  downloads.html     Constitution, forms, accounts, annual reports
  membership.html    How to join, what it costs, what members receive
  contact.html       Address, telephone, e-mail and an enquiry form
  404.html           Shown when an address does not exist
  .htaccess          404 page, compression and caching for Apache hosts
  assets/css, js, img
```

To preview it on your own machine, open `website/index.html` in a browser, or:

```bash
cd website && python3 -m http.server 8000
```

### Why the React version showed a blank page

`react-app/index.html` contains no content of its own — only a `<script>` tag
pointing at `src/main.jsx`. JSX is not something a browser understands. During
development Vite compiles it on the fly; on a normal web host there is nothing
to do that, so the browser loads a page with an empty `<div id="root">` and
renders white.

That is not a bug in the code. It is what an unbuilt React application does on
a static host. `website/` avoids the problem entirely by not needing a build.

---

## `react-app/` — the React version

Use this if you are deploying somewhere that runs a build (Netlify, Vercel,
Cloudflare Pages, or your own server).

```bash
cd react-app
npm install
npm run dev      # http://localhost:5173, proxying the API to the gateway
npm run build    # writes dist/ — upload the CONTENTS of dist/, never src/
```

Deep links such as `/about` need the host to serve `index.html` for unknown
paths (Netlify: `/* /index.html 200`). Without that rule those addresses give a
404. `website/` has no such requirement because every page is a real file.

---

## The staff panels

Both versions link to the panels in the header and the footer:

```
/adminpanel/login/
/superadminpanel/login/
```

These are served by Django, in `backend/`. They work when the backend runs on
the same domain as the site. On a plain host with no backend, those two links
show a 404 — expected, not a fault in the website.

If the backend lives on a **different** domain, edit `website/assets/js/site.js`
(or build the React app with `VITE_BACKEND_URL=https://admin.example.org`) so
the links point there.

## Accessibility

Three appearance modes (light, dark, high contrast) and three text sizes, chosen
from the top strip and remembered per browser. Skip links, visible focus rings,
labelled fields with errors tied to their inputs, a keyboard-operable gallery
and lightbox, a slider that respects `prefers-reduced-motion`, and a print
stylesheet that drops the navigation.
