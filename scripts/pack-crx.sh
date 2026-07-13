#!/usr/bin/env bash
# Build the signed enterprise CRX (self-hosted forced-install).
#
# Chrome rejects a manifest that has BOTH a "key" field and --pack-extension-key,
# so we stage a copy with the manifest "key" stripped and sign with our key. The
# CRX header still carries the public key, so the installed id is the stable one
# (bfdbncnhgjdbaeipacekokclgbkhlpic) — the manifest "key" is only needed for the
# unpacked/dev load.
#
# Output: build/mxid-login-<version>.crx  (host it + deploy/update.xml internally)
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
KEY="${KEY:-$(cd .. && pwd)/mxid-login-key.pem}"
[[ -x "$CHROME" ]] || { echo "Chrome not at: $CHROME (set CHROME=…)"; exit 1; }
[[ -f "$KEY" ]] || { echo "signing key not found: $KEY (run scripts/gen-key.sh)"; exit 1; }

VER=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
STAGE="$(mktemp -d)/mxid-login"
mkdir -p "$STAGE"
cp -r manifest.json src icons managed_schema.json "$STAGE"/
python3 -c "import json;m=json.load(open('$STAGE/manifest.json'));m.pop('key',None);json.dump(m,open('$STAGE/manifest.json','w'),indent=2)"

"$CHROME" --pack-extension="$STAGE" --pack-extension-key="$KEY" --no-message-box
mkdir -p build
mv "$STAGE.crx" "build/mxid-login-$VER.crx"
rm -rf "$(dirname "$STAGE")"
echo "built build/mxid-login-$VER.crx"
