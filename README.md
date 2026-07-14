# MXID Login

**Browser extension (Manifest V3) for [MXID](https://github.com/imkerbos/mxid)
form-fill SSO (SWA).**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)

Some internal systems only have a plain username + password login — no OIDC,
SAML or CAS. **Form-fill SSO** (a.k.a. SWA, Secure Web Authentication) closes
that gap: the downstream credential is vaulted in MXID, and this extension types
it into the app's *own* login form and submits it. MXID never talks to the app;
the extension fills the form in the user's browser.

## How it works

```
[content.js @ the app's login page] --msg--> [background.js (service worker)]
                                                     |
                                       fetch (session cookie + binding token)
                                                     v
                                                  [ MXID ]
```

- **background.js** (service worker) is the *only* component that talks to MXID.
  It reuses the user's MXID portal session cookie and the per-install binding
  token to sync which sites are form apps and to reveal a credential on demand.
- **content.js** runs on every page. When the page origin matches a known form
  app's login URL, it asks the service worker for the credential and fills +
  submits the form using that app's field selectors — only on the matching
  origin, only that app's own selectors.
- **popup** shows synced apps + per-app status and a **Record login** button.
- **options** sets the MXID base URL (for unmanaged installs).

## Security model

This extension handles credentials, so its trust boundary is deliberately tight:

- **Credentials live in MXID**, not in the extension. They are revealed on demand
  and only held in memory long enough to fill the form.
- **Reveal is multi-gated** on the MXID side: the authenticated portal session
  **+** a per-install binding token (`X-MXID-FormFill-Token`, so another extension
  can't ride the cookie) **+** step-up MFA **+** the app's access policy. Every
  reveal is audited.
- **Origin-scoped fills** — the content script only acts when the current page
  origin equals the descriptor's login-URL origin, and only touches that
  descriptor's own selectors.
- **No telemetry, no third-party endpoints.** The extension talks *only* to the
  one MXID base URL you configure. Nothing else.
- **Stable identity** — the `key` in `manifest.json` is the public half of the
  signing keypair; it pins the extension ID so MXID can allow-list exactly this
  extension for CORS + token binding. The private signing key (`key.pem`) is
  **never** committed — it lives only in CI secrets.

## Install

Chrome blocks installing a self-hosted `.crx` by download/double-click, so there
are two real paths:

1. **Enterprise (recommended for intranet)** — push it with a managed policy
   (`ExtensionInstallForcelist` via Windows GPO / macOS plist / Chrome cloud
   management), pointing at a self-hosted `.crx` + `update.xml`
   (see [`deploy/update.xml`](deploy/update.xml) and [INSTALL.md](INSTALL.md)).
   Users get it auto-installed with the MXID URL pre-set — zero setup.
2. **Chrome Web Store** — one-click "Add to Chrome" for users; auto-updates via
   Google. See [PUBLISHING.md](PUBLISHING.md).

**Dev (load unpacked):**

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → this folder
   (or `build/unpacked` after `scripts/pack.sh`).
2. Open the extension **Options** → set your MXID base URL.
3. Sign in to the MXID portal in the same browser, open the popup → **Sync**.

## Configure

The MXID base URL resolves in this order:

1. **Managed policy** (`mxidBaseUrl` in the enterprise config) — set once by IT.
2. **Options page** — for unmanaged installs.
3. Otherwise unset: the extension stays inert until configured.

## Record login (capture mode)

For an app whose selectors you don't want to hand-write: open its login page,
click **Record login** in the popup, and log in once. The extension records the
username / password / submit selectors into a descriptor **and** — if that app is
already registered in MXID — stores the credential you just typed, so a user
onboards an app in a single pass. A user who prefers not to vault a password
simply skips this; the app then works as a plain launcher and they type it in.

## Build & package

```bash
scripts/gen-key.sh          # one-time: generate the signing keypair (key.pem)
scripts/pack.sh             # build/unpacked + a zip for the Web Store
scripts/pack-crx.sh         # signed .crx for self-hosted / enterprise install
```

`key.pem` is git-ignored and must stay out of the repo. In CI, provide it as a
secret and reconstruct it at package time — anyone with it can sign a malicious
update under this extension's ID.

## Requirements

- An MXID deployment with the **form-fill** feature (Enterprise).
- MXID reachable over **HTTPS** with cross-site cookies enabled
  (`MXID_SESSION_CROSS_SITE_COOKIES=true`) and this extension's id added to the
  server's allowed origins (`chrome-extension://<id>`) — the extension's
  cross-site fetch carries the portal cookie, which requires `SameSite=None;
  Secure` and therefore HTTPS.

## License

[Apache License 2.0](LICENSE) © 2026 MatrixPlus.
