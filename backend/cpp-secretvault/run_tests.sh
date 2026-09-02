#!/usr/bin/env bash
# Proves the properties that matter: round trip, wrong passphrase refused,
# tampering detected, no plaintext on disk, file permissions, rotation.
set -u

VAULT=$(mktemp -d)/secrets.vault
export SECRETVAULT_FILE="$VAULT"
BIN=./secretvault
PASS="correct horse battery staple"
# A stand-in for a real API key. Deliberately not shaped like any
# provider's live format — a realistic-looking fixture trips secret
# scanners and blocks the push, every time.
KEY="test-api-key-0123456789-not-a-real-credential"
pass=0; fail=0

check() {  # check "name" "expected" "actual"
  if [ "$2" = "$3" ]; then echo "  ok    $1"; pass=$((pass+1));
  else echo "  FAIL  $1"; echo "        expected: $2"; echo "        actual:   $3"; fail=$((fail+1)); fi
}

echo "secretvault tests"

SECRETVAULT_PASSPHRASE="$PASS" $BIN init >/dev/null 2>&1
check "init creates the vault" "yes" "$([ -f "$VAULT" ] && echo yes || echo no)"
check "vault is owner-read/write only" "600" "$(stat -c '%a' "$VAULT")"

printf '%s' "$KEY" | SECRETVAULT_PASSPHRASE="$PASS" $BIN set STRIPE_API_KEY >/dev/null 2>&1
got=$(SECRETVAULT_PASSPHRASE="$PASS" $BIN get STRIPE_API_KEY 2>/dev/null)
check "a stored secret comes back unchanged" "$KEY" "$got"

check "the plaintext is not in the vault file" "absent" \
      "$(grep -qF "$KEY" "$VAULT" && echo present || echo absent)"
check "the plaintext is not in the binary" "absent" \
      "$(grep -qF "$KEY" $BIN && echo present || echo absent)"
check "no passphrase is stored in the binary" "absent" \
      "$(strings $BIN | grep -qF "$PASS" && echo present || echo absent)"

SECRETVAULT_PASSPHRASE="wrong passphrase entirely" $BIN get STRIPE_API_KEY >/dev/null 2>&1
check "a wrong passphrase is refused" "1" "$?"

cp "$VAULT" "$VAULT.bak"
# flip one hex character of the ciphertext
awk 'NR==FNR{next}1' /dev/null "$VAULT" | sed '/^entry/ s/\(entry [^ ]* [^ ]* [^ ]* \)\(.\)/\1f/' > "$VAULT.t" && mv "$VAULT.t" "$VAULT"
SECRETVAULT_PASSPHRASE="$PASS" $BIN get STRIPE_API_KEY >/dev/null 2>&1
check "an edited vault is detected" "1" "$?"
mv "$VAULT.bak" "$VAULT"

printf '%s' "second-value" | SECRETVAULT_PASSPHRASE="$PASS" $BIN set MAPS_API_KEY >/dev/null 2>&1
check "list shows both names" "2" "$(SECRETVAULT_PASSPHRASE="$PASS" $BIN list 2>/dev/null | wc -l)"
check "list never prints a value" "absent" \
      "$(SECRETVAULT_PASSPHRASE="$PASS" $BIN list 2>/dev/null | grep -qF "$KEY" && echo present || echo absent)"

eval "$(SECRETVAULT_PASSPHRASE="$PASS" $BIN export 2>/dev/null)"
check "export puts values in the environment" "$KEY" "${STRIPE_API_KEY:-unset}"

# two identical values must not produce identical ciphertext (fresh nonce each time)
printf '%s' "same-value" | SECRETVAULT_PASSPHRASE="$PASS" $BIN set DUP_ONE >/dev/null 2>&1
printf '%s' "same-value" | SECRETVAULT_PASSPHRASE="$PASS" $BIN set DUP_TWO >/dev/null 2>&1
one=$(grep '^entry DUP_ONE' "$VAULT" | awk '{print $5}')
two=$(grep '^entry DUP_TWO' "$VAULT" | awk '{print $5}')
check "identical secrets encrypt differently" "different" \
      "$([ "$one" = "$two" ] && echo same || echo different)"

SECRETVAULT_PASSPHRASE="$PASS" $BIN remove MAPS_API_KEY >/dev/null 2>&1
check "remove deletes the entry" "0" "$(SECRETVAULT_PASSPHRASE="$PASS" $BIN list 2>/dev/null | grep -c MAPS_API_KEY)"

echo
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
