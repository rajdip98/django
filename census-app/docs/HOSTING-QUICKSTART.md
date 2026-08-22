# India Census 2026-27 — hosting quick start

This folder is the complete, built web app. It is plain static files: HTML,
JavaScript, CSS and icons. There is nothing to compile and no server-side
language required.

## Option 1 — Your own domain (cPanel, Plesk, any shared hosting)

1. Open your hosting control panel and go to **File Manager**.
2. Enter `public_html` (or the folder for the domain you want to use).
3. Upload **the contents of this folder** — `index.html`, the `assets` folder,
   the `icons` folder, `manifest.webmanifest`, `sw.js` and `.htaccess`.
   Upload the files themselves, not the folder that contains them.
4. Visit your domain. The app loads.

A subfolder works too: upload to `public_html/census/` and open
`https://yourdomain.com/census/`. All asset paths are relative and the app uses
hash-based URLs (`#/households`), so no rewrite rules or server configuration
are needed anywhere.

## Option 2 — Free static hosting

| Host | How |
| --- | --- |
| **Netlify** | Drag this folder onto <https://app.netlify.com/drop> |
| **Vercel** | `npx vercel deploy --prod` from inside this folder |
| **GitHub Pages** | Commit these files to a `gh-pages` branch |
| **Cloudflare Pages** | Create a project and upload this folder as the build output |

## Option 3 — No hosting at all

Open `index.html` directly from your computer or copy this folder to a phone.
Everything except the service worker works from `file://`.

## What works without a server

Everything a single device needs: OTP-free device login, the full census
questionnaire, offline storage, GPS geo-tagging, photos, voice input,
data validation, maps, charts and CSV/JSON export. Data stays on that device.

## What needs the census server

Multi-device sync, supervisor review across a team, server-side user and zone
management, the audit log, and real SMS OTPs.

To connect this app to a server, open it, go to **Profile → Census server
address**, enter the server URL (for example `https://api.yourdomain.com`) and
tap **Test connection**. See `DEPLOYMENT.md` in the full download for how to run
that server.

## Installing it as an app

On Android/Chrome: open the site, then **⋮ → Add to Home screen**.
On iPhone/Safari: **Share → Add to Home Screen**.
It then launches full screen and runs offline.

## Important

Change the administrator password before real use. In this static-only mode the
admin password is checked on the device, which is a convenience lock rather than
a security boundary — see `SECURITY.md`.
