#!/usr/bin/env bash
# Build the India Census 2026-27 app and package it for download.
#
# Produces, in ./release:
#   census-app-static-<version>.zip  → just the web app. Upload the contents to
#                                      any web host (cPanel public_html, Netlify,
#                                      Vercel, S3, GitHub Pages). Works with no
#                                      backend at all, in device-only mode.
#   census-app-full-<version>.zip    → app + API + docs, for self-hosting on a
#                                      VPS or in Docker.
#
# Usage:  ./build-release.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(node -p "require('$ROOT/frontend/package.json').version" 2>/dev/null || echo "1.0.0")"
RELEASE="$ROOT/release"

say() { printf '\033[1;32m==>\033[0m %s\n' "$1"; }

command -v node >/dev/null || { echo "Node.js 18+ is required"; exit 1; }
command -v npm  >/dev/null || { echo "npm is required"; exit 1; }

say "Building the frontend (version $VERSION)"
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
fi
npm run build

say "Copying the built app into the backend so one process can serve both"
rm -rf "$ROOT/backend/static"
cp -r "$ROOT/frontend/dist" "$ROOT/backend/static"

say "Packaging"
rm -rf "$RELEASE"
mkdir -p "$RELEASE/staging/full"

# --- static-only bundle -----------------------------------------------------
cp -r "$ROOT/frontend/dist" "$RELEASE/staging/census-app-static"
cp "$ROOT/docs/HOSTING-QUICKSTART.md" "$RELEASE/staging/census-app-static/README.txt"

# --- full self-host bundle --------------------------------------------------
FULL="$RELEASE/staging/full/census-app"
mkdir -p "$FULL"
cp -r "$ROOT/backend" "$FULL/backend"
cp -r "$ROOT/frontend" "$FULL/frontend"
cp -r "$ROOT/docs" "$FULL/docs"
cp "$ROOT/docker-compose.yml" "$ROOT/build-release.sh" "$ROOT/README.md" "$FULL/"
# Never ship build artefacts, virtualenvs or collected data.
rm -rf "$FULL/frontend/node_modules" "$FULL/backend/.venv" "$FULL/backend/data" \
       "$FULL/backend/__pycache__" "$FULL/backend/.pytest_cache"
find "$FULL" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$FULL" -name '*.pyc' -delete 2>/dev/null || true

python3 - "$RELEASE" "$VERSION" <<'PY'
import pathlib, shutil, sys

release = pathlib.Path(sys.argv[1])
version = sys.argv[2]
staging = release / "staging"

def archive(name: str, folder: pathlib.Path) -> None:
    stem = release / f"{name}-{version}"
    shutil.make_archive(str(stem), "zip", root_dir=str(folder))
    # Build the filename by hand: `with_suffix` would read ".0" of "1.0.0"
    # as the existing suffix and produce "census-app-static-1.0.zip".
    archive_path = pathlib.Path(f"{stem}.zip")
    size = archive_path.stat().st_size / 1_048_576
    print(f"    {archive_path.name}  ({size:.1f} MB)")

archive("census-app-static", staging / "census-app-static")
archive("census-app-full", staging / "full")
PY

rm -rf "$RELEASE/staging"

say "Done — files are in ./release"
ls -lh "$RELEASE"
