import { useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, addWeeks } from 'date-fns'
import { expandEvents, rangeFor, titleFor } from './lib/dates'
import { initials } from './lib/colours'
import { useFriends, pendingInvite, clearInvite } from './lib/friends'
import TimeGrid from './views/TimeGrid'
import MonthView from './views/MonthView'
import AgendaView from './views/AgendaView'
import EventEditor from './components/EventEditor'
import Settings from './components/Settings'
import FriendsSheet, { Avatar } from './components/FriendsSheet'
import { first } from './views/TimeGrid'
import FriendEventSheet from './components/FriendEventSheet'
import CalendarsSheet from './components/CalendarsSheet'
import ImportedEventSheet from './components/ImportedEventSheet'
import SmartAddSheet from './components/SmartAddSheet'
import { useCalendarSources } from './lib/sync'
import AppearanceSheet from './components/AppearanceSheet'
import BirthdaySheet from './components/BirthdaySheet'
import FriendCard from './components/FriendCard'
import Confetti from './components/Confetti'
import { Cake } from './views/TimeGrid'
import { harmonize, seasonalFor, useThemeState } from './lib/themes'
import { birthdayOccurrences, nextBirthday, useBirthdays } from './lib/birthdays'
import { fmt } from './lib/dates'

const VIEWS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['agenda', 'List']]
const readView = () => { try { return localStorage.getItem('klander:view') || 'week' } catch { return 'week' } }

