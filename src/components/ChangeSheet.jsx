import { useMemo, useState } from 'react'
import { addDays, startOfDay } from 'date-fns'
import Sheet from './Sheet'
import { expandEvents, fmt, timeLabel } from '../lib/dates'
import { applyChange, editWithAI } from '../lib/smart'

const EXAMPLES = ['move gym to 7', 'push basketball back an hour', 'cancel dentist', 'lecture is in room B12 now']

/** Change an event by typing it: "move gym to 7". Shows the change first; nothing happens until you tap Apply. */
export default function ChangeSheet({ data, onClose, onDone }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [props, setProps] = useState(null) // [{ occ, change, next }]
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  // Your own events (not imported ones) from today for the next 3 weeks, one row per occurrence
  const upcoming = useMemo(() => {
    const from = startOfDay(new Date())
    return expandEvents(data.events.filter(e => !e.source_id), from, addDays(from, 21)).slice(0, 60)
  }, [data.events])

  const ask = async () => {
    if (!text.trim()) return
    setBusy(true); setError(''); setMessage(''); setProps(null)
    try {
      const r = await editWithAI(text.trim(), upcoming)
      setProps((r.changes || []).map(c => ({ occ: upcoming[c.index], change: c, next: c.delete ? null : applyChange(upcoming[c.index], c) })).filter(p => p.occ))
      setMessage(r.message || '')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const apply = async p => {
    setError('')
    const ev = data.events.find(e => e.id === p.occ.id)
    if (!ev) return setError("Couldn't find that event any more.")
    try {
      if (p.change.delete) {
        if (ev.rrule) { await data.skipOccurrence(ev, p.occ.occurrence); onDone(`Cancelled ${ev.title} on ${fmt(p.occ.start, 'EEE d MMM')}`) }
        else { const gone = await data.deleteEvent(ev.id); onDone(`Deleted "${ev.title}"`, gone ? () => data.restoreEvent(gone) : null) }
        return
      }
      const { start, end, title, location } = p.next
      if (ev.rrule && p.change.date) {
        // Moving one repeat to another day: skip that one and add a one-off copy
        await data.skipOccurrence(ev, p.occ.occurrence)
        await data.saveEvent({ ...ev, id: undefined, rrule: null, exdates: [], title, location, starts_at: start.toISOString(), ends_at: end.toISOString() })
        onDone(`Moved ${title} to ${fmt(start, 'EEE d MMM, HH:mm')} (just this once)`)
      } else {
        // One-off event, or a new time for every repeat
        const shift = start - p.occ.start
        const s = new Date(new Date(ev.starts_at).getTime() + shift)
        const e = new Date(s.getTime() + (end - start))
        const before = { ...ev }
        await data.saveEvent({ ...ev, title, location, starts_at: s.toISOString(), ends_at: e.toISOString() })
        onDone(`${title} is now ${fmt(start, 'EEE HH:mm')}–${fmt(end, 'HH:mm')}${ev.rrule ? ' (every time)' : ''}`, () => data.saveEvent(before))
      }
    } catch (e) { setError(e.message) }
  }

  return (
    <Sheet title="Change an event" onClose={onClose}>
      <div className="group">
        <textarea className="input" rows={2} value={text} onChange={e => setText(e.target.value)} placeholder='e.g. "move gym to 7"' maxLength={300} autoFocus />
        <div className="chips-row">{EXAMPLES.map(x => <button key={x} className="ex-chip" onClick={() => setText(x)}>{x}</button>)}</div>
        <button className="btn primary block" disabled={busy || !text.trim()} onClick={ask}>{busy ? 'Thinking…' : 'Find it'}</button>
        <p className="small muted" style={{ margin: 0 }}>Works on events you made in Klander over the next 3 weeks. You'll see the change before anything happens.</p>
      </div>
      {message && <p className="small" style={{ margin: 0 }}>{message}</p>}
      {props && props.map((p, n) => (
        <div key={n} className="group change-card">
          <b>{p.occ.title}</b>
          <p className="small muted" style={{ margin: 0 }}>{fmt(p.occ.start, 'EEE d MMM')} · {timeLabel(p.occ)}{p.occ.rrule ? ' · repeats' : ''}</p>
          {p.change.delete
            ? <p style={{ margin: 0 }}>→ <b className="danger-text">{p.occ.rrule ? 'Cancel just this one' : 'Delete it'}</b></p>
            : <p style={{ margin: 0 }}>→ <b>{p.next.title !== p.occ.title ? `${p.next.title} · ` : ''}{fmt(p.next.start, 'EEE d MMM')} · {fmt(p.next.start, 'HH:mm')}–{fmt(p.next.end, 'HH:mm')}</b>{p.next.location && p.next.location !== (p.occ.location || '') ? ` · ${p.next.location}` : ''}</p>}
          {p.occ.rrule && !p.change.delete && <p className="small muted" style={{ margin: 0 }}>{p.change.date ? 'Only this one moves.' : 'This changes every repeat.'}</p>}
          <div className="row"><button className="btn primary grow" onClick={() => apply(p)}>Apply</button><button className="btn grow" onClick={() => setProps(ps => ps.filter(x => x !== p))}>Skip</button></div>
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </Sheet>
  )
}
