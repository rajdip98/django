#!/usr/bin/env bash
# Build the India Census 2026-27 Android app.
#
# Produces a single installable .apk with the whole web app bundled inside, so
# it runs with no server and no network.
#
# Deliberately Gradle-free. The Android Gradle Plugin and the SDK platform are
# only distributed from Google's servers; this pipeline needs nothing but the
# Android build tools packaged by Debian/Ubuntu, which means it builds in
# restricted environments and CI images that cannot reach dl.google.com.
#
#   sudo apt-get install -y aapt android-sdk-platform-23 dalvik-exchange \
#                           apksigner zipalign default-jdk
#   ./android/build-apk.sh
#
# Environment overrides:
#   ANDROID_JAR     path to android.jar          (default: Ubuntu's API 23)
#   KEYSTORE        signing keystore             (default: android/keystore/census-release.jks)
#   KEYSTORE_PASS   keystore password            (default: censusapp)
#   KEY_ALIAS       key alias                    (default: census)
#   SKIP_WEB_BUILD  set to 1 to reuse frontend/dist as-is

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID="$ROOT/android"
BUILD="$ANDROID/build"
ASSETS="$ANDROID/assets"

ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
KEYSTORE="${KEYSTORE:-$ANDROID/keystore/census-release.jks}"
KEYSTORE_PASS="${KEYSTORE_PASS:-censusapp}"
KEY_ALIAS="${KEY_ALIAS:-census}"
APK_NAME="india-census-2026-27.apk"

say()  { printf '\033[1;32m==>\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "$1 is not installed. See the header of this script."; }

need aapt
need dalvik-exchange
need apksigner
need zipalign
need javac
need keytool
[ -f "$ANDROID_JAR" ] || die "android.jar not found at $ANDROID_JAR (set ANDROID_JAR)"

# --- 1. the web app ---------------------------------------------------------
if [ "${SKIP_WEB_BUILD:-0}" != "1" ]; then
  say "Building the web app"
  ( cd "$ROOT/frontend"
    [ -d node_modules ] || npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
    npm run build )
fi
[ -f "$ROOT/frontend/dist/index.html" ] || die "frontend/dist is missing — run the web build first"

say "Bundling the web app into assets/www"
rm -rf "$ASSETS" "$BUILD"
mkdir -p "$ASSETS/www" "$BUILD/gen" "$BUILD/classes"
cp -r "$ROOT/frontend/dist/." "$ASSETS/www/"
# The service worker and host configs are dead weight inside the APK: assets are
# already local, and .htaccess/_redirects/vercel.json only mean anything on a
# web host. Dropping them keeps the package honest about what it contains.
rm -f "$ASSETS/www/sw.js" "$ASSETS/www/.htaccess" "$ASSETS/www/_redirects" \
      "$ASSETS/www/vercel.json" "$ASSETS/www/robots.txt"

# --- 2. resources + manifest -> base APK, and R.java ------------------------
say "Compiling resources"
aapt package -f -m \
  -J "$BUILD/gen" \
  -M "$ANDROID/AndroidManifest.xml" \
  -S "$ANDROID/res" \
  -A "$ASSETS" \
  -I "$ANDROID_JAR" \
  -F "$BUILD/base.apk"

# --- 3. Java -> classes -> dex ---------------------------------------------
say "Compiling Java"
# --release 8: dalvik-exchange is the legacy dexer and does not desugar newer
# class files. android.jar supplies the android.* stubs.
find "$ANDROID/java" "$BUILD/gen" -name '*.java' > "$BUILD/sources.txt"
javac --release 8 -nowarn -Xlint:-options \
  -classpath "$ANDROID_JAR" \
  -d "$BUILD/classes" \
  @"$BUILD/sources.txt"

say "Converting to DEX"
dalvik-exchange --dex --min-sdk-version=23 --output="$BUILD/classes.dex" "$BUILD/classes"

say "Adding classes.dex to the package"
# Run from the file's directory so the zip entry is "classes.dex", not a path.
( cd "$BUILD" && aapt add -f base.apk classes.dex >/dev/null )

# --- 4. align + sign --------------------------------------------------------
say "Aligning"
zipalign -f -p 4 "$BUILD/base.apk" "$BUILD/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  say "Creating a signing key at $KEYSTORE"
  echo "    Keep this file. Android only accepts an update signed with the same key;"
  echo "    lose it and users have to uninstall before they can install a new version."
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" \
    -dname "CN=India Census 2026-27, OU=Census App, O=Census App, L=Kolkata, ST=West Bengal, C=IN" \
    >/dev/null 2>&1
fi

say "Signing"
mkdir -p "$ANDROID/dist"
apksigner sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEYSTORE_PASS" \
  --key-pass "pass:$KEYSTORE_PASS" \
  --min-sdk-version 23 \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$ANDROID/dist/$APK_NAME" \
  "$BUILD/aligned.apk"

say "Verifying"
apksigner verify --min-sdk-version 23 --verbose "$ANDROID/dist/$APK_NAME" | sed 's/^/    /'
aapt dump badging "$ANDROID/dist/$APK_NAME" | grep -E "^(package|application-label|sdkVersion|targetSdkVersion|uses-permission)" | sed 's/^/    /'

SIZE=$(du -h "$ANDROID/dist/$APK_NAME" | cut -f1)
say "Done — $ANDROID/dist/$APK_NAME ($SIZE)"
