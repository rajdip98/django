# Product Requirements Document

**Product:** Club & Organisation Website with Tiered Administration
**Version:** 1.0
**Status:** Delivered
**Last updated:** 23 August 2026

---

## 1. Purpose

A registered community club needs a public website it can keep current without a
developer, and a way for its office to manage that content safely. Committee
members are volunteers, not technical staff; the office runs on shared hosting.
The product must therefore be usable by someone whose entire toolkit is a web
browser and a hosting control panel.

## 2. Problem statement

Community organisations of this kind typically have one of three things:

1. No website at all — notices reach only the physical board at the premises.
2. A website nobody can edit, because the person who built it has moved on.
3. A website that broke on upload and was abandoned.

Each failure has the same root: the site was built for someone who understands
deployment, and handed to someone who does not.

## 3. Users

| User | What they need | Technical skill assumed |
|---|---|---|
| **Public visitor** | Find events, notices, office address, how to join | None |
| **Member** | Registrations, certificates, documents | None |
| **Admin** (office staff) | Edit content: banners, images, header, footer, name, logo, files | None beyond a web form |
| **Super Admin** (secretary) | Everything an Admin does, plus create and remove administrators, view the audit log | None |
| **Platform owner** | Administer several club websites from one place | Some |

Admin and Super Admin are deliberately separate roles with separate sign-ins.
A person who administers website content must not be able to reach platform
administration without a further, specific credential.

## 4. Goals

**G1 — It must survive being uploaded.**
The website must display correctly when its files are copied to ordinary shared
hosting. No build step, no Node.js, no command line. This is the primary goal;
every earlier failure of this project traces to it.

**G2 — The office can change the content.**
Name, logo, header, footer, banners, images, documents, events, notices and
members are all editable from a browser by a non-technical administrator.

**G3 — Two tiers of administration, genuinely separated.**
An ordinary Admin can manage the website. Only a Super Admin can create or
remove administrators. Crossing that line requires a separate passphrase and the
elevation expires by itself.

**G4 — Nothing on the site is a dead end.**
Every link, button and form goes somewhere. A form that cannot reach the server
must say so and offer a way through, not fail in silence.

**G5 — It should read like an official body's website.**
Restrained institutional design, legible at a distance, usable on a slow phone
connection, and accessible to a reader with low vision.

## 5. Scope

### 5.1 Public website — twelve pages

| Page | Contains |
|---|---|
| Home | Image slider, scrolling notice ticker, statistics, about extract, President's message, activities, upcoming events, gallery extract, latest news, office details |
| About Us | History, objectives, milestones table, values, registration details |
| Committee | Executive committee and office bearers, grouped, with tenure and role |
| Members | Register of members, searchable |
| Events | Programmes, filterable by upcoming and past, with registration status |
| News | Reports, announcements and press notes |
| Notice Board | Official notices, searchable, with category |
| Gallery | Photographs, filterable by category, with a lightbox |
| Downloads | Constitution, forms, audited accounts, annual reports |
| Membership | How to join, the four steps, subscription rates, member benefits |
| Contact | Office address, telephone, e-mail, hours, enquiry form |
| Not found | Shown for an address that does not exist |

Plus an **installation check** page that reports what a host is and is not
serving.

### 5.2 Administration

- **Admin panel** at `/adminpanel/login/` — website content, files, banners, QR codes.
- **Super Admin panel** at `/superadminpanel/login/` — administers websites and administrators.
- Both must be reachable by typing the address into a browser.
- Every administrator changes the shared default password at first sign-in, before seeing anything.
- Every content change and every sign-in attempt is written to an audit log.

### 5.3 Out of scope

Online payment, an SMS gateway, a mobile application, and multi-language
translation of content. The interface is English; content is whatever the office
types.

## 6. Requirements

### 6.1 Must have

| # | Requirement | Verified by |
|---|---|---|
| R1 | Every page displays when the files are copied to a static host | Served from Apache and a plain file server; 13/13 pages render |
| R2 | No page can render blank, even if the stylesheet is missing | Tested with `assets/` deleted — page remains readable |
| R3 | An unrecognised server directive must not take the site down | Every `.htaccess` directive guarded by `<IfModule>` |
| R4 | Admin and Super Admin are separate sign-ins | 100 automated tests, including role separation |
| R5 | The default password must be changed at first sign-in | Enforced by middleware; tested |
| R6 | Reaching Super Admin functions needs a separate passphrase | Elevation expires after 30 minutes; tested |
| R7 | Content added in a panel appears on the public site | Tested end to end in a browser |
| R8 | Content can be removed as well as added | Delete flows for every content type, self-deletion blocked |
| R9 | The contact form must never fail silently | Falls back to a pre-filled e-mail link |
| R10 | Site legible on a 390 px phone screen | Tested at 390×844 |

### 6.2 Should have

Three appearance modes (light, dark, high contrast); three text sizes; a
scrolling notice ticker; searchable member and notice tables; a photo gallery
with filters; an analytics dashboard for administrators.

### 6.3 Accessibility

Skip links; visible focus outlines; form labels tied to their fields; errors
announced next to the field they concern; a keyboard-operable gallery; the
slider pauses for `prefers-reduced-motion`; contrast meeting WCAG AA in all
three appearance modes.

## 7. Success criteria

1. A committee member with a hosting control panel and no other help gets the
   site online. **Met** — twelve HTML files, no build, with step-by-step upload
   instructions and a self-diagnosing check page.
2. An office volunteer changes the club's name, logo and a banner without
   assistance. **Met** — panel forms for each.
3. No page is ever blank. **Met** — content is in the HTML itself, so nothing
   needs to run for the page to be readable.
4. Administration is safe to hand to several people. **Met** — separate roles,
   forced password change, timed elevation, lockout after five failures, audit log.

## 8. Known constraints

- The two admin panels need the backend running on the same domain. On plain
  hosting with no backend, those two links show a 404. This is expected and is
  stated on the page and in the instructions.
- The photographs shipped are placeholders and are meant to be replaced.
- The three default passwords are visible in the source, so they must be
  overridden before the site carries real data. The panels force each
  administrator to change theirs, but the defaults themselves must be set by
  whoever deploys it.
