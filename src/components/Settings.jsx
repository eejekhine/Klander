import { useRef, useState } from 'react'
import Sheet from './Sheet'
import { supabase } from '../lib/supabase'
import { PALETTE, initials } from '../lib/colours'
import { themeName, useThemeState } from '../lib/themes'
import BirthdayFields from './BirthdayFields'
import { REMINDERS } from '../lib/notify'

export default function Settings({ data, bd, onClose, onOpenCalendars, onOpenAppearance, onOpenHelp, onOpenInstall }) {
  const theme = useThemeState()
  const p = data.profile
  const [displayName, setDisplayName] = useState(p.display_name || '')
  const [username, setUsername] = useState(p.username || '')
  const [colour, setColour] = useState(p.colour)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const saveProfile = async () => {
    setError(''); setMsg('')
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return setError('Usernames are 3–20 letters, numbers or underscores.')
    setBusy(true)
    try { await data.updateProfile({ display_name: displayName.trim() || username, username, colour }); setMsg('Profile saved') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const pickAvatar = async e => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(''); setMsg(''); setBusy(true)
    try { await data.uploadAvatar(f); setMsg('Photo updated') }
    catch (err) { setError(err.message) }
    finally { setBusy(false); e.target.value = '' }
  }

  const dirty = displayName !== (p.display_name || '') || username !== p.username || colour !== p.colour

  return (
    <Sheet title="You" onClose={onClose}
      actions={dirty ? <button className="btn primary" style={{ padding: '8px 14px' }} disabled={busy} onClick={saveProfile}>Save</button> : null}>

      <div className="group">
        <div className="row">
          <button className="avatar big-avatar" onClick={() => fileRef.current?.click()} aria-label="Change profile photo"
            style={p.avatar_url ? { backgroundImage: `url(${p.avatar_url})`, borderColor: colour } : { background: colour, borderColor: colour }}>
            {!p.avatar_url && initials({ ...p, display_name: displayName })}
          </button>
          <div className="grow">
            <b>{displayName || username}</b>
            <div className="muted small">@{p.username}</div>
            <button className="linklike small" onClick={() => fileRef.current?.click()} disabled={busy}>{p.avatar_url ? 'Change photo' : 'Add a photo'}</button>
          </div>
          <input ref={fileRef} id="avatar-file" type="file" accept="image/*" hidden onChange={pickAvatar} />
        </div>
        <label className="field"><span>Display name</span><input id="set-name" className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={50} /></label>
        <label className="field"><span>Username</span><input id="set-username" className="input" value={username} onChange={e => setUsername(e.target.value.trim())} autoCapitalize="none" autoCorrect="off" /></label>
        <div className="field"><span>Your colour</span>
          <div className="swatches">{PALETTE.map(c => <button key={c} type="button" className="swatch" style={{ background: c }} aria-pressed={colour === c} aria-label={`Colour ${c}`} onClick={() => setColour(c)} />)}</div>
        </div>
        {msg && <p className="small" style={{ color: 'var(--good)' }}>{msg}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="group">
        <h3>Birthday</h3>
        <BirthdayFields bd={bd} />
      </div>

      <div className="group">
        <h3>Appearance</h3>
        <button className="btn block" onClick={onOpenAppearance}>Themes and appearance · <b>{themeName(theme.config)}</b></button>
      </div>

      <div className="group">
        <h3>Calendars</h3>
        <p className="small muted">Bring in your uni timetable, Google, Outlook or iCloud calendars, and get a link to see Klander in those apps.</p>
        <button className="btn block" onClick={onOpenCalendars}>Linked calendars and sync</button>
      </div>

      <Categories data={data} />

      <div className="group">
        <h3>Help</h3>
        <p className="small muted" style={{ margin: 0 }}>How everything works, in plain English, with a button to take you there.</p>
        <button className="btn block" onClick={onOpenHelp}>Help &amp; tips</button>
      </div>

      <div className="group">
        <h3>Add to your Home Screen</h3>
        <p className="small muted" style={{ margin: 0 }}>Opens full screen like a normal app, and lets Klander send notifications.</p>
        <button className="btn block" onClick={onOpenInstall}>Show me how</button>
      </div>

      <button className="btn danger block" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </Sheet>
  )
}

function Categories({ data }) {
  const [editing, setEditing] = useState(null) // {id?, name, colour}
  const [confirmId, setConfirmId] = useState(null)
  const [error, setError] = useState('')

  const save = async () => {
    setError('')
    if (!editing.name.trim()) return setError('Give the category a name.')
    try { await data.saveCategory({ ...editing, name: editing.name.trim() }); setEditing(null) }
    catch (err) { setError(err.message) }
  }
  const remove = async id => {
    try { await data.deleteCategory(id); setConfirmId(null); setEditing(null) } catch (err) { setError(err.message) }
  }

  return (
    <div className="group">
      <h3>Categories</h3>
      {data.categories.map(c => editing?.id === c.id ? null : (
        <div key={c.id} className="cat-row">
          <span className="cat-dot" style={{ '--c': c.colour }} />
          <span>{c.name}{c.is_shift && <small className="muted"> · shifts</small>}</span>
          {confirmId === c.id
            ? <span className="row"><button className="btn danger" style={{ padding: '6px 10px' }} onClick={() => remove(c.id)}>Delete</button><button className="btn ghost" style={{ padding: '6px 8px' }} onClick={() => setConfirmId(null)}>Keep</button></span>
            : <span className="row"><button className="linklike small" onClick={() => setEditing({ ...c })}>Edit</button><button className="linklike small" style={{ color: 'var(--danger)' }} onClick={() => setConfirmId(c.id)}>Delete</button></span>}
        </div>
      ))}
      {editing && (
        <div className="group" style={{ background: 'var(--bg)' }}>
          <input id="cat-name" className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Category name" maxLength={30} autoFocus />
          <div className="swatches">{PALETTE.map(col => <button key={col} type="button" className="swatch" style={{ background: col }} aria-pressed={editing.colour === col} aria-label={`Colour ${col}`} onClick={() => setEditing({ ...editing, colour: col })} />)}</div>
          <div className="toggle-row"><span>These are shifts<br /><small className="muted">Adds a sleep block after each one. Free-time finder and quiet hours respect it.</small></span>
            <label className="switch"><input type="checkbox" checked={!!editing.is_shift} onChange={e => setEditing({ ...editing, is_shift: e.target.checked })} aria-label="These are shifts" /><span /></label>
          </div>
          <label className="field"><span>Reminder for this category</span>
            <select className="input" value={editing.default_reminder ?? ''} onChange={e => setEditing({ ...editing, default_reminder: e.target.value === '' ? null : +e.target.value })}>
              <option value="">Use my default</option><option value="-1">No reminders</option>
              {REMINDERS.filter(([v]) => v !== null).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div className="row"><button className="btn primary" onClick={save}>Save category</button><button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button></div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {!editing && <button className="btn block" onClick={() => setEditing({ name: '', colour: PALETTE[data.categories.length % PALETTE.length] })}>+ Add category</button>}
      {data.categories.some(c => c.is_shift) && (
        <label className="field"><span>Sleep after a shift</span>
          <select className="input" value={String(data.profile.sleep_hours ?? 7)} onChange={e => data.updateProfile({ sleep_hours: +e.target.value }).catch(err => setError(err.message))}>
            {[0, 4, 5, 6, 7, 8, 9, 10].map(h => <option key={h} value={String(h)}>{h ? `${h} hours` : 'No sleep block'}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
