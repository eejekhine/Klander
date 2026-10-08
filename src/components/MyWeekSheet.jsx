import { useEffect, useMemo, useState } from 'react'
import { addDays } from 'date-fns'
import Sheet from './Sheet'
import StoryViewer from './StoryViewer'
import { expandEvents, fmt } from '../lib/dates'
import { buildWeek, mergeEdits } from '../lib/week'
import { isoDay, photoUrls, photosBetween, weekStartOf } from '../lib/memories'

/** Build, tweak and share your My Week story. */
export default function MyWeekSheet({ uid, me, data, goingPlans, guests, catMap, people, weeks, onClose, onToast }) {
  const thisWeek = weekStartOf(new Date())
  const [ws, setWs] = useState(thisWeek)
  const [photos, setPhotos] = useState(null)
  const [slides, setSlides] = useState([])
  const [urls, setUrls] = useState({})
  const [caption, setCaption] = useState('')
  const [vis, setVis] = useState('friends')
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const key = isoDay(ws)
  const saved = weeks.weeks.find(w => w.user_id === uid && w.week_start === key)

  const occ = useMemo(() => {
    const to = addDays(ws, 7)
    return [
      ...expandEvents(data.events, ws, to),
      ...expandEvents(goingPlans, ws, to).map(o => ({ ...o, plan: o }))
    ]
  }, [data.events, goingPlans, ws])

  useEffect(() => {
    let live = true
    setPhotos(null)
    photosBetween(ws, addDays(ws, 7)).then(ps => {
      if (!live) return
      const mineOrAt = new Set(occ.map(o => o.id))
      setPhotos(ps.filter(p => p.user_id === uid || mineOrAt.has(p.event_id)))
    })
    return () => { live = false }
  }, [ws, occ, uid])

  useEffect(() => {
    if (!photos) return
    const guestsByEvent = {}
    for (const g of guests) (guestsByEvent[g.event_id] ||= []).push(g)
    const fresh = buildWeek({ weekStart: ws, occ, photos, catMap, uid, guestsByEvent })
    setSlides(mergeEdits(fresh, saved?.slides))
    setCaption(saved?.caption || '')
    setVis(saved?.visibility || 'friends')
    photoUrls(photos.map(p => p.path)).then(setUrls)
  }, [photos]) // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (k, patch) => setSlides(ss => ss.map(s => (s.key === k ? { ...s, ...patch } : s)))
  // Hidden photos are stored without their photo, so friends can never load them
  const clean = () => slides.map(s => (s.hidden ? { key: s.key, type: s.type, hidden: true } : s))
  const visible = slides.filter(s => !s.hidden)

  const post = async (andPost = true) => {
    setBusy('post'); setError('')
    try {
      await weeks.save({ week_start: key, slides: clean(), caption: caption.trim(), visibility: vis, post: andPost && !saved?.posted_at })
      onToast(saved?.posted_at ? 'Your week is updated.' : andPost ? 'Posted. Your friends can watch it now.' : 'Saved.')
      if (andPost) onClose()
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const unpost = async () => { setBusy('unpost'); try { await weeks.unpost(saved.id); onToast('Taken down.') } catch (e) { setError(e.message) } finally { setBusy('') } }
  const saveImage = async () => {
    setBusy('img'); setError('')
    try { await exportCollage({ slides: visible, urls, caption, name: me.display_name || me.username }) } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  return (
    <Sheet title="My Week" onClose={onClose}>
      <div className="seg" role="group" style={{ width: '100%' }}>
        <button style={{ flex: 1 }} aria-pressed={+ws === +addDays(thisWeek, -7)} onClick={() => setWs(addDays(thisWeek, -7))}>Last week</button>
        <button style={{ flex: 1 }} aria-pressed={+ws === +thisWeek} onClick={() => setWs(thisWeek)}>This week</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{fmt(ws, 'd MMM')} – {fmt(addDays(ws, 6), 'd MMM')} · built from your events and photos. Private and busy-only things are left out unless you switch them on.</p>

      {!photos ? <p className="small muted">Putting your week together…</p> : (
        <>
          <div className="week-strip">
            {slides.map(s => (
              <div key={s.key} className={`week-card ${s.type}${s.hidden ? ' off' : ''}`}>
                <div className="week-thumb">
                  {s.type === 'photo' && urls[s.path] && <img src={urls[s.path]} alt="" />}
                  {s.type === 'cover' && <b>{s.range}</b>}
                  {s.type === 'day' && <><b>{s.day}</b><small>{s.events.length} {s.events.length === 1 ? 'thing' : 'things'}</small></>}
                  {s.type === 'stats' && <b>Numbers</b>}
                </div>
                {s.type !== 'cover' && (
                  <button className="week-eye" aria-label={s.hidden ? 'Show this' : 'Hide this'} onClick={() => edit(s.key, { hidden: !s.hidden })}>{s.hidden ? 'Hidden' : 'Shown'}</button>
                )}
                {(s.type === 'photo' || s.type === 'day') && !s.hidden && (
                  <input className="week-cap" value={s.caption || ''} onChange={e => edit(s.key, { caption: e.target.value.slice(0, 120) })} placeholder="Caption" />
                )}
              </div>
            ))}
          </div>
          {photos.length === 0 && <p className="small muted" style={{ margin: 0 }}>No photos this week yet. Add some to an event (open it and tap Add under Photos) and they'll appear here.</p>}

          <label className="field"><span>Say something (optional)</span>
            <input className="input" value={caption} onChange={e => setCaption(e.target.value)} maxLength={200} placeholder="e.g. Long week but the 5-a-side made it" />
          </label>
          <div className="field"><span>Who can watch it</span>
            <div className="seg" role="group" style={{ width: '100%' }}>
              {[['friends', 'All friends'], ['close', 'Close friends']].map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={vis === v} onClick={() => setVis(v)}>{l}</button>)}
            </div>
          </div>

          <div className="row">
            <button className="btn grow" onClick={() => setPreview(true)} disabled={!visible.length}>Preview</button>
            <button className="btn grow" onClick={saveImage} disabled={busy === 'img'}>{busy === 'img' ? 'Making…' : 'Save image'}</button>
          </div>
          <button className="btn primary block" onClick={() => post(true)} disabled={!!busy}>{busy === 'post' ? 'Saving…' : saved?.posted_at ? 'Update my week' : 'Post to friends'}</button>
          {saved?.posted_at && <button className="btn ghost block danger-text" onClick={unpost} disabled={!!busy}>Take it down</button>}
          {error && <p className="error" role="alert">{error}</p>}
        </>
      )}
      {preview && <StoryViewer slides={slides} owner={me} people={people} caption={caption} mine onClose={() => setPreview(false)} />}
    </Sheet>
  )
}

/** A 1080×1920 collage you can save or post anywhere. */
async function exportCollage({ slides, urls, caption, name }) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920
  const g = c.getContext('2d')
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#2b4cff'
  const grad = g.createLinearGradient(0, 0, 1080, 1920)
  grad.addColorStop(0, css('--accent')); grad.addColorStop(1, '#111827')
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1920)
  const cover = slides.find(s => s.type === 'cover')
  g.fillStyle = '#fff'; g.font = '700 64px system-ui, sans-serif'; g.fillText(`${name}'s week`, 70, 150)
  g.font = '500 40px system-ui, sans-serif'; g.globalAlpha = 0.85; g.fillText(cover?.range || '', 70, 210); g.globalAlpha = 1
  if (caption) { g.font = 'italic 36px system-ui, sans-serif'; g.fillText(caption.slice(0, 48), 70, 275) }
  const pics = slides.filter(s => s.type === 'photo' && urls[s.path]).slice(0, 6)
  const load = src => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src })
  const imgs = await Promise.all(pics.map(p => load(urls[p.path])))
  const cols = imgs.length > 2 ? 2 : 1, w = cols === 2 ? 455 : 940, h = imgs.length > 4 ? 400 : imgs.length > 2 ? 560 : imgs.length === 2 ? 600 : 1100
  imgs.forEach((im, n) => {
    if (!im) return
    const x = 70 + (n % cols) * (w + 30), y = 330 + Math.floor(n / cols) * (h + 30)
    const r = Math.max(w / im.width, h / im.height), sw = w / r, sh = h / r
    g.save(); g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, 28); else g.rect(x, y, w, h); g.clip()
    g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h); g.restore()
  })
  if (!imgs.length) {
    g.font = '600 46px system-ui, sans-serif'
    slides.filter(s => s.type === 'day').slice(0, 7).forEach((d, n) => g.fillText(`${d.day}: ${d.events.map(e => e.title).join(', ')}`.slice(0, 42), 70, 420 + n * 110))
  }
  if (cover) { g.font = '600 40px system-ui, sans-serif'; g.fillText(`${cover.events} things · ${cover.hours} hours planned${cover.busiest ? ` · busiest: ${cover.busiest}` : ''}`, 70, 1820) }
  g.globalAlpha = 0.7; g.font = '600 34px system-ui, sans-serif'; g.fillText('made with Klander', 70, 1880); g.globalAlpha = 1
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9))
  if (!blob) throw new Error("Couldn't make the image (a photo may not have loaded). Try again.")
  const file = new File([blob], 'my-week.jpg', { type: 'image/jpeg' })
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'My week' }); return } catch { /* cancelled */ return } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-week.jpg'; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
