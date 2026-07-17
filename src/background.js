// Service worker: the only component that talks to MXID. It reuses the user's
// portal session cookie (Option A — see docs/FORM-FILL-EXTENSION-AUTH-DESIGN.md),
// so `credentials: 'include'` carries mxid_portal_sid. That requires the portal
// cookie to be SameSite=None (MXID's MXID_SESSION_CROSS_SITE_COOKIES=true) and
// HTTPS — on a plain-http dev stack the cookie won't ride the cross-site fetch.

import { API, getBaseUrl, TOKEN_HEADER } from './config.js'

async function getToken() {
  const { extToken } = await chrome.storage.local.get('extToken')
  return extToken || ''
}

// pair this install: POST /formfill/pair (step-up gated). On success store the
// binding token. A malicious extension cannot pass the step-up, so it can't pair.
async function pair() {
  const base = await getBaseUrl()
  let res
  try {
    res = await fetch(base + API.pair, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_label: (navigator.userAgent || 'browser').slice(0, 120) }),
    })
  } catch (e) {
    return { error: 'network', detail: String(e) }
  }
  const body = await res.json().catch(() => ({}))
  if (res.ok && body.data?.token) {
    await chrome.storage.local.set({ extToken: body.data.token })
    return { ok: true }
  }
  if (body.code === 40133) return { error: 'step_up', base }
  if (res.status === 401) return { error: 'not_logged_in', base }
  return { error: 'http_' + res.status, base }
}

// --- MXID API calls (session-cookie authed) ---

async function syncDescriptors() {
  const base = await getBaseUrl()
  let res
  try {
    res = await fetch(base + API.list, { credentials: 'include' })
  } catch (e) {
    return { error: 'network', detail: String(e) }
  }
  if (res.status === 401) return { error: 'not_logged_in' }
  if (!res.ok) return { error: 'http_' + res.status }
  const body = await res.json().catch(() => ({}))
  const apps = Array.isArray(body.data) ? body.data : []
  await chrome.storage.local.set({ descriptors: apps, syncedAt: Date.now() })
  return { apps }
}

function sameOriginUrl(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

// storeCredential PUTs the user's captured account+password for a form app.
// Cookie-authed; no step-up (storing your own password isn't high-risk).
async function storeCredential(appId, account, credential) {
  const base = await getBaseUrl()
  const token = await getToken()
  try {
    const r = await fetch(base + `/api/v1/portal/apps/${appId}/credential`, {
      method: 'PUT',
      credentials: 'include',
      // The binding token doubles as the CSRF bypass (custom header the server
      // trusts in place of a same-site Origin the extension can't provide).
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { [TOKEN_HEADER]: token } : {}),
      },
      body: JSON.stringify({ account, credential }),
    })
    return r.ok
  } catch {
    return false
  }
}

// saveDescriptor PUTs the captured login_url + selectors for a form app, so
// "record a login" configures the app in one step instead of an admin copying
// selectors into the console by hand. Server-gated: admin + fresh step-up +
// ext-token. A non-admin (or unpaired) caller is refused — harmless, they still
// store their own credential. Returns a status the caller can log; never throws.
async function saveDescriptor(appId, descriptor) {
  const base = await getBaseUrl()
  const token = await getToken()
  try {
    const r = await fetch(base + API.descriptor(appId), {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { [TOKEN_HEADER]: token } : {}),
      },
      body: JSON.stringify({
        login_url: descriptor.login_url,
        username_selector: descriptor.username_selector,
        password_selector: descriptor.password_selector,
        submit_selector: descriptor.submit_selector || '',
      }),
    })
    if (r.ok) return { ok: true }
    const body = await r.json().catch(() => ({}))
    return { ok: false, status: r.status, code: body.code }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// flushPendingCapture stores the credential the content script stashed at login
