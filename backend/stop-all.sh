#!/usr/bin/env bash
# Stop whatever start-all.sh started.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for pidfile in "$here"/logs/*.pid; do
  [ -e "$pidfile" ] || continue
  name="$(basename "$pidfile" .pid)"
  pid="$(cat "$pidfile")"
  if kill "$pid" 2>/dev/null; then
    echo "stopped $name ($pid)"
    # dotnet run leaves the built binary as a child; clear the whole group.
    pkill -P "$pid" 2>/dev/null || true
  else
    echo "$name was not running"
  fi
  rm -f "$pidfile"
done
