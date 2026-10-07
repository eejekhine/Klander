import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isSameDay } from 'date-fns'
import { Avatar } from './FriendsSheet'
import { fmt, timeLabel } from '../lib/dates'
import { REACTIONS, chatLabel, shrinkPhoto, useMessages } from '../lib/chat'

const first = p => (p?.display_name || p?.username || '').split(/\s+/)[0]
const when = iso => {
  const d = new Date(iso), now = new Date()
  if (isSameDay(d, now)) return fmt(d, 'HH:mm')
  if (now - d < 6 * 864e5) return fmt(d, 'EEE')
  return fmt(d, 'd MMM')
}
const Back = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.7 5.3a1 1 0 0 1 0 1.4L10.4 12l5.3 5.3a1 1 0 1 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0z"/></svg>

/** Chats: a list of conversations, and the conversation itself. Full screen, like a messaging app. */
export default function ChatScreen({ chats, uid, me, people, friends, initialId, upcoming, onClose, onMakeEvent, onOpenEvent, onToast }) {
  const [open, setOpen] = useState(initialId || null)
  const [composing, setComposing] = useState(false)
  useEffect(() => { if (initialId) setOpen(initialId) }, [initialId])
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && (open ? setOpen(null) : onClose())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const conv = chats.list.find(c => c.id === open)
  return (
    <div className="chat-screen" role="dialog" aria-modal="true" aria-label="Chat">
      {open && conv
        ? <Conversation key={open} conv={conv} chats={chats} uid={uid} me={me} people={people} friends={friends} upcoming={upcoming}
            onBack={() => { setOpen(null); chats.refresh() }} onMakeEvent={onMakeEvent} onOpenEvent={onOpenEvent} onToast={onToast} />
        : composing
          ? <NewChat chats={chats} friends={friends} onBack={() => setComposing(false)} onOpen={id => { setComposing(false); setOpen(id) }} />
          : <ChatList chats={chats} uid={uid} me={me} people={people} onOpen={setOpen} onNew={() => setComposing(true)} onClose={onClose} hasFriends={friends.length > 0} />}
    </div>
  )
}

