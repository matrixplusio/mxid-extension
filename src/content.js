// Content script (runs on every page; NOT a module). On a page whose origin
// matches a known form app's login_url, it asks the service worker for the
// credential and auto-submits the login form.
//
// Security (see FORM-FILL-SSO-B0-SECURITY-SPEC.md §6): the script only acts when
// the CURRENT page origin equals the descriptor's login_url origin, and it only
// touches the descriptor's own selectors — it never posts credentials to an
// arbitrary URL.

(async function () {
  let descriptors
  try {
    descriptors = await chrome.runtime.sendMessage({ type: 'getDescriptors' })
  } catch {
    return // service worker asleep / not ready
  }
  if (!Array.isArray(descriptors) || descriptors.length === 0) return

  const match = descriptors.find(
    (d) => d.login_url && sameOrigin(d.login_url, location.href),
  )
  if (!match) return

  const userEl = match.username_selector && document.querySelector(match.username_selector)
  const passEl = match.password_selector && document.querySelector(match.password_selector)
  if (!userEl || !passEl) return // not the login form (or selectors stale)

  const resp = await chrome.runtime.sendMessage({ type: 'getCredential', appId: match.app_id })

  if (resp?.error === 'step_up') {
    banner('MXID: identity check (MFA) required to fill this login.', 'Verify', () =>
      chrome.runtime.sendMessage({ type: 'openPortal' }),
    )
    return
  }
  if (resp?.error === 'not_logged_in') {
    banner('MXID: sign in to MXID to auto-fill this login.', 'Sign in', () =>
      chrome.runtime.sendMessage({ type: 'openPortal' }),
    )
    return
  }
  if (resp?.error || !resp?.credential) {
    console.warn('[MXID form-fill]', resp?.error || 'no credential')
    return
  }

  fill(userEl, resp.credential.account)
  fill(passEl, resp.credential.credential)
  const submit = match.submit_selector && document.querySelector(match.submit_selector)
  if (submit) submit.click()
})()

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

// Fill a value and fire the events frameworks (React/Vue) listen for, so the
// controlled input actually registers the change before submit.
function fill(el, value) {
  el.focus()
  const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

// Minimal in-page prompt for the cases needing user action (step-up / sign-in).
function banner(text, actionLabel, onAction) {
  const bar = document.createElement('div')
  bar.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#111;color:#fff;' +
    'font:14px system-ui;padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:center'
  bar.textContent = text
  const btn = document.createElement('button')
  btn.textContent = actionLabel
  btn.style.cssText = 'background:#2563eb;color:#fff;border:0;border-radius:6px;padding:4px 12px;cursor:pointer'
  btn.onclick = () => { onAction(); bar.remove() }
  const close = document.createElement('button')
  close.textContent = '✕'
  close.style.cssText = 'background:transparent;color:#aaa;border:0;cursor:pointer'
  close.onclick = () => bar.remove()
  bar.append(btn, close)
  document.documentElement.appendChild(bar)
}
