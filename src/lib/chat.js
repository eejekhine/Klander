import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const fail = error => { if (error) throw new Error(/Failed to fetch/i.test(error.message) ? "You're offline. Try again when you're back online." : error.message) }
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🏀', '🎉']

/** Your chats (list + unread counts), blocks, and helpers to start chats. */
export function useChats(uid) {
  const [list, setList] = useState([])
  const [blocked, setBlocked] = useState([])
  const refresh = useCallback(async () => {
    const [{ data, error }, { data: b }] = await Promise.all([supabase.rpc('my_conversations'), supabase.from('blocks').select('blocked_id')])
    if (!error) setList(data || [])
    setBlocked((b || []).map(x => x.blocked_id))
  }, [])

  useEffect(() => {
    let t = null
    const soon = () => { clearTimeout(t); t = setTimeout(refresh, 300) }
    const ch = supabase.channel(`klander-chats-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${uid}` }, soon)
      .subscribe()
    refresh()
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(t); supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [uid, refresh])

  const unread = list.filter(c => !c.muted).reduce((a, c) => a + (c.unread || 0), 0)
  const startDm = async friendId => { const { data, error } = await supabase.rpc('start_dm', { other: friendId }); fail(error); await refresh(); return data }
  const createGroup = async (title, members) => { const { data, error } = await supabase.rpc('create_group', { group_title: title, members }); fail(error); await refresh(); return data }
  const eventThread = async eventId => { const { data, error } = await supabase.rpc('event_thread', { ev: eventId }); fail(error); await refresh(); return data }
  const block = async id => { const { error } = await supabase.from('blocks').insert({ user_id: uid, blocked_id: id }); fail(error); await refresh() }
  const unblock = async id => { const { error } = await supabase.from('blocks').delete().eq('user_id', uid).eq('blocked_id', id); fail(error); await refresh() }
  const setMuted = async (cid, muted) => {
    setList(l => l.map(c => (c.id === cid ? { ...c, muted } : c)))
    const { error } = await supabase.from('conversation_members').update({ muted }).eq('conversation_id', cid).eq('user_id', uid); fail(error)
  }
  const leave = async cid => { const { error } = await supabase.from('conversation_members').delete().eq('conversation_id', cid).eq('user_id', uid); fail(error); await refresh() }
  const rename = async (cid, title) => { const { error } = await supabase.from('conversations').update({ title: title.trim().slice(0, 60) || null }).eq('id', cid); fail(error); await refresh() }
  const addMembers = async (cid, ids) => { const { error } = await supabase.from('conversation_members').insert(ids.map(user_id => ({ conversation_id: cid, user_id }))); fail(error); await refresh() }
  const markRead = async cid => {
    setList(l => l.map(c => (c.id === cid ? { ...c, unread: 0 } : c)))
    await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', cid).eq('user_id', uid)
  }
  const report = async ({ messageId, userId, reason, snapshot }) => {
    const { error } = await supabase.from('reports').insert({ reporter: uid, message_id: messageId || null, reported_user: userId || null, reason, snapshot: snapshot?.slice(0, 2000) || null }); fail(error)
  }
  return { list, unread, blocked, refresh, startDm, createGroup, eventThread, block, unblock, setMuted, leave, rename, addMembers, markRead, report }
}

