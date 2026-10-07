import { addDays } from 'date-fns'
import { startOfDay } from '../lib/dates'
import { eventsOn, fmt, isSameDay, timeLabel } from '../lib/dates'

export default function AgendaView({ from, occurrences, colourOf, catMap, now, onEvent }) {
  const days = Array.from({ length: 60 }, (_, i) => addDays(from, i))
    .map(d => [d, eventsOn(occurrences, d)])
    .filter(([, list]) => list.length)
  if (!days.length) return <div className="agenda"><p className="empty">Nothing in the next 60 days. Tap + to add something.</p></div>
  return (
    <div className="agenda">
      {days.map(([d, list]) => (
        <div key={d.getTime()} className="agenda-day">
          <div className={`agenda-date${isSameDay(d, now) ? ' today' : ''}`}><small>{fmt(d, 'EEE')}</small><b>{fmt(d, 'd')}</b><small>{fmt(d, 'MMM')}</small></div>
          <div className="agenda-list">
            {list.map(o => (
              <button key={o.key} className="agenda-item" style={{ '--c': colourOf(o) }} onClick={() => onEvent(o)}>
                <i />
                <span><b>{o.title}</b>
                  <small>{!o.all_day && o.start < startOfDay(d) ? `Until ${fmt(o.end, 'HH:mm')}` : timeLabel(o)}{o.location ? ` · ${o.location}` : ''}{catMap[o.category_id] ? ` · ${catMap[o.category_id].name}` : ''}{o.rrule ? ' · repeats' : ''}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
