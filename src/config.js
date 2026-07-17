// Shared config for the service worker (an ES module). The MXID base URL is
// stored in chrome.storage.sync so an operator can point the extension at their
// deployment via the options page. Content scripts are NOT modules and must not
// import this — they receive everything they need over messaging.

// No built-in default: the MXID URL must come from enterprise managed policy or
// the user's Options page. Empty until configured, so the extension stays inert
// on a fresh install rather than pointing at some arbitrary host.
export const DEFAULT_BASE = ''

export const API = {
  // Descriptor sync: which sites are form apps, how to fill them, whether a
  // credential is already stored. (EE route, cookie-authed.)
  list: '/api/v1/portal/formfill/apps',
  // Reveal a single credential (the only plaintext endpoint; step-up gated).
  reveal: (appId) => `/api/v1/portal/apps/${appId}/credential`,
  // Write a form app's captured descriptor (login_url + selectors) so recording a
  // login configures the app in one step. Admin + step-up gated server-side; a
  // non-admin's PUT is refused (they only store their own credential).
  descriptor: (appId) => `/api/v1/portal/apps/${appId}/descriptor`,
  // Pair this extension install (step-up gated) → a binding token that reveal
  // requires in addition to the cookie, so another extension can't ride it.
  pair: '/api/v1/portal/formfill/pair',
  // Where to send the user to (re)authenticate / do step-up.
  portal: '/',
}

// Header carrying the per-install binding token on reveal.
export const TOKEN_HEADER = 'X-MXID-FormFill-Token'

// getBaseUrl resolves the MXID URL, precedence:
//   1. enterprise managed policy (chrome.storage.managed) — IT pushes it with the
//      force-install, so a managed fleet needs zero per-user setup;
//   2. the user's Options setting;
//   3. the built-in default (empty — see DEFAULT_BASE).
export async function getBaseUrl() {
  try {
    const m = await chrome.storage.managed.get('mxidBaseUrl')
    if (m && m.mxidBaseUrl) return String(m.mxidBaseUrl).replace(/\/+$/, '')
  } catch {
    // no managed policy (unmanaged browser) — fall through
  }
  const { mxidBaseUrl } = await chrome.storage.sync.get('mxidBaseUrl')
  return (mxidBaseUrl || DEFAULT_BASE).replace(/\/+$/, '')
}
