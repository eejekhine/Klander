import { useEffect, useRef, useState } from 'react'
import { Avatar } from './FriendsSheet'
import { photoUrls } from '../lib/memories'
import { REACTIONS } from '../lib/chat'

const first = p => (p?.display_name || p?.username || '').split(/\s+/)[0]

/** Full-screen story player for a My Week. Tap right/left to move, hold to pause. */
export default function StoryViewer({ slides, owner, people = {}, caption, mine, heading, onClose, onReact, myReaction, onReply, reactions = [] }) {
  const show = slides.filter(s => !s.hidden)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [urls, setUrls] = useState({})
  const [reply, setReply] = useState('')
  const t0 = useRef(Date.now())
  const [, tick] = useState(0)
  const DUR = 4500
  useEffect(() => { photoUrls(show.filter(s => s.path).map(s => s.path)).then(setUrls) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { t0.current = Date.now() }, [i])
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      if (Date.now() - t0.current >= DUR) { if (i < show.length - 1) setI(i + 1); else onClose() }
      tick(n => n + 1)
    }, 80)
    return () => clearInterval(id)
  }, [i, paused, show.length, onClose])
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI(n => Math.min(show.length - 1, n + 1)); if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1)) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [show.length, onClose])
  const s = show[i]
  if (!s) return null
  const progress = Math.min(1, (Date.now() - t0.current) / DUR)
  const tap = e => {
    if (e.target.closest('.story-ui')) return
    const x = e.clientX / window.innerWidth
    if (x < 0.3) setI(Math.max(0, i - 1)); else if (i < show.length - 1) setI(i + 1); else onClose()
  }
  return (
    <div className="story" onClick={tap} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
      <div className="story-bars">{show.map((x, n) => <i key={x.key}><b style={{ width: `${n < i ? 100 : n === i ? progress * 100 : 0}%` }} /></i>)}</div>
      <div className="story-top story-ui">
        <Avatar person={owner} size={30} /><b>{heading || (mine ? 'Your week' : `${first(owner)}'s week`)}</b>
        <button className="story-x" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <Slide s={s} url={urls[s.path]} people={people} caption={caption} />
      {!mine && (
        <div className="story-bottom story-ui">
          <div className="story-reacts">{REACTIONS.slice(0, 6).map(e => <button key={e} className={myReaction === e ? 'on' : ''} onClick={() => onReact(e)}>{e}</button>)}</div>
          <form className="story-reply" onSubmit={e => { e.preventDefault(); if (reply.trim()) { onReply(reply.trim(), s); setReply('') } }}>
            <input value={reply} onChange={e => setReply(e.target.value)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} placeholder={`Reply to ${first(owner)}…`} maxLength={500} />
            <button disabled={!reply.trim()}>Send</button>
          </form>
        </div>
      )}
      {mine && reactions.length > 0 && <div className="story-bottom story-ui"><p className="story-seen">{reactions.map(r => `${first(people[r.user_id])} ${r.emoji}`).join('  ·  ')}</p></div>}
    </div>
  )
}

function Slide({ s, url, people, caption }) {
  if (s.type === 'big') return (
    <div className={`slide big${s.tone === 'cover' ? ' cover' : ''}`}>
      <small className="big-eyebrow">{s.eyebrow}</small>
      {s.person && people[s.person] && <Avatar person={people[s.person]} size={88} />}
      <h1>{s.big}</h1>
      {s.sub && <p className="slide-cap">{s.sub}</p>}
      {s.list?.length > 0 && <div>{s.list.map(l => <div key={l.label} className="stat-bar"><span>{l.label}</span><b>{l.value}</b></div>)}</div>}
      {s.people?.length > 0 && <div className="story-people">{s.people.map(id => people[id] && <span key={id}><Avatar person={people[id]} size={40} /><small>{first(people[id])}</small></span>)}</div>}
    </div>
  )
  if (s.type === 'cover') return (
    <div className="slide cover">
      <small>My week</small><h1>{s.range}</h1>
      {caption && <p className="slide-cap">{caption}</p>}
      <div className="cover-stats">
        <span><b>{s.events}</b>things</span><span><b>{s.hours}</b>hours planned</span>
        {s.busiest && <span><b>{s.busiest.slice(0, 3)}</b>busiest day</span>}
      </div>
    </div>
  )
  if (s.type === 'photo') return (
    <div className="slide photo">
      {url ? <img src={url} alt="" /> : <span className="spinner" />}
      <div className="slide-text">{s.title && <b>{s.title}</b>}<small>{new Date(s.at).toLocaleDateString('en-GB', { weekday: 'long' })}</small>{s.caption && <p>{s.caption}</p>}</div>
    </div>
  )
  if (s.type === 'day') return (
    <div className="slide day">
      <h2>{s.day}</h2>
      {s.events.map((e, n) => <p key={n}><small>{e.time}</small> {e.title}</p>)}
      {s.caption && <p className="slide-cap">{s.caption}</p>}
    </div>
  )
  return (
    <div className="slide stats">
      <h2>The week in numbers</h2>
      {s.cats.map(c => <div key={c.name} className="stat-bar"><span>{c.name}</span><b>{c.hours}h</b></div>)}
      {s.people.length > 0 && <>
        <h3>Who I saw</h3>
        <div className="story-people">{s.people.map(id => people[id] && <span key={id}><Avatar person={people[id]} size={40} /><small>{first(people[id])}</small></span>)}</div>
      </>}
    </div>
  )
}
