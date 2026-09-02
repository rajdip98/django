# ClubApi — the C# half of the backend

A small ASP.NET Core service that serves the website's public content as JSON and
accepts contact enquiries. It reads the same MySQL database Django writes to.

## Why two backends

| Job | Runs on | Why there |
| --- | --- | --- |
| Database schema, migrations | Python / Django | one owner of the schema, and migrations are Django's strength |
| Admin panel, platform panel, membership, audit log | Python / Django | forms, sessions, permissions and the admin are what Django is for |
| Public content as JSON, enquiries | C# / ASP.NET Core | a compiled, statically-typed service handling the traffic the public generates; easy to cache and to scale on its own |
| Pages, styling, interaction | HTML / CSS / JavaScript | plain files, hostable anywhere |

The C# service never changes the schema and never writes to a staff table. It reads,
and it inserts one row into the enquiries table. Django remains the single owner of
everything else, so there is no migration race between the two.

## Endpoints

| Method and path | Returns |
| --- | --- |
| `GET /api/health` | `ok` plus whether the database answers (503 if it does not) |
| `GET /api/site` | organisation name, slogan, address, telephone, office hours |
| `GET /api/events?scope=upcoming\|past\|all&limit=` | programmes; upcoming reads soonest-first, the rest newest-first |
| `GET /api/notices?limit=` | notice-board items |
| `GET /api/articles?limit=` | published news |
| `GET /api/activities` | the standing programme of work |
| `GET /api/gallery?limit=` | gallery entries |
| `POST /api/enquiries` | stores a contact enquiry; it appears in the Django panel |

Responses are camelCase JSON and cached for 60 seconds. Which website answers is
decided by the request's host name, matching `saas_tenant.domain` — the same rule
Django uses — so one service serves every website on the installation.

## Run it

```bash
export DATABASE_URL="mysql://clubuser:password@127.0.0.1:3306/clubsite"
export CLUB_ALLOWED_ORIGINS="https://club.example.org"
export ASPNETCORE_URLS="http://0.0.0.0:5081"
dotnet run                     # development
dotnet publish -c Release      # then run bin/Release/net8.0/ClubApi
```

`DATABASE_URL` is the same variable Django reads, so both services are configured
once. `CLUB_DB_CONNECTION` takes a native connection string instead, if you prefer.

**Only put your own site's origin in `CLUB_ALLOWED_ORIGINS`.** It defaults to
localhost, which means a deployed frontend on another domain will be refused by the
browser until you set it — that is the intended behaviour, not a bug.

## Notes for whoever maintains this

- Every statement is parameterised; nothing a visitor submits reaches SQL as text.
- Ids are `long`. Django's `BigAutoField` makes every primary key a MySQL `bigint`,
  and reading one into an `int` fails at run time — that mistake cost an afternoon.
- Enquiries are validated before the insert, and the error says which field is wrong.
- The service has no session and no cookie. It never sees a password.

## Tests

```bash
./run_tests.sh      # exercises every endpoint against a running service
```
