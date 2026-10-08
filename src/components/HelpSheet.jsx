import { useState } from 'react'
import Sheet from './Sheet'
import { searchHelp } from '../lib/help'

/** Help & tips: every feature in plain English, searchable, with "Show me" to jump straight there. */
export default function HelpSheet({ onClose, onShow, onTour }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const groups = searchHelp(q)
  return (
    <Sheet title="Help & tips" onClose={onClose}>
      <input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search, e.g. chat, timetable, vote" aria-label="Search help" />
      {!q && <button className="btn block" onClick={onTour}>Replay the quick tour</button>}
      {groups.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing found for "{q}". Try a simpler word like "friends" or "event".</p>}
      {groups.map(g => (
        <div key={g.group} className="group help-group">
          <h3>{g.group}</h3>
          {g.items.map(i => (
            <div key={i.id} className={`help-item${open === i.id || q ? ' open' : ''}`}>
              <button className="help-q" aria-expanded={open === i.id || !!q} onClick={() => setOpen(open === i.id ? null : i.id)}>
                <span>{i.title}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.3 8.3a1 1 0 0 1 1.4 0L12 13.6l5.3-5.3a1 1 0 1 1 1.4 1.4l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4z"/></svg>
              </button>
              {(open === i.id || q) && (
                <div className="help-a">
                  <p>{i.body}</p>
                  {i.show && <button className="linklike" onClick={() => onShow(i.show)}>Show me →</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Still stuck? Message the person who invited you to Klander.</p>
    </Sheet>
  )
}
