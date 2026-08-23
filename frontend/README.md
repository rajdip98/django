# Frontend

A React single-page application for a government / political club website,
built with Vite.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173, proxying the API to the gateway
npm run build     # produces dist/
npm run preview   # serves the built dist/
```

The dev server proxies `/api`, `/media`, `/static`, `/adminpanel`,
`/superadminpanel` and `/analytics` to the gateway on `http://127.0.0.1:8080`,
so what you see locally behaves the way it will on a server. Point it elsewhere
with `GATEWAY_URL`.

## What is here

```
index.html            the page shell, SEO tags, and the pre-paint theme script
src/
  main.jsx            entry point
  App.jsx             routes and the site-wide data
  api.js              every network call, with seed content as a fallback
  config.js           where the two staff panels live
  data/fallback.js    the content shown before an administrator has entered any
  styles/gov.css      the design system: colours, type, layout, three themes
  components/         header, footer, page shell, formatting helpers
  pages/              one file per page
```

## Pages

Home, About, Events, Event detail, Activities, Gallery, Team, News & Notices,
Membership, Resources, Contact, Search, and a not-found page. Every link goes
somewhere — there are no dead buttons.

## Where the content comes from

Pages read from the C# API through the gateway. If the backend is not running,
or a collection is still empty, the page falls back to the seed content in
`src/data/fallback.js` and says so in a small notice. A fresh checkout is
therefore never a blank page, and a backend hiccup never becomes one either.

The club's name, address, telephone and office hours come from the database, so
an administrator changing them in the panel changes them across the site without
a rebuild.

## The staff panels

The Admin and Super Admin panels are Django pages, not React ones — they hold
the sessions and the audit log, and they belong on the server side. The website
links to them from the top strip and the footer:

```
https://your-domain/adminpanel/login/
https://your-domain/superadminpanel/login/
```

On a normal deployment the site and the panels share a domain and those relative
links are correct as they stand.

If you host this React build somewhere separate from the backend — a static host,
a CDN — set the backend's address at build time so the links still point at it:

```bash
VITE_BACKEND_URL=https://admin.your-domain npm run build
```

A static host cannot run Django. Without that variable the panel links on a
separately-hosted site will 404, because there is nothing there to answer them.

## Accessibility and appearance

Three appearance modes (light, dark, high contrast) and three text sizes, chosen
from the top strip and remembered per browser. Skip links, visible focus rings,
labelled form fields with error messages tied to their inputs, keyboard-operable
gallery and lightbox, and a print stylesheet that drops the navigation.
