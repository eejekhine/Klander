import Sheet from './Sheet'
import { Avatar } from './FriendsSheet'
import { fmt, timeLabel } from '../lib/dates'
import EventPhotos from './EventPhotos'

export default function FriendEventSheet({ occ, onClose, uid, me, people }) {
  const p = occ.friend
  const busy = occ.visibility === 'busy'
  return (
    <Sheet title={`${p.display_name || p.username}'s event`} onClose={onClose}>
      <div className="group">
        <div className="person-row">
          <Avatar person={p} size={44} />
          <div className="who"><b style={{ fontSize: 18 }}>{occ.title}</b><small>@{p.username}</small></div>
        </div>
        <div><b>{fmt(occ.start, 'EEEE d MMMM')}</b><div className="muted">{timeLabel(occ)}{occ.rrule ? ' · repeats' : ''}</div></div>
        {occ.location && <div><span className="muted">Where: </span>{occ.location}</div>}
        {busy && <p className="small muted">{p.display_name || p.username} has marked this as busy, so the details are hidden.</p>}
      </div>
      {!busy && <EventPhotos eventId={occ.id} uid={uid} canAdd={false} people={people} me={me} />}
    </Sheet>
  )
}
