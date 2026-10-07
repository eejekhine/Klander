import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message); else onDone()
  }
  return (
    <div className="auth"><form className="auth-card" onSubmit={submit}>
      <span className="wordmark">Klander<i>.</i></span>
      <h2 style={{ fontSize: 18 }}>Choose a new password</h2>
      <label className="field"><span>New password</span>
        <input id="new-password" className="input" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
    </form></div>
  )
}
