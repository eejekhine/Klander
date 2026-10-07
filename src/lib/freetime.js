import { addDays, addMinutes, startOfDay } from 'date-fns'
import { expandEvents } from './dates'

/** Timed busy intervals [{s,e}] (all-day items like birthdays and bank holidays don't block time), merged and sorted. */
export function busyIntervals(events, from, to) {
  const list = expandEvents(events.filter(e => !e.all_day), from, to).map(o => ({ s: o.start, e: o.end }))
  return merge(list)
}

export function merge(list) {
  const sorted = [...list].sort((a, b) => a.s - b.s)
  const out = []
  for (const x of sorted) {
    const last = out[out.length - 1]
    if (last && x.s <= last.e) { if (x.e > last.e) last.e = x.e }
    else out.push({ s: new Date(x.s), e: new Date(x.e) })
  }
  return out
}

/** Free gaps inside [from, to) given merged busy intervals. */
export function freeGaps(busy, from, to) {
  const out = []
  let cur = from
  for (const b of busy) {
    if (b.e <= cur) continue
    if (b.s >= to) break
    if (b.s > cur) out.push({ s: cur, e: b.s < to ? b.s : to })
    if (b.e > cur) cur = b.e
  }
  if (cur < to) out.push({ s: cur, e: to })
  return out
}

/** Is this person free right now? -> { free, until } (until = when that changes, within 24h, or null) */
export function freeNow(busy, now = new Date()) {
  const cur = busy.find(b => b.s <= now && b.e > now)
  if (cur) return { free: false, until: cur.e }
  const next = busy.find(b => b.s > now)
  return { free: true, until: next && next.s - now < 864e5 ? next.s : null }
}

const roundUp = (d, mins = 30) => { const x = new Date(d); const m = x.getMinutes(); x.setSeconds(0, 0); x.setMinutes(Math.ceil(m / mins) * mins); return x }

/**
 * Find windows where people are free.
 * busyBy: { [personId]: mergedBusy[] }, people: ids that must be free
 * opts: { days, duration (mins), startHour, endHour, now }
 * Returns { all: [{s,e,day}], allBut: [{s,e,missing}] } (windows at least `duration` long, inside the daily hours)
 */
export function findTimes(busyBy, people, { days = 7, duration = 60, startHour = 9, endHour = 22, now = new Date() } = {}) {
  const all = [], allBut = []
  const first = startOfDay(now)
  for (let i = 0; i < days; i++) {
    const day = addDays(first, i)
    let ws = new Date(day); ws.setHours(startHour, 0, 0, 0)
    let we = new Date(day); if (endHour >= 24) { we = addDays(day, 1) } else we.setHours(endHour, 0, 0, 0)
    if (we <= now) continue
    if (ws < now) ws = roundUp(now)
    if (addMinutes(ws, duration) > we) continue
    const gapsFor = ids => {
      const busy = merge(ids.flatMap(id => busyBy[id] || []))
      return freeGaps(busy, ws, we).filter(g => (g.e - g.s) / 60000 >= duration)
    }
    for (const g of gapsFor(people)) all.push({ ...g, day })
    if (people.length > 2) {
      for (const missing of people) {
        const rest = people.filter(p => p !== missing)
        for (const g of gapsFor(rest)) {
          // only worth showing if it isn't already an everyone-free window
          if (!all.some(a => a.s <= g.s && a.e >= g.e)) allBut.push({ ...g, day, missing })
        }
      }
    }
  }
  allBut.sort((a, b) => a.s - b.s)
  return { all, allBut: allBut.slice(0, 12) }
}

/** Busy intervals per person for the next n days: me from my own events (+ plans I'm going to), friends from friend_busy rows. */
export function buildBusyMap({ uid, myEvents, myPlans = [], friendBusy, days = 14, now = new Date() }) {
  const from = startOfDay(now), to = addDays(from, days + 1)
  const map = { [uid]: busyIntervals([...myEvents, ...myPlans], from, to) }
  const byOwner = {}
  for (const r of friendBusy) (byOwner[r.owner_id] ||= []).push(r)
  for (const [id, rows] of Object.entries(byOwner)) map[id] = busyIntervals(rows, from, to)
  return map
}
