import Sheet from './Sheet'
import { fmt, timeLabel } from '../lib/dates'

export default function ImportedEventSheet({ occ, source, category, onClose, onOpenCalendars }) {
  return (
    <Sheet title="Event" onClose={onClose}>
      <div className="group">
        <b style={{ fontSize: 18 }}>{occ.title}</b>
        <div><b>{fmt(occ.start, 'EEEE d MMMM')}</b><div className="muted">{timeLabel(occ)}{occ.rrule ? ' · repeats' : ''}</div></div>
        {occ.location && <div><span className="muted">Where: </span>{occ.location}</div>}
        {category && <div><span className="muted">Category: </span>{category.name}</div>}
        {occ.notes && <p className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{occ.notes}</p>}
      </div>
      <div className="group">
        <p className="small muted" style={{ margin: 0 }}>
          This comes from your linked calendar <b>{source?.name || 'calendar'}</b>, so change it there. Klander picks up changes every few hours.
        </p>
        <button className="btn block" onClick={onOpenCalendars}>Calendar settings</button>
      </div>
    </Sheet>
  )
}
