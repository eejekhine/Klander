import { applyThemeConfig, getTheme } from './themes'
const KEY = 'klander:theme'

/** Light/dark mode for the default look: 'system' | 'light' | 'dark'. Saved locally so it applies before login. */
export function applyTheme(mode) {
  let m = mode
  if (!m) { try { m = localStorage.getItem(KEY) || 'system' } catch { m = 'system' } }
  else { try { localStorage.setItem(KEY, m) } catch { /* ignore */ } }
  applyThemeConfig(getTheme(), m)
}
