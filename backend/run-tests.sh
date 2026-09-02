#!/usr/bin/env bash
#
# Run every test in the backend. The C# and dashboard checks need the services
# running (backend/start-all.sh); the Django and Java suites do not.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
failed=0

echo "=== Django (schema, panels, authorisation) ==="
# Django builds a throwaway "test_<name>" database, which needs a grant of its
# own. If this fails with "Access denied … to database test_…", run:
#   GRANT ALL ON `test_club`.* TO 'clubapp'@'127.0.0.1';
( cd "$here/python-api" && python3 manage.py test ) || failed=1

echo
echo "=== Java gateway (routing, guard, rate limit, CORS) ==="
( cd "$here/java-gateway" && mvn -q -B test ) || failed=1

echo
echo "=== C++ secret vault ==="
( cd "$here/cpp-secretvault" && make --silent && ./run_tests.sh ) || failed=1

echo
echo "=== C# API (needs the service running) ==="
if curl -fsS -o /dev/null http://127.0.0.1:5081/api/health 2>/dev/null; then
  ( cd "$here/csharp-api" && ./run_tests.sh ) || failed=1
else
  echo "  skipped — start the API first (backend/start-all.sh)"
fi

echo
[ "$failed" -eq 0 ] && echo "All suites passed." || echo "Something failed — see the output above."
exit "$failed"
