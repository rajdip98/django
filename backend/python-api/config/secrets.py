"""Read settings from the environment, or from the encrypted vault.

Order of preference for every secret:

1. an ordinary environment variable — what a managed platform gives you, and the
   simplest thing that works;
2. the encrypted vault, read once at start-up through the `secretvault` binary;
3. the fallback passed in, so a fresh checkout still runs.

Set SECRETVAULT_FILE and SECRETVAULT_PASSPHRASE to enable step 2. The vault is
read exactly once per process, so start-up costs one key derivation rather than
one per secret.
"""
import os
import shutil
import subprocess
import sys

_cache = None


def _load_vault():
    """Decrypt the whole vault once. Returns {} when it is not configured."""
    vault_file = os.environ.get('SECRETVAULT_FILE')
    if not vault_file or not os.path.exists(vault_file):
        return {}
    if not os.environ.get('SECRETVAULT_PASSPHRASE'):
        sys.stderr.write(
            'secrets: SECRETVAULT_FILE is set but SECRETVAULT_PASSPHRASE is not, '
            'so the vault cannot be opened.\n')
        return {}

    # config/secrets.py -> config -> app -> project root, where tools/ lives.
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    binary = os.environ.get('SECRETVAULT_BIN') or shutil.which('secretvault') \
        or os.path.join(project_root, 'tools', 'secretvault', 'secretvault')
    if not os.path.exists(binary):
        sys.stderr.write(f'secrets: the secretvault binary is not at {binary}; '
                         f'build it with "make" in tools/secretvault.\n')
        return {}

    try:
        finished = subprocess.run([binary, 'export'], capture_output=True, text=True,
                                  timeout=30, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        sys.stderr.write(f'secrets: could not run the vault: {exc}\n')
        return {}
    if finished.returncode != 0:
        sys.stderr.write(f'secrets: the vault refused to open: {finished.stderr.strip()}\n')
        return {}

    values = {}
    for line in finished.stdout.splitlines():
        if not line.startswith('export '):
            continue
        name, _, raw = line[len('export '):].partition('=')
        values[name.strip()] = raw.strip().strip("'").replace("'\\''", "'")
    return values


def get(name, default=''):
    """One secret, by name."""
    global _cache
    from_env = os.environ.get(name)
    if from_env:
        return from_env
    if _cache is None:
        _cache = _load_vault()
    return _cache.get(name, default)