export default function CalendarApp({ data, user }) {
  const [view, setView] = useState(readView)
  const [date, setDate] = useState(() => new Date())
  const [editing, setEditing] = useState(null) // {event?, occurrence?, start?}
  const [viewing, setViewing] = useState(null) // a friend's occurrence
  const [sheet, setSheet] = useState(null) // 'settings' | 'friends'
  const [now, setNow] = useState(() => new Date())
  const [toast, setToast] = useState('')
  const f = useFriends(user.id)
  const bd = useBirthdays(user.id)
  const theme = useThemeState()
  const fun = theme.config.fun !== false
  const [bdayView, setBdayView] = useState(null)
  const [card, setCard] = useState(null) // friend person
  const todayKey = fmt(now, 'yyyy-MM-dd')
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem('klander:bday-banner') || '' } catch { return '' } })
  const [confetti, setConfetti] = useState(false)
  const cal = useCalendarSources(user.id, data.refresh)
  const [imported, setImported] = useState(null)
  const seenKey = `klander:seen:${user.id}`
  const [seenAt, setSeenAt] = useState(() => { try { return localStorage.getItem(seenKey) || '' } catch { return '' } })
  const unseen = f.activity.filter(a => a.created_at > seenAt && f.people[a.actor]).length
  const openFriends = () => {
    setSheet('friends')
    const t = new Date().toISOString(); setSeenAt(t)
    try { localStorage.setItem(seenKey, t) } catch { /* ignore */ }
  }

  useEffect(() => { try { localStorage.setItem('klander:view', view) } catch { /* ignore */ } }, [view])
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t) }, [toast])

  // Arrived through someone's invite link? Become friends now that we're signed in.
  useEffect(() => {
    const code = pendingInvite()
    if (!code) return
    clearInvite()
    f.acceptInvite(code)
      .then(r => setToast(r === 'invalid' ? "That invite link doesn't work any more." : r === 'self' ? "That's your own invite link." : `You're now friends with @${r}.`))
      .catch(() => setToast("Couldn't use that invite link. Try opening it again."))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const catMap = useMemo(() => Object.fromEntries(data.categories.map(c => [c.id, c])), [data.categories])
  const range = useMemo(() => rangeFor(view, date), [view, date])

  const mine = useMemo(() => expandEvents(data.events, range.from, range.to), [data.events, range])
  const theirs = useMemo(() => {
    const visible = f.friendEvents.filter(e => f.people[e.owner_id] && !f.hidden.includes(e.owner_id))
    return expandEvents(visible, range.from, range.to).map(o => ({ ...o, friend: f.people[o.owner_id] }))
  }, [f.friendEvents, f.people, f.hidden, range])
  const meHidden = f.hidden.includes(user.id)

  // Birthdays: yours and your friends' (only day + month unless they share the year)
  const bdayPeople = useMemo(() => {
    const out = []
    if (bd.mine?.birthday) {
      const [y, m, d] = bd.mine.birthday.split('-').map(Number)
      out.push({ id: user.id, person: data.profile, month: m, day: d, year: y, me: true })
    }
    for (const b of bd.friends) if (f.people[b.user_id]) out.push({ id: b.user_id, person: f.people[b.user_id], month: b.month, day: b.day, year: b.year || null })
    return out
  }, [bd.mine, bd.friends, f.people, data.profile, user.id])
  const bdays = useMemo(() => birthdayOccurrences(bdayPeople.filter(b => !f.hidden.includes(b.id)), range.from, range.to), [bdayPeople, f.hidden, range])
  const occurrences = useMemo(
    () => [...bdays, ...(meHidden ? [] : mine), ...theirs].sort((a, b) => a.start - b.start || b.end - a.end),
    [bdays, mine, theirs, meHidden])

  const soon = useMemo(() => bdayPeople.map(b => ({ ...b, next: nextBirthday(b.month, b.day, now) })).filter(b => b.next.inDays <= 3).sort((a, b) => a.next.inDays - b.next.inDays), [bdayPeople, now])
  const birthdayToday = id => soon.some(b => b.id === id && b.next.inDays === 0)
  const myBirthday = birthdayToday(user.id)
  const season = fun ? seasonalFor(now) : null
  useEffect(() => {
    if (!fun || !myBirthday) return
    const k = `klander:confetti:${todayKey}`
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1') } catch { /* ignore */ }
    setConfetti(true)
  }, [fun, myBirthday, todayKey])
  const dismissBanner = () => { setDismissed(todayKey); try { localStorage.setItem('klander:bday-banner', todayKey) } catch { /* ignore */ } }

  const colourOf = ev => harmonize(ev.birthday ? ev.birthday.person.colour : ev.friend ? ev.friend.colour : catMap[ev.category_id]?.colour || data.profile.colour)

  const step = dir => setDate(d =>
    view === 'day' ? addDays(d, dir) : view === 'week' ? addWeeks(d, dir) : view === 'month' ? addMonths(d, dir) : addDays(d, dir * 30))

  const openNew = start => setEditing({ start: start || defaultStart(date) })
  const openEvent = occ => (occ.birthday
    ? setBdayView(occ)
    : occ.friend
    ? setViewing(occ)
    : occ.source_id
      ? setImported(occ)
      : setEditing({ event: data.events.find(e => e.id === occ.id), occurrence: occ.occurrence || null }))
  const openDay = d => { setDate(d); setView('day') }

  const p = data.profile
  const requests = f.incoming.length
  return (
    <div className={`app${season ? ' seasonal' : ''}`} style={season ? { '--season': season.colour } : undefined}>
      <header className="topbar">
        <div className="topbar-row">
          <h1>{titleFor(view, date)}</h1>
          {season && <span className="season" title={season.label}>{season.label}</span>}
          <button className="btn" style={{ padding: '8px 12px' }} onClick={() => setDate(new Date())}>Today</button>
          <button className="icon-btn" aria-label="Previous" onClick={() => step(-1)}>‹</button>
          <button className="icon-btn" aria-label="Next" onClick={() => step(1)}>›</button>
          <button className="avatar" aria-label="Profile and settings" onClick={() => setSheet('settings')}
            style={p.avatar_url ? { backgroundImage: `url(${p.avatar_url})`, borderColor: p.colour } : { background: p.colour, borderColor: p.colour }}>
            {!p.avatar_url && initials(p)}
          </button>
        </div>
        <div className="seg" role="group" aria-label="View" style={{ justifySelf: 'start' }}>
          {VIEWS.map(([v, label]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>)}
        </div>
        <div className="people-strip" role="group" aria-label="Whose events to show">
          <button className="pchip" aria-pressed={!meHidden} onClick={() => f.toggleHidden(user.id)}><Avatar person={p} size={24} />You{fun && myBirthday && <Cake />}</button>
          {f.friends.map(({ person }) => (
            <button key={person.id} className="pchip" aria-pressed={!f.hidden.includes(person.id)} onClick={() => f.toggleHidden(person.id)}>
              <Avatar person={person} size={24} />{(person.display_name || person.username).split(/\s+/)[0]}{fun && birthdayToday(person.id) && <Cake />}
            </button>
          ))}
          <button className="pchip add" onClick={openFriends}>
            {f.friends.length ? 'Friends' : '+ Add friends'}{requests + unseen > 0 && <span className="badge">{requests + unseen}</span>}
          </button>
        </div>
        {soon.length > 0 && dismissed !== todayKey && (
          <div className="banner" role="status">
            <Cake />
            <span>{soon.slice(0, 2).map((b, i) => {
              const who = b.me ? 'your' : `${(b.person.display_name || b.person.username).split(/\s+/)[0]}'s`
              const when = b.next.inDays === 0 ? 'today' : b.next.inDays === 1 ? 'tomorrow' : `on ${fmt(b.next.date, 'EEEE')}`
              const txt = b.me && b.next.inDays === 0 ? <>Happy birthday, <b>{first(p)}</b>!</> : <>It's <b>{who}</b> birthday {when}</>
              return <span key={b.id}>{i ? ' · ' : ''}{b.me || b.next.inDays !== 0 ? txt : <button className="linklike" style={{ font: 'inherit' }} onClick={() => setCard(b.person)}>{txt}</button>}</span>
            })}{soon.length > 2 ? ` +${soon.length - 2} more` : ''}</span>
            <button className="x" aria-label="Dismiss" onClick={dismissBanner}>×</button>
          </div>
        )}
      </header>

      <main className="main">
        {(view === 'day' || view === 'week') &&
          <TimeGrid days={view === 'day' ? [range.from] : Array.from({ length: 7 }, (_, i) => addDays(range.from, i))}
            occurrences={occurrences} colourOf={colourOf} now={now} onEvent={openEvent} onSlot={openNew} onDay={openDay} hour={theme.config.density || 52} />}
        {view === 'month' &&
          <MonthView date={date} range={range} occurrences={occurrences} colourOf={colourOf} now={now} onDay={openDay} onEvent={openEvent} />}
        {view === 'agenda' &&
          <AgendaView from={range.from} occurrences={occurrences} colourOf={colourOf} catMap={catMap} now={now} onEvent={openEvent} />}
      </main>

      <button className="fab-smart" onClick={() => setSheet('smart')}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg>
        Smart add
      </button>
      <button className="fab" aria-label="New event" onClick={() => openNew()}>+</button>
      {!data.online && <div className="offline-pill">Offline · showing saved calendar</div>}
      {toast && <div className="toast" role="status">{toast}</div>}

      {editing && <EventEditor data={data} {...editing} onClose={() => setEditing(null)} />}
      {viewing && <FriendEventSheet occ={viewing} onClose={() => setViewing(null)} />}
      {sheet === 'settings' && <Settings data={data} bd={bd} onClose={() => setSheet(null)} onOpenCalendars={() => setSheet('calendars')} onOpenAppearance={() => setSheet('appearance')} />}
      {sheet === 'appearance' && <AppearanceSheet data={data} onClose={() => setSheet(null)} />}
      {bdayView && <BirthdaySheet occ={bdayView} onClose={() => setBdayView(null)} />}
      {card && <FriendCard person={f.people[card.id] || card} birthday={bd.friends.find(b => b.user_id === card.id)} data={data}
        onClose={() => setCard(null)} onShowWeek={() => { f.showOnly(card.id); setCard(null); setSheet(null) }} />}
      {confetti && <Confetti colours={[p.colour, '#ffb020', '#ff5d8f', '#22c55e', '#7c3aed']} onDone={() => setConfetti(false)} />}
      {sheet === 'smart' && <SmartAddSheet data={data} onClose={() => setSheet(null)} onDone={msg => { setSheet(null); setToast(msg) }} />}
      {sheet === 'calendars' && <CalendarsSheet data={data} cal={cal} onClose={() => setSheet(null)} />}
      {imported && <ImportedEventSheet occ={imported} source={cal.sources.find(s => s.id === imported.source_id)}
        category={catMap[imported.category_id]} onClose={() => setImported(null)} onOpenCalendars={() => { setImported(null); setSheet('calendars') }} />}
      {sheet === 'friends' && <FriendsSheet f={f} onClose={() => setSheet(null)} onPerson={person => { setSheet(null); setCard(person) }} />}
    </div>
  )
}

function defaultStart(selected) {
  const n = new Date()
  const d = new Date(selected)
  d.setHours(n.getHours() + 1, 0, 0, 0)
  return d
}
