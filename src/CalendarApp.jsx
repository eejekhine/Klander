import { useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, addWeeks } from 'date-fns'
import { expandEvents, rangeFor, titleFor } from './lib/dates'
import { initials } from './lib/colours'
import TimeGrid from './views/TimeGrid'
import MonthView from './views/MonthView'
import AgendaView from './views/AgendaView'
import EventEditor from './components/EventEditor'
import Settings from './components/Settings'

const VIEWS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['agenda', 'List']]
const readView = () => { try { return localStorage.getItem('klander:view') || 'week' } catch { return 'week' } }

export default function CalendarApp({ data }) {
  const [view, setView] = useState(readView)
  const [date, setDate] = useState(() => new Date())
  const [editing, setEditing] = useState(null) // {event?, occurrence?, start?}
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => { try { localStorage.setItem('klander:view', view) } catch { /* ignore */ } }, [view])
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t) }, [])

  const catMap = useMemo(() => Object.fromEntries(data.categories.map(c => [c.id, c])), [data.categories])
  const colourOf = ev => catMap[ev.category_id]?.colour || data.profile.colour
  const range = useMemo(() => rangeFor(view, date), [view, date])
  const occurrences = useMemo(() => expandEvents(data.events, range.from, range.to), [data.events, range])

  const step = dir => setDate(d =>
    view === 'day' ? addDays(d, dir) : view === 'week' ? addWeeks(d, dir) : view === 'month' ? addMonths(d, dir) : addDays(d, dir * 30))

  const openNew = start => setEditing({ start: start || defaultStart(date) })
  const openEvent = occ => setEditing({ event: data.events.find(e => e.id === occ.id), occurrence: occ.occurrence || null })
  const openDay = d => { setDate(d); setView('day') }

  const p = data.profile
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <h1>{titleFor(view, date)}</h1>
          <button className="btn" style={{ padding: '8px 12px' }} onClick={() => setDate(new Date())}>Today</button>
          <button className="icon-btn" aria-label="Previous" onClick={() => step(-1)}>‹</button>
          <button className="icon-btn" aria-label="Next" onClick={() => step(1)}>›</button>
          <button className="avatar" aria-label="Profile and settings" onClick={() => setSettingsOpen(true)}
            style={p.avatar_url ? { backgroundImage: `url(${p.avatar_url})`, borderColor: p.colour } : { background: p.colour, borderColor: p.colour }}>
            {!p.avatar_url && initials(p)}
          </button>
        </div>
        <div className="seg" role="group" aria-label="View" style={{ justifySelf: 'start' }}>
          {VIEWS.map(([v, label]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>)}
        </div>
      </header>

      <main className="main">
        {(view === 'day' || view === 'week') &&
          <TimeGrid days={view === 'day' ? [range.from] : Array.from({ length: 7 }, (_, i) => addDays(range.from, i))}
            occurrences={occurrences} colourOf={colourOf} now={now} onEvent={openEvent} onSlot={openNew} onDay={openDay} />}
        {view === 'month' &&
          <MonthView date={date} range={range} occurrences={occurrences} colourOf={colourOf} now={now} onDay={openDay} onEvent={openEvent} />}
        {view === 'agenda' &&
          <AgendaView from={range.from} occurrences={occurrences} colourOf={colourOf} catMap={catMap} now={now} onEvent={openEvent} />}
      </main>

      <button className="fab" aria-label="New event" onClick={() => openNew()}>+</button>
      {!data.online && <div className="offline-pill">Offline · showing saved calendar</div>}

      {editing && <EventEditor data={data} {...editing} onClose={() => setEditing(null)} />}
      {settingsOpen && <Settings data={data} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function defaultStart(selected) {
  const n = new Date()
  const d = new Date(selected)
  d.setHours(n.getHours() + 1, 0, 0, 0)
  return d
}
