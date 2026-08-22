# Security and privacy notes

Census returns are confidential under the **Census Act, 1948**. This document is
an honest account of what this application protects, and what it does not —
please read it before collecting real data.

## Administrator password

The default administrator password is `rajdip100@`, as specified for this build.

**Change it before the app is used for anything real.** Set either variable:

```bash
ADMIN_PASSWORD="your-own-password"

# or, better, store only the hash:
ADMIN_PASSWORD_HASH="$(cd backend && python3 -c \
  "from app.security import hash_password; print(hash_password('your-own-password'))")"
```

### How it is handled

* **With a backend** — the password is sent once over HTTPS and checked against
  a PBKDF2-HMAC-SHA256 hash (240,000 iterations, random salt) held server-side.
  The plaintext is never stored, and never ships in the browser bundle.
* **Without a backend** (device-only mode) — there is no server to ask, so the
  app compares a salted SHA-256 digest baked into the bundle. This is a
  **convenience lock, not a security boundary**: anyone with the files can read
  the digest and attack it offline. It is acceptable only because in that mode
  all data is already on that one device — there is nothing remote to protect.

If the admin panel must be a real access control, run the backend.

## Authentication

* Six-digit OTP, cryptographically random, valid for 5 minutes, single use.
* OTPs are stored hashed (SHA-256, salted with the request id), so a database
  dump cannot be replayed.
* Five wrong attempts invalidate the challenge; eight requests per mobile per
  hour are allowed by default.
* Sessions are JWTs signed with HS256, valid for 14 days by default.
* **The role stored on the account always wins.** A citizen who asks to log in
  as a supervisor is still a citizen — the requested role only ever applies when
  creating a brand-new account.
* Set `ALLOW_SELF_REGISTRATION=false` once your team is registered, and unknown
  numbers are refused entirely.

When SMS is not configured the API returns the OTP in its response so the flow
can be tested. **This is a complete bypass of the second factor.** The API stops
doing it automatically as soon as Twilio credentials are present — never run a
public deployment without them.

## Authorisation

| Role | Can see | Can change |
| --- | --- | --- |
| Citizen | Their own household | Their own household |
| Enumerator | Households they collected | Households they collected |
| Supervisor | Households in their zones (all, if no zone is assigned) | Review decisions |
| Admin | Everything | Everything, plus users, zones and the audit log |

Enforced server-side on every request, not in the UI. The test suite covers the
cases that matter: an enumerator cannot read or overwrite another's household,
cannot review, and a supervisor cannot reach the audit log.

## Data at rest

* **On the device** — IndexedDB, unencrypted, in the browser's storage for that
  origin. It is protected by the device's own lock screen and nothing more. Issue
  enumerator devices with full-disk encryption and a screen lock, and use
  **Profile → Erase data on this device** when a device is reassigned.
* **On the server** — MongoDB or a JSON file, unencrypted by the application.
  Use encrypted volumes, and restrict database network access.

## Data in transit

HTTPS is assumed and required in practice:

* GPS geo-tagging only works in a secure context (HTTPS or localhost) — browsers
  refuse geolocation otherwise, and the app says so plainly.
* Voice input needs a secure context for microphone access.
* Service workers, and therefore offline mode, need HTTPS.

Use a real certificate. Let's Encrypt is free.

## The AI provider is opt-in, and off by default

All data validation in this app is a **rule engine that runs on the device** and
sends nothing anywhere. Voice input uses the browser's built-in speech
recognition. Neither needs an API key or an external service.

If you set `AI_BASE_URL` and `AI_API_KEY`, the "Run AI check" button sends
household data to that third party. Before enabling it on real census data,
consider whether that is lawful for you under the Census Act. The code reduces
the exposure but cannot eliminate it — before sending, it strips:

* all photographs,
* every member's **name** and **mobile number**,
* the house number, building name and street,
* the GPS coordinates,
* enumerator notes and the review trail.

What remains is the demographic and housing structure needed for a consistency
check. Even so, this is a deliberate, documented trade-off, and the app is fully
functional with AI switched off.

## Photographs

Optional, down-scaled to a 1024 px long edge and re-encoded as JPEG (~60–120 KB)
before storage. They sync in the household payload and are never sent to the AI
provider. Photos of a house front are the intent; the app does not ask for
photographs of people.

## What this build does not implement

Be clear-eyed about the gap between this and a national government system:

* **No Aadhaar integration.** Deliberate — it requires government-level
  authorisation. Identity here is a mobile number only.
* **No end-to-end encryption** of household records.
* **No field-level access logging** — the audit log records actions
  (who approved what, who exported data), not every individual record read.
* **No penetration test, and no third-party security audit.**
* **Translations have not been reviewed by professional translators.** They are
  good enough to use and to correct, not certified.
* **No formal data-retention or deletion policy.** Add one that matches your
  jurisdiction's rules before collecting at scale.

## Reporting a problem

If you find a security issue in this code, do not open a public issue — contact
the repository owner directly.