function ChatList({ chats, uid, me, people, onOpen, onNew, onClose, hasFriends }) {
  return (
    <>
      <header className="chat-head">
        <button className="plain-btn" aria-label="Close chats" onClick={onClose}><Back /></button>
        <h2>Chats</h2>
        {hasFriends && <button className="plain-btn accent" aria-label="New chat" onClick={onNew}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8.4L4.7 21.3A1 1 0 0 1 3 20.6V5a1 1 0 0 1 1-2zm7 4v3H8v2h3v3h2v-3h3v-2h-3V7z"/></svg>
        </button>}
      </header>
      <div className="chat-list">
        {chats.list.length === 0 && (
          <div className="chat-empty">
            <b>No chats yet</b>
            <p className="small muted">Message a friend, start a group, or chat about a plan from its invite.</p>
            {hasFriends && <button className="btn primary" onClick={onNew}>Start a chat</button>}
          </div>
        )}
        {chats.list.map(c => {
          const { title, people: ps } = chatLabel(c, uid, people, me)
          const last = c.last
          const lastText = !last ? 'Say hi' : last.deleted ? 'Message deleted' : last.kind === 'image' ? 'Photo' : last.kind === 'event' ? 'Shared an event' : last.body || ''
          const prefix = last && last.sender_id === uid && last.kind !== 'system' ? 'You: ' : last && c.kind !== 'dm' && last.kind !== 'system' && people[last.sender_id] ? `${first(people[last.sender_id])}: ` : ''
          return (
            <button key={c.id} className={`chat-row${c.unread ? ' unread' : ''}`} onClick={() => onOpen(c.id)}>
              <ChatAvatar kind={c.kind} people={ps} />
              <span className="chat-row-main">
                <b>{c.kind === 'event' && <span className="tag">Plan</span>}{title}</b>
                <small>{prefix}{lastText}</small>
              </span>
              <span className="chat-row-side">
                <small>{last ? when(last.created_at) : ''}</small>
                {c.unread > 0 && !c.muted ? <i className="dot-count">{c.unread}</i> : c.muted ? <small className="muted">muted</small> : null}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function ChatAvatar({ kind, people }) {
  if (kind === 'dm' || people.length <= 1) return <Avatar person={people[0]} size={46} />
  return <span className="chat-stack"><Avatar person={people[0]} size={32} /><Avatar person={people[1]} size={32} /></span>
}

function NewChat({ chats, friends, onBack, onOpen }) {
  const [picked, setPicked] = useState([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true); setError('')
    try { onOpen(picked.length === 1 ? await chats.startDm(picked[0]) : await chats.createGroup(name, picked)) }
    catch (e) { setError(e.message); setBusy(false) }
  }
  return (
    <>
      <header className="chat-head">
        <button className="plain-btn" aria-label="Back" onClick={onBack}><Back /></button>
        <h2>New chat</h2>
        <button className="btn primary small-btn" disabled={!picked.length || busy} onClick={go}>{picked.length > 1 ? 'Create' : 'Chat'}</button>
      </header>
      <div className="chat-list" style={{ padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}>
        <p className="small muted" style={{ margin: 0 }}>Pick one friend to message, or a few to start a group.</p>
        <div className="pick-row">
          {friends.filter(p => !chats.blocked.includes(p.id)).map(p => (
            <button key={p.id} className="pchip" aria-pressed={picked.includes(p.id)} onClick={() => setPicked(v => (v.includes(p.id) ? v.filter(x => x !== p.id) : [...v, p.id]))}>
              <Avatar person={p} size={22} />{first(p)}
            </button>
          ))}
        </div>
        {picked.length > 1 && <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Group name (optional)" maxLength={60} />}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </>
  )
}

/* ---------------- one conversation ---------------- */
function Conversation({ conv, chats, uid, me, people, friends, upcoming, onBack, onMakeEvent, onOpenEvent, onToast }) {
  const m = useMessages(conv.id, uid)
  const { title, people: ps } = chatLabel(conv, uid, people, me)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [action, setAction] = useState(null) // message id with the action bar open
  const [panel, setPanel] = useState(null) // 'info' | 'share' | 'photo' | { photo }
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const fileRef = useRef(null)
  const atBottom = useRef(true)
  const who = id => (id === uid ? me : people[id])
  const other = conv.kind === 'dm' ? (conv.members || []).find(id => id !== uid) : null
  const blocked = other && chats.blocked.includes(other)

  // Keep the newest message in view, and mark the chat as read
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [m.messages.length, m.loading])
  useEffect(() => { chats.markRead(conv.id) }, [conv.id, m.messages.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = e => {
    const el = e.currentTarget
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 40 && m.more) { const h = el.scrollHeight; m.loadOlder().then(() => requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - h })) }
  }

  const run = async fn => { setError(''); try { await fn() } catch (e) { setError(e.message) } }
  const send = async () => {
    const body = text.trim()
    if (!body) return
    setText(''); atBottom.current = true
    const r = replyTo?.id; setReplyTo(null)
    await run(() => m.sendText(body, r))
  }
  const pickPhoto = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setSending(true); atBottom.current = true
    await run(async () => m.sendImage(await shrinkPhoto(f), text.trim() ? text : ''))
    setText(''); setSending(false)
  }
  const byId = useMemo(() => Object.fromEntries(m.messages.map(x => [x.id, x])), [m.messages])
  const reactionsFor = id => {
    const out = {}
    for (const r of m.reactions) if (r.message_id === id) (out[r.emoji] ||= []).push(r.user_id)
    return Object.entries(out)
  }
  const lastMine = [...m.messages].reverse().find(x => x.sender_id === uid && !x.pending)
  const seen = other && lastMine && m.members.find(x => x.user_id === other && new Date(x.last_read_at) >= new Date(lastMine.created_at))

  return (
    <>
      <header className="chat-head">
        <button className="plain-btn" aria-label="Back to chats" onClick={onBack}><Back /></button>
        <button className="chat-title" onClick={() => setPanel(panel === 'info' ? null : 'info')}>
          <ChatAvatar kind={conv.kind} people={ps} />
          <span><b>{title}</b><small>{conv.kind === 'dm' ? `@${ps[0]?.username || ''}` : conv.kind === 'event' ? 'Plan chat' : `${(conv.members || []).length} people`}{conv.muted ? ' · muted' : ''}</small></span>
        </button>
      </header>

      {panel === 'info' && <ChatInfo conv={conv} chats={chats} uid={uid} me={me} people={people} friends={friends} other={other} onBack={onBack} onClose={() => setPanel(null)} onOpenEvent={onOpenEvent} onToast={onToast} />}

      <div className="msgs" ref={listRef} onScroll={onScroll} onClick={() => action && setAction(null)}>
        {m.loading && <p className="small muted center">Loading…</p>}
        {!m.loading && m.messages.length === 0 && <p className="small muted center">No messages yet. Say hi 👋</p>}
        {m.messages.map((x, i) => {
          const prev = m.messages[i - 1]
          const mine = x.sender_id === uid
          const newDay = !prev || !isSameDay(new Date(prev.created_at), new Date(x.created_at))
          const grouped = prev && !newDay && prev.sender_id === x.sender_id && prev.kind !== 'system' && new Date(x.created_at) - new Date(prev.created_at) < 5 * 60000
          const hiddenSender = chats.blocked.includes(x.sender_id) && !mine
          if (x.kind === 'system') return <div key={x.id}>{newDay && <DayLine d={x.created_at} />}<p className="sys">{x.body}</p></div>
          const next = m.messages[i + 1]
          const showTime = !next || next.sender_id !== x.sender_id || new Date(next.created_at) - new Date(x.created_at) > 5 * 60000
          const rs = reactionsFor(x.id)
          const reply = x.reply_to && byId[x.reply_to]
          return (
            <div key={x.id}>
              {newDay && <DayLine d={x.created_at} />}
              <div className={`msg${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`}>
                {!mine && conv.kind !== 'dm' && <span className="msg-av">{!grouped && <Avatar person={who(x.sender_id)} size={26} />}</span>}
                <div className="msg-col">
                  {!mine && conv.kind !== 'dm' && !grouped && <small className="msg-name">{first(who(x.sender_id))}</small>}
                  <div role="button" tabIndex={0} className={`bubble ${x.kind}${x.deleted_at ? ' deleted' : ''}${x.pending ? ' pending' : ''}${x.failed ? ' failed' : ''}`}
                    onClick={e => { e.stopPropagation(); if (!x.deleted_at && !x.pending) setAction(action === x.id ? null : x.id) }}>
                    {reply && <span className="reply-quote">{first(who(reply.sender_id))}: {reply.deleted_at ? 'deleted' : reply.kind === 'image' ? 'Photo' : reply.kind === 'event' ? reply.event_ref?.title : reply.body}</span>}
                    {hiddenSender ? <i className="muted">Message from someone you blocked</i>
                      : x.deleted_at ? <i>Message deleted</i>
                      : x.kind === 'image' ? <>{m.urls[x.image_path] ? <img src={m.urls[x.image_path]} alt="Photo" onClick={e => { e.stopPropagation(); setPanel({ photo: m.urls[x.image_path] }) }} /> : <span className="img-ph" />}{x.body && <span className="caption">{x.body}</span>}</>
                      : x.kind === 'event' ? <EventCard ev={x.event_ref} onOpen={e => { e.stopPropagation(); onOpenEvent(x.event_ref) }} />
                      : <span className="text">{linkify(x.body)}</span>}
                    {x.edited_at && !x.deleted_at && <small className="edited">edited</small>}
                  </div>
                  {rs.length > 0 && <div className="reacts">{rs.map(([e, us]) => <button key={e} className={us.includes(uid) ? 'on' : ''} onClick={() => m.react(x.id, e)}>{e}{us.length > 1 ? ` ${us.length}` : ''}</button>)}</div>}
                  {action === x.id && (
                    <div className="msg-actions" onClick={e => e.stopPropagation()}>
                      <div className="react-row">{REACTIONS.map(e => <button key={e} onClick={() => { m.react(x.id, e); setAction(null) }}>{e}</button>)}</div>
                      <div className="act-row">
                        <button onClick={() => { setReplyTo(x); setAction(null) }}>Reply</button>
                        {x.kind === 'text' && <button onClick={() => { setAction(null); onMakeEvent(x.body) }}>Make an event</button>}
                        {x.kind === 'text' && <button onClick={() => { navigator.clipboard?.writeText(x.body); setAction(null); onToast('Copied') }}>Copy</button>}
                        {mine
                          ? <button className="danger" onClick={() => { setAction(null); run(() => m.remove(x.id)) }}>Delete</button>
                          : <button className="danger" onClick={() => { setAction(null); run(async () => { await chats.report({ messageId: x.id, userId: x.sender_id, reason: 'Reported from chat', snapshot: x.body }); onToast('Reported. Thanks for letting us know.') }) }}>Report</button>}
                      </div>
                    </div>
                  )}
                  {(showTime || x.failed) && <small className="msg-time">{fmt(new Date(x.created_at), 'HH:mm')}{x.failed ? ' · not sent' : ''}</small>}
                </div>
              </div>
            </div>
          )
        })}
        {seen && <p className="seen">Seen</p>}
      </div>

      {error && <p className="error chat-error" role="alert">{error}</p>}
      {panel === 'share' && <SharePicker upcoming={upcoming} onPick={ev => { setPanel(null); atBottom.current = true; run(() => m.sendEvent(ev)) }} onClose={() => setPanel(null)} />}
      {panel?.photo && <div className="photo-view" onClick={() => setPanel(null)}><img src={panel.photo} alt="" /></div>}

      {blocked
        ? <div className="composer blocked">You blocked {first(people[other])}. <button className="linklike" onClick={() => run(() => chats.unblock(other))}>Unblock</button></div>
        : (
          <div className="composer">
            {replyTo && <div className="replying">Replying to {first(who(replyTo.sender_id))}: <span>{replyTo.body || (replyTo.kind === 'image' ? 'Photo' : replyTo.event_ref?.title)}</span><button aria-label="Cancel reply" onClick={() => setReplyTo(null)}>×</button></div>}
            <div className="composer-row">
              <button className="plain-btn" aria-label="Send a photo" disabled={sending} onClick={() => fileRef.current?.click()}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>
              </button>
              <button className="plain-btn" aria-label="Share an event" onClick={() => setPanel(panel === 'share' ? null : 'share')}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 7h14v11H5zm3 3v2h2v-2zm4 0v2h2v-2z"/></svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
              <textarea className="composer-input" rows={1} value={text} placeholder={sending ? 'Sending photo…' : 'Message'} maxLength={2000}
                onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !/iPhone|Android/.test(navigator.userAgent)) { e.preventDefault(); send() } }} />
              <button className="send" aria-label="Send" disabled={!text.trim()} onClick={send}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>
              </button>
            </div>
          </div>
        )}
    </>
  )
}

const DayLine = ({ d }) => <p className="day-line"><span>{isSameDay(new Date(d), new Date()) ? 'Today' : fmt(new Date(d), 'EEEE d MMMM')}</span></p>

function linkify(s = '') {
  return s.split(/(https?:\/\/[^\s]+)/g).map((part, i) => (/^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}>{part}</a> : part))
}

function EventCard({ ev, onOpen }) {
  const s = new Date(ev.starts_at), e = new Date(ev.ends_at)
  return (
    <span className="ev-card" onClick={onOpen}>
      <span className="ev-date"><small>{fmt(s, 'MMM')}</small><b>{fmt(s, 'd')}</b></span>
      <span className="ev-info"><b>{ev.title}</b><small>{fmt(s, 'EEE')} · {timeLabel({ start: s, end: e, all_day: ev.all_day })}{ev.location ? ` · ${ev.location}` : ''}</small></span>
    </span>
  )
}

function SharePicker({ upcoming, onPick, onClose }) {
  return (
    <div className="share-picker">
      <div className="share-head"><b>Share an event</b><button className="linklike" onClick={onClose}>Close</button></div>
      {upcoming.length === 0 && <p className="small muted">Nothing coming up in the next month.</p>}
      {upcoming.map(ev => (
        <button key={`${ev.id}-${ev.starts_at}`} className="plan-row" onClick={() => onPick(ev)}>
          <span className="ev-date"><small>{fmt(new Date(ev.starts_at), 'MMM')}</small><b>{fmt(new Date(ev.starts_at), 'd')}</b></span>
          <span><b>{ev.title}</b><small>{fmt(new Date(ev.starts_at), 'EEE HH:mm')}{ev.location ? ` · ${ev.location}` : ''}</small></span>
          <small>Share</small>
        </button>
      ))}
    </div>
  )
}

function ChatInfo({ conv, chats, uid, me, people, friends, other, onBack, onClose, onOpenEvent, onToast }) {
  const [name, setName] = useState(conv.title || '')
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')
  const run = async fn => { setError(''); try { await fn() } catch (e) { setError(e.message) } }
  const members = (conv.members || []).map(id => (id === uid ? me : people[id]) || { id, username: 'someone' })
  const addable = friends.filter(f => !(conv.members || []).includes(f.id))
  return (
    <div className="chat-info">
      {conv.kind === 'group' && (
        <div className="row">
          <input className="input grow" value={name} onChange={e => setName(e.target.value)} placeholder="Group name" maxLength={60} />
          <button className="btn" disabled={name === (conv.title || '')} onClick={() => run(async () => { await chats.rename(conv.id, name); onToast('Renamed') })}>Save</button>
        </div>
      )}
      <div className="pick-row">{members.map(p => <span key={p.id} className="pchip static"><Avatar person={p} size={22} />{p.id === uid ? 'You' : first(p)}</span>)}</div>
      {conv.kind === 'group' && addable.length > 0 && (adding
        ? <div className="pick-row">{addable.map(p => <button key={p.id} className="pchip" onClick={() => run(async () => { await chats.addMembers(conv.id, [p.id]); setAdding(false) })}><Avatar person={p} size={22} />+ {first(p)}</button>)}</div>
        : <button className="btn block" onClick={() => setAdding(true)}>Add people</button>)}
      {conv.kind === 'event' && conv.event_id && <button className="btn block" onClick={() => onOpenEvent({ id: conv.event_id })}>Open the plan</button>}
      <div className="toggle-row"><span>Mute this chat<br /><small className="muted">No notifications from it</small></span>
        <label className="switch"><input type="checkbox" checked={!!conv.muted} onChange={e => run(() => chats.setMuted(conv.id, e.target.checked))} aria-label="Mute this chat" /><span /></label>
      </div>
      {conv.kind === 'group' && (confirm === 'leave'
        ? <div className="row"><button className="btn danger grow" onClick={() => run(async () => { await chats.leave(conv.id); onBack() })}>Leave group</button><button className="btn grow" onClick={() => setConfirm(null)}>Stay</button></div>
        : <button className="btn danger block" onClick={() => setConfirm('leave')}>Leave group</button>)}
      {other && !chats.blocked.includes(other) && (confirm === 'block'
        ? <div className="row"><button className="btn danger grow" onClick={() => run(async () => { await chats.block(other); onToast(`Blocked ${first(people[other])}`); onClose() })}>Block</button><button className="btn grow" onClick={() => setConfirm(null)}>Cancel</button></div>
        : <button className="btn ghost block danger-text" onClick={() => setConfirm('block')}>Block {first(people[other])}</button>)}
      {other && <button className="btn ghost block danger-text" onClick={() => run(async () => { await chats.report({ userId: other, reason: 'Reported from chat info' }); onToast('Reported. Thanks for letting us know.') })}>Report {first(people[other])}</button>}
      <p className="small muted" style={{ margin: 0 }}>Messages are private to the people in this chat. Blocking stops someone messaging you directly and hides their messages.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
