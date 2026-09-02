#!/usr/bin/env bash
# Exercises the API against a running instance.
#   ./run_tests.sh [base-url]      default: http://127.0.0.1:5081
set -u
BASE="${1:-http://127.0.0.1:5081}"
pass=0; fail=0

check() {
  if [ "$2" = "$3" ]; then echo "  ok    $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected $2, got $3)"; fail=$((fail+1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' --noproxy '*' "$@"; }
body() { curl -s --noproxy '*' "$@"; }

echo "ClubApi tests against $BASE"
check "health answers"            "200" "$(code $BASE/api/health)"
check "site identity"             "200" "$(code $BASE/api/site)"
check "upcoming events"           "200" "$(code "$BASE/api/events?scope=upcoming")"
check "past events"               "200" "$(code "$BASE/api/events?scope=past")"
check "notices"                   "200" "$(code $BASE/api/notices)"
check "articles"                  "200" "$(code $BASE/api/articles)"
check "activities"                "200" "$(code $BASE/api/activities)"
check "gallery"                   "200" "$(code $BASE/api/gallery)"
check "team"                      "200" "$(code $BASE/api/team)"
check "statistics"                "200" "$(code $BASE/api/statistics)"

check "team members carry a position" "yes" \
  "$(body $BASE/api/team | grep -q '"position"' && echo yes || echo no)"
check "statistics carry a numeric value" "yes" \
  "$(body $BASE/api/statistics | grep -qE '"value":[0-9]+' && echo yes || echo no)"
# An image field only appears once someone has uploaded a picture, so what is
# always true is the shape of the URL when it is there: it must point into the
# media directory the gateway serves, and never at an absolute foreign host.
check "gallery image URLs point at /media/" "yes" \
  "$(body $BASE/api/gallery | grep -oE '"image":"[^"]*"' | grep -qv '"image":"/media/' && echo no || echo yes)"
check "event image URLs point at /media/" "yes" \
  "$(body "$BASE/api/events?scope=all" | grep -oE '"image":"[^"]*"' | grep -qv '"image":"/media/' && echo no || echo yes)"

check "site returns a name" "yes" \
  "$(body $BASE/api/site | grep -q '"name"' && echo yes || echo no)"
check "an oversized limit is clamped" "yes" \
  "$(test "$(body "$BASE/api/events?scope=all&limit=9999" | grep -o '"id"' | wc -l)" -le 100 && echo yes || echo no)"
check "upcoming events are in the future" "yes" \
  "$(body "$BASE/api/events?scope=upcoming&limit=1" | grep -q '"isUpcoming":true' && echo yes || echo no)"

check "a valid enquiry is accepted" "201" \
  "$(code -X POST $BASE/api/enquiries -H 'Content-Type: application/json' \
     -d '{"name":"Test Person","email":"test@example.com","subject":"Test","message":"Hello."}')"
check "an empty enquiry is refused"  "400" \
  "$(code -X POST $BASE/api/enquiries -H 'Content-Type: application/json' \
     -d '{"name":"","email":"","subject":"","message":""}')"
check "a bad address is refused"     "400" \
  "$(code -X POST $BASE/api/enquiries -H 'Content-Type: application/json' \
     -d '{"name":"A","email":"not-an-address","subject":"S","message":"M"}')"
check "the refusal says what is wrong" "yes" \
  "$(body -X POST $BASE/api/enquiries -H 'Content-Type: application/json' \
     -d '{"name":"","email":"x@y.z","subject":"S","message":"M"}' | grep -q 'name is required' && echo yes || echo no)"
check "a quote in the message is stored safely" "201" \
  "$(code -X POST $BASE/api/enquiries -H 'Content-Type: application/json' \
     -d '{"name":"O'\''Brien","email":"o@example.com","subject":"Quote '\'' test","message":"1'\'' OR 1=1 --"}')"

echo
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
