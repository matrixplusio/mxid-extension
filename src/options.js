const input = document.getElementById('base')
const saved = document.getElementById('saved')

chrome.storage.sync.get('mxidBaseUrl').then(({ mxidBaseUrl }) => {
  input.value = mxidBaseUrl || 'http://localhost:3500'
})

document.getElementById('save').addEventListener('click', async () => {
  const url = input.value.trim().replace(/\/+$/, '')
  await chrome.storage.sync.set({ mxidBaseUrl: url })
  saved.textContent = 'Saved'
  setTimeout(() => (saved.textContent = ''), 1500)
})
