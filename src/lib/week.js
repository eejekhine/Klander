import { addDays, differenceInMinutes, isSameDay } from 'date-fns'
import { fmt } from './dates'

/**
 * Build a My Week story from your week.
 * occ: your occurrences this week (own events + plans you went to), each with { id, title, start, end, all_day, visibility, category_id, plan?, friend? }
 * photos: event_photos rows (with path) taken this week that are yours or from events you were at
 * Returns slides (plain JSON, stored in week_recaps.slides).
 */
export function buildWeek({ weekStart, occ, photos, catMap = {}, uid, guestsByEvent = {} }) {
  const weekEnd = addDays(weekStart, 7)
  const shareable = o => !o.all_day && (o.plan || o.visibility === 'friends' || o.visibility === 'close')
  const evById = Object.fromEntries(occ.map(o => [o.id, o]))
  const timed = occ.filter(o => !o.all_day && o.start >= weekStart && o.start < weekEnd)

  // stats
  const minsByCat = {}
  let total = 0
  const perDay = Array.from({ length: 7 }, () => 0)
  for (const o of timed) {
    const m = Math.max(0, differenceInMinutes(o.end, o.start))
    total += m
    const key = o.plan ? 'Plans with friends' : catMap[o.category_id]?.name || 'Other'
    minsByCat[key] = (minsByCat[key] || 0) + m
    perDay[Math.min(6, Math.max(0, Math.floor((o.start - weekStart) / 864e5)))] += 1
  }
  const busiest = perDay.indexOf(Math.max(...perDay))
  const seen = new Set()
  for (const o of timed) {
    if (o.plan) { seen.add(o.owner_id); for (const g of o.plan.guests || []) if (g.status === 'going') seen.add(g.user_id) }
    for (const g of guestsByEvent[o.id] || []) if (g.status === 'going') seen.add(g.user_id)
  }
  seen.delete(uid)

  const slides = [{
    type: 'cover', key: 'cover',
    range: `${fmt(weekStart, 'd MMM')} – ${fmt(addDays(weekStart, 6), 'd MMM')}`,
    events: timed.length, hours: Math.round(total / 60), busiest: timed.length ? fmt(addDays(weekStart, busiest), 'EEEE') : null
  }]

  // a slide per photo, in time order; days with no photos get one "day" slide listing what you did
  const items = []
  for (const p of photos) {
    const ev = evById[p.event_id]
    const priv = ev && !shareable(ev)
    items.push({
      type: 'photo', key: `p-${p.id}`, photo_id: p.id, path: p.path, at: p.taken_at,
      title: priv ? '' : ev?.title || '', caption: p.caption || '', mine: p.user_id === uid, hidden: !!priv
    })
  }
  for (let d = 0; d < 7; d++) {
    const day = addDays(weekStart, d)
    if (photos.some(p => isSameDay(new Date(p.taken_at), day))) continue
    const list = timed.filter(o => isSameDay(o.start, day) && shareable(o)).slice(0, 4)
    if (!list.length) continue
    items.push({ type: 'day', key: `d-${d}`, at: day.toISOString(), day: fmt(day, 'EEEE'), events: list.map(o => ({ title: o.title, time: fmt(o.start, 'HH:mm') })), hidden: false })
  }
  items.sort((a, b) => new Date(a.at) - new Date(b.at))
  slides.push(...items.slice(0, 16))

  const cats = Object.entries(minsByCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, m]) => ({ name, hours: Math.round(m / 6) / 10 }))
  if (cats.length || seen.size) slides.push({ type: 'stats', key: 'stats', cats, people: [...seen].slice(0, 8) })
  return slides
}

/** Keep your edits (hidden, captions) when the story is rebuilt. */
export function mergeEdits(fresh, saved = []) {
  const byKey = Object.fromEntries(saved.map(s => [s.key, s]))
  return fresh.map(s => (byKey[s.key] ? { ...s, hidden: byKey[s.key].hidden, caption: byKey[s.key].caption ?? s.caption } : s))
}
