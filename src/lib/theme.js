const KEY = 'klander:theme'

/** 'system' | 'light' | 'dark'. Saved locally so the right theme shows before login loads. */
export function applyTheme(theme) {
  let t = theme
  if (!t) { try { t = localStorage.getItem(KEY) || 'system' } catch { t = 'system' } }
  else { try { localStorage.setItem(KEY, t) } catch { /* ignore */ } }
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f111a' : '#f3f4f8')
}
