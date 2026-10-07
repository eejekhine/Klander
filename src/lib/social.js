import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

const fail = error => { if (error) throw new Error(/Failed to fetch/i.test(error.message) ? "You're offline. Try again when you're back online." : error.message) }

/** Close friends, your friend groups, and time polls. */
export function useSocial(uid) {
  const [close, setClose] = useState([])
  const [groups, setGroups] = useState([])
  const [polls, setPolls] = useState([]) // [{...poll, options:[{...opt, votes:[]}], invitees:[ids]}]

  const refresh = useCallback(async () => {
    const [c, g, p, o, i, v] = await Promise.all([
      supabase.from('close_friends').select('friend_id'),
      supabase.from('friend_groups').select('id, name, members, sort').order('sort').order('created_at'),
      supabase.from('polls').select('id, owner_id, title, location, note, decided_option, event_id, created_at').order('created_at', { ascending: false }).limit(30),
      supabase.from('poll_options').select('id, poll_id, starts_at, ends_at').order('starts_at'),
      supabase.from('poll_invitees').select('poll_id, user_id'),
      supabase.from('poll_votes').select('option_id, user_id, vote')
    ])
    if (!c.error) setClose((c.data || []).map(r => r.friend_id))
    if (!g.error) setGroups(g.data || [])
    if (!p.error) {
      const opts = o.data || [], inv = i.data || [], votes = v.data || []
      setPolls((p.data || []).map(poll => ({
        ...poll,
        invitees: inv.filter(x => x.poll_id === poll.id).map(x => x.user_id),
        options: opts.filter(x => x.poll_id === poll.id).map(x => ({ ...x, votes: votes.filter(y => y.option_id === x.id) }))
      })))
    }
  }, [])

  useEffect(() => {
    let t = null
    const soon = () => { clearTimeout(t); t = setTimeout(refresh, 400) }
    const ch = supabase.channel(`klander-social-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, soon)
      .subscribe()
    refresh()
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(t); supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [uid, refresh])

  const toggleClose = async id => {
    const on = close.includes(id)
    setClose(list => (on ? list.filter(x => x !== id) : [...list, id]))
    const { error } = on
      ? await supabase.from('close_friends').delete().eq('user_id', uid).eq('friend_id', id)
      : await supabase.from('close_friends').insert({ user_id: uid, friend_id: id })
    if (error) { await refresh(); fail(error) }
  }

  const saveGroup = async ({ id, name, members }) => {
    const row = { owner_id: uid, name: name.trim(), members }
    const { error } = id ? await supabase.from('friend_groups').update(row).eq('id', id) : await supabase.from('friend_groups').insert({ ...row, sort: groups.length })
    fail(error); await refresh()
  }
  const deleteGroup = async id => { const { error } = await supabase.from('friend_groups').delete().eq('id', id); fail(error); await refresh() }

  /** options: [{ start, end }] */
  const createPoll = async ({ title, location, note, options, invitees }) => {
    const { data: poll, error } = await supabase.from('polls').insert({ owner_id: uid, title: title.trim(), location: location || null, note: note || null }).select('id').single()
    fail(error)
    const r1 = await supabase.from('poll_options').insert(options.map(o => ({ poll_id: poll.id, starts_at: o.start.toISOString(), ends_at: o.end.toISOString() })))
    fail(r1.error)
    const r2 = await supabase.from('poll_invitees').insert(invitees.map(user_id => ({ poll_id: poll.id, user_id })))
    fail(r2.error)
    await refresh()
    return poll.id
  }
  const vote = async (optionId, value) => {
    setPolls(ps => ps.map(p => ({ ...p, options: p.options.map(o => o.id !== optionId ? o : { ...o, votes: [...o.votes.filter(v => v.user_id !== uid), ...(value ? [{ option_id: optionId, user_id: uid, vote: value }] : [])] }) })))
    const { error } = value
      ? await supabase.from('poll_votes').upsert({ option_id: optionId, user_id: uid, vote: value, updated_at: new Date().toISOString() })
      : await supabase.from('poll_votes').delete().eq('option_id', optionId).eq('user_id', uid)
    if (error) { await refresh(); fail(error) }
  }
  const markDecided = async (pollId, optionId, eventId) => {
    const { error } = await supabase.from('polls').update({ decided_option: optionId, event_id: eventId }).eq('id', pollId)
    fail(error); await refresh()
  }
  const deletePoll = async id => { const { error } = await supabase.from('polls').delete().eq('id', id); fail(error); await refresh() }

  return { close, groups, polls, refresh, toggleClose, saveGroup, deleteGroup, createPoll, vote, markDecided, deletePoll }
}

/** Score an option: yes = 2, maybe = 1. */
export const tally = o => {
  const yes = o.votes.filter(v => v.vote === 'yes').length, maybe = o.votes.filter(v => v.vote === 'maybe').length, no = o.votes.filter(v => v.vote === 'no').length
  return { yes, maybe, no, score: yes * 2 + maybe }
}

/** Friends you haven't made a plan with recently. plansWith: { friendId: lastDate } */
export function catchUps(friends, plansWith, { days = 21, now = new Date() } = {}) {
  const cutoff = now.getTime() - days * 864e5
  return friends
    .filter(({ link, person }) => new Date(link.created_at).getTime() < cutoff && !(plansWith[person.id] > cutoff))
    .map(({ person }) => ({ person, last: plansWith[person.id] || null }))
    .sort((a, b) => (a.last || 0) - (b.last || 0))
}
