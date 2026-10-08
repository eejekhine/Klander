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
import PlansSheet, { BroadcastCard } from './components/PlansSheet'
import InviteSheet from './components/InviteSheet'
import { usePlans } from './lib/plans'
import { useNotifications } from './lib/notify'
import { useSocial } from './lib/social'
import Swipe from './components/Swipe'
import ChatScreen from './components/ChatScreen'
import HelpSheet from './components/HelpSheet'
import WelcomeTour from './components/WelcomeTour'
import { TOUR_KEY } from './lib/help'
import { useChats } from './lib/chat'
import PollSheet from './components/PollSheet'
import { differenceInCalendarDays } from 'date-fns'
import NotificationsSheet, { BellIcon } from './components/NotificationsSheet'
import { buildBusyMap, freeNow } from './lib/freetime'

const VIEWS = [['day', 'Day', 'One day, in detail'], ['week', 'Week', 'Seven days at a glance'], ['month', 'Month', 'The whole month'], ['agenda', 'List', 'Everything coming up'], ['people', 'People', 'Everyone side by side for a day']]
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
  const pl = usePlans(user.id)
  const nt = useNotifications(user.id)
  const so = useSocial(user.id)
  const [menu, setMenu] = useState(null) // 'view' | 'add'
  const ch = useChats(user.id)
  const chatUnread = ch.unread
  const [chatOpen, setChatOpen] = useState(null)
  const [smartText, setSmartText] = useState('')
  const [tour, setTour] = useState(() => { try { return !localStorage.getItem(TOUR_KEY) } catch { return false } })
  const doneTour = () => { setTour(false); try { localStorage.setItem(TOUR_KEY, '1') } catch { /* ignore */ } }
  const openChat = id => { setCard(null); setInviteView(null); setEditing(null); setChatOpen(id || null); setSheet('chat') }
  const startChatWith = fn => fn().then(openChat).catch(e => setToast(e.message))
  const [pollView, setPollView] = useState(null)
  const [planInit, setPlanInit] = useState({})
  const [inviteView, setInviteView] = useState(null)
  const openPlans = (init = {}) => { setPlanInit(init); setCard(null); setBdayView(null); setSheet('plans') }
  const startPlan = ({ start, end, title, invite = [], hide = [] }) => { setSheet(null); setEditing({ start, end, title, invite, hide }) }
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
  const range = useMemo(() => rangeFor(view === 'people' ? 'day' : view, date), [view, date])

  const mine = useMemo(() => expandEvents(data.events, range.from, range.to), [data.events, range])
  // Plans you've said Going/Maybe to show on your calendar like your own events
  const goingPlans = useMemo(() => pl.invites.filter(i => ['going', 'maybe'].includes(i.my_status) && f.people[i.owner_id]), [pl.invites, f.people])
  const planOcc = useMemo(() => expandEvents(goingPlans, range.from, range.to).map(o => ({ ...o, friend: f.people[o.owner_id], plan: o, visibility: 'friends' })), [goingPlans, range, f.people])
  const theirs = useMemo(() => {
    const planIds = new Set(goingPlans.map(g => g.id))
    const visible = f.friendEvents.filter(e => f.people[e.owner_id] && !f.hidden.includes(e.owner_id) && !planIds.has(e.id))
    return expandEvents(visible, range.from, range.to).map(o => ({ ...o, friend: f.people[o.owner_id] }))
  }, [f.friendEvents, f.people, f.hidden, range, goingPlans])
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
    () => [...bdays, ...(meHidden ? [] : [...mine, ...planOcc]), ...theirs].sort((a, b) => a.start - b.start || b.end - a.end),
    [bdays, mine, planOcc, theirs, meHidden])

  // Free/busy for the free-time finder and the "free now" dots
  const dayKey = fmt(now, 'yyyy-MM-dd-HH')
  const busyMap = useMemo(() => buildBusyMap({ uid: user.id, myEvents: data.events, myPlans: goingPlans, friendBusy: pl.busy, now: new Date() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.events, goingPlans, pl.busy, user.id, dayKey])
  const freeInfo = id => (busyMap[id] ? freeNow(busyMap[id], now) : { free: true, until: null })
  // Last (or next) plan together with each friend, for catch-up nudges
  const plansWith = useMemo(() => {
    const out = {}
    const bump = (id, t) => { if (!out[id] || t > out[id]) out[id] = t }
    const evById = Object.fromEntries(data.events.map(e => [e.id, e]))
    for (const g of pl.guests) if (g.status !== 'declined' && evById[g.event_id]) bump(g.user_id, new Date(evById[g.event_id].starts_at).getTime())
    for (const i of pl.invites) if (i.my_status !== 'declined') {
      const t = new Date(i.starts_at).getTime()
      bump(i.owner_id, t)
      for (const g of i.guests || []) if (g.status === 'going') bump(g.user_id, t)
    }
    return out
  }, [pl.guests, pl.invites, data.events])
  const countdowns = useMemo(() => {
    const list = data.events.filter(e => e.countdown && new Date(e.starts_at) > now).map(e => ({ e, days: differenceInCalendarDays(new Date(e.starts_at), now) }))
    return list.sort((a, b) => a.days - b.days).slice(0, 2)
  }, [data.events, now])
  const peopleCols = useMemo(() => {
    if (view !== 'people') return null
    const colOf = o => (o.birthday ? o.birthday.id : o.plan ? user.id : o.friend ? o.owner_id : user.id)
    const who = [...(meHidden ? [] : [{ id: user.id, person: data.profile, label: 'You' }]),
      ...f.friends.filter(x => !f.hidden.includes(x.person.id)).map(x => ({ id: x.person.id, person: x.person, label: (x.person.display_name || x.person.username).split(/\s+/)[0] }))].slice(0, 6)
    return who.map(w => ({ key: w.id, day: range.from, person: w.person, label: w.label, occurrences: occurrences.filter(o => colOf(o) === w.id) }))
  }, [view, occurrences, f.friends, f.hidden, meHidden, range, user.id, data.profile])
  const decidePoll = async (poll, option) => {
    const row = await data.saveEvent({ title: poll.title, all_day: false, starts_at: option.starts_at, ends_at: option.ends_at, location: poll.location || '', notes: poll.note || '', rrule: null, exdates: [], category_id: null, visibility: 'friends', hidden_from: [] })
    await pl.setInvitees(row.id, poll.invitees)
    await so.markDecided(poll.id, option.id, row.id)
    setPollView(null); setSheet(null); setDate(new Date(option.starts_at))
    setToast(`Plan made for ${fmt(new Date(option.starts_at), 'EEE d MMM, HH:mm')}. Invites sent.`)
  }
  const pendingInvites = pl.invites.filter(i => i.my_status === 'invited' && (i.rrule || new Date(i.ends_at) > now)).length
    + so.polls.filter(q => q.owner_id !== user.id && !q.decided_option && !q.options.some(o => o.votes.some(v => v.user_id === user.id))).length
  const liveBroadcasts = pl.broadcasts.filter(b => b.user_id !== user.id && f.people[b.user_id] && new Date(b.ends_at) > now && new Date(b.starts_at) - now < 12 * 3600e3)
  const [hiddenBc, setHiddenBc] = useState(() => { try { return JSON.parse(localStorage.getItem('klander:hidden-bc')) || [] } catch { return [] } })
  const hideBc = id => { const n = [...hiddenBc, id].slice(-30); setHiddenBc(n); try { localStorage.setItem('klander:hidden-bc', JSON.stringify(n)) } catch { /* ignore */ } }

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
    view === 'day' || view === 'people' ? addDays(d, dir) : view === 'week' ? addWeeks(d, dir) : view === 'month' ? addMonths(d, dir) : addDays(d, dir * 30))

  const openNew = start => setEditing({ start: start || defaultStart(date) })
  const openEvent = occ => (occ.birthday
    ? setBdayView(occ)
    : occ.plan
    ? setInviteView({ ...occ.plan, start: occ.start, end: occ.end })
    : occ.friend
    ? setViewing(occ)
    : occ.source_id
      ? setImported(occ)
      : setEditing({ event: data.events.find(e => e.id === occ.id), occurrence: occ.occurrence || null }))
  const openDay = d => { setDate(d); setView('day') }

  // "Show me" from Help & tips
  const showMe = what => {
    setSheet(null); setMenu(null)
    const go = {
      views: () => setMenu('view'), add: () => setMenu('add'), smart: () => setSheet('smart'), calendars: () => setSheet('calendars'),
      friends: () => openFriends(), find: () => openPlans({ tab: 'find' }), plans: () => openPlans(), up: () => openPlans({ tab: 'up' }),
      chat: () => openChat(), notify: () => setSheet('notify'), appearance: () => setSheet('appearance'), settings: () => setSheet('settings')
    }[what]
    if (go) setTimeout(go, 120)
  }

  // Tapping a notification opens the right place (?open=plans | up | friends | activity | event:<id>)
  const openUrl = url => {
    let open = null
    try { open = new URL(url, window.location.origin).searchParams.get('open') } catch { /* ignore */ }
    setSheet(null)
    if (open === 'plans') openPlans()
    else if (open === 'up') openPlans({ tab: 'up' })
    else if (open === 'friends' || open === 'activity') openFriends()
    else if (open?.startsWith('poll:')) setPollView({ id: open.slice(5) })
    else if (open?.startsWith('chat:')) openChat(open.slice(5))
    else if (open?.startsWith('event:')) {
      const ev = data.events.find(e => e.id === open.slice(6))
      if (ev) { setDate(new Date(ev.starts_at)); setEditing({ event: ev }) }
    }
  }
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('open')) { const u = window.location.href; window.history.replaceState(null, '', '/'); setTimeout(() => openUrl(u), 300) }
    const onMsg = e => { if (e.data?.type === 'klander-open') openUrl(e.data.url) }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const p = data.profile
  const requests = f.incoming.length
  const upcoming = expandEvents([...data.events, ...goingPlans], now, addDays(now, 30)).slice(0, 25)
    .map(o => ({ id: o.id, owner_id: o.owner_id, title: o.title, starts_at: o.start.toISOString(), ends_at: o.end.toISOString(), all_day: o.all_day, location: o.location }))
  const openEventRef = ref => {
    const own = data.events.find(e => e.id === ref.id)
    const inv = pl.invites.find(i => i.id === ref.id)
    if (own) { setSheet(null); setEditing({ event: own }) }
    else if (inv) setInviteView(inv)
    else { setSheet(null); if (ref.starts_at) setDate(new Date(ref.starts_at)); setToast("That's on their calendar. You can see it on that day.") }
  }
  const showsToday = now >= range.from && now < range.to
  // One slim, swipeable row of "today" cards: countdowns, friends looking for plans, birthdays
  const cards = [
    ...(soon.length > 0 && dismissed !== todayKey ? [(
      <div key="bday" className="card bday-card">
        <Cake size={16} />
        <span>{(() => {
          const b = soon[0]
          const who = b.me ? 'your' : `${(b.person.display_name || b.person.username).split(/\s+/)[0]}'s`
          const when = b.next.inDays === 0 ? 'today' : b.next.inDays === 1 ? 'tomorrow' : fmt(b.next.date, 'EEEE')
          return b.me && b.next.inDays === 0 ? <>Happy birthday, <b>{first(p)}</b>!</> : <><b>{who[0].toUpperCase() + who.slice(1)}</b> birthday {when}</>
        })()}{soon.length > 1 ? <small> +{soon.length - 1}</small> : null}</span>
        <button className="x" aria-label="Dismiss" onClick={dismissBanner}>×</button>
      </div>)] : []),
    ...countdowns.map(({ e, days }) => (
      <button key={e.id} className="card countdown" onClick={() => setEditing({ event: e })}>
        <b>{days === 0 ? 'Today' : days}</b><span>{days === 0 ? '' : days === 1 ? 'day to' : 'days to'}</span><em>{e.title}</em>
      </button>)),
    ...liveBroadcasts.filter(b => !hiddenBc.includes(b.id)).slice(0, 3).map(b => (
      <div key={b.id} className="card bc-card">
        <BroadcastCard b={b} person={f.people[b.user_id]} replies={pl.replies.filter(r => r.broadcast_id === b.id)} uid={user.id} people={f.people} compact
          onReply={v => pl.reply(b.id, v).catch(e => setToast(e.message))} />
        <button className="x" aria-label="Hide" onClick={() => hideBc(b.id)}>×</button>
      </div>))
  ]
  return (
    <div className={`app${season ? ' seasonal' : ''}`} style={season ? { '--season': season.colour } : undefined}>
      <header className="topbar">
        <div className="topbar-row">
          <button className="title-btn" aria-haspopup="menu" aria-expanded={menu === 'view'} onClick={() => setMenu(menu === 'view' ? null : 'view')}>
            <h1>{titleFor(view === 'people' ? 'day' : view, date)}</h1>
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.3 8.3a1 1 0 0 1 1.4 0L12 13.6l5.3-5.3a1 1 0 1 1 1.4 1.4l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4z"/></svg>
            {season && <span className="season-dot" title={season.label} />}
          </button>
          {!showsToday && <button className="today-pill" onClick={() => setDate(new Date())}>Today</button>}
          <button className="plain-btn bell" aria-label={`Notifications${nt.unread ? `, ${nt.unread} new` : ''}`} onClick={() => setSheet('notify')}>
            <BellIcon size={21} />{nt.unread > 0 && <span className="badge">{nt.unread > 9 ? '9+' : nt.unread}</span>}
          </button>
          <button className="avatar me" aria-label="Profile and settings" onClick={() => setSheet('settings')}
            style={p.avatar_url ? { backgroundImage: `url(${p.avatar_url})` } : { background: p.colour }}>
            {!p.avatar_url && initials(p)}
          </button>
        </div>
        {menu === 'view' && (
          <>
            <div className="menu-scrim" onClick={() => setMenu(null)} />
            <div className="menu" role="menu">
              {VIEWS.map(([v, label, hint]) => (
                <button key={v} role="menuitemradio" aria-checked={view === v} onClick={() => { setView(v); setMenu(null) }}>
                  <span>{label}<small>{hint}</small></span>{view === v && <i aria-hidden="true">✓</i>}
                </button>
              ))}
              <button role="menuitem" className="menu-today" onClick={() => { setDate(new Date()); setMenu(null) }}>Go to today</button>
              <button role="menuitem" className="menu-help" onClick={() => { setMenu(null); setSheet('help') }}>Help &amp; tips</button>
              {season && <p className="menu-note"><span className="season-dot" /> {season.label}</p>}
            </div>
          </>
        )}
        <div className="people-row" role="group" aria-label="Whose events to show">
          <button className="face" aria-pressed={!meHidden} onClick={() => f.toggleHidden(user.id)} title="You">
            <Avatar person={p} size={30} />{fun && myBirthday && <span className="face-cake"><Cake size={11} /></span>}
          </button>
          {f.friends.map(({ person }) => (
            <button key={person.id} className="face" aria-pressed={!f.hidden.includes(person.id)} onClick={() => f.toggleHidden(person.id)}
              title={`${(person.display_name || person.username).split(/\s+/)[0]}${freeInfo(person.id).free ? ' · free now' : ''}`}>
              <Avatar person={person} size={30} />{freeInfo(person.id).free && <i className="free-dot" />}{fun && birthdayToday(person.id) && <span className="face-cake"><Cake size={11} /></span>}
            </button>
          ))}
          {so.groups.map(g => {
            const others = f.friends.map(x => x.person.id).filter(id => !g.members.includes(id))
            const on = others.length > 0 && others.every(id => f.hidden.includes(id)) && g.members.every(id => !f.hidden.includes(id))
            return <button key={g.id} className="group-pill" aria-pressed={on} onClick={() => f.showGroup(g.members)}>{g.name}</button>
          })}
          {f.friends.length === 0 && <button className="group-pill" onClick={openFriends}>+ Add friends</button>}
        </div>
        {cards.length > 0 && <div className="cards">{cards}</div>}
      </header>

      <main className="main">
        <Swipe onSwipe={step} disabled={!!sheet || !!editing}>
          {view === 'people' &&
            <TimeGrid columns={peopleCols} occurrences={occurrences} colourOf={colourOf} now={now} onEvent={openEvent} onSlot={openNew} onDay={openDay}
              onPerson={person => (person.id === user.id ? setSheet('settings') : setCard(person))} hour={theme.config.density || 52} />}
          {(view === 'day' || view === 'week') &&
            <TimeGrid days={view === 'day' ? [range.from] : Array.from({ length: 7 }, (_, i) => addDays(range.from, i))}
              occurrences={occurrences} colourOf={colourOf} now={now} onEvent={openEvent} onSlot={openNew} onDay={openDay} hour={theme.config.density || 52} />}
          {view === 'month' &&
            <MonthView date={date} range={range} occurrences={occurrences} colourOf={colourOf} now={now} onDay={openDay} onEvent={openEvent} />}
          {view === 'agenda' &&
            <AgendaView from={range.from} occurrences={occurrences} colourOf={colourOf} catMap={catMap} now={now} onEvent={openEvent} />}
        </Swipe>
      </main>

      {menu === 'add' && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(null)} />
          <div className="add-menu" role="menu">
            <button role="menuitem" onClick={() => { setMenu(null); openNew() }}>
              <span className="add-ic"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 7h14v11H5z"/></svg></span>
              <span><b>New event</b><small>Pick the time yourself</small></span>
            </button>
            <button role="menuitem" onClick={() => { setMenu(null); setSheet('smart') }}>
              <span className="add-ic accent"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg></span>
              <span><b>Smart add</b><small>Type it, or snap a photo or screenshot</small></span>
            </button>
            {f.friends.length > 0 && <button role="menuitem" onClick={() => { setMenu(null); openPlans({ tab: 'find' }) }}>
              <span className="add-ic"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3.3 0-7 1.6-7 4v2h14v-2c0-2.4-3.7-4-7-4zm7 0c-.5 0-1 0-1.6.1 1.6 1 2.6 2.3 2.6 3.9v2h5v-2c0-2.4-3.2-4-6-4z"/></svg></span>
              <span><b>Plan with friends</b><small>Find a time everyone's free</small></span>
            </button>}
          </div>
        </>
      )}

      <nav className="tabbar" aria-label="Main">
        <button className="tab" aria-current={!sheet ? 'page' : undefined} onClick={() => { setSheet(null); setMenu(null) }}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 7h14v11H5zm3 3v2h2v-2zm4 0v2h2v-2z"/></svg>
          <span>Calendar</span>
        </button>
        <button className="tab" aria-current={sheet === 'plans' ? 'page' : undefined} onClick={() => openPlans()}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.2 6.3-5.5 7a1 1 0 0 1-1.5.1l-3-3a1 1 0 1 1 1.4-1.4l2.2 2.2 4.8-6.1a1 1 0 0 1 1.6 1.2z"/></svg>
          <span>Plans</span>{pendingInvites > 0 && <i className="tab-badge">{pendingInvites}</i>}
        </button>
        <button className="tab add" aria-label="Add" aria-expanded={menu === 'add'} onClick={() => setMenu(menu === 'add' ? null : 'add')}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 5a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z"/></svg>
        </button>
        <button className="tab" aria-current={sheet === 'chat' ? 'page' : undefined} onClick={() => setSheet('chat')}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8.4L4.7 21.3A1 1 0 0 1 3 20.6V5a1 1 0 0 1 1-2z"/></svg>
          <span>Chat</span>{chatUnread > 0 && <i className="tab-badge">{chatUnread > 9 ? '9+' : chatUnread}</i>}
        </button>
        <button className="tab" aria-current={sheet === 'friends' ? 'page' : undefined} onClick={openFriends}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3.3 0-7 1.6-7 4v2h14v-2c0-2.4-3.7-4-7-4zm7 0c-.5 0-1 0-1.6.1 1.6 1 2.6 2.3 2.6 3.9v2h5v-2c0-2.4-3.2-4-6-4z"/></svg>
          <span>Friends</span>{requests + unseen > 0 && <i className="tab-badge">{requests + unseen}</i>}
        </button>
      </nav>
      {!data.online && <div className="offline-pill">Offline · showing saved calendar</div>}
      {toast && <div className="toast" role="status">{toast}</div>}

      {editing && <EventEditor data={data} {...editing} friends={f.friends.map(x => x.person)} groups={so.groups} plans={pl} onChat={id => startChatWith(() => ch.eventThread(id))} onClose={msg => { setEditing(null); if (msg) setToast(msg) }} />}
      {sheet === 'plans' && <PlansSheet uid={user.id} me={data} plans={pl} social={so} friendLinks={f.friends} plansWith={plansWith} onOpenPoll={id => setPollView({ id })} people={f.people} friends={f.friends.map(x => x.person)} busyMap={busyMap}
        initial={planInit} onPlan={startPlan} onClose={() => setSheet(null)} onOpenInvite={i => setInviteView(i)} />}
      {sheet === 'notify' && <NotificationsSheet n={nt} people={f.people} friends={f.friends.map(x => x.person)} onClose={() => setSheet(null)} onOpen={openUrl} />}
      {pollView && so.polls.find(q => q.id === pollView.id) && <PollSheet poll={so.polls.find(q => q.id === pollView.id)} social={so} uid={user.id} me={p} people={f.people} onDecide={decidePoll} onClose={() => setPollView(null)} />}
      {inviteView && <InviteSheet invite={inviteView} plans={pl} people={f.people} me={p} onClose={() => setInviteView(null)} onChat={() => startChatWith(() => ch.eventThread(inviteView.id))} />}
      {viewing && <FriendEventSheet occ={viewing} onClose={() => setViewing(null)} />}
      {sheet === 'settings' && <Settings data={data} bd={bd} onClose={() => setSheet(null)} onOpenCalendars={() => setSheet('calendars')} onOpenAppearance={() => setSheet('appearance')} onOpenHelp={() => setSheet('help')} />}
      {sheet === 'appearance' && <AppearanceSheet data={data} onClose={() => setSheet(null)} />}
      {bdayView && <BirthdaySheet occ={bdayView} onClose={() => setBdayView(null)}
        onPlan={bdayView.birthday.me ? null : () => openPlans({ tab: 'find', hide: [bdayView.birthday.id], with: f.friends.map(x => x.person.id).filter(id => id !== bdayView.birthday.id).slice(0, 4), title: `${bdayView.birthday.short}'s birthday`, window: 'eve', days: 14 })} />}
      {card && <FriendCard person={f.people[card.id] || card} birthday={bd.friends.find(b => b.user_id === card.id)} data={data} free={freeInfo(card.id)} social={so}
        onFindTime={() => openPlans({ tab: 'find', with: [card.id] })} onMessage={() => startChatWith(() => ch.startDm(card.id))}
        onClose={() => setCard(null)} onShowWeek={() => { f.showOnly(card.id); setCard(null); setSheet(null) }} />}
      {confetti && <Confetti colours={[p.colour, '#ffb020', '#ff5d8f', '#22c55e', '#7c3aed']} onDone={() => setConfetti(false)} />}
      {sheet === 'smart' && <SmartAddSheet data={data} initialText={smartText} onClose={() => { setSheet(null); setSmartText('') }} onDone={msg => { setSheet(null); setSmartText(''); setToast(msg) }} />}
      {sheet === 'help' && <HelpSheet onClose={() => setSheet(null)} onShow={showMe} onTour={() => { setSheet(null); setTour(true) }} />}
      {tour && !editing && <WelcomeTour onDone={doneTour} />}
      {sheet === 'chat' && <ChatScreen chats={ch} uid={user.id} me={p} people={f.people} friends={f.friends.map(x => x.person)} initialId={chatOpen} upcoming={upcoming}
        onClose={() => { setSheet(null); setChatOpen(null) }} onMakeEvent={t => { setSmartText(t); setSheet('smart') }} onOpenEvent={openEventRef} onToast={setToast} />}
      {sheet === 'calendars' && <CalendarsSheet data={data} cal={cal} onClose={() => setSheet(null)} />}
      {imported && <ImportedEventSheet occ={imported} source={cal.sources.find(s => s.id === imported.source_id)}
        category={catMap[imported.category_id]} onClose={() => setImported(null)} onOpenCalendars={() => { setImported(null); setSheet('calendars') }} />}
      {sheet === 'friends' && <FriendsSheet f={f} social={so} onClose={() => setSheet(null)} onPerson={person => { setSheet(null); setCard(person) }} />}
    </div>
  )
}

function defaultStart(selected) {
  const n = new Date()
  const d = new Date(selected)
  d.setHours(n.getHours() + 1, 0, 0, 0)
  return d
}
