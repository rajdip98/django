#!/usr/bin/env bash
#
# Start the whole backend in the right order. Every service binds to localhost
# except the gateway, which is the only one that should be reachable from
# outside. Stop everything again with stop-all.sh.
#
# Before the first run:
#   1. Create the database and its two accounts (see backend/README.md).
#   2. Export DATABASE_URL and REPORTS_DATABASE_URL.
#   3. Override the three shipped default passwords — they are public knowledge.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
logs="$here/logs"
mkdir -p "$logs"

: "${DATABASE_URL:?Set DATABASE_URL, e.g. mysql://clubapp:password@127.0.0.1:3306/club}"
: "${REPORTS_DATABASE_URL:=$DATABASE_URL}"

# These must agree with the gateway's own defaults; it is told the same values
# below so the two can never drift apart.
PYTHON_PORT="${PYTHON_PORT:-8000}"
CSHARP_PORT="${CSHARP_PORT:-5081}"
DASH_PORT="${DASH_PORT:-8050}"
GATEWAY_PORT="${GATEWAY_PORT:-8080}"

export PYTHON_API="http://127.0.0.1:$PYTHON_PORT"
export CSHARP_API="http://127.0.0.1:$CSHARP_PORT"
export DASH_ANALYTICS="http://127.0.0.1:$DASH_PORT"
export GATEWAY_PORT

if [ "$REPORTS_DATABASE_URL" = "$DATABASE_URL" ]; then
  echo "warning: the dashboard is using the read-write account." >&2
  echo "         Give it a SELECT-only account via REPORTS_DATABASE_URL." >&2
fi

# curl must not send a localhost request to an outbound proxy.
probe() { curl -fsS --noproxy '*' -o /dev/null "$1" 2>/dev/null; }

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 90); do
    if probe "$url"; then echo "  $name is up"; return 0; fi
    if [ -f "$logs/$name.pid" ] && ! kill -0 "$(cat "$logs/$name.pid")" 2>/dev/null; then
      echo "  $name exited — see $logs/$name.log" >&2
      tail -5 "$logs/$name.log" >&2
      return 1
    fi
    sleep 1
  done
  echo "  $name did not answer in time — see $logs/$name.log" >&2
  return 1
}

launch() {
  local name="$1"; shift
  echo "starting $name…"
  ( cd "$here/$name" && "$@" > "$logs/$name.log" 2>&1 & echo $! > "$logs/$name.pid" )
}

# 1. Django: owns the schema, both panels and every account.
launch python-api python3 manage.py runserver "127.0.0.1:$PYTHON_PORT" --noreload
wait_for "$PYTHON_API/" python-api

# 2. The C# read API. Kestrel needs to be told where to listen, or it takes
#    its own default port and the gateway proxies into thin air.
( cd "$here/csharp-api" && ASPNETCORE_URLS="http://127.0.0.1:$CSHARP_PORT" \
    dotnet run --configuration Release > "$logs/csharp-api.log" 2>&1 &
  echo $! > "$logs/csharp-api.pid" )
wait_for "$CSHARP_API/api/health" csharp-api

# 3. The analytics dashboard, on the read-only account.
( cd "$here/dash-analytics" && DATABASE_URL="$REPORTS_DATABASE_URL" DASH_PORT="$DASH_PORT" \
    python3 app.py > "$logs/dash-analytics.log" 2>&1 &
  echo $! > "$logs/dash-analytics.pid" )
wait_for "$DASH_ANALYTICS/analytics/" dash-analytics

# 4. The gateway — the only process that should be reachable from outside.
if [ ! -f "$here/java-gateway/target/gateway-1.0.0.jar" ]; then
  echo "building the gateway…"
  ( cd "$here/java-gateway" && mvn -q -B package )
fi
launch java-gateway java -jar target/gateway-1.0.0.jar
wait_for "http://127.0.0.1:$GATEWAY_PORT/gateway/health" java-gateway

cat <<INFO

The website is on http://127.0.0.1:$GATEWAY_PORT/
  Admin panel        http://127.0.0.1:$GATEWAY_PORT/adminpanel/login/
  Super Admin panel  http://127.0.0.1:$GATEWAY_PORT/superadminpanel/login/
  Analytics          http://127.0.0.1:$GATEWAY_PORT/analytics/   (staff sign-in required)

Logs are in backend/logs/. Stop everything with ./stop-all.sh
INFO
