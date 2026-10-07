import { useState } from 'react'
import Sheet from './Sheet'
import { Avatar } from './FriendsSheet'
import { fmt, timeLabel } from '../lib/dates'
import { RSVP, statusLabel } from '../lib/plans'

/** A plan a friend invited you to: details, who's going, and your answer. */
export default function InviteSheet({ invite, plans, people, me, onClose }) {
  const live = plans.invites.find(i => i.id === invite.id) || invite
  const host = people[live.owner_id]
  const [error, setError] = useState('')
  const s = invite.start || new Date(live.starts_at), e = invite.end || new Date(live.ends_at)
  const answer = async v => { setError(''); try { await plans.respond(live.id, v) } catch (err) { setError(err.message) } }
  const guests = (live.guests || []).map(g => ({ ...g, person: g.user_id === me.id ? me : people[g.user_id] })).filter(g => g.person)
  return (
    <Sheet title={`${(host?.display_name || host?.username || 'Friend').split(/\s+/)[0]}'s plan`} onClose={onClose}>
      <div className="group">
        <div className="person-row">
          <Avatar person={host} size={44} />
          <div className="who"><b style={{ fontSize: 18 }}>{live.title}</b><small>Hosted by @{host?.username}</small></div>
        </div>
        <div><b>{fmt(s, 'EEEE d MMMM')}</b><div className="muted">{timeLabel({ start: s, end: e, all_day: live.all_day })}{live.rrule ? ' · repeats' : ''}</div></div>
        {live.location && <div><span className="muted">Where: </span>{live.location}</div>}
        {live.notes && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{live.notes}</p>}
      </div>
      <div className="group">
        <h3>Are you going?</h3>
        <div className="seg" role="group" style={{ width: '100%' }}>
          {RSVP.map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={live.my_status === v} onClick={() => answer(v)}>{l}</button>)}
        </div>
        {live.my_status === 'going' && <p className="small muted" style={{ margin: 0 }}>It's on your calendar.</p>}
      </div>
      <div className="group">
        <h3>Guests</h3>
        <div className="person-row"><Avatar person={host} size={30} /><div className="who"><b>{host?.display_name || host?.username}</b></div><small className="rsvp going">Host</small></div>
        {guests.map(g => (
          <div key={g.user_id} className="person-row">
            <Avatar person={g.person} size={30} />
            <div className="who"><b>{g.user_id === me.id ? 'You' : g.person.display_name || g.person.username}</b></div>
            <small className={`rsvp ${g.status}`}>{statusLabel(g.status)}</small>
          </div>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Sheet>
  )
}
