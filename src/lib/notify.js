import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export const DEFAULT_SETTINGS = {
  friend_events: true, plans: true, broadcasts: true, requests: true, reminders: true, chat: true,
  default_reminder: 30, quiet_start: null, quiet_end: null, muted: []
}

const b64ToBytes = s => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

/** What this device can do: 'ok' | 'ios-browser' (needs Home Screen) | 'unsupported' */
export function pushSupport() {
  if (typeof window === 'undefined') return 'unsupported'
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
  if (ios && !standalone) return 'ios-browser'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

export function useNotifications(uid) {
  const [items, setItems] = useState([])
  const [settings, setSettings] = useState(null)
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'))

  const refresh = useCallback(async () => {
    const [{ data: n }, { data: s }] = await Promise.all([
      supabase.from('notifications').select('id, kind, actor, title, body, url, count, created_at, read_at').order('created_at', { ascending: false }).limit(60),
      supabase.from('notify_settings').select('*').eq('user_id', uid).maybeSingle()
    ])
    setItems((n || []).filter(x => x.kind !== 'test' || !x.read_at))
    setSettings({ ...DEFAULT_SETTINGS, ...(s || {}) })
  }, [uid])

  const checkSub = useCallback(async () => {
    if (pushSupport() !== 'ok') return setSubscribed(false)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setSubscribed(!!sub)
    } catch { setSubscribed(false) }
  }, [])

  useEffect(() => {
    refresh(); checkSub()
    const ch = supabase.channel(`klander-notify-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, refresh)
      .subscribe()
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [uid, refresh, checkSub])

  const unread = items.filter(i => !i.read_at).length

  const markAllRead = async () => {
    if (!unread) return
    const t = new Date().toISOString()
    setItems(list => list.map(i => (i.read_at ? i : { ...i, read_at: t })))
    try { navigator.clearAppBadge?.() } catch { /* ignore */ }
    await supabase.from('notifications').update({ read_at: t }).is('read_at', null).eq('user_id', uid)
  }

  const saveSettings = async patch => {
    const next = { ...settings, ...patch }
    setSettings(next)
    const { user_id: _u, updated_at: _t, ...row } = next
    const { error } = await supabase.from('notify_settings').upsert({ ...row, user_id: uid, updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
  }

  /** Ask permission, subscribe this device and save it. */
  const enable = async () => {
    const support = pushSupport()
    if (support === 'ios-browser') throw new Error('On iPhone, add Klander to your Home Screen first (Share → Add to Home Screen), then open it from there.')
    if (support !== 'ok') throw new Error("This browser can't do notifications.")
    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked. Turn them on for Klander in your phone Settings → Notifications.' : 'Notifications were not allowed.')
    const { data: key, error: kErr } = await supabase.rpc('vapid_public_key')
    if (kErr || !key) throw new Error("Notifications aren't set up on the server yet. Try again in a minute.")
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) })
    const j = sub.toJSON()
    const device = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Browser'
    const { error } = await supabase.from('push_subscriptions').upsert({ user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device }, { onConflict: 'endpoint' })
    if (error) throw new Error(error.message)
    if (!settings?.user_id) await saveSettings({})
    setSubscribed(true)
  }

  const disable = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
    } finally { setSubscribed(false) }
  }

  const sendTest = async () => {
    const { data, error } = await supabase.functions.invoke('push', { body: { test: true } })
    if (error) {
      let msg = "Couldn't send a test."
      try { msg = (await error.context.json()).error || msg } catch { /* keep */ }
      throw new Error(msg)
    }
    return data
  }

  return { items, unread, settings, subscribed, permission, refresh, markAllRead, saveSettings, enable, disable, sendTest }
}

export const REMINDERS = [[null, 'Off'], [0, 'At start'], [10, '10 min before'], [30, '30 min before'], [60, '1 hour before'], [1440, '1 day before']]
