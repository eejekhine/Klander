import { useMemo, useState } from 'react'
import { addHours, startOfDay } from 'date-fns'
import Sheet from './Sheet'
import { expandEvents, fmt, timeLabel } from '../lib/dates'
import { addEventPhoto } from '../lib/memories'

/** "Add a photo": put it on what you're doing now (or did today), or turn it into an event. */
export default function AddPhotoSheet({ uid, file, data, goingPlans, onClose, onDone, onMakeEvent }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const now = new Date()
  const options = useMemo(() => {
    const occ = [...expandEvents(data.events, startOfDay(now), addHours(now, 2)), ...expandEvents(goingPlans, startOfDay(now), addHours(now, 2))]
      .filter(o => !o.all_day && !o.source_id && o.start <= addHours(now, 1))
    // happening now first, then the most recent
    return occ.sort((a, b) => (b.start <= now && b.end > now) - (a.start <= now && a.end > now) || b.start - a.start).slice(0, 6)
  }, [data.events, goingPlans]) // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => URL.createObjectURL(file), [file])
  const attach = async o => {
    setBusy(o.key); setError('')
    try { await addEventPhoto(uid, o.id, file, o.start <= now && o.end > now ? now : o.start); onDone(`Added to ${o.title}. It'll be in your My Week.`) }
    catch (e) { setError(e.message); setBusy(null) }
  }
  return (
    <Sheet title="Add a photo" onClose={onClose}>
      <img className="add-photo-preview" src={preview} alt="" />
      <div className="group">
        <h3>{options.length ? 'Which event is it from?' : 'Nothing on today'}</h3>
        {options.map(o => (
          <button key={o.key} className="plan-row" disabled={!!busy} onClick={() => attach(o)}>
            <span className="ev-date"><small>{fmt(o.start, 'EEE')}</small><b>{fmt(o.start, 'd')}</b></span>
            <span><b>{o.title}</b><small>{o.start <= now && o.end > now ? 'Happening now · ' : ''}{timeLabel(o)}</small></span>
            <small>{busy === o.key ? 'Adding…' : 'Add'}</small>
          </button>
        ))}
        <button className="btn block" onClick={() => onMakeEvent(file)}>Make a new event from this photo</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Sheet>
  )
}
