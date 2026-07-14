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
    const state = document.createElement('span')
    state.textContent = a.has_credential ? 'ready' : 'no credential'
    state.className = a.has_credential ? 'ok' : 'warn'
    li.append(name, state)
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

document.getElementById('opts').addEventListener('click', (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})

// --- E4 capture ---
document.getElementById('capture').addEventListener('click', async () => {
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
