import { useState } from 'react'
import Sheet from './Sheet'
import { initials } from '../lib/colours'
import { fmt } from '../lib/dates'
import { ago } from '../lib/sync'

const MESSAGES = {
  sent: name => `Request sent to @${name}.`,
  accepted: name => `You're now friends with @${name}.`,
  already_sent: name => `You've already asked @${name}. Waiting for them to accept.`,
  already_friends: name => `You're already friends with @${name}.`,
  not_found: name => `Nobody's called @${name} yet. Check the spelling, or send them your invite link.`,
  self: () => "That's you!"
}

export function Avatar({ person, size = 38 }) {
  const style = person?.avatar_url
    ? { width: size, height: size, backgroundImage: `url(${person.avatar_url})`, borderColor: person.colour }
    : { width: size, height: size, background: person?.colour, borderColor: person?.colour, fontSize: size * 0.36 }
  return <span className="avatar" style={style} aria-hidden="true">{!person?.avatar_url && initials(person)}</span>
}

export default function FriendsSheet({ f, onClose, onPerson }) {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [link, setLink] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(null)

  const add = async e => {
    e.preventDefault()
    const name = username.replace(/^@/, '').trim()
    if (!name) return
    setBusy(true); setMsg(''); setError('')
    try { const r = await f.sendRequest(name); setMsg((MESSAGES[r] || (() => r))(name)); if (r === 'sent' || r === 'accepted') setUsername('') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const share = async () => {
    setError('')
    try {
      const code = await f.inviteCode()
      const url = `${window.location.origin}/?invite=${code}`
      setLink(url)
      if (navigator.share) {
        try { await navigator.share({ title: 'Klander', text: "Add me on Klander so we can see each other's weeks", url }); return } catch { /* cancelled */ }
      }
      try { await navigator.clipboard.writeText(url); setMsg('Invite link copied.') } catch { /* user can copy by hand */ }
    } catch (err) { setError(err.message) }
  }

  const act = async fn => { setError(''); try { await fn() } catch (err) { setError(err.message) } }

  return (
    <Sheet title="Friends" onClose={onClose}>
      <form className="group" onSubmit={add}>
        <h3>Add a friend</h3>
        <div className="row">
          <input id="friend-username" className="input grow" placeholder="@username" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          <button className="btn primary" disabled={busy || !username.trim()}>Add</button>
        </div>
        {msg && <p className="small" style={{ color: 'var(--good)' }}>{msg}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </form>

      <div className="group">
        <h3>Invite link</h3>
        <p className="small muted">Anyone who opens your link and signs in becomes your friend straight away. Only share it with people you want to add.</p>
        <button className="btn block" onClick={share}>Share my invite link</button>
        {link && <input id="invite-link" className="input small" readOnly value={link} onFocus={e => e.target.select()} />}
      </div>

      {f.friends.length > 0 && (
        <div className="group">
          <h3>Recent activity</h3>
          {f.activity.length === 0 && <p className="small muted">Nothing yet. When friends add or change events you'll see it here.</p>}
          {f.activity.slice(0, 15).map(a => {
            const p = f.people[a.actor]
            if (!p) return null
            const name = (p.display_name || p.username).split(/\s+/)[0]
            const what = a.verb === 'synced' ? 'updated their linked calendar'
              : a.verb === 'removed' ? 'removed an event'
              : `${a.verb} ${a.title ? `"${a.title}"` : 'a busy block'}${a.starts_at ? ` · ${fmt(new Date(a.starts_at), 'EEE d MMM, HH:mm')}` : ''}`
            return (
              <div key={a.id} className="person-row">
                <Avatar person={p} size={30} />
                <div className="who"><span className="small"><b>{name}</b> {what}</span><small>{ago(a.created_at)}</small></div>
                <span />
              </div>
            )
          })}
        </div>
      )}

      {f.incoming.length > 0 && (
        <div className="group">
          <h3>Requests ({f.incoming.length})</h3>
          {f.incoming.map(({ link: l, person }) => (
            <div key={l.id} className="person-row">
              <Avatar person={person} />
              <div className="who"><b>{person.display_name || person.username}</b><small>@{person.username}</small></div>
              <span className="row">
                <button className="btn primary" style={{ padding: '7px 12px' }} onClick={() => act(() => f.accept(l.id))}>Accept</button>
                <button className="btn ghost" style={{ padding: '7px 8px' }} onClick={() => act(() => f.remove(l.id))}>Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="group">
        <h3>Your friends ({f.friends.length})</h3>
        {f.friends.length === 0 && <p className="small muted">No friends yet. Add someone by username or share your invite link.</p>}
        {f.friends.map(({ link: l, person }) => {
          const shown = !f.hidden.includes(person.id)
          return (
            <div key={l.id} className="person-row">
              <button className="person-open" onClick={() => onPerson?.(person)} aria-label={`Open ${person.display_name || person.username}`}>
                <Avatar person={person} />
                <div className="who"><b>{person.display_name || person.username}</b><small>@{person.username} · Birthday &amp; theme ›</small></div>
              </button>
              {confirmRemove === l.id
                ? <span className="row">
                    <button className="btn danger" style={{ padding: '7px 10px' }} onClick={() => act(async () => { await f.remove(l.id); setConfirmRemove(null) })}>Remove</button>
                    <button className="btn ghost" style={{ padding: '7px 8px' }} onClick={() => setConfirmRemove(null)}>Keep</button>
                  </span>
                : <span className="row">
                    <label className="switch" title={shown ? 'Shown on your calendar' : 'Hidden from your calendar'}>
                      <input type="checkbox" checked={shown} onChange={() => f.toggleHidden(person.id)} aria-label={`Show ${person.username} on calendar`} /><span />
                    </label>
                    <button className="linklike small" style={{ color: 'var(--danger)' }} onClick={() => setConfirmRemove(l.id)}>Remove</button>
                  </span>}
            </div>
          )
        })}
      </div>

      {f.outgoing.length > 0 && (
        <div className="group">
          <h3>Waiting for them</h3>
          {f.outgoing.map(({ link: l, person }) => (
            <div key={l.id} className="person-row">
              <Avatar person={person} />
              <div className="who"><b>{person.display_name || person.username}</b><small>@{person.username}</small></div>
              <button className="linklike small" onClick={() => act(() => f.remove(l.id))}>Cancel</button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
