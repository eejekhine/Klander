import { useEffect, useRef, useState } from 'react'
import { addDays } from 'date-fns'
import { hangouts } from '../lib/insights'
import Sheet from './Sheet'
import { Avatar } from './FriendsSheet'
import { Cake } from '../views/TimeGrid'
import { fmt, isSameDay } from '../lib/dates'
import { nextBirthday } from '../lib/birthdays'
import { DEFAULT_THEME, applyThemeConfig, getTheme, sanitize, themeName } from '../lib/themes'

/** A friend's card: birthday, their theme, and "try their theme". */
export default function FriendCard({ person, birthday, data, free, social, onClose, onShowWeek, onFindTime, onMessage }) {
  const before = useRef(null)
  const [trying, setTrying] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [hang, setHang] = useState(null)
  useEffect(() => {
    let live = true
    const now = new Date()
    hangouts(addDays(now, -30), now).then(r => { if (live) setHang(r.find(h => h.friend_id === person.id) || { plans: 0 }) }).catch(() => {})
    return () => { live = false }
  }, [person.id])
  const theirs = person.theme_config && Object.keys(person.theme_config).length ? { ...DEFAULT_THEME, ...person.theme_config } : null
  const next = birthday ? nextBirthday(birthday.month, birthday.day) : null
  const first = (person.display_name || person.username).split(/\s+/)[0]
  const statusOn = person.status_text && (!person.status_until || new Date(person.status_until) > new Date())

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
        {statusOn && <p className="status-note" style={{ margin: 0 }}>“{person.status_text}”{person.status_until ? <small className="muted"> · until {fmt(new Date(person.status_until), 'HH:mm')}</small> : null}</p>}
        {free && <p className="small" style={{ margin: 0 }}><i className={`free-dot inline${free.free ? '' : ' busy'}`} /> {free.free ? `Free now${free.until ? ` until ${fmt(free.until, 'HH:mm')}` : ''}` : `Busy until ${fmt(free.until, isSameDay(free.until, new Date()) ? 'HH:mm' : 'EEE HH:mm')}`}</p>}
        {hang && <p className="hang-note">{hang.plans > 0
          ? <>You and {first}: <b>{hang.plans} {hang.plans === 1 ? 'plan' : 'plans'}</b> in the last 30 days<span className="muted"> · last {fmt(new Date(hang.last_at), 'd MMM')}</span></>
          : <span className="muted">No plans with {first} in the last 30 days.</span>}</p>}
        <div className="row">
          <button className="btn primary grow" onClick={onMessage}>Message</button>
          <button className="btn grow" onClick={onFindTime}>Find a time</button>
        </div>
        <div className="row">
          <button className="btn ghost grow" onClick={onShowWeek}>Only {first}'s week</button>
        </div>
      </div>

      {social && (
        <div className="group">
          <div className="toggle-row"><span>Close friend<br /><small className="muted">Close friends see events you mark "Close friends". Only you know who's on your list.</small></span>
            <label className="switch"><input type="checkbox" checked={social.close.includes(person.id)} onChange={() => social.toggleClose(person.id).catch(e => setError(e.message))} aria-label="Close friend" /><span /></label>
          </div>
        </div>
      )}

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
