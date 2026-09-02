#!/usr/bin/env bash
# Every test for the panel system. Run from the project root: bash _test/run-all.sh
#
# Needs jsdom:  npm install --no-save jsdom
set -u
pass=0; fail=0

for t in panel-boot theme-apply round-trip check-page hidden-panels; do
  printf '\n\033[1m### %s\033[0m\n' "$t"
  # The exit status must come from node, not from the filter. Piping into grep
  # made a crashed suite look green, because grep itself succeeded.
  if timeout 600 node "_test/$t.test.js" > "/tmp/$t.out" 2>&1; then
    grep -Ev "Not implemented|^ *at |^[A-Za-z]*Error:" "/tmp/$t.out"
    pass=$((pass+1))
  else
    grep -Ev "Not implemented|^ *at " "/tmp/$t.out" | tail -20
    printf '\033[31m  suite failed\033[0m\n'
    fail=$((fail+1))
  fi
done

printf '\n=========================\n%d suite(s) passed, %d failed\n' "$pass" "$fail"
exit $((fail > 0))
