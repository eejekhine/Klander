import { createClient } from '@supabase/supabase-js'

// Some phones (private browsing, storage blocked or full, some in-app browsers) silently refuse to keep
// data in localStorage. Supabase keeps your sign-in there, so on those phones every request went out
// "signed out" and the account couldn't load. This keeps a copy in memory as well, so the session
// always works for as long as the app is open, and is saved properly wherever the phone allows it.
const memory = new Map()
const safeStorage = {
  getItem(key) {
    let v = null
    try { v = window.localStorage.getItem(key) } catch { /* blocked */ }
    return v ?? memory.get(key) ?? null
  },
  setItem(key, value) {
    memory.set(key, value)
    try { window.localStorage.setItem(key, value) } catch { /* blocked or full: memory copy is used */ }
  },
  removeItem(key) {
    memory.delete(key)
    try { window.localStorage.removeItem(key) } catch { /* ignore */ }
  }
}

/** True when this device didn't keep the sign-in (it will last until the app is closed). */
export function sessionOnlyInMemory() {
  try {
    for (const k of memory.keys()) if (window.localStorage.getItem(k) === null) return true
  } catch { return memory.size > 0 }
  return false
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: safeStorage } }
)
