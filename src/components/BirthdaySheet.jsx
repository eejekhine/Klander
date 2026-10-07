import Sheet from './Sheet'
import { Avatar } from './FriendsSheet'
import { Cake } from '../views/TimeGrid'
import { fmt } from '../lib/dates'
import { nextBirthday } from '../lib/birthdays'

const countdown = n => (n === 0 ? 'Today!' : n === 1 ? 'Tomorrow' : `In ${n} days`)

export default function BirthdaySheet({ occ, onClose }) {
  const b = occ.birthday
  const p = b.person
  const next = nextBirthday(b.month, b.day)
  const name = b.me ? 'Your' : `${p.display_name || p.username}'s`
  return (
    <Sheet title={`${name} birthday`} onClose={onClose}>
      <div className="group">
        <div className="person-row">
          <span className="avatar-wrap"><Avatar person={p} size={48} /><span className="cake-badge"><Cake size={12} /></span></span>
          <div className="who"><b style={{ fontSize: 18 }}>{b.me ? 'You' : p.display_name || p.username}</b>{!b.me && <small>@{p.username}</small>}</div>
        </div>
        <div><b>{fmt(occ.start, 'EEEE d MMMM')}</b>
          {b.age ? <div className="muted">{b.me ? 'You turn' : 'Turns'} {b.age}</div> : null}</div>
        <div className="banner" style={{ margin: 0 }}><Cake /> <span>Next birthday: <b>{countdown(next.inDays)}</b>{next.inDays > 1 ? ` (${fmt(next.date, 'd MMM')})` : ''}</span></div>
        {!b.me && !b.year && <p className="small muted" style={{ margin: 0 }}>{(p.display_name || p.username).split(/\s+/)[0]} keeps their age private.</p>}
        {b.me && <p className="small muted" style={{ margin: 0 }}>Change your birthday in Settings.</p>}
      </div>
    </Sheet>
  )
}
