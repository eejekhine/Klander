import { useState } from 'react'
import { addDays, addMinutes, differenceInMinutes, format, parse } from 'date-fns'
import Sheet from './Sheet'
import { REPEATS, buildRRule, fmt, parseRRule, startOfDay } from '../lib/dates'

const D = d => format(d, 'yyyy-MM-dd')
const T = d => format(d, 'HH:mm')
const join = (date, time) => parse(`${date} ${time || '00:00'}`, 'yyyy-MM-dd HH:mm', new Date())

const VIS = [
  ['friends', 'Friends', 'Friends see the title, time and place'],
  ['busy', 'Busy only', 'Friends just see that you are busy'],
  ['private', 'Private', 'Only you can see it']
]

export default function EventEditor({ data, event, occurrence, start, onClose }) {
  const isNew = !event
  const s0 = event ? new Date(event.starts_at) : start
  const e0 = event ? new Date(event.ends_at) : addMinutes(start, 60)
  const allDay0 = event?.all_day || false
  const rep = parseRRule(event?.rrule)

  const [title, setTitle] = useState(event?.title || '')
  const [allDay, setAllDay] = useState(allDay0)
  const [sDate, setSDate] = useState(D(s0))
  const [sTime, setSTime] = useState(T(s0))
  const [eDate, setEDate] = useState(D(allDay0 ? addDays(e0, -1) : e0))
  const [eTime, setETime] = useState(T(e0))
  const [repeat, setRepeat] = useState(rep.preset)
  const [until, setUntil] = useState(rep.until)
  const [categoryId, setCategoryId] = useState(event?.category_id || '')
  const [visibility, setVisibility] = useState(event?.visibility || 'friends')
  const [location, setLocation] = useState(event?.location || '')
  const [notes, setNotes] = useState(event?.notes || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Moving the start keeps the event's length the same.
  const changeStart = (date, time) => {
    const oldS = join(sDate, sTime), oldE = join(eDate, eTime)
    const dur = Math.max(0, differenceInMinutes(oldE, oldS))
    const newS = join(date, time)
    const newE = addMinutes(newS, allDay ? differenceInMinutes(join(eDate, '00:00'), join(sDate, '00:00')) : dur)
    setSDate(date); setSTime(time); setEDate(D(newE)); if (!allDay) setETime(T(newE))
  }
  // An end time earlier than the start on the same day means it runs past midnight (night shifts).
  const changeEndTime = time => {
    setETime(time)
    if (!allDay && eDate === sDate && time <= sTime) setEDate(D(addDays(join(sDate, '00:00'), 1)))
  }

  const save = async () => {
    setError('')
    if (!title.trim()) return setError('Give it a title.')
    let s, e
    if (allDay) { s = startOfDay(join(sDate)); e = addDays(startOfDay(join(eDate)), 1) }
    else { s = join(sDate, sTime); e = join(eDate, eTime) }
    if (e <= s) return setError('The end needs to be after the start.')
    if (repeat !== 'none' && until && join(until) < startOfDay(s)) return setError('"Repeat until" is before the event starts.')
    const rrule = repeat === 'custom' ? event.rrule : buildRRule(repeat, s, until || null)
    setBusy(true)
    try {
      await data.saveEvent({
        id: event?.id, title, all_day: allDay, starts_at: s.toISOString(), ends_at: e.toISOString(),
        rrule, exdates: event?.exdates || [], category_id: categoryId || null, visibility, location: location.trim(), notes: notes.trim()
      })
      onClose()
    } catch (err) { setError(err.message); setBusy(false) }
  }

  const remove = async mode => {
    setBusy(true); setError('')
    try {
      if (mode === 'one') await data.skipOccurrence(event, occurrence)
      else await data.deleteEvent(event.id)
      onClose()
    } catch (err) { setError(err.message); setBusy(false) }
  }

  const repeating = !!event?.rrule
  return (
    <Sheet title={isNew ? 'New event' : 'Edit event'} onClose={onClose}
      actions={<button className="btn primary" style={{ padding: '8px 14px' }} disabled={busy} onClick={save}>{busy ? '…' : 'Save'}</button>}>

      <input id="ev-title" className="title-input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} autoFocus={isNew} maxLength={120} />

      <div className="group">
        <div className="toggle-row"><span>All day</span>
          <label className="switch"><input id="ev-allday" type="checkbox" checked={allDay} onChange={e => {
            const on = e.target.checked
            setAllDay(on)
            if (!on && sTime === '00:00' && eTime === '00:00') { setSTime('09:00'); setETime('10:00'); setEDate(sDate) }
          }} aria-label="All day" /><span /></label>
        </div>
        <div className="two">
          <label className="field"><span>Starts</span><input id="ev-sdate" className="input" type="date" value={sDate} onChange={e => e.target.value && changeStart(e.target.value, sTime)} /></label>
          {!allDay && <label className="field"><span>&nbsp;</span><input id="ev-stime" className="input" type="time" value={sTime} onChange={e => e.target.value && changeStart(sDate, e.target.value)} /></label>}
        </div>
        <div className="two">
          <label className="field"><span>Ends</span><input id="ev-edate" className="input" type="date" value={eDate} min={sDate} onChange={e => e.target.value && setEDate(e.target.value)} /></label>
          {!allDay && <label className="field"><span>&nbsp;</span><input id="ev-etime" className="input" type="time" value={eTime} onChange={e => e.target.value && changeEndTime(e.target.value)} /></label>}
        </div>
        <label className="field"><span>Repeat</span>
          <select id="ev-repeat" className="input" value={repeat} onChange={e => setRepeat(e.target.value)}>
            {REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {repeat === 'custom' && <option value="custom">Custom (from import)</option>}
          </select>
        </label>
        {repeat !== 'none' && (
          <label className="field"><span>Repeat until (optional)</span>
            <input id="ev-until" className="input" type="date" value={until} min={sDate} onChange={e => setUntil(e.target.value)} />
          </label>
        )}
        {repeating && occurrence && <p className="muted small">Changes here apply to every repeat of this event.</p>}
      </div>

      <div className="group">
        <h3>Category</h3>
        <div className="swatches" style={{ gap: 6 }}>
          <button type="button" className="chip" style={{ '--c': 'var(--muted)', width: 'auto', padding: '6px 10px', fontSize: 13, outline: !categoryId ? '2px solid var(--ink)' : 'none' }} onClick={() => setCategoryId('')}>None</button>
          {data.categories.map(c => (
            <button key={c.id} type="button" className="chip" aria-pressed={categoryId === c.id}
              style={{ '--c': c.colour, width: 'auto', padding: '6px 10px', fontSize: 13, outline: categoryId === c.id ? '2px solid var(--ink)' : 'none' }}
              onClick={() => setCategoryId(c.id)}>{c.name}</button>
          ))}
        </div>
      </div>

      <div className="group">
        <h3>Who can see it</h3>
        <div className="seg" role="group" aria-label="Visibility" style={{ width: '100%' }}>
          {VIS.map(([v, l]) => <button key={v} type="button" style={{ flex: 1 }} aria-pressed={visibility === v} onClick={() => setVisibility(v)}>{l}</button>)}
        </div>
        <p className="muted small">{VIS.find(v => v[0] === visibility)[2]}. Friends arrive in the next update.</p>
      </div>

      <div className="group">
        <label className="field"><span>Location</span><input id="ev-loc" className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. The Edge, Leeds Beckett" maxLength={200} /></label>
        <label className="field"><span>Notes</span><textarea id="ev-notes" className="input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} /></label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {!isNew && (
        !confirmDelete
          ? <button className="btn danger block" onClick={() => setConfirmDelete(true)}>Delete event</button>
          : <div className="group">
              <p>{repeating && occurrence ? 'Delete just this one, or every repeat?' : `Delete "${event.title}"?`}</p>
              {repeating && occurrence && <button className="btn danger block" disabled={busy} onClick={() => remove('one')}>Delete only {fmt(occurrence, 'EEE d MMM')}</button>}
              <button className="btn danger block" disabled={busy} onClick={() => remove('all')}>{repeating ? 'Delete every repeat' : 'Delete'}</button>
              <button className="btn block" onClick={() => setConfirmDelete(false)}>Keep it</button>
            </div>
      )}
    </Sheet>
  )
}
