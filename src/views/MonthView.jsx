import { addDays, differenceInCalendarDays } from 'date-fns'
import { eventsOn, fmt, isSameDay } from '../lib/dates'

const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function MonthView({ date, range, occurrences, colourOf, now, onDay }) {
  const n = differenceInCalendarDays(range.to, range.from)
  const days = Array.from({ length: n }, (_, i) => addDays(range.from, i))
  return (
    <div className="month">
      <div className="month-head">{NAMES.map(d => <span key={d}>{d}</span>)}</div>
      <div className="month-grid">
        {days.map(d => {
          const list = eventsOn(occurrences, d)
          const other = d.getMonth() !== date.getMonth()
          return (
            <button key={d.getTime()} className={`mcell${other ? ' other' : ''}${isSameDay(d, now) ? ' today' : ''}`}
              onClick={() => onDay(d)} aria-label={`${fmt(d, 'EEEE d MMMM')}, ${list.length} events`}>
              <span className="dn">{fmt(d, 'd')}</span>
              {list.slice(0, 3).map(o => <span key={o.key} className="chip" style={{ '--c': colourOf(o) }}>{o.title}</span>)}
              {list.length > 3 && <span className="more">+{list.length - 3} more</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
