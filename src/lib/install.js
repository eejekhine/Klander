import { useEffect, useState } from 'react'

// Chrome/Edge/Samsung on Android and desktop fire this when Klander can be installed in one tap.
let deferred = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; listeners.forEach(f => f()) })
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('klander:installed', '1') } catch { /* ignore */ } listeners.forEach(f => f()) })
}

/** Running from the Home Screen (or as an installed app)? */
export function isInstalled() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || navigator.standalone === true
}

/** Which instructions to show: 'iphone' | 'iphone-other' | 'android' | 'computer' */
export function platform() {
  const ua = navigator.userAgent || ''
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'iphone-other' : 'iphone'
  if (/Android/.test(ua)) return 'android'
  return 'computer'
}

export const isMobile = () => ['iphone', 'iphone-other', 'android'].includes(platform())

/** { canPrompt, prompt() } for the one-tap install button. */
export function useInstallPrompt() {
  const [, bump] = useState(0)
  useEffect(() => { const f = () => bump(n => n + 1); listeners.add(f); return () => listeners.delete(f) }, [])
  return {
    canPrompt: !!deferred,
    prompt: async () => {
      if (!deferred) return 'unavailable'
      const e = deferred
      deferred = null
      e.prompt()
      const { outcome } = await e.userChoice
      listeners.forEach(f => f())
      return outcome // 'accepted' | 'dismissed'
    }
  }
}

export const INSTALL_CARD_KEY = 'klander:install-card'
