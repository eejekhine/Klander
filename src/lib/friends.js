import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const cacheKey = uid => `klander:friends:${uid}`
const readCache = uid => { try { return JSON.parse(localStorage.getItem(cacheKey(uid))) || {} } catch { return {} } }
const writeCache = (uid, d) => { try { localStorage.setItem(cacheKey(uid), JSON.stringify(d)) } catch { /* ignore */ } }
const hiddenKey = uid => `klander:hidden:${uid}`

/** Friend requests, friends' profiles and friends' events (privacy already applied by the server). */
export function useFriends(uid) {
  const cached = useMemo(() => readCache(uid), [uid])
  const [links, setLinks] = useState(cached.links || [])
  const [people, setPeople] = useState(cached.people || {})
  const [friendEvents, setFriendEvents] = useState(cached.friendEvents || [])
  const [activity, setActivity] = useState(cached.activity || [])
  const [hidden, setHidden] = useState(() => { try { return JSON.parse(localStorage.getItem(hiddenKey(uid))) || [] } catch { return [] } })

  useEffect(() => { writeCache(uid, { links, people, friendEvents, activity }) }, [uid, links, people, friendEvents, activity])
  useEffect(() => { try { localStorage.setItem(hiddenKey(uid), JSON.stringify(hidden)) } catch { /* ignore */ } }, [uid, hidden])

  const refresh = useCallback(async () => {
    const { data: rows, error } = await supabase.from('friendships').select('id, requester, addressee, status, created_at')
    if (error) return
    const others = [...new Set(rows.map(r => (r.requester === uid ? r.addressee : r.requester)))]
    let profs = []
    if (others.length) {
      const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url, colour, theme_config, status_text, status_until').in('id', others)
      profs = data || []
    }
    const [{ data: evs }, { data: acts }] = await Promise.all([
      supabase.rpc('friend_events'),
      supabase.from('activity').select('id, actor, verb, title, starts_at, created_at').order('created_at', { ascending: false }).limit(40)
    ])
    setLinks(rows)
    setActivity(acts || [])
    setPeople(Object.fromEntries(profs.map(p => [p.id, p])))
    setFriendEvents(evs || [])
  }, [uid])

  // Live updates: friends' changes and friend requests arrive straight away
  useEffect(() => {
    let timer = null
    const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 400) }
    const channel = supabase.channel(`klander-live-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, soon)
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(channel) }
  }, [uid, refresh])

  useEffect(() => {
    refresh()
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), 60000)
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', refresh)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', refresh) }
  }, [refresh])

  const other = r => people[r.requester === uid ? r.addressee : r.requester]
  const friends = links.filter(r => r.status === 'accepted').map(r => ({ link: r, person: other(r) })).filter(x => x.person)
  const incoming = links.filter(r => r.status === 'pending' && r.addressee === uid).map(r => ({ link: r, person: other(r) })).filter(x => x.person)
  const outgoing = links.filter(r => r.status === 'pending' && r.requester === uid).map(r => ({ link: r, person: other(r) })).filter(x => x.person)

  const sendRequest = async username => {
    const { data, error } = await supabase.rpc('send_friend_request', { target_username: username.replace(/^@/, '').trim() })
    if (error) throw new Error(error.message)
    await refresh()
    return data
  }
  const accept = async id => {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id)
    if (error) throw new Error(error.message)
    await refresh()
  }
  const remove = async id => {
    const { error } = await supabase.from('friendships').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await refresh()
  }
  const inviteCode = async () => {
    const { data, error } = await supabase.rpc('my_invite_code')
    if (error) throw new Error(error.message)
    return data
  }
  const acceptInvite = async code => {
    const { data, error } = await supabase.rpc('accept_invite', { invite: code })
    if (error) throw new Error(error.message)
    await refresh()
    return data
  }
  const toggleHidden = id => setHidden(h => (h.includes(id) ? h.filter(x => x !== id) : [...h, id]))

  // Show just one person (everyone else hidden, including you); calling it again shows everyone.
  const showOnly = id => setHidden(h => {
    const all = [uid, ...friends.map(x => x.person.id)]
    const already = all.every(x => x === id ? !h.includes(x) : h.includes(x))
    return already ? [] : all.filter(x => x !== id)
  })
  return { activity, friends, incoming, outgoing, people, friendEvents, hidden, toggleHidden, showOnly, refresh, sendRequest, accept, remove, inviteCode, acceptInvite }
}

/* ---------- invite links: ?invite=CODE is remembered until the person is signed in ---------- */
const INVITE_KEY = 'klander:invite'
export function captureInviteFromUrl() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('invite')
  if (!code) return
  try { localStorage.setItem(INVITE_KEY, code) } catch { /* ignore */ }
  url.searchParams.delete('invite')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}
export const pendingInvite = () => { try { return localStorage.getItem(INVITE_KEY) } catch { return null } }
export const clearInvite = () => { try { localStorage.removeItem(INVITE_KEY) } catch { /* ignore */ } }
