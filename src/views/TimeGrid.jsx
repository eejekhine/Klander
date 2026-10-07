import { useEffect, useRef } from 'react'
import { differenceInMinutes } from 'date-fns'
import { evVars } from '../lib/themes'
import { Avatar } from '../components/FriendsSheet'
import { allDayOn, fmt, isSameDay, layoutDay, startOfDay, timeLabel } from '../lib/dates'

const GUTTER = 44

/** Day/week grid. Pass `columns` ([{ key, day, person, label, occurrences }]) for the side-by-side view instead of `days`. */
export default function TimeGrid({ days: daysIn, columns, occurrences, colourOf, now, onEvent, onSlot, onDay, onPerson, hour: HOUR = 52 }) {
  const scrollRef = useRef(null)
  const C = columns || daysIn.map(d => ({ key: d.getTime(), day: d, occurrences }))
  const days = C.map(c => c.day)
  const people = !!columns
  const cols = `${GUTTER}px repeat(${C.length}, minmax(0, 1fr))`
  const single = C.length === 1

  // Scroll to roughly "now" (or 07:00) on first show and when the visible range changes.
  const firstDay = days[0].getTime()
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const showsToday = days.some(d => isSameDay(d, new Date()))
    const h = showsToday ? Math.max(0, new Date().getHours() - 2) : 7
    el.scrollTop = h * HOUR
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDay, days.length, HOUR])

  const hasAllDay = C.some(c => allDayOn(c.occurrences, c.day).length)

  const slotClick = (e, day) => {
    if (e.target !== e.currentTarget) return
    const y = e.nativeEvent.offsetY
    const mins = Math.floor(y / HOUR * 2) * 30
    const d = startOfDay(day); d.setMinutes(mins)
    onSlot(d)
  }

  return (
    <div className="tg">
      <div className="tg-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {C.map(c => people ? (
          <button key={c.key} className="tg-dayhead person" onClick={() => onPerson?.(c.person)}>
            <Avatar person={c.person} size={26} /><span>{c.label}</span>
          </button>
        ) : (
          <button key={c.key} className={`tg-dayhead${isSameDay(c.day, now) ? ' today' : ''}`} onClick={() => onDay(c.day)}>
            <span>{fmt(c.day, single ? 'EEEE' : 'EEE')}</span><b>{fmt(c.day, 'd')}</b>
          </button>
        ))}
      </div>

      {hasAllDay && (
        <div className="tg-allday" style={{ gridTemplateColumns: cols }}>
          <div className="label">all-day</div>
          {C.map(({ key, day: d, occurrences }) => (
            <div key={key} className="cell">
              {allDayOn(occurrences, d).map(o =>
                <button key={o.key} className={chipClass(o)} style={evVars(colourOf(o))} onClick={() => onEvent(o)}>{o.birthday && <Cake />}{o.birthday && !single ? o.birthday.short : <>{o.friend && !people ? `${first(o.friend)}: ` : ''}{o.title}</>}</button>)}
            </div>
          ))}
        </div>
      )}

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body" style={{ gridTemplateColumns: cols, height: HOUR * 24 }}>
          <div className="tg-gutter">
            {Array.from({ length: 23 }, (_, i) => <span key={i} style={{ top: (i + 1) * HOUR }}>{String(i + 1).padStart(2, '0')}:00</span>)}
          </div>
          {C.map(({ key, day: d, occurrences }) => {
            const today = isSameDay(d, now)
            return (
              <div key={key} className={`tg-col${today && !people ? ' today' : ''}`} onClick={e => slotClick(e, d)}>
                {Array.from({ length: 24 }, (_, i) => <div key={i} className="hourline" style={{ top: i * HOUR, pointerEvents: 'none' }} />)}
                {single && Array.from({ length: 24 }, (_, i) => <div key={'h' + i} className="halfline" style={{ top: i * HOUR + HOUR / 2, pointerEvents: 'none' }} />)}
                {layoutDay(occurrences, d).map(({ ev, top, bottom, col, cols: n }) => {
                  const h = (bottom - top) / 60 * HOUR
                  return (
                    <button key={ev.key} className={`ev${ev.plan ? ' plan' : ev.friend ? ' friend' : ''}${ev.friend && ev.visibility === 'busy' ? ' busy' : ''}`} onClick={() => onEvent(ev)}
                      style={{ ...evVars(colourOf(ev)), top: top / 60 * HOUR + 1, height: h - 2, left: `calc(${col / n * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}>
                      <b>{ev.friend && !people && <span className="who-tag">{first(ev.friend)} </span>}{ev.title}</b>
                      {h > 34 && <small>{timeLabel(ev)}</small>}
                      {h > 52 && ev.location && <small>{ev.location}</small>}
                    </button>
                  )
                })}
                {isSameDay(d, now) && <div className="nowline" style={{ top: differenceInMinutes(now, startOfDay(now)) / 60 * HOUR }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const first = p => (p.display_name || p.username || '').split(/\s+/)[0]
export const chipClass = o => `chip${o.birthday ? ' bday' : ''}${o.plan ? ' plan' : o.friend ? ' friend' : ''}${o.friend && o.visibility === 'busy' ? ' busy' : ''}`
export const Cake = ({ size = 13 }) => (
  <svg className="cake" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="12" cy="3.6" rx="1.9" ry="2.6" fill="#ffb020" />
    <rect x="10.9" y="6.6" width="2.2" height="4" rx=".6" fill="currentColor" opacity=".55" />
    <rect x="5" y="10.4" width="14" height="5" rx="1.6" fill="currentColor" opacity=".75" />
    <rect x="2.5" y="15.2" width="19" height="7" rx="1.8" fill="currentColor" />
  </svg>
)
