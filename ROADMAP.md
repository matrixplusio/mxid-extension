# Extension Roadmap — E2 → E5

E1 (this skeleton) is done: manifest + SW (sync/reveal/step-up) + content-script
fill/submit + popup + options; loads in Chrome. What remains to make it a shipped,
robust product:

## E2 — Fill/submit hardening  (~1–1.5 wk)

The naive "querySelector → set value → click" breaks on real logins. Add:

- **Wait for the form** — SPA/JS-rendered login pages mount fields after load.
  Use a `MutationObserver` (with a timeout) instead of a one-shot query.
- **Multi-step logins** — some sites ask username first, then password on a
  second view (Microsoft/Okta-style). Descriptor gains an optional step model;
  the content script fills step 1, waits for step 2, fills, submits.
- **`extra_fields`** — static hidden/extra inputs (tenant code, domain) already in
  the descriptor schema; fill them too.
- **Success confirmation** — after submit, if navigation matches
  `success_url_glob`, report success (stamp `last_used_at`); otherwise surface a
  "fill failed" hint (likely stale selectors).
- **Framework-safe value setting** — already using the native setter + input/change
  events; extend to cover `blur`, key events for pickier widgets.
- **Guard rails** — never double-submit; never fill on an origin ≠ `login_url`
  (already enforced); bail if the page looks post-login.

## E3 — Step-up (sudo) flow  (~0.5–1 wk)

Reveal returns `40133 step_up_required` when the MFA window is stale. Today the
skeleton shows a banner that opens the portal. Finish it:

- Open the MXID step-up page (portal MFA) in a focused tab/popup.
- Detect completion (poll a lightweight "am I fresh?" endpoint, or listen for the
  portal to signal done), then automatically retry the reveal + fill.
- Handle `not_logged_in` (401) the same way via the portal login.

## E4 — Capture mode  (~1–1.5 wk)  ← the scale unlock

Hand-writing selectors doesn't scale. Let the user record one real login:

- A "Record login" action puts the content script into capture on the app's
  `login_url`. It watches which field the user types the username into, which the
  password, which element submits, and the URL they land on.
- Generate a descriptor (prefer stable selectors: `#id` > `[name=…]` > a short CSS
  path) and POST it to MXID. **Needs a small EE endpoint** to save the descriptor
  (or reuse the CE protocol-config update route) — an E4 backend task.
- Admin/user confirms the captured origin + selectors before it's saved
  (B0 §6 — the capture must resolve within the `login_url` origin).

## E5 — Cross-browser, packaging, distribution  (ongoing)

- **Stable extension id** — add a `key` to the manifest (derived from a generated
  keypair) so the id is fixed across installs; that id is what MXID CORS-allow-lists.
- **Edge** — Chromium, the same build/CRX works.
- **Firefox** — MV3 differences (background scripts, `browser.*` namespace); add
  `webextension-polyfill` + a manifest variant; sign via AMO or enterprise policy.
- **Packaging** — build a zip/CRX per browser; version + `update_url` for auto-update.
- **Distribution** — see INSTALL.md (Web Store unlisted vs enterprise forced-install).
- **Breakage telemetry** — when a fill fails (selectors stale after a site
  redesign), report it so admins know which app needs a re-capture. This is what
  keeps the `<10 stable sites` assumption maintainable.

## Backend tasks these depend on

- E4: an endpoint to save a captured descriptor (EE).
- E5: the stable extension id fed into `MXID_SERVER_ALLOWED_ORIGINS`, and HTTPS +
  `MXID_SESSION_CROSS_SITE_COOKIES=true` for the cookie to ride cross-site (already
  built as an opt-in flag).
