// Service worker: the only component that talks to MXID. It reuses the user's
// portal session cookie (Option A — see docs/FORM-FILL-EXTENSION-AUTH-DESIGN.md),
// so `credentials: 'include'` carries mxid_portal_sid. That requires the portal
// cookie to be SameSite=None (MXID's MXID_SESSION_CROSS_SITE_COOKIES=true) and
// HTTPS — on a plain-http dev stack the cookie won't ride the cross-site fetch.

import { API, getBaseUrl } from './config.js'

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

async function getCredential(appId) {
  const base = await getBaseUrl()
  let res
  try {
    res = await fetch(base + API.reveal(appId), { credentials: 'include' })
  } catch (e) {
    return { error: 'network', detail: String(e) }
  }
  if (res.ok) {
    const body = await res.json().catch(() => ({}))
    return { credential: body.data }
  }
  const body = await res.json().catch(() => ({}))
  // 40133 = step_up_required, 40136 = not authorized for app, 401 = no session.
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
      case 'getCredential':
        sendResponse(await getCredential(msg.appId))
        break
      case 'openPortal': {
        const base = await getBaseUrl()
        chrome.tabs.create({ url: base + API.portal })
        sendResponse({ ok: true })
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
  chrome.alarms.create('sync', { periodInMinutes: 30 })
})

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'sync') syncDescriptors()
})
