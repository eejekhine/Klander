import { useState } from 'react'
import { PALETTE } from '../lib/colours'
import { useBirthdays } from '../lib/birthdays'

export default function Onboarding({ data, user }) {
  const suggested = (user.email || '').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)
  const [username, setUsername] = useState(suggested.length >= 3 ? suggested : '')
  const [displayName, setDisplayName] = useState(data.profile.display_name || '')
  const [colour, setColour] = useState(data.profile.colour || PALETTE[0])
  const [birthday, setBirthday] = useState('')
  const bd = useBirthdays(user.id)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault(); setError('')
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return setError('Usernames are 3–20 letters, numbers or underscores.')
    setBusy(true)
    try {
      if (birthday) await bd.saveMine(birthday, false)
      await data.updateProfile({ username, display_name: displayName.trim() || username, colour })
    }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="auth"><form className="auth-card" onSubmit={submit}>
      <span className="wordmark">Klander<i>.</i></span>
      <div><h2 style={{ fontSize: 20 }}>Set up your profile</h2>
        <p className="muted small" style={{ marginTop: 6 }}>Friends will find you by your username.</p></div>
      <label className="field"><span>Username</span>
        <input id="ob-username" className="input" value={username} onChange={e => setUsername(e.target.value.trim())} autoCapitalize="none" autoCorrect="off" placeholder="e.g. ethan_j" required />
      </label>
      <label className="field"><span>Display name</span>
        <input id="ob-name" className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Ethan" />
      </label>
      <div className="field"><span>Your colour (friends see your events in this)</span>
        <div className="swatches">{PALETTE.map(c =>
          <button key={c} type="button" className="swatch" style={{ background: c }} aria-pressed={colour === c} aria-label={`Colour ${c}`} onClick={() => setColour(c)} />)}
        </div>
      </div>
      <label className="field"><span>Birthday (optional)</span>
        <input id="ob-bday" type="date" className="input" value={birthday} max={new Date().toISOString().slice(0, 10)} min="1900-01-01" onChange={e => setBirthday(e.target.value)} />
        <small className="muted">Friends see the day, not your age. You can change this later.</small>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Start using Klander'}</button>
    </form></div>
  )
}
