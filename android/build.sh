#!/usr/bin/env bash
# Builds dist/ne-touche-pas-le-rouge.apk from the web game. Requires a JDK (17+), curl and unzip.
set -euo pipefail
A="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$A")"
T="$A/.tools"
OUT="$A/build"
VERSION_CODE="${VERSION_CODE:-4}"
VERSION_NAME="${VERSION_NAME:-2.1}"

[ -x "$T/aapt2" ] || "$A/fetch-tools.sh"

rm -rf "$OUT"
mkdir -p "$OUT/assets/www" "$OUT/classes"
cp -r "$ROOT/index.html" "$ROOT/manifest.webmanifest" "$ROOT/css" "$ROOT/js" "$ROOT/fonts" "$ROOT/assets" "$ROOT/audio" "$OUT/assets/www/"

# Resources + manifest
"$T/aapt2" compile --dir "$A/res" -o "$OUT/res.zip"
"$T/aapt2" link -o "$OUT/unsigned.apk" -I "$T/android.jar" \
  --manifest "$A/AndroidManifest.xml" -A "$OUT/assets" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  "$OUT/res.zip"

# Code
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$T/android.jar" \
  -d "$OUT/classes" $(find "$A/src" -name '*.java')
java -cp "$T/r8.jar" com.android.tools.r8.D8 --release --min-api 24 \
  --lib "$T/android.jar" --output "$OUT" $(find "$OUT/classes" -name '*.class')
(cd "$OUT" && zip -q unsigned.apk classes.dex)

# Align + sign (debug key embedded in uber-apk-signer)
java -jar "$T/signer.jar" -a "$OUT/unsigned.apk" -o "$OUT/signed" --allowResign >/dev/null
mkdir -p "$ROOT/dist"
cp "$OUT"/signed/*.apk "$ROOT/dist/ne-touche-pas-le-rouge.apk"
echo "APK : $ROOT/dist/ne-touche-pas-le-rouge.apk"
