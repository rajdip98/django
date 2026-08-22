# API reference

Base URL: the origin serving the API. Every path below is prefixed with `/api`.
Interactive docs are at `/docs` (OpenAPI) when the server is running.

Authentication is a bearer token: `Authorization: Bearer <token>`. File
downloads may instead pass `?token=<token>`, because a browser-initiated
download cannot set headers.

---

## Meta

### `GET /api/health`

Public. Used by the app to decide between connected and device-only mode.

```json
{
  "status": "ok",
  "version": "1.0.0",
  "database": "mongodb",
  "smsEnabled": true,
  "aiEnabled": false,
  "serverTime": "2026-08-22T09:15:00Z"
}
```

---

## Authentication

### `POST /api/auth/otp/request`

```json
{ "mobile": "9876543210", "role": "enumerator" }
```

Returns `requestId` and `expiresInSeconds`. When SMS is **not** configured the
response also carries `devOtp` so the flow remains usable in development; this
field disappears as soon as Twilio credentials are set.

`role` is only honoured when creating a new account — an existing account keeps
its stored role. `role: "admin"` is rejected (400).

Rate limited to `OTP_RATE_LIMIT_PER_HOUR` per mobile (429 when exceeded).

### `POST /api/auth/otp/verify`

```json
{
  "requestId": "…",
  "mobile": "9876543210",
  "otp": "483920",
  "role": "enumerator",
  "name": "Ravi Kumar"
}
```

→ `{ "token": "…", "user": { … } }`

`410` if the challenge expired or was already used, `401` for a wrong code,
`429` after `OTP_MAX_ATTEMPTS` failures.

### `POST /api/auth/admin/login`

```json
{ "password": "…" }
```

→ `{ "token": "…", "user": { "role": "admin", … } }`, or `401`.

### `GET /api/auth/me`

The signed-in user.

---

## Households

### `GET /api/households`

Query: `status`, `zone_id`, `enumerator_id`, `limit` (default 500).
Scoped to what the caller may see — enumerators get their own records,
supervisors get their zones, administrators get everything.

→ `{ "households": [ … ] }`

### `GET /api/households/{id}`

`404` if it does not exist **or** the caller may not see it.

### `DELETE /api/households/{id}`

Drafts only, unless the caller is an administrator.

### `POST /api/households/{id}/review`

Supervisors and administrators.

```json
{ "action": "approved" | "flagged" | "reopened" | "comment", "text": "…" }
```

`text` is required for everything except `approved`. Sets the household status
(`approved`, `flagged`, or back to `submitted` for `reopened`), appends to the
review trail, bumps `rev`, and writes an audit entry.

### `GET /api/households/acknowledgement/{code}`

**Public.** Lets a citizen confirm their household was counted. Returns only the
acknowledgement id, household number, status, submission time and member count —
never personal details.

---

## Sync

The offline protocol. Every household carries an integer `rev` that the server
owns.

### `POST /api/sync/push`

```json
{ "households": [ { "id": "…", "rev": 3, … } ] }
```

Up to 200 households per request. Response:

```json
{ "results": [ { "id": "…", "rev": 4, "status": "accepted" } ] }
```

| `status` | Meaning | What the client does |
| --- | --- | --- |
| `accepted` | Stored; `rev` is the new revision | Mark synced, drop from the outbox |
| `conflict` | A newer server copy exists (returned in `household`) | Replace the local copy |
| `rejected` | Not permitted, with `message` | Keep locally, surface the error |

**Conflict rules.** If the pushed `rev` matches the server's, the write is
accepted and `rev` increments. If they diverge, the newer `updatedAt` wins — but
a merge preserves the review trail, keeps an `approved`/`flagged` status set by
a supervisor, and never drops an acknowledgement number that has been issued.
That way an enumerator's offline edit cannot silently undo a supervisor's
decision.

### `GET /api/sync/pull?since=<iso8601>`

```json
{
  "households": [ … ],
  "zones": [ … ],
  "users": [ … ],
  "serverTime": "2026-08-22T09:15:00Z"
}
```

`users` is populated only for supervisors and administrators. Store `serverTime`
and pass it as the next `since`.

---

## Zones

* `GET /api/zones` — any signed-in user
* `POST /api/zones` — admin. Zone codes are unique and upper-cased.
* `PATCH /api/zones/{id}` — admin
* `DELETE /api/zones/{id}` — admin; `409` if households reference the zone

## Users

* `GET /api/users` — supervisor or admin
* `POST /api/users` — admin; `409` on a duplicate mobile number
* `PATCH /api/users/{id}` — admin
* `DELETE /api/users/{id}` — admin. If the user has collected households they
  are **deactivated** rather than deleted, so their data keeps a traceable owner.

## Analytics

### `GET /api/analytics/summary?zone_id=…`

Supervisor or admin. Household and member counts, status breakdown, coverage
against target, average household size, sex/age/literacy/category/religion
distributions, per-zone and per-enumerator progress, and 14 days of daily counts.
Supervisors see only their zones.

## Export

### `GET /api/export?format=csv|json&scope=households|members`

Supervisor or admin. CSV is UTF-8 with a BOM so Excel renders Indic scripts
correctly. Accepts `?token=` for direct browser downloads.

## Audit

### `GET /api/audit?limit=200`

Admin only. Newest first. Records logins, failed admin logins, sync pushes,
review decisions, user and zone changes, and exports.

---

## AI (optional)

Both return `503` with an explanatory message when no provider is configured.

* `POST /api/ai/validate` — `{ "household": { … } }` → `{ "issues": [ … ] }`
* `POST /api/ai/translate` — `{ "text": "…", "targetLanguage": "hi" }`

Photographs, names, mobile numbers, street address and GPS are stripped before
anything is sent. See [SECURITY.md](SECURITY.md).

---

## Errors

Standard HTTP status codes with a FastAPI body:

```json
{ "detail": "Enter a valid 10-digit Indian mobile number" }
```

`422` carries Pydantic's structured validation detail.
