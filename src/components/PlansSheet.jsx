import { useMemo, useState } from 'react'
import { addDays, addHours, addMinutes, differenceInMinutes, nextSaturday, isSaturday, isSunday } from 'date-fns'
import Sheet from './Sheet'
import { Avatar } from './FriendsSheet'
import { fmt, isSameDay, timeLabel } from '../lib/dates'
import { findTimes } from '../lib/freetime'
import { RSVP, statusLabel } from '../lib/plans'
import { catchUps, tally } from '../lib/social'

const firstName = p => (p?.display_name || p?.username || '').split(/\s+/)[0]
const TABS = [['plans', 'Plans'], ['find', 'Find a time'], ['up', 'Up for something']]
const DURS = [[30, '30m'], [60, '1h'], [120, '2h'], [180, '3h']]
const WINDOWS = [['any', 'Any time', 8, 23], ['day', 'Daytime', 9, 17], ['eve', 'Evening', 17, 23]]
const hrs = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`)
const dayLabel = d => (isSameDay(d, new Date()) ? 'Today' : isSameDay(d, addDays(new Date(), 1)) ? 'Tomorrow' : fmt(d, 'EEE d MMM'))

export default function PlansSheet({ uid, me, plans, social, people, friends, friendLinks = [], plansWith = {}, busyMap, initial = {}, onPlan, onClose, onOpenInvite, onOpenPoll }) {
  const [tab, setTab] = useState(initial.tab || 'plans')
  const [findWith, setFindWith] = useState(null)
  return (
    <Sheet title="Plans" onClose={onClose}>
      <div className="seg" role="tablist" style={{ width: '100%' }}>
        {TABS.map(([k, l]) => <button key={k} role="tab" style={{ flex: 1 }} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}{k === 'plans' && plans.invites.filter(i => i.my_status === 'invited').length > 0 && <span className="badge">{plans.invites.filter(i => i.my_status === 'invited').length}</span>}</button>)}
      </div>
      {tab === 'plans' && <PlansTab uid={uid} plans={plans} social={social} people={people} friendLinks={friendLinks} plansWith={plansWith} onOpenInvite={onOpenInvite} onOpenPoll={onOpenPoll} onFind={w => { setFindWith(w); setTab('find') }} />}
      {tab === 'find' && <FindTab uid={uid} me={me} friends={friends} groups={social.groups} social={social} busyMap={busyMap} initial={findWith ? { ...initial, with: findWith } : initial} onPlan={onPlan} onPolled={id => { setTab('plans'); onOpenPoll(id) }} />}
      {tab === 'up' && <UpTab uid={uid} me={me} plans={plans} people={people} onPlan={onPlan} />}
    </Sheet>
  )
}

/* ---------------- Plans: invites waiting for an answer + what's coming up ---------------- */
function PlansTab({ uid, plans, social, people, friendLinks, plansWith, onOpenInvite, onOpenPoll, onFind }) {
  const [error, setError] = useState('')
  const now = new Date()
  const pending = plans.invites.filter(i => i.my_status === 'invited' && (i.rrule || new Date(i.ends_at) > now))
  const upcoming = plans.invites.filter(i => ['going', 'maybe'].includes(i.my_status) && (i.rrule || new Date(i.ends_at) > now))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  const answer = async (id, s) => { setError(''); try { await plans.respond(id, s) } catch (e) { setError(e.message) } }
  return (
    <>
      <div className="group">
        <h3>Invites{pending.length ? ` (${pending.length})` : ''}</h3>
        {pending.length === 0 && <p className="small muted" style={{ margin: 0 }}>No invites waiting. When a friend invites you to something it shows up here.</p>}
        {pending.map(i => <InviteCard key={i.id} i={i} host={people[i.owner_id]} onOpen={() => onOpenInvite(i)} onAnswer={s => answer(i.id, s)} />)}
      </div>
      <div className="group">
        <h3>Coming up</h3>
        {upcoming.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing planned with friends yet.</p>}
        {upcoming.map(i => (
          <button key={i.id} className="plan-row" onClick={() => onOpenInvite(i)}>
            <Avatar person={people[i.owner_id]} size={30} />
            <span><b>{i.title}</b><small>{fmt(new Date(i.starts_at), 'EEE d MMM, HH:mm')} · {firstName(people[i.owner_id])}'s plan</small></span>
            <small className={`rsvp ${i.my_status}`}>{statusLabel(i.my_status)}</small>
          </button>
        ))}
        <button className="btn block" onClick={() => onFind(null)}>Find a time with friends</button>
      </div>
      <PollList uid={uid} social={social} people={people} onOpenPoll={onOpenPoll} />
      <CatchUp uid={uid} friendLinks={friendLinks} plansWith={plansWith} onFind={onFind} />
      {error && <p className="error" role="alert">{error}</p>}
      <p className="small muted" style={{ margin: 0 }}>Plans you host live on your calendar. Tap one to see who's going.</p>
    </>
  )
}

export function InviteCard({ i, host, onOpen, onAnswer }) {
  const s = new Date(i.starts_at), e = new Date(i.ends_at)
  return (
    <div className="invite-card">
      <button className="plan-row" onClick={onOpen}>
        <Avatar person={host} size={34} />
        <span><b>{i.title}</b><small>{firstName(host)} invited you · {fmt(s, 'EEE d MMM')} · {timeLabel({ start: s, end: e, all_day: i.all_day })}{i.location ? ` · ${i.location}` : ''}</small></span>
      </button>
      <div className="seg" role="group" style={{ width: '100%' }}>
        {RSVP.map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={i.my_status === v} onClick={() => onAnswer(v)}>{l}</button>)}
      </div>
    </div>
  )
}

/* ---------------- Find a time ---------------- */
function FindTab({ uid, me, friends, groups: friendGroups = [], social, busyMap, initial, onPlan, onPolled }) {
  const [picked, setPicked] = useState(initial.with || [])
  const [hide] = useState(initial.hide || [])
  const [dur, setDur] = useState(initial.duration || 120)
  const [win, setWin] = useState(initial.window || 'any')
  const [days, setDays] = useState(initial.days || 7)
  const [voteMode, setVoteMode] = useState(false)
  const [chosen, setChosen] = useState([]) // slot start times (ms) picked for a poll
  const [pollTitle, setPollTitle] = useState(initial.title || '')
  const [sending, setSending] = useState(false)
  const [pollErr, setPollErr] = useState('')
  const pickSlot = s => setChosen(c => (c.includes(+s) ? c.filter(x => x !== +s) : c.length >= 5 ? c : [...c, +s]))
  const sendPoll = async () => {
    if (!pollTitle.trim()) return setPollErr('Give it a name, like "Cinema".')
    setSending(true); setPollErr('')
    try {
      const id = await social.createPoll({ title: pollTitle, options: [...chosen].sort().map(t => ({ start: new Date(t), end: addMinutes(new Date(t), dur) })), invitees: picked })
      onPolled(id)
    } catch (e) { setPollErr(e.message); setSending(false) }
  }
  const visible = friends.filter(f => !hide.includes(f.id))
  const toggle = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  const w = WINDOWS.find(x => x[0] === win)
  const people = [uid, ...picked]
  const result = useMemo(() => (picked.length ? findTimes(busyMap, people, { days, duration: dur, startHour: w[2], endHour: w[3] }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyMap, picked.join(), days, dur, win])
  const byId = Object.fromEntries([[uid, me.profile], ...friends.map(f => [f.id, f])])
  const plan = (s, missing) => onPlan({
    start: s, end: addMinutes(s, dur), title: initial.title || '',
    invite: picked.filter(p => p !== missing), hide
  })

  const groups = []
  for (const g of result?.all || []) {
    const last = groups[groups.length - 1]
    if (last && isSameDay(last.day, g.day)) last.items.push(g); else groups.push({ day: g.day, items: [g] })
  }
  return (
    <>
      {hide.length > 0 && <p className="banner" style={{ margin: 0 }}>Surprise mode: {hide.map(id => firstName(byId[id])).join(', ')} won't see this plan.</p>}
      <div className="group">
        <h3>Who's coming?</h3>
        {visible.length === 0 && <p className="small muted" style={{ margin: 0 }}>Add some friends first.</p>}
        {friendGroups.length > 0 && (
          <div className="pick-row">
            {friendGroups.map(g => {
              const ids = g.members.filter(id => visible.some(f => f.id === id))
              const all = ids.length > 0 && ids.every(id => picked.includes(id))
              return <button key={g.id} className="ex-chip group-chip" aria-pressed={all} onClick={() => setPicked(p => (all ? p.filter(x => !ids.includes(x)) : [...new Set([...p, ...ids])]))}>{g.name}</button>
            })}
          </div>
        )}
        <div className="pick-row">
          {visible.map(f => (
            <button key={f.id} className="pchip" aria-pressed={picked.includes(f.id)} onClick={() => toggle(f.id)}>
              <Avatar person={f} size={22} />{firstName(f)}
            </button>
          ))}
        </div>
        <div className="field"><span>How long?</span>
          <div className="seg" role="group" style={{ width: '100%' }}>{DURS.map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={dur === v} onClick={() => setDur(v)}>{l}</button>)}</div>
        </div>
        <div className="field"><span>When?</span>
          <div className="seg" role="group" style={{ width: '100%' }}>{WINDOWS.map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={win === v} onClick={() => setWin(v)}>{l}</button>)}</div>
        </div>
        <div className="seg" role="group" style={{ width: '100%' }}>
          {[[7, 'Next 7 days'], [14, 'Next 2 weeks']].map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={days === v} onClick={() => setDays(v)}>{l}</button>)}
        </div>
      </div>

      {!picked.length && <p className="small muted" style={{ margin: 0 }}>Pick at least one friend. Klander only looks at when people are busy, never what they're doing.</p>}
      {result && (picked.length > 0) && (
        <div className="toggle-row">
          <span>Let them vote<br /><small className="muted">Pick up to 5 times and send a poll instead</small></span>
          <label className="switch"><input type="checkbox" checked={voteMode} onChange={e => { setVoteMode(e.target.checked); setChosen([]) }} aria-label="Let them vote" /><span /></label>
        </div>
      )}
      {result && (
        <div className="group">
          <h3>Everyone's free</h3>
          {groups.length === 0 && <p className="small muted" style={{ margin: 0 }}>No time where everyone's free for {hrs(dur)}. Try a shorter time, a different part of the day, or two weeks.</p>}
          {groups.map(g => (
            <div key={g.day.getTime()} className="slot-day">
              <b>{dayLabel(g.day)}</b>
              <div className="slot-list">
                {g.items.map(x => (
                  <button key={x.s.getTime()} className="slot" aria-pressed={voteMode ? chosen.includes(+x.s) : undefined} onClick={() => (voteMode ? pickSlot(x.s) : plan(x.s))}>
                    {fmt(x.s, 'HH:mm')}–{fmt(x.e, 'HH:mm')}
                    <small>{hrs(differenceInMinutes(x.e, x.s))} free · {voteMode ? (chosen.includes(+x.s) ? 'Added ✓' : 'Add to poll') : 'Plan'}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {result && result.allBut.length > 0 && (
        <div className="group">
          <h3>Everyone but one</h3>
          {result.allBut.map(x => (
            <button key={`${x.missing}-${x.s.getTime()}`} className="plan-row" aria-pressed={voteMode ? chosen.includes(+x.s) : undefined} onClick={() => (voteMode ? pickSlot(x.s) : plan(x.s, x.missing))}>
              <span className="who-missing">{dayLabel(x.day)}</span>
              <span><b>{fmt(x.s, 'HH:mm')}–{fmt(x.e, 'HH:mm')}</b><small>Everyone except {x.missing === uid ? 'you' : firstName(byId[x.missing])}</small></span>
              <small>{voteMode ? (chosen.includes(+x.s) ? 'Added ✓' : 'Add') : 'Plan'}</small>
            </button>
          ))}
        </div>
      )}
      {voteMode && (
        <div className="group sheet-sticky poll-send">
          <input className="input" value={pollTitle} onChange={e => setPollTitle(e.target.value)} placeholder="What's the plan? e.g. Cinema" maxLength={120} />
          <button className="btn primary block" disabled={sending || chosen.length < 2} onClick={sendPoll}>
            {sending ? 'Sending…' : chosen.length < 2 ? 'Pick at least 2 times' : `Ask ${picked.length} ${picked.length === 1 ? 'friend' : 'friends'} to vote on ${chosen.length} times`}
          </button>
          {pollErr && <p className="error" role="alert">{pollErr}</p>}
        </div>
      )}
    </>
  )
}

/* ---------------- Up for something + your status ---------------- */
const IDEAS = ['Anyone free tonight?', 'Ball later?', 'Food?', 'Gym?', 'Study session?']
const WHENS = [
  ['now', 'Next 2 hours', () => [new Date(), addHours(new Date(), 2)]],
  ['tonight', 'Tonight', () => { const s = new Date(); const a = new Date(); a.setHours(18, 0, 0, 0); const e = new Date(); e.setHours(23, 59, 0, 0); return [s > a ? s : a, e] }],
  ['tomorrow', 'Tomorrow', () => { const d = addDays(new Date(), 1); const s = new Date(d); s.setHours(9, 0, 0, 0); const e = new Date(d); e.setHours(23, 59, 0, 0); return [s, e] }],
  ['weekend', 'This weekend', () => {
    const n = new Date(), wk = isSaturday(n) || isSunday(n)
    const s = wk ? n : new Date(nextSaturday(n).setHours(9, 0, 0, 0))
    const e = new Date(isSunday(n) ? n : addDays(isSaturday(n) ? n : s, 1)); e.setHours(23, 59, 0, 0)
    return [s, e]
  }]
]
const STATUS_FOR = [[1, '1 hour'], [3, '3 hours'], [0, 'Rest of today']]

function UpTab({ uid, me, plans, people, onPlan }) {
  const [msg, setMsg] = useState('')
  const [when, setWhen] = useState('tonight')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const now = new Date()
  const live = plans.broadcasts.filter(b => new Date(b.ends_at) > now)
  const mine = live.filter(b => b.user_id === uid)
  const theirs = live.filter(b => b.user_id !== uid && people[b.user_id])
  const repliesFor = id => plans.replies.filter(r => r.broadcast_id === id)

  const post = async () => {
    if (!msg.trim()) return
    setBusy(true); setError('')
    try { const [s, e] = WHENS.find(w => w[0] === when)[2](); await plans.postBroadcast(msg, s, e); setMsg('') }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const act = async fn => { setError(''); try { await fn() } catch (err) { setError(err.message) } }

  return (
    <>
      <div className="group">
        <h3>Up for something?</h3>
        <p className="small muted" style={{ margin: 0 }}>Let your friends know you're free. They can tap "I'm in".</p>
        <input id="bc-msg" className="input" value={msg} onChange={e => setMsg(e.target.value)} placeholder="e.g. Anyone up for ball at The Edge?" maxLength={140} />
        <div className="pick-row">{IDEAS.map(i => <button key={i} className="ex-chip" onClick={() => setMsg(i)}>{i}</button>)}</div>
        <div className="seg" role="group" style={{ width: '100%' }}>{WHENS.map(([k, l]) => <button key={k} style={{ flex: 1, fontSize: 13 }} aria-pressed={when === k} onClick={() => setWhen(k)}>{l}</button>)}</div>
        <button className="btn primary block" disabled={busy || !msg.trim()} onClick={post}>{busy ? 'Posting…' : 'Tell my friends'}</button>
      </div>

      {mine.map(b => {
        const rs = repliesFor(b.id)
        return (
          <div key={b.id} className="group bc mine">
            <div className="bc-head"><b>You: {b.message}</b><small>{fmt(new Date(b.starts_at), 'EEE HH:mm')}–{fmt(new Date(b.ends_at), 'HH:mm')}</small></div>
            {rs.length === 0 ? <p className="small muted" style={{ margin: 0 }}>No replies yet.</p>
              : <div className="pick-row">{rs.map(r => <span key={r.user_id} className="pchip static"><Avatar person={people[r.user_id]} size={22} />{firstName(people[r.user_id])} {r.reply === 'in' ? "is in" : 'maybe'}</span>)}</div>}
            <div className="row">
              {rs.length > 0 && <button className="btn primary grow" onClick={() => onPlan({ start: new Date(Math.max(Date.now(), new Date(b.starts_at))), end: null, title: b.message.replace(/\?+$/, ''), invite: rs.map(r => r.user_id), hide: [] })}>Make it a plan</button>}
              <button className="btn grow" onClick={() => act(() => plans.endBroadcast(b.id))}>Stop</button>
            </div>
          </div>
        )
      })}

      <div className="group">
        <h3>Friends</h3>
        {theirs.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nobody's looking for plans right now.</p>}
        {theirs.map(b => <BroadcastCard key={b.id} b={b} person={people[b.user_id]} replies={repliesFor(b.id)} uid={uid} people={people} onReply={v => act(() => plans.reply(b.id, v))} />)}
      </div>

      <StatusEditor me={me} />
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}

export function BroadcastCard({ b, person, replies, uid, people, onReply, compact = false }) {
  const mine = replies.find(r => r.user_id === uid)
  const others = replies.filter(r => r.user_id !== uid && people[r.user_id])
  return (
    <div className={`bc${compact ? ' compact' : ''}`}>
      <Avatar person={person} size={compact ? 26 : 32} />
      <div className="bc-body">
        <span><b>{firstName(person)}</b> {b.message}</span>
        <small>{fmt(new Date(b.starts_at), 'EEE HH:mm')}–{fmt(new Date(b.ends_at), 'HH:mm')}{others.length ? ` · ${others.map(r => firstName(people[r.user_id])).join(', ')} in` : ''}</small>
      </div>
      {mine
        ? <button className="btn" style={{ padding: '6px 10px' }} onClick={() => onReply(null)}>✓ {mine.reply === 'in' ? "I'm in" : 'Maybe'}</button>
        : <button className="btn primary" style={{ padding: '6px 10px' }} onClick={() => onReply('in')}>I'm in</button>}
    </div>
  )
}

function StatusEditor({ me }) {
  const active = me.profile.status_text && (!me.profile.status_until || new Date(me.profile.status_until) > new Date())
  const [text, setText] = useState(active ? me.profile.status_text : '')
  const [forH, setForH] = useState(3)
  const [msg, setMsg] = useState('')
  const save = async clear => {
    let until = null
    if (!clear) { until = forH ? addHours(new Date(), forH) : new Date(new Date().setHours(23, 59, 0, 0)) }
    try {
      await me.updateProfile({ status_text: clear ? null : text.trim().slice(0, 60) || null, status_until: until ? until.toISOString() : null })
      if (clear) setText('')
      setMsg(clear ? 'Status cleared' : 'Status set')
    } catch (e) { setMsg(e.message) }
  }
  return (
    <div className="group">
      <h3>Your status</h3>
      <p className="small muted" style={{ margin: 0 }}>A short note friends see on your card, like "At the library till 6".</p>
      <input id="status-text" className="input" value={text} onChange={e => setText(e.target.value)} maxLength={60} placeholder="What are you up to?" />
      <div className="seg" role="group" style={{ width: '100%' }}>{STATUS_FOR.map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={forH === v} onClick={() => setForH(v)}>{l}</button>)}</div>
      <div className="row">
        <button className="btn primary grow" disabled={!text.trim()} onClick={() => save(false)}>Set status</button>
        {active && <button className="btn grow" onClick={() => save(true)}>Clear</button>}
      </div>
      {msg && <p className="small" style={{ color: 'var(--good)', margin: 0 }}>{msg}</p>}
    </div>
  )
}

/* ---------------- Polls waiting on votes ---------------- */
function PollList({ uid, social, people, onOpenPoll }) {
  const open = social.polls.filter(p => !p.decided_option && p.options.some(o => new Date(o.ends_at) > new Date()))
  if (!open.length) return null
  return (
    <div className="group">
      <h3>Polls</h3>
      {open.map(p => {
        const mine = p.owner_id === uid
        const voted = p.options.some(o => o.votes.some(v => v.user_id === uid))
        const voters = new Set(p.options.flatMap(o => o.votes.map(v => v.user_id))).size
        const best = [...p.options].sort((a, b) => tally(b).score - tally(a).score)[0]
        return (
          <button key={p.id} className="plan-row" onClick={() => onOpenPoll(p.id)}>
            <Avatar person={mine ? null : people[p.owner_id]} size={30} />
            <span><b>{p.title}</b><small>{mine ? `${voters} of ${p.invitees.length} voted${best && tally(best).score ? ` · best so far ${fmt(new Date(best.starts_at), 'EEE HH:mm')}` : ''}` : `${firstName(people[p.owner_id])} is asking · ${p.options.length} times`}</small></span>
            {!mine && !voted ? <small className="rsvp maybe">Vote</small> : mine ? <small className="rsvp">Yours</small> : <small className="rsvp going">Voted</small>}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Catch-up nudges ---------------- */
const NUDGE_KEY = 'klander:nudge-hidden'
function CatchUp({ friendLinks, plansWith, onFind }) {
  const [hidden, setHidden] = useState(() => { try { return JSON.parse(localStorage.getItem(NUDGE_KEY)) || {} } catch { return {} } })
  const list = catchUps(friendLinks, plansWith).filter(x => !(hidden[x.person.id] > Date.now())).slice(0, 3)
  if (!list.length) return null
  const hide = id => { const n = { ...hidden, [id]: Date.now() + 7 * 864e5 }; setHidden(n); try { localStorage.setItem(NUDGE_KEY, JSON.stringify(n)) } catch { /* ignore */ } }
  return (
    <div className="group">
      <h3>Catch up</h3>
      {list.map(({ person, last }) => (
        <div key={person.id} className="plan-row" style={{ cursor: 'default' }}>
          <Avatar person={person} size={30} />
          <span><b>{firstName(person)}</b><small>{last ? `No plans together since ${fmt(new Date(last), 'd MMM')}` : 'No plans together yet'}</small></span>
          <span className="row" style={{ gap: 4 }}>
            <button className="btn primary" style={{ padding: '6px 10px' }} onClick={() => onFind([person.id])}>Find a time</button>
            <button className="linklike small" aria-label={`Hide ${firstName(person)} for a week`} onClick={() => hide(person.id)}>Later</button>
          </span>
        </div>
      ))}
    </div>
  )
}
