import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/* Tiny offline cache: last-known profile/categories/events per user in localStorage. */
const cacheKey = uid => `klander:${uid}`
const readCache = uid => { try { return JSON.parse(localStorage.getItem(cacheKey(uid))) || {} } catch { return {} } }
const writeCache = (uid, data) => { try { localStorage.setItem(cacheKey(uid), JSON.stringify(data)) } catch { /* storage full or blocked */ } }

export function useKlanderData(user) {
  const uid = user?.id
  const cached = useRef(uid ? readCache(uid) : {})
  const [profile, setProfile] = useState(cached.current.profile || null)
  const [categories, setCategories] = useState(cached.current.categories || [])
  const [events, setEvents] = useState(cached.current.events || [])
  const [loading, setLoading] = useState(!cached.current.profile)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (uid) writeCache(uid, { profile, categories, events })
  }, [uid, profile, categories, events])

  const refresh = useCallback(async () => {
    if (!uid) return
    const [p, c, e] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('categories').select('*').eq('user_id', uid).order('sort'),
      supabase.from('events').select('*').eq('owner_id', uid).order('starts_at')
    ])
    const err = p.error || c.error || e.error
    if (err) { setError(err.message); setLoading(false); return }
    setProfile(p.data); setCategories(c.data); setEvents(e.data); setError(null); setLoading(false)
  }, [uid])

  useEffect(() => {
    refresh()
    const onFocus = () => document.visibilityState === 'visible' && refresh()
    const up = () => { setOnline(true); refresh() }
    const down = () => setOnline(false)
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [refresh])

  /* ---------- profile ---------- */
  const updateProfile = async patch => {
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', uid).select().single()
    if (error) throw friendly(error)
    setProfile(data)
    return data
  }

  const uploadAvatar = async file => {
    const blob = await resizeImage(file, 320)
    const path = `${uid}/avatar-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
    if (error) throw friendly(error)
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return updateProfile({ avatar_url: data.publicUrl })
  }

  /* ---------- categories ---------- */
  const saveCategory = async cat => {
    const row = { name: cat.name, colour: cat.colour, sort: cat.sort ?? categories.length, user_id: uid }
    const q = cat.id
      ? supabase.from('categories').update(row).eq('id', cat.id).select().single()
      : supabase.from('categories').insert(row).select().single()
    const { data, error } = await q
    if (error) throw friendly(error)
    setCategories(cs => cat.id ? cs.map(c => c.id === data.id ? data : c) : [...cs, data])
  }
  const deleteCategory = async id => {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw friendly(error)
    setCategories(cs => cs.filter(c => c.id !== id))
    setEvents(es => es.map(e => e.category_id === id ? { ...e, category_id: null } : e))
  }

  /* ---------- events ---------- */
  const saveEvent = async ev => {
    const row = {
      owner_id: uid, title: ev.title.trim(), notes: ev.notes || null, location: ev.location || null,
      starts_at: ev.starts_at, ends_at: ev.ends_at, all_day: ev.all_day, category_id: ev.category_id || null,
      visibility: ev.visibility, rrule: ev.rrule || null, exdates: ev.exdates || []
    }
    if (!ev.id) row.source = ev.source || 'manual'
    const q = ev.id
      ? supabase.from('events').update(row).eq('id', ev.id).select().single()
      : supabase.from('events').insert(row).select().single()
    const { data, error } = await q
    if (error) throw friendly(error)
    setEvents(es => (ev.id ? es.map(e => e.id === data.id ? data : e) : [...es, data]))
    return data
  }
  const deleteEvent = async id => {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) throw friendly(error)
    setEvents(es => es.filter(e => e.id !== id))
  }
  /** Skip a single occurrence of a repeating event. */
  const skipOccurrence = async (ev, occurrence) => {
    const base = events.find(e => e.id === ev.id)
    const exdates = [...(base.exdates || []), occurrence.toISOString()]
    const { data, error } = await supabase.from('events').update({ exdates }).eq('id', ev.id).select().single()
    if (error) throw friendly(error)
    setEvents(es => es.map(e => e.id === data.id ? data : e))
  }

  return {
    profile, categories, events, loading, online, error, refresh,
    updateProfile, uploadAvatar, saveCategory, deleteCategory, saveEvent, deleteEvent, skipOccurrence
  }
}

function friendly(error) {
  const m = error?.message || 'Something went wrong'
  if (/duplicate key.*username/i.test(m)) return new Error('That username is taken. Try another.')
  if (/username_check/i.test(m)) return new Error('Usernames are 3–20 letters, numbers or underscores.')
  if (/Failed to fetch|NetworkError/i.test(m)) return new Error("You're offline. Reconnect and try again.")
  return new Error(m)
}

function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.85)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('Could not read that image. Try a JPG or PNG.'))
    img.src = URL.createObjectURL(file)
  })
}
