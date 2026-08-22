# The Android app

`android/dist/india-census-2026-27.apk` is a single installable file with the
whole census app inside it. No server, no network, nothing to configure — it
works the moment it is installed.

## Installing it

1. Copy the `.apk` to the phone (USB, email, a download link, anything).
2. Open it. Android will ask you to allow installing from this source — that is
   the normal prompt for any app that does not come from the Play Store.
3. Tap **Install**.

Requires **Android 6.0 (API 23) or newer**, which covers essentially every phone
still in service.

## What is inside

| | |
| --- | --- |
| Size | ~270 KB |
| Package | `io.github.rajdip98.census2026` |
| Min / target SDK | 23 / 33 |
| Signing | v1 + v2 + v3 schemes |
| Permissions | Internet, network state, location |

The app is one Activity hosting a WebView that loads the built PWA from the
APK's own assets. Everything the browser version does on a device, the app does:
the full questionnaire, offline IndexedDB storage, GPS geo-tagging, house
photographs, the validation engine, maps, charts, seven languages and export.

## Why it is served over https://census.localhost

The assets could have been loaded from `file:///android_asset/`, and that is what
most WebView wrappers do. It would have broken geo-tagging.

A `file://` page is an *opaque origin*, which modern WebView treats as insecure,
and browsers refuse geolocation to insecure origins. Instead the app answers a
virtual `https://census.localhost` origin from its own assets — a real, secure
origin that never touches the network. `.localhost` is reserved by RFC 6761, so
even a request that somehow escaped interception could not leave the device.

## Three things a plain WebView will not do

**Location.** The page asks, the app requests the Android runtime permission and
hands the answer back to the page. Nothing is requested until the census form
actually asks for a fix.

**House photographs.** `<input type="file" capture>` does nothing in a bare
WebView. The app opens a chooser combining the camera and the picker. The
`CAMERA` permission is deliberately *not* declared — handing off to the camera
app by intent needs no permission and spares the enumerator a prompt.

**Exports.** A WebView ignores `<a download>` and cannot pull a `blob:` URL
through the download manager, so CSV and JSON export would silently do nothing.
The page hands the bytes across a small bridge instead; the app writes the file
into its own private storage and opens a share sheet. Files live in
`Android/data/io.github.rajdip98.census2026/files/Download`, so they disappear
when the app is uninstalled — appropriate for data that is confidential under the
Census Act.

## Connecting it to a census server

The app starts in device-only mode because there is no server inside the APK.
To sync with one, open **Profile → Census server address**, enter the URL and
tap **Test connection**.

Two things to get right on the server:

* **HTTPS is required.** The manifest sets `usesCleartextTraffic="false"`. If you
  must use plain HTTP on a local network, change that line and rebuild.
* **CORS must allow the app.** The app's origin is `https://census.localhost`,
  so set `CORS_ORIGINS` to include it, or leave it as `*`.

## Building it yourself

```bash
sudo apt-get install -y aapt android-sdk-platform-23 dalvik-exchange \
                        apksigner zipalign default-jdk
./android/build-apk.sh
```

The output is `android/dist/india-census-2026-27.apk`.

### Why there is no Gradle

The Android Gradle Plugin and the SDK platform are only distributed from
Google's servers. This pipeline uses nothing but the Android build tools
Debian and Ubuntu package — `aapt`, `dalvik-exchange`, `apksigner`, `zipalign`
and a JDK — so it builds in restricted networks and CI images that cannot reach
`dl.google.com`. It is also considerably easier to read: five commands instead
of a build system.

The trade-off is that the code compiles against the API 23 platform stub, which
is the newest Ubuntu ships. It targets API 33 at runtime and uses no API above
23, so this costs nothing today; if you later need a newer compile SDK, the
project is small enough to move to Gradle in an afternoon.

### Signing

The first build generates `android/keystore/census-release.jks`.

**Keep that file.** Android only accepts an update signed with the same key. If
you lose it, users have to uninstall before they can install a new version. It
is git-ignored on purpose — never commit a signing key.

To use your own:

```bash
KEYSTORE=/path/to/your.jks KEYSTORE_PASS=… KEY_ALIAS=… ./android/build-apk.sh
```

Change `KEYSTORE_PASS` from the default before you ship anything.

## Known limitations

**Voice input does not work in the app.** The Web Speech API is a Chrome
feature, not a WebView one, so the microphone buttons do not appear. Everything
else works; use the browser version if dictation matters. Wiring Android's own
`SpeechRecognizer` through the bridge would fix it and is the obvious next step.

**Not tested on a physical device.** It was built and verified here — the
package structure, the signatures, and the bundled web app driven through a
browser with the bridge stubbed — but no emulator was available, because Google's
system images come from the same servers the build deliberately avoids. Install
it on a real phone before relying on it in the field, and check the three
native paths first: location, camera, export.

**Not from the Google Play Store.** Play requires targetSdk 34+, a developer
account, and a privacy declaration. For sideloading to a census team's own
devices, none of that applies.
