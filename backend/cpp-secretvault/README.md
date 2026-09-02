# secretvault — keeping API keys out of your source tree

A small C++ program that stores API keys and passwords **encrypted at rest**, so
they never sit in plaintext in `settings.py`, a `.env` file, your git repository or
a backup tarball. The website reads them at start-up.

## What this does and does not protect against

Read this before relying on it.

**It protects against**

- a key committed to git and then pushed to a public repository
- a key sitting in a `.env` file that ends up in a backup, a disk image or a
  support ticket
- someone who can read your deployment directory but does not know the passphrase
- a stolen laptop or an unencrypted server snapshot

**It cannot protect against**

- **an attacker who is root on the running server.** The decrypted value is in the
  application's memory while it runs. Nothing changes that — not this program, not
  any other.
- anyone holding both the vault file *and* the passphrase
- a weak passphrase, given enough time. PBKDF2 with 600,000 iterations makes each
  guess expensive, not impossible.

**A compiled binary is not a hiding place.** Putting a key inside a C++ program and
compiling it does *not* secure it: `strings ./program` prints it straight back out.
This program stores nothing secret inside itself. The ciphertext lives in the vault
file, and the key is derived from a passphrase you supply at run time.

For a managed platform (Render, Railway, a cloud provider) their own secret store is
still the better answer — it keeps the passphrase problem off your plate entirely.
This is for a server you run yourself.

## How it is built

| Piece | Choice |
| --- | --- |
| Cipher | AES-256-GCM — authenticated, so an edited vault is refused rather than silently decrypted to nonsense |
| Key derivation | PBKDF2-HMAC-SHA256, 600,000 iterations, random 128-bit salt |
| Nonce | fresh 96-bit random value per entry, so two identical secrets do not produce identical ciphertext |
| File | one line per secret, hex-encoded, written atomically with `0600` permissions |
| Memory | keys and plaintexts wiped with `OPENSSL_cleanse` after use |
| Primitives | OpenSSL 3. Nothing hand-rolled. |

## Build

```bash
sudo apt install g++ libssl-dev     # Debian/Ubuntu
make                                # produces ./secretvault
make test                           # 13 checks, including that the plaintext never
                                    # appears in the vault file or the binary
sudo make install                   # optional: /usr/local/bin/secretvault
```

Fedora/RHEL: `sudo dnf install gcc-c++ openssl-devel`.
macOS: `brew install openssl@3 && make OPENSSL=$(brew --prefix openssl@3)`.

## Use

```bash
export SECRETVAULT_FILE=/etc/club-website/secrets.vault

./secretvault init                       # asks for a passphrase, twice
./secretvault set SECRET_KEY             # type the value (not echoed)
printf 'your-api-key' | ./secretvault set PAYMENT_API_KEY   # or pipe it in
./secretvault list                       # names only, never values
./secretvault get PAYMENT_API_KEY        # prints one value to stdout
./secretvault export                     # export NAME='value' lines
./secretvault rotate                     # re-encrypt everything under a new passphrase
./secretvault remove OLD_KEY
```

`get` writes the secret to stdout and everything else to stderr, so
`KEY=$(secretvault get PAYMENT_API_KEY)` captures exactly the value.

## Using it with the website

`app/config/secrets.py` resolves every secret in this order:

1. an ordinary environment variable, if set;
2. the vault, opened once at start-up;
3. the fallback in `settings.py`, so a fresh checkout still runs.

So you can move secrets into the vault gradually, and a platform that injects
environment variables keeps working untouched.

```bash
export SECRETVAULT_FILE=/etc/club-website/secrets.vault
export SECRETVAULT_PASSPHRASE='the passphrase'      # see below
cd app && sh start.sh
```

Anything the site reads can live in the vault: `SECRET_KEY`, `DATABASE_URL` (so the
MySQL password is encrypted too), `PANEL_DEFAULT_PASSWORD`, `PANEL_ELEVATION_SECRET`,
`PLATFORM_DEFAULT_PASSWORD`, and any API key your own code reads with
`secrets.get('NAME')`.

## The passphrase problem, honestly

An unattended server has to get the passphrase from somewhere, and wherever you put
it is now the weak point. Ranked, worst to best:

1. **`SECRETVAULT_PASSPHRASE` in a shell script committed to git** — pointless; the
   passphrase travels with the ciphertext.
2. **In a systemd `EnvironmentFile` at `/etc/club-website.env`, `chmod 600`** —
   reasonable for a single self-hosted box. The vault then protects backups, the
   repository and anything copied off the machine, which is where keys usually leak.
3. **Typed by a person at start-up** — strongest, but the service cannot restart on
   its own.
4. **A platform secret store, or a KMS/HSM that releases the key to the process** —
   the real answer once it matters enough.

Pick 2 for a club website. Do not pretend it is 4.

## Rotating a leaked key

1. Revoke the key with whoever issued it — this is the step that actually matters.
2. `secretvault set THE_KEY` with the new value.
3. Restart the site.

If the vault file itself may have leaked, `secretvault rotate` re-encrypts everything
under a new passphrase — but assume the old contents are known and reissue those keys.
