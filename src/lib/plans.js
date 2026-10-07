import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Plans you're invited to, guests on your own events, friends' "up for something" posts and free/busy times. */
export function usePlans(uid) {
  const [invites, setInvites] = useState([]) // my_invites() rows
  const [guests, setGuests] = useState([]) // event_invites rows for my events
  const [broadcasts, setBroadcasts] = useState([])
  const [replies, setReplies] = useState([])
  const [busy, setBusy] = useState([]) // friend_busy() rows

  const refresh = useCallback(async () => {
    const nowIso = new Date().toISOString()
    const [inv, gst, bc, rp, fb] = await Promise.all([
      supabase.rpc('my_invites'),
      supabase.from('event_invites').select('event_id, user_id, status, responded_at').neq('user_id', uid),
      supabase.from('broadcasts').select('id, user_id, message, starts_at, ends_at, created_at').gt('ends_at', nowIso).order('created_at', { ascending: false }),
      supabase.from('broadcast_replies').select('broadcast_id, user_id, reply, created_at'),
      supabase.rpc('friend_busy')
    ])
    if (!inv.error) setInvites(inv.data || [])
    if (!gst.error) setGuests(gst.data || [])
    if (!bc.error) setBroadcasts(bc.data || [])
    if (!rp.error) setReplies(rp.data || [])
    if (!fb.error) setBusy(fb.data || [])
  }, [uid])

  useEffect(() => {
    let timer = null
    const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 400) }
    const ch = supabase.channel(`klander-plans-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_invites' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcasts' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcast_replies' }, soon)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, soon)
      .subscribe()
    refresh()
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), 60000)
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(timer); clearInterval(t); document.removeEventListener('visibilitychange', onVis); supabase.removeChannel(ch) }
  }, [uid, refresh])

  const fail = error => { if (error) throw new Error(/Failed to fetch/i.test(error.message) ? "You're offline. Try again when you're back online." : error.message) }

  /** Make the guest list of one of my events match `ids`. */
  const setInvitees = async (eventId, ids) => {
    const current = guests.filter(g => g.event_id === eventId).map(g => g.user_id)
    const add = ids.filter(id => !current.includes(id)), drop = current.filter(id => !ids.includes(id))
    if (add.length) { const { error } = await supabase.from('event_invites').insert(add.map(user_id => ({ event_id: eventId, user_id }))); fail(error) }
    if (drop.length) { const { error } = await supabase.from('event_invites').delete().eq('event_id', eventId).in('user_id', drop); fail(error) }
    if (add.length || drop.length) await refresh()
  }
  const respond = async (eventId, status) => {
    setInvites(list => list.map(i => i.id === eventId ? { ...i, my_status: status } : i))
    const { error } = await supabase.from('event_invites').update({ status, responded_at: new Date().toISOString() }).eq('event_id', eventId).eq('user_id', uid)
    if (error) { await refresh(); fail(error) }
  }
  const postBroadcast = async (message, starts_at, ends_at) => {
    const { error } = await supabase.from('broadcasts').insert({ user_id: uid, message: message.trim(), starts_at: starts_at.toISOString(), ends_at: ends_at.toISOString() })
    fail(error); await refresh()
  }
  const endBroadcast = async id => { const { error } = await supabase.from('broadcasts').delete().eq('id', id); fail(error); await refresh() }
  const reply = async (broadcastId, value) => {
    const { error } = value
      ? await supabase.from('broadcast_replies').upsert({ broadcast_id: broadcastId, user_id: uid, reply: value })
      : await supabase.from('broadcast_replies').delete().eq('broadcast_id', broadcastId).eq('user_id', uid)
    fail(error); await refresh()
  }

  return { invites, guests, broadcasts, replies, busy, refresh, setInvitees, respond, postBroadcast, endBroadcast, reply }
}

export const RSVP = [['going', 'Going'], ['maybe', 'Maybe'], ['declined', "Can't"]]
export const statusLabel = s => ({ invited: 'Invited', going: 'Going', maybe: 'Maybe', declined: "Can't make it" }[s] || s)