// time. It runs from multiple triggers (captureResult message, storage.onChanged,
// SW wake, sync alarm) so a torn-down message after a fast post-login 301 never
// loses the credential. Idempotent: storeCredential is a PUT, so re-running is safe.
async function flushPendingCapture() {
  const { pendingCapture, descriptors, captureTargetAppId } = await chrome.storage.local.get([
    'pendingCapture',
    'descriptors',
    'captureTargetAppId',
  ])
  if (!pendingCapture) return { credentialSaved: false }
  const { descriptor, account, credential } = pendingCapture

  // Resolve WHICH app this capture configures. An explicit target (the admin
  // clicked "Record" on a specific app in the popup) is authoritative and, crucially,
  // works even when the app has no login_url yet — that's the chicken-and-egg the
  // descriptor push breaks: you can't origin-match an app that has never been
  // configured. Fall back to origin-matching an already-configured app (a
  // rank-and-file user re-recording their credential for a working app).
  let app = null
  if (captureTargetAppId) {
    app = (descriptors || []).find((d) => String(d.app_id) === String(captureTargetAppId)) || {
      app_id: captureTargetAppId,
      credential_mode: 'per_user',
    }
  } else if (descriptor && descriptor.login_url) {
    app = (descriptors || []).find(
      (d) => d.login_url && sameOriginUrl(d.login_url, descriptor.login_url),
    )
  }

  // Push the captured descriptor (login_url + selectors) so recording configures
  // the app in one step. Admin + step-up gated server-side; a non-admin's PUT is
  // refused (403) — harmless, they still store their credential below. Only
  // attempted when we have a resolved app + a descriptor with selectors.
  let descriptorSaved = false
  if (app && app.app_id && descriptor && descriptor.username_selector && descriptor.login_url) {
    const r = await saveDescriptor(app.app_id, descriptor)
    descriptorSaved = !!r.ok
    if (descriptorSaved) await syncDescriptors() // app now has selectors → fill works next load
  }

  let credentialSaved = false
  if (account && credential && app && app.app_id && app.credential_mode !== 'shared') {
    credentialSaved = await storeCredential(app.app_id, account, credential)
  } else if (account && credential && !app) {
    // No app to store into — nothing to retry, drop the pending capture.
    await chrome.storage.local.remove(['pendingCapture', 'captureTargetAppId'])
    return { credentialSaved: false, descriptorSaved }
  }

  // Clear only on success (or when there was nothing to store) so a transient
  // network failure keeps the pending creds for a later trigger to retry.
  if (credentialSaved || !(account && credential)) {
    await chrome.storage.local.remove(['pendingCapture', 'captureTargetAppId'])
  }
  return { credentialSaved, descriptorSaved }
}

async function getCredential(appId) {
  const base = await getBaseUrl()
  const token = await getToken()
  let res
  try {
    res = await fetch(base + API.reveal(appId), {
      credentials: 'include',
      headers: token ? { [TOKEN_HEADER]: token } : {},
    })
  } catch (e) {
    return { error: 'network', detail: String(e) }
  }
  if (res.ok) {
    const body = await res.json().catch(() => ({}))
    return { credential: body.data }
  }
  const body = await res.json().catch(() => ({}))
  // 40137 = pairing_required, 40133 = step_up, 40136 = not authorized, 401 = no session.
  if (body.code === 40137) return { error: 'pairing_required', base }
  if (body.code === 40133) return { error: 'step_up', base }
  if (res.status === 401) return { error: 'not_logged_in', base }
  return { error: 'http_' + res.status, code: body.code, base }
}

// --- messaging (content script + popup) ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    switch (msg?.type) {
      case 'sync':
        sendResponse(await syncDescriptors())
        break
      case 'getDescriptors': {
        const { descriptors } = await chrome.storage.local.get('descriptors')
        sendResponse(descriptors || [])
        break
      }
      case 'getBaseUrl':
        sendResponse({ base: await getBaseUrl() })
        break
      case 'getCredential':
        sendResponse(await getCredential(msg.appId))
        break
      case 'pair':
        sendResponse(await pair())
        break
      case 'openPortal': {
        const base = await getBaseUrl()
        chrome.tabs.create({ url: base + API.portal })
        sendResponse({ ok: true })
        break
      }
      case 'startCapture':
        // Arm capture; the content script on the active tab picks it up on reload.
        await chrome.storage.local.set({ capturing: true, lastCapture: null })
        sendResponse({ ok: true })
        break
      case 'captureResult': {
        // Fast path: the content script already stashed pendingCapture to storage
        // synchronously, so flush from there (single source of truth). If this
        // message was lost to a post-login nav, the storage.onChanged / wake
        // handlers below flush the same pendingCapture instead.
        await chrome.storage.local.set({ capturing: false, lastCapture: msg.descriptor })
        const res = await flushPendingCapture()
        sendResponse({ ok: true, credentialSaved: res.credentialSaved, descriptorSaved: res.descriptorSaved })
        break
      }
      default:
        sendResponse({ error: 'unknown_message' })
    }
  })()
  return true // async response
})

// --- lifecycle: sync on install + periodically ---

chrome.runtime.onInstalled.addListener(() => {
  syncDescriptors()
  flushPendingCapture()
  chrome.alarms.create('sync', { periodInMinutes: 30 })
})

// SW woke on browser start — flush any capture left pending from a prior session.
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => flushPendingCapture())

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'sync') {
    syncDescriptors()
    flushPendingCapture() // retry a capture whose store failed transiently
  }
})

// Primary backstop: when the content script writes pendingCapture synchronously
// during the login (even as the page unloads), this wakes the SW to flush it,
// independent of whether the captureResult message was delivered.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pendingCapture && changes.pendingCapture.newValue) {
    flushPendingCapture()
  }
})