/** Messages in one chat, live. */
export function useMessages(cid, uid) {
  const [messages, setMessages] = useState([])
  const [reactions, setReactions] = useState([])
  const [members, setMembers] = useState([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const urls = useRef({})
  const [, bump] = useState(0)

  const signImages = useCallback(async msgs => {
    const need = msgs.filter(m => m.image_path && !m.image_removed_at && !urls.current[m.image_path]).map(m => m.image_path)
    if (!need.length) return
    const { data } = await supabase.storage.from('chat').createSignedUrls(need, 3600)
    for (const d of data || []) if (d.signedUrl) urls.current[d.path] = d.signedUrl
    bump(n => n + 1)
  }, [])

  const loadReactions = useCallback(async ids => {
    if (!ids.length) return
    const { data } = await supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', ids)
    setReactions(r => [...r.filter(x => !ids.includes(x.message_id)), ...(data || [])])
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: mem }] = await Promise.all([
      supabase.from('messages').select('*').eq('conversation_id', cid).order('id', { ascending: false }).limit(50),
      supabase.from('conversation_members').select('user_id, last_read_at, muted').eq('conversation_id', cid)
    ])
    const list = (data || []).reverse()
    setMessages(list); setMembers(mem || []); setMore((data || []).length === 50); setLoading(false)
    signImages(list); loadReactions(list.map(m => m.id))
  }, [cid, signImages, loadReactions])

  const loadOlder = async () => {
    if (!messages.length) return
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', cid).lt('id', messages[0].id).order('id', { ascending: false }).limit(50)
    const older = (data || []).reverse()
    setMessages(m => [...older, ...m]); setMore(older.length === 50)
    signImages(older); loadReactions(older.map(m => m.id))
  }

  useEffect(() => {
    load()
    const ch = supabase.channel(`klander-chat-${cid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, ({ new: m }) => {
        setMessages(list => (list.some(x => x.id === m.id) ? list : [...list.filter(x => !(x.pending && x.sender_id === m.sender_id && x.body === m.body && x.kind === m.kind)), m]))
        signImages([m])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, ({ new: m }) => {
        setMessages(list => list.map(x => (x.id === m.id ? m : x)))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        setMessages(list => { loadReactions(list.map(m => m.id)); return list })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${cid}` }, ({ new: r }) => {
        setMembers(ms => ms.map(m => (m.user_id === r.user_id ? { ...m, ...r } : m)))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [cid, load, signImages, loadReactions])

  const insert = async row => {
    const temp = { id: `tmp-${Date.now()}`, pending: true, conversation_id: cid, sender_id: uid, created_at: new Date().toISOString(), ...row }
    setMessages(m => [...m, temp])
    const { data, error } = await supabase.from('messages').insert({ conversation_id: cid, sender_id: uid, ...row }).select().single()
    if (error) { setMessages(m => m.map(x => (x.id === temp.id ? { ...x, pending: false, failed: true } : x))); fail(error) }
    setMessages(m => (m.some(x => x.id === data.id) ? m.filter(x => x.id !== temp.id) : m.map(x => (x.id === temp.id ? data : x))))
    return data
  }
  const sendText = (body, replyTo = null) => insert({ kind: 'text', body: body.trim().slice(0, 2000), reply_to: replyTo })
  const sendEvent = ev => insert({
    kind: 'event', body: null,
    event_ref: { id: ev.id, owner_id: ev.owner_id, title: ev.title, starts_at: ev.starts_at, ends_at: ev.ends_at, all_day: !!ev.all_day, location: ev.location || null }
  })
  const sendImage = async (blob, caption = '') => {
    const path = `${cid}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('chat').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    fail(error)
    const { data } = await supabase.storage.from('chat').createSignedUrl(path, 3600)
    if (data?.signedUrl) urls.current[path] = data.signedUrl
    return insert({ kind: 'image', image_path: path, body: caption.trim() || null })
  }
  const remove = async id => {
    setMessages(m => m.map(x => (x.id === id ? { ...x, deleted_at: new Date().toISOString() } : x)))
    const { error } = await supabase.from('messages').update({ deleted_at: new Date().toISOString(), body: null }).eq('id', id); fail(error)
  }
  const edit = async (id, body) => {
    setMessages(m => m.map(x => (x.id === id ? { ...x, body, edited_at: new Date().toISOString() } : x)))
    const { error } = await supabase.from('messages').update({ body: body.trim().slice(0, 2000), edited_at: new Date().toISOString() }).eq('id', id); fail(error)
  }
  const react = async (id, emoji) => {
    const mine = reactions.some(r => r.message_id === id && r.user_id === uid && r.emoji === emoji)
    setReactions(r => (mine ? r.filter(x => !(x.message_id === id && x.user_id === uid && x.emoji === emoji)) : [...r, { message_id: id, user_id: uid, emoji }]))
    const { error } = mine
      ? await supabase.from('message_reactions').delete().eq('message_id', id).eq('user_id', uid).eq('emoji', emoji)
      : await supabase.from('message_reactions').insert({ message_id: id, user_id: uid, emoji })
    if (error) loadReactions([id])
  }
  return { messages, reactions, members, more, loading, urls: urls.current, loadOlder, sendText, sendEvent, sendImage, remove, edit, react, reload: load }
}

/** Resize a photo before sending (keeps data use low). */
export function shrinkPhoto(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      c.toBlob(b => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), 'image/jpeg', 0.82)
    }
    img.onerror = () => reject(new Error("Couldn't open that photo. Try a JPG or PNG."))
    img.src = URL.createObjectURL(file)
  })
}

/** Name + people for a chat row. */
export function chatLabel(c, uid, people, me) {
  const others = (c.members || []).filter(id => id !== uid)
  const who = id => (id === uid ? me : people[id])
  if (c.kind === 'dm') { const p = who(others[0]); return { title: p ? p.display_name || p.username : 'Chat', people: [p].filter(Boolean) } }
  const names = others.map(id => who(id)).filter(Boolean).map(p => (p.display_name || p.username).split(/\s+/)[0])
  return { title: c.title || names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') || 'Group', people: others.map(who).filter(Boolean) }
}
