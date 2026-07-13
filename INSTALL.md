# Installing the MXID Form-Fill Extension

## A. Developer install (dev / testing)

1. `bash scripts/pack.sh` — produces `build/unpacked/` (runtime files only, no
   signing key or repo clutter). Load THIS, not the repo root (the repo root has
   key.pem, which Chrome warns about).
2. Open `chrome://extensions` (or `edge://extensions`).
3. Toggle **Developer mode** (top-right).
4. **Load unpacked** → pick **`build/unpacked`**.

> The `.crx` in `build/enterprise/` CANNOT be loaded this way (it's a packed file)
> and cannot be drag-installed on standard Chrome — it's for enterprise policy
> (§C2). "Load unpacked" always needs a *folder* containing `manifest.json`.
4. Note the assigned **extension id** (shown on the card).
5. Extension **Details → Extension options** → set your **MXID base URL**.
6. Sign in to the MXID portal in the same browser.
7. Click the toolbar icon → **Sync**.

### Making the full flow work (cookie requirement)

Option A reuses the portal session cookie, which must be sent on the extension's
cross-site request. That needs, on the **MXID server**:

- **HTTPS** (SameSite=None cookies require Secure — plain-http dev won't send them).
- `MXID_SESSION_CROSS_SITE_COOKIES=true` (flips the portal cookie to SameSite=None).
- `MXID_SERVER_ALLOWED_ORIGINS` includes `chrome-extension://<your-extension-id>`
  (CORS + CSRF allow-list; already credentialed).

Without these you'll see `not_logged_in` on Sync — the extension code is fine, the
cookie just isn't riding the cross-site fetch.

## B. Stable extension id (do before distribution)

The dev id is random per profile. CORS-allow-listing needs a **fixed** id:

1. Generate a key: `openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt` (or reuse
   the CRX packaging key).
2. Add its public part as `"key": "<base64>"` in `manifest.json`. The id is then
   deterministic across installs.
3. Put that id in `MXID_SERVER_ALLOWED_ORIGINS`.

## C. Production distribution

Two paths — pick per your fleet:

### C1. Chrome Web Store (unlisted / private)
- Package + upload; set visibility **Unlisted** (link-only) or **Private** to your
  Google Workspace org.
- Users install from the link; Chrome auto-updates them.
- Simplest for users; requires a Web Store developer account.

### C2. Enterprise forced-install (no store)
Push the extension via device management — nothing for users to click:

- **Windows (GPO / Intune):** policy `ExtensionInstallForcelist` = `<id>;<update_url>`.
- **macOS (Jamf / MDM):** the same Chrome/Edge policy via a config profile.
- Host the packaged `.crx` + an `update.xml` (update manifest) on an internal HTTPS
  server; `update_url` points at it. Chrome fetches + auto-updates from there.
- This is the usual enterprise route: managed, pinned, no Web Store dependency.

### Edge
Same Chromium build/CRX. Use Edge Add-ons, or the same forced-install policy
(`ExtensionInstallForcelist` under the Edge policy namespace).

### Firefox
Separate build (see ROADMAP E5). Distribute signed via addons.mozilla.org, or
self-distribute through the enterprise policy (`ExtensionSettings` → `installation_mode: force_installed`).

## C3. Set the MXID URL for the fleet (managed config)

The extension is domain-agnostic (host_permissions is broad `https://*/*`); it just
needs to know YOUR MXID URL. Precedence: **managed policy → Options page → default**.
For a managed fleet, push the URL with the same MDM/GPO that force-installs it — no
per-user setup, no re-packaging:

- **Windows (GPO/registry):**
  `HKLM\Software\Policies\Google\Chrome\3rdparty\extensions\bfdbncnhgjdbaeipacekokclgbkhlpic\policy`
  value `mxidBaseUrl` = `https://mxid.corp`
- **macOS / Linux (managed policy JSON):**
  ```json
  {
    "3rdparty": {
      "extensions": {
        "bfdbncnhgjdbaeipacekokclgbkhlpic": { "mxidBaseUrl": "https://mxid.corp" }
      }
    }
  }
  ```
The extension reads this via `chrome.storage.managed` (schema: `managed_schema.json`).
Unmanaged browsers fall back to the Options page.

## D. Server checklist recap

- [ ] MXID served over **HTTPS**.
- [ ] `MXID_SESSION_CROSS_SITE_COOKIES=true`.
- [ ] `chrome-extension://<stable-id>` in `MXID_SERVER_ALLOWED_ORIGINS`.
- [ ] `form_fill` feature in the EE license.
- [ ] Form apps created + descriptors set (console); users have stored credentials
      (portal) or an admin set the shared credential.
