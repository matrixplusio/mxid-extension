// Popup: show synced form apps + a manual Sync button. Not a module.

const statusEl = document.getElementById('status')
const appsEl = document.getElementById('apps')
const baseEl = document.getElementById('base')

async function render() {
  const { descriptors, syncedAt } = await chrome.storage.local.get(['descriptors', 'syncedAt'])
  const { mxidBaseUrl } = await chrome.storage.sync.get('mxidBaseUrl')
  baseEl.textContent = (mxidBaseUrl || 'localhost:3500').replace(/^https?:\/\//, '')
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

render()
