import { useEffect, useMemo, useState } from 'react'
import Sheet from './Sheet'
import StoryViewer from './StoryViewer'
import { Avatar } from './FriendsSheet'
import { fmt } from '../lib/dates'
import { buildWrapped, hangouts, periodOf, streaks, summarise, termOf } from '../lib/insights'
import { photoUrls, photosBetween } from '../lib/memories'

const first = p => (p?.display_name || p?.username || '').split(/\s+/)[0]

/** Private stats about your time: hours, streaks, who you saw, and your end-of-term Wrapped. */
export default function InsightsSheet({ uid, me, data, goingPlans, people, guests = [], onClose, onPerson, startWrapped }) {
  const [kind, setKind] = useState('month')
  const period = useMemo(() => periodOf(kind), [kind])
  const [saw, setSaw] = useState(null)
  const [error, setError] = useState('')
  const [wrapped, setWrapped] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState('')
  const catMap = useMemo(() => Object.fromEntries(data.categories.map(c => [c.id, c])), [data.categories])

  const sum = useMemo(() => summarise({ events: data.events, plans: goingPlans, catMap, from: period.from, to: period.to }), [data.events, goingPlans, catMap, period])
  const streakList = useMemo(() => streaks({ events: data.events, categories: data.categories }), [data.events, data.categories])

  useEffect(() => {
    let live = true
    setSaw(null)
    hangouts(period.from, period.to).then(r => live && setSaw(r)).catch(e => { if (live) { setSaw([]); setError(e.message) } })
    return () => { live = false }
  }, [period])

  const playWrapped = async () => {
    setBusy('wrap'); setError('')
    try {
      const term = termOf()
      const tsum = summarise({ events: data.events, plans: goingPlans, catMap, from: term.from, to: term.to })
      const tsaw = await hangouts(term.from, term.to)
      const photo = await pickPhoto({ uid, from: term.from, to: new Date(), data, goingPlans, guests })
      setWrapped(buildWrapped({ term, sum: tsum, streakList, saw: tsaw, people, photo }))
      setPlaying(true)
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  useEffect(() => { if (startWrapped) playWrapped() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy('img'); setError('')
    try { await exportWrapped(wrapped, me) } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const maxH = Math.max(1, ...sum.cats.map(c => c.hours))
  const friends = (saw || []).filter(h => people[h.friend_id])

  return (
    <Sheet title="Insights" onClose={onClose}>
      <div className="seg" role="group" style={{ width: '100%' }}>
        {[['month', 'This month'], ['term', 'This term'], ['year', 'This year']].map(([k, l]) => <button key={k} style={{ flex: 1 }} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{period.label} so far. Only you can see this page.</p>

      <div className="ins-big">
        <div><b>{sum.count}</b><small>things</small></div>
        <div><b>{sum.hours}</b><small>hours planned</small></div>
        <div><b>{saw ? friends.length : '–'}</b><small>{friends.length === 1 ? 'friend' : 'friends'} you made plans with</small></div>
      </div>

      <div className="group">
        <h3>Where your time went</h3>
        {sum.cats.length === 0
          ? <p className="small muted" style={{ margin: 0 }}>Nothing yet. Add some events and this fills up.</p>
          : <div className="ins-bars">{sum.cats.slice(0, 6).map(c => (
              <div key={c.name} className="ins-bar"><span>{c.name}</span><b>{c.hours}h</b><i><b style={{ width: `${(c.hours / maxH) * 100}%`, background: c.colour }} /></i></div>
            ))}</div>}
        {sum.busiestDay && <p className="small muted" style={{ margin: 0 }}>Busiest day: {sum.busiestDay}{sum.busiestWeek ? ` · busiest week: w/c ${fmt(sum.busiestWeek.start, 'd MMM')} (${sum.busiestWeek.hours}h)` : ''}</p>}
      </div>

      <div className="group">
        <h3>Streaks</h3>
        {streakList.length === 0
          ? <p className="small muted" style={{ margin: 0 }}>Do something in the same category two weeks in a row (gym, ball, revision…) and a streak starts here.</p>
          : streakList.map(s => (
              <div key={s.id} className="streak">
                <i className="sw" style={{ background: s.colour }} />
                <span>{s.name}<br /><small className="muted">{s.weeks >= 2 ? (s.doneThisWeek ? 'Done this week' : 'Not yet this week, keep it going') : `Best: ${s.best} weeks`}</small></span>
                <b>{s.weeks >= 2 ? `${s.weeks} weeks running` : 'Ended'}</b>
              </div>
            ))}
      </div>

      <div className="group">
        <h3>Who you made plans with</h3>
        {!saw ? <p className="small muted" style={{ margin: 0 }}>Counting…</p>
          : friends.length === 0 ? <p className="small muted" style={{ margin: 0 }}>No plans with friends yet {kind === 'month' ? 'this month' : kind === 'term' ? 'this term' : 'this year'}. Plans → Find a time makes it easy.</p>
          : friends.slice(0, 6).map(h => (
              <button key={h.friend_id} className="saw btn ghost block" style={{ justifyContent: 'flex-start' }} onClick={() => onPerson(people[h.friend_id])}>
                <Avatar person={people[h.friend_id]} size={34} />
                <span className="saw-name" style={{ textAlign: 'left' }}>{first(people[h.friend_id])}<br /><small className="muted">last {fmt(new Date(h.last_at), 'd MMM')}</small></span>
                <b>{h.plans}</b>
              </button>
            ))}
        <p className="small muted" style={{ margin: 0 }}>Counts plans you both went to. Each count is only visible to the two of you.</p>
      </div>

      <div className="group">
        <h3>Klander Wrapped</h3>
        <p className="small muted" style={{ margin: 0 }}>Your {termOf().short.toLowerCase()} as a story: top category, your number one, a favourite photo, your longest streak.</p>
        <div className="row">
          <button className="btn primary grow" onClick={playWrapped} disabled={busy === 'wrap'}>{busy === 'wrap' ? 'Putting it together…' : wrapped ? 'Play again' : 'Play my Wrapped'}</button>
          {wrapped && <button className="btn grow" onClick={save} disabled={busy === 'img'}>{busy === 'img' ? 'Making…' : 'Save image'}</button>}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {wrapped && playing && <StoryViewer slides={wrapped} owner={me} people={people} mine heading="Your Wrapped" onClose={() => setPlaying(false)} />}
    </Sheet>
  )
}

/** Your best photo this term: from the plan with the most people going, else the newest. */
async function pickPhoto({ uid, from, to, data, goingPlans, guests }) {
  const ps = (await photosBetween(from, to)).filter(p => p.user_id === uid)
  if (!ps.length) return null
  const evs = Object.fromEntries([...data.events, ...goingPlans.map(p => ({ ...p, plan: true }))].map(e => [e.id, e]))
  const going = {}
  for (const g of guests) if (g.status === 'going') going[g.event_id] = (going[g.event_id] || 0) + 1
  const score = p => (going[p.event_id] || 0) * 10 + (evs[p.event_id]?.plan ? 5 : 0)
  const best = [...ps].sort((a, b) => score(b) - score(a) || new Date(b.taken_at) - new Date(a.taken_at))[0]
  const ev = evs[best.event_id]
  const shareable = ev && (ev.plan || ev.visibility === 'friends' || ev.visibility === 'close')
  return { ...best, title: shareable ? ev.title : '' }
}

/** A 1080×1920 Wrapped image to save or post. */
async function exportWrapped(slides, me) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920
  const g = c.getContext('2d')
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#2b4cff'
  const grad = g.createLinearGradient(0, 0, 1080, 1920)
  grad.addColorStop(0, css('--accent')); grad.addColorStop(1, '#111827')
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1920)
  g.fillStyle = '#fff'
  const cover = slides[0]
  g.font = '700 40px system-ui, sans-serif'; g.globalAlpha = 0.8; g.fillText('KLANDER WRAPPED', 80, 170); g.globalAlpha = 1
  g.font = '800 92px system-ui, sans-serif'; g.fillText(cover.big, 80, 280)
  g.font = '500 44px system-ui, sans-serif'; g.fillText(`${(me.display_name || me.username || '').split(/\s+/)[0]} · ${cover.sub}`.slice(0, 44), 80, 350)
  let y = 520
  const photo = slides.find(s => s.type === 'photo')
  if (photo) {
    const urls = await photoUrls([photo.path])
    const im = await new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = urls[photo.path] })
    if (im) {
      const w = 920, h = 560, r = Math.max(w / im.width, h / im.height), sw = w / r, sh = h / r
      g.save(); g.beginPath(); if (g.roundRect) g.roundRect(80, 430, w, h, 36); else g.rect(80, 430, w, h); g.clip()
      g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, 80, 430, w, h); g.restore()
      y = 1100
    }
  }
  for (const s of slides.filter(x => x.type === 'big' && x.tone !== 'cover').slice(0, 4)) {
    g.globalAlpha = 0.75; g.font = '600 34px system-ui, sans-serif'; g.fillText(s.eyebrow.toUpperCase(), 80, y); g.globalAlpha = 1
    g.font = '800 64px system-ui, sans-serif'; g.fillText(String(s.big).slice(0, 24), 80, y + 72)
    g.font = '500 36px system-ui, sans-serif'; g.globalAlpha = 0.85; g.fillText((s.sub || '').slice(0, 48), 80, y + 122); g.globalAlpha = 1
    y += 200
    if (y > 1760) break
  }
  g.globalAlpha = 0.7; g.font = '600 34px system-ui, sans-serif'; g.fillText('made with Klander', 80, 1860); g.globalAlpha = 1
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9))
  if (!blob) throw new Error("Couldn't make the image. Try again.")
  const file = new File([blob], 'klander-wrapped.jpg', { type: 'image/jpeg' })
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'My Klander Wrapped' }) } catch { /* cancelled */ } return }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'klander-wrapped.jpg'; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
