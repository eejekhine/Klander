import { useState } from 'react'

/** Your birthday + whether friends can see your age. Used in Settings and onboarding. */
export default function BirthdayFields({ bd, compact = false }) {
  const [date, setDate] = useState(bd.mine?.birthday || '')
  const [showYear, setShowYear] = useState(!!bd.mine?.show_year)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadedFrom, setLoadedFrom] = useState(bd.mine)
  if (bd.mine !== loadedFrom) { setLoadedFrom(bd.mine); setDate(bd.mine?.birthday || ''); setShowYear(!!bd.mine?.show_year) }

  const dirty = date !== (bd.mine?.birthday || '') || showYear !== !!bd.mine?.show_year
  const save = async () => {
    setBusy(true); setMsg(''); setError('')
    try { await bd.saveMine(date, showYear); setMsg(date ? 'Birthday saved' : 'Birthday removed') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="bday-fields">
      {!compact && <p className="small muted" style={{ margin: 0 }}>Friends see the day and month on their calendar. Your age stays private unless you switch it on.</p>}
      <div className="row">
        <input id="bday-date" type="date" className="input grow" value={date} max={today} min="1900-01-01" onChange={e => setDate(e.target.value)} aria-label="Your birthday" />
        {date && <button className="linklike small" onClick={() => setDate('')}>Clear</button>}
      </div>
      <div className="toggle-row"><span>Show my age to friends</span>
        <label className="switch"><input type="checkbox" checked={showYear} onChange={e => setShowYear(e.target.checked)} aria-label="Show my age to friends" /><span /></label>
      </div>
      {dirty && <button className="btn primary block" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save birthday'}</button>}
      {msg && <p className="small" style={{ color: 'var(--good)', margin: 0 }}>{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
