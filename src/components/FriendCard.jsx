import { useRef, useState } from 'react'
import Sheet from './Sheet'
import { Avatar } from './FriendsSheet'
import { Cake } from '../views/TimeGrid'
import { fmt } from '../lib/dates'
import { nextBirthday } from '../lib/birthdays'
import { DEFAULT_THEME, applyThemeConfig, getTheme, sanitize, themeName } from '../lib/themes'

/** A friend's card: birthday, their theme, and "try their theme". */
export default function FriendCard({ person, birthday, data, onClose, onShowWeek }) {
  const before = useRef(null)
  const [trying, setTrying] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const theirs = person.theme_config && Object.keys(person.theme_config).length ? { ...DEFAULT_THEME, ...person.theme_config } : null
  const next = birthday ? nextBirthday(birthday.month, birthday.day) : null
  const first = (person.display_name || person.username).split(/\s+/)[0]

  const tryIt = () => {
    before.current = getTheme()
    // keep your own size settings, borrow their look
    const mine = getTheme()
    applyThemeConfig({ ...theirs, density: mine.density, textScale: mine.textScale, fun: mine.fun })
    setTrying(true); setMsg('')
  }
  const undo = () => { if (before.current) applyThemeConfig(before.current); setTrying(false) }
  const keep = async () => {
    setError('')
    try { await data.updateProfile({ theme_config: sanitize(getTheme()) }); setTrying(false); before.current = null; setMsg(`You're now using ${first}'s theme.`) }
    catch (e) { setError(e.message) }
  }
  const close = () => { if (trying) undo(); onClose() }

  return (
    <Sheet title={person.display_name || person.username} onClose={close}>
      <div className="group">
        <div className="person-row">
          <span className="avatar-wrap"><Avatar person={person} size={52} />{next?.inDays === 0 && <span className="cake-badge"><Cake size={12} /></span>}</span>
          <div className="who"><b style={{ fontSize: 18 }}>{person.display_name || person.username}</b><small>@{person.username}</small></div>
        </div>
        <button className="btn block" onClick={onShowWeek}>See only {first}'s week</button>
      </div>

      <div className="group">
        <h3>Birthday</h3>
        {birthday
          ? <p style={{ margin: 0 }}><Cake /> <b>{fmt(next.date, 'd MMMM')}</b> · {next.inDays === 0 ? 'today!' : next.inDays === 1 ? 'tomorrow' : `in ${next.inDays} days`}
              {birthday.year ? <span className="muted"> · turns {next.date.getFullYear() - birthday.year}</span> : null}</p>
          : <p className="small muted" style={{ margin: 0 }}>{first} hasn't added their birthday yet.</p>}
      </div>

      <div className="group">
        <h3>Their theme</h3>
        {theirs
          ? <>
              <p style={{ margin: 0 }}><b>{themeName(theirs)}</b></p>
              {!trying
                ? <button className="btn block" onClick={tryIt}>Try their theme</button>
                : <div className="row"><button className="btn primary grow" onClick={keep}>Keep it</button><button className="btn grow" onClick={undo}>Undo</button></div>}
            </>
          : <p className="small muted" style={{ margin: 0 }}>{first} is using the standard Klander look.</p>}
        {msg && <p className="small" style={{ color: 'var(--good)', margin: 0 }}>{msg}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </Sheet>
  )
}
