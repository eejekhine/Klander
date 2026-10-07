import { useEffect, useRef } from 'react'
import { differenceInMinutes } from 'date-fns'
import { allDayOn, fmt, isSameDay, layoutDay, startOfDay, timeLabel } from '../lib/dates'

const HOUR = 52
const GUTTER = 44

export default function TimeGrid({ days, occurrences, colourOf, now, onEvent, onSlot, onDay }) {
  const scrollRef = useRef(null)
  const cols = `${GUTTER}px repeat(${days.length}, minmax(0, 1fr))`
  const single = days.length === 1

  // Scroll to roughly "now" (or 07:00) on first show and when the visible range changes.
  const firstDay = days[0].getTime()
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const showsToday = days.some(d => isSameDay(d, new Date()))
    const h = showsToday ? Math.max(0, new Date().getHours() - 2) : 7
    el.scrollTop = h * HOUR
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDay, days.length])

  const hasAllDay = days.some(d => allDayOn(occurrences, d).length)

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
        {days.map(d => (
          <button key={d.getTime()} className={`tg-dayhead${isSameDay(d, now) ? ' today' : ''}`} onClick={() => onDay(d)}>
            <span>{fmt(d, single ? 'EEEE' : 'EEE')}</span><b>{fmt(d, 'd')}</b>
          </button>
        ))}
      </div>

      {hasAllDay && (
        <div className="tg-allday" style={{ gridTemplateColumns: cols }}>
          <div className="label">all-day</div>
          {days.map(d => (
            <div key={d.getTime()} className="cell">
              {allDayOn(occurrences, d).map(o =>
                <button key={o.key} className={chipClass(o)} style={{ '--c': colourOf(o) }} onClick={() => onEvent(o)}>{o.friend ? `${first(o.friend)}: ` : ''}{o.title}</button>)}
            </div>
          ))}
        </div>
      )}

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body" style={{ gridTemplateColumns: cols, height: HOUR * 24 }}>
          <div className="tg-gutter">
            {Array.from({ length: 23 }, (_, i) => <span key={i} style={{ top: (i + 1) * HOUR }}>{String(i + 1).padStart(2, '0')}:00</span>)}
          </div>
          {days.map(d => {
            const today = isSameDay(d, now)
            return (
              <div key={d.getTime()} className={`tg-col${today ? ' today' : ''}`} onClick={e => slotClick(e, d)}>
                {Array.from({ length: 24 }, (_, i) => <div key={i} className="hourline" style={{ top: i * HOUR, pointerEvents: 'none' }} />)}
                {single && Array.from({ length: 24 }, (_, i) => <div key={'h' + i} className="halfline" style={{ top: i * HOUR + HOUR / 2, pointerEvents: 'none' }} />)}
                {layoutDay(occurrences, d).map(({ ev, top, bottom, col, cols: n }) => {
                  const h = (bottom - top) / 60 * HOUR
                  return (
                    <button key={ev.key} className={`ev${ev.friend ? ' friend' : ''}${ev.friend && ev.visibility === 'busy' ? ' busy' : ''}`} onClick={() => onEvent(ev)}
                      style={{ '--c': colourOf(ev), top: top / 60 * HOUR + 1, height: h - 2, left: `calc(${col / n * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}>
                      <b>{ev.friend && <span className="who-tag">{first(ev.friend)} </span>}{ev.title}</b>
                      {h > 34 && <small>{timeLabel(ev)}</small>}
                      {h > 52 && ev.location && <small>{ev.location}</small>}
                    </button>
                  )
                })}
                {today && <div className="nowline" style={{ top: differenceInMinutes(now, startOfDay(now)) / 60 * HOUR }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const first = p => (p.display_name || p.username || '').split(/\s+/)[0]
export const chipClass = o => `chip${o.friend ? ' friend' : ''}${o.friend && o.visibility === 'busy' ? ' busy' : ''}`
