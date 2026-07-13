#!/usr/bin/env bash
# Package the extension.
#
#   build/mxid-login-<version>.zip   → upload to the Chrome Web Store.
#
# For the enterprise self-hosted CRX (forced-install), pack with Chrome so it is
# signed by key.pem (which fixes the id to the stable one in gen-key.sh):
#   google-chrome --pack-extension="$PWD" --pack-extension-key="$PWD/../mxid-login-key.pem"
#   # → ../mxid-extension.crx  — host it + update.xml on your internal HTTPS.
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
mkdir -p build

# Runtime files only — no signing key, no scripts/docs. These are what ships.
RUNTIME=(manifest.json src icons managed_schema.json)

# 1. A clean UNPACKED folder for "Load unpacked" (dev / manual test). Keeps the
#    manifest "key" so the id is the stable one; excludes key.pem + repo clutter.
UNP="build/unpacked"
rm -rf "$UNP"; mkdir -p "$UNP"
cp -r "${RUNTIME[@]}" "$UNP"/
echo "unpacked  -> $UNP        (chrome://extensions → Load unpacked → this)"

# 2. A ZIP for the Chrome Web Store.
ZIP="build/mxid-login-$VER.zip"
rm -f "$ZIP"
( cd "$UNP" && zip -r -q "../mxid-login-$VER.zip" . -x '*.DS_Store' )
echo "store zip -> $ZIP"
