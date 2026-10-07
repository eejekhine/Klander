import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

const FN = name => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`

/** Calendar links you've added (uni timetable, Google, Outlook, iCloud…) and your own subscribe link. */
export function useCalendarSources(uid, onEventsChanged) {
  const [sources, setSources] = useState([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('calendar_sources').select('*').eq('user_id', uid).order('created_at')
    setSources(data || []); setLoaded(true)
  }, [uid])
  useEffect(() => { load() }, [load])

  const sync = async id => {
    const { data, error } = await supabase.functions.invoke('import-ics', { body: { source_id: id } })
    await load()
    await onEventsChanged?.()
    if (error) {
      let msg = error.message
      try { msg = (await error.context.json()).error || msg } catch { /* keep */ }
      throw new Error(msg)
    }
    return data
  }

  const add = async ({ name, url, category_id, visibility }) => {
    const clean = url.trim()
    if (!/^(https?|webcal):\/\//i.test(clean)) throw new Error('Paste the full link. It should start with https:// or webcal://')
    const { data, error } = await supabase.from('calendar_sources')
      .insert({ user_id: uid, name: name.trim() || 'Calendar', url: clean, category_id: category_id || null, visibility })
      .select().single()
    if (error) throw new Error(error.message)
    await load()
    return sync(data.id)
  }

  const update = async (id, patch) => {
    const { error } = await supabase.from('calendar_sources').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    // apply the new colour/privacy to events already imported
    const evPatch = {}
    if ('category_id' in patch) evPatch.category_id = patch.category_id
    if ('visibility' in patch) evPatch.visibility = patch.visibility
    if (Object.keys(evPatch).length) await supabase.from('events').update(evPatch).eq('source_id', id)
    await load(); await onEventsChanged?.()
  }

  const remove = async id => {
    const { error } = await supabase.from('calendar_sources').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await load(); await onEventsChanged?.()
  }

  return { sources, loaded, load, add, sync, update, remove }
}

export async function getFeedLinks(reset = false) {
  const { data, error } = await supabase.rpc('my_feed_token', { reset })
  if (error) throw new Error(error.message)
  const https = `${FN('feed')}?token=${data}`
  const webcal = https.replace(/^https:/, 'webcal:')
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent('Klander')}`
  }
}

export function ago(iso) {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}
