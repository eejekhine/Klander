import { useCallback, useEffect, useState } from 'react'
import { addDays, startOfWeek } from 'date-fns'
import { supabase } from './supabase'
import { shrinkPhoto } from './chat'
import { WEEK_OPTS } from './dates'

const fail = error => { if (error) throw new Error(/Failed to fetch/i.test(error.message) ? "You're offline. Try again when you're back online." : error.message) }

/* ---------- signed URLs, cached for the session ---------- */
const urlCache = {}
export async function photoUrls(paths) {
  const need = [...new Set(paths)].filter(p => p && !urlCache[p])
  if (need.length) {
    const { data } = await supabase.storage.from('memories').createSignedUrls(need, 3600)
    for (const d of data || []) if (d.signedUrl) urlCache[d.path] = d.signedUrl
  }
  return Object.fromEntries(paths.map(p => [p, urlCache[p]]))
}

/** Photos on one event (yours, and anyone else's who was there). */
export function useEventPhotos(eventId) {
  const [photos, setPhotos] = useState([])
  const [urls, setUrls] = useState({})
  const load = useCallback(async () => {
    if (!eventId) return
    const { data } = await supabase.from('event_photos').select('id, event_id, user_id, path, caption, taken_at').eq('event_id', eventId).order('taken_at')
    setPhotos(data || [])
    setUrls(await photoUrls((data || []).map(p => p.path)))
  }, [eventId])
  useEffect(() => { load() }, [load])
  return { photos, urls, reload: load }
}

/** Shrink, upload and attach a photo to an event. taken_at defaults to now (or the occurrence you're looking at). */
export async function addEventPhoto(uid, eventId, file, takenAt) {
  const blob = await shrinkPhoto(file, 1400)
  const path = `${eventId}/${crypto.randomUUID()}.jpg`
  const up = await supabase.storage.from('memories').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  fail(up.error)
  const { data, error } = await supabase.from('event_photos').insert({ event_id: eventId, user_id: uid, path, taken_at: (takenAt || new Date()).toISOString() }).select().single()
  if (error) { await supabase.storage.from('memories').remove([path]); fail(error) }
  return data
}
export async function deleteEventPhoto(photo) {
  const { error } = await supabase.from('event_photos').delete().eq('id', photo.id)
  fail(error)
  await supabase.storage.from('memories').remove([photo.path]) // only works for your own; the daily cleanup catches the rest
}

export const weekStartOf = d => startOfWeek(d, WEEK_OPTS)
export const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Photos you can see that were taken in a date range (your own + events you were at). */
export async function photosBetween(from, to) {
  const { data } = await supabase.from('event_photos').select('id, event_id, user_id, path, caption, taken_at')
    .gte('taken_at', from.toISOString()).lt('taken_at', to.toISOString()).order('taken_at')
  return data || []
}

/** My Week posts: yours and friends' (recent). */
export function useWeeks(uid) {
  const [weeks, setWeeks] = useState([])
  const [reactions, setReactions] = useState([])
  const refresh = useCallback(async () => {
    const since = isoDay(addDays(weekStartOf(new Date()), -21))
    const { data } = await supabase.from('week_recaps').select('id, user_id, week_start, slides, caption, visibility, posted_at, updated_at').gte('week_start', since).order('week_start', { ascending: false })
    setWeeks(data || [])
    const ids = (data || []).map(w => w.id)
    if (ids.length) {
      const { data: r } = await supabase.from('week_reactions').select('recap_id, user_id, emoji').in('recap_id', ids)
      setReactions(r || [])
    }
  }, [])
  useEffect(() => {
    refresh()
    const ch = supabase.channel(`klander-weeks-${uid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'week_recaps' }, () => refresh()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [uid, refresh])

  const save = async ({ week_start, slides, caption, visibility, post }) => {
    const row = { user_id: uid, week_start, slides, caption: caption || null, visibility, updated_at: new Date().toISOString() }
    if (post) row.posted_at = new Date().toISOString()
    const { error } = await supabase.from('week_recaps').upsert(row, { onConflict: 'user_id,week_start' })
    fail(error); await refresh()
  }
  const unpost = async id => { const { error } = await supabase.from('week_recaps').update({ posted_at: null }).eq('id', id); fail(error); await refresh() }
  const react = async (recapId, emoji) => {
    const mine = reactions.find(r => r.recap_id === recapId && r.user_id === uid)
    setReactions(r => [...r.filter(x => !(x.recap_id === recapId && x.user_id === uid)), ...(mine?.emoji === emoji ? [] : [{ recap_id: recapId, user_id: uid, emoji }])])
    const { error } = mine?.emoji === emoji
      ? await supabase.from('week_reactions').delete().eq('recap_id', recapId).eq('user_id', uid)
      : await supabase.from('week_reactions').upsert({ recap_id: recapId, user_id: uid, emoji })
    if (error) refresh()
  }
  return { weeks, reactions, refresh, save, unpost, react }
}

/** "One year ago" photos for today. */
export async function onThisDay(today = new Date()) {
  const s = new Date(today); s.setFullYear(s.getFullYear() - 1); s.setHours(0, 0, 0, 0)
  return photosBetween(s, addDays(s, 1))
}
