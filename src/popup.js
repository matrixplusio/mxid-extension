// Popup: show synced form apps + a manual Sync button. Not a module.

const statusEl = document.getElementById('status')
const appsEl = document.getElementById('apps')
const baseEl = document.getElementById('base')

async function render() {
  const { descriptors, syncedAt } = await chrome.storage.local.get(['descriptors', 'syncedAt'])
  // Ask the SW for the resolved base (managed policy → Options → default) so a
  // managed fleet shows its real URL, not a blank.
  const r = await chrome.runtime.sendMessage({ type: 'getBaseUrl' }).catch(() => null)
  const base = (r && r.base) || ''
  baseEl.textContent = base ? base.replace(/^https?:\/\//, '') : 'not configured — open Options'
  const apps = descriptors || []
  appsEl.innerHTML = ''
  for (const a of apps) {
    const li = document.createElement('li')
    const name = document.createElement('span')
    name.textContent = a.name || a.code
    const right = document.createElement('span')
    right.style.cssText = 'display:flex;gap:8px;align-items:center'
    const state = document.createElement('span')
    // "configured" = the app already has selectors; without them the fill gate
    // has nothing to match, so surface it instead of a silent no-op.
    const configured = !!a.username_selector
    state.textContent = !configured ? 'not configured' : a.has_credential ? 'ready' : 'no credential'
    state.className = configured && a.has_credential ? 'ok' : 'warn'
    const rec = document.createElement('button')
    rec.textContent = 'Record'
    rec.title = 'Record a login on the current tab to configure + store the credential for this app'
    rec.addEventListener('click', () => startCaptureFor(a.app_id))
    right.append(state, rec)
    li.append(name, right)
    appsEl.appendChild(li)
  }
  if (!apps.length) statusEl.textContent = 'No form apps synced yet.'
  else statusEl.innerHTML = `<span class="ok">${apps.length}</span> app(s) · synced ${syncedAt ? timeAgo(syncedAt) : 'never'}`
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return s + 's ago'
  if (s < 3600) return Math.round(s / 60) + 'm ago'
  return Math.round(s / 3600) + 'h ago'
}

document.getElementById('sync').addEventListener('click', async () => {
  statusEl.textContent = 'Syncing…'
  const res = await chrome.runtime.sendMessage({ type: 'sync' })
  if (res?.error === 'not_logged_in') statusEl.innerHTML = '<span class="warn">Sign in to MXID first.</span>'
  else if (res?.error) statusEl.innerHTML = `<span class="warn">Sync failed: ${res.error}</span>`
  else render()
})

// Connect: pair this extension install (step-up gated). Recording a descriptor
// or revealing a credential needs the binding token this mints. Without a
// configured app to trigger the in-page "Connect" banner, this is the only way to
// pair — so it lives in the popup too.
document.getElementById('connect').addEventListener('click', async () => {
  statusEl.textContent = 'Connecting…'
  const r = await chrome.runtime.sendMessage({ type: 'pair' })
  if (r?.ok) {
    statusEl.innerHTML = '<span class="ok">Connected — this browser is paired.</span>'
    return
  }
  if (r?.error === 'step_up' || r?.error === 'not_logged_in') {
    // Send the user to the portal to authenticate / clear MFA, then retry Connect.
    await chrome.runtime.sendMessage({ type: 'openPortal' })
    statusEl.innerHTML =
      '<span class="warn">Verify your identity (MFA) in the tab that opened, then click Connect again.</span>'
    return
  }
  statusEl.innerHTML = `<span class="warn">Connect failed: ${r?.error || 'unknown'}</span>`
})

document.getElementById('opts').addEventListener('click', (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})

// --- E4 capture ---

// startCaptureFor binds the recording to a specific app id. Unlike the generic
// "Record login" button (which origin-matches an already-configured app afterward),
// this lets the capture CONFIGURE an app that has no login_url/selectors yet —
// the descriptor push is keyed by this id, breaking the chicken-and-egg where you
// can't origin-match an app that has never been configured.
async function startCaptureFor(appId) {
  await chrome.storage.local.set({ captureTargetAppId: appId })
  await chrome.runtime.sendMessage({ type: 'startCapture' })
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) chrome.tabs.reload(tab.id)
  window.close()
}

document.getElementById('capture').addEventListener('click', async () => {
  // Generic record: no explicit target, credential is origin-matched to a
  // configured app afterward. Clear any stale target from a prior per-app record.
  await chrome.storage.local.remove('captureTargetAppId')
  await chrome.runtime.sendMessage({ type: 'startCapture' })
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) chrome.tabs.reload(tab.id) // content script re-runs in capture mode
  window.close()
})

document.getElementById('copycap').addEventListener('click', () => {
  const ta = document.getElementById('capjson')
  ta.select()
  navigator.clipboard.writeText(ta.value)
})

async function showCapture() {
  const { lastCapture } = await chrome.storage.local.get('lastCapture')
  if (lastCapture) {
    document.getElementById('captured').style.display = 'block'
    // merge with a default credential_mode so it drops straight into protocol_config
    document.getElementById('capjson').value = JSON.stringify(
      { credential_mode: 'per_user', ...lastCapture },
      null,
      2,
    )
  }
}

render()
showCapture()
