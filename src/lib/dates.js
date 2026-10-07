import { RRule } from 'rrule'
import {
  addDays, addMinutes, startOfDay, startOfWeek, startOfMonth, endOfMonth, endOfWeek,
  differenceInMinutes, format, isSameDay
} from 'date-fns'
import { enGB } from 'date-fns/locale'

export const WEEK_OPTS = { weekStartsOn: 1, locale: enGB }
export const fmt = (d, f) => format(d, f, { locale: enGB })

/* rrule works in UTC. To keep "every weekday at 23:30" at 23:30 local time across
   BST/GMT changes we use rrule's "floating time" trick: feed it local wall-clock
   components dressed up as UTC, then read the results back as local. */
const toFloating = d => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
const fromFloating = d => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())

/** Expand stored events into concrete occurrences overlapping [from, to). */
export function expandEvents(events, from, to) {
  const out = []
  for (const ev of events) {
    const start = new Date(ev.starts_at)
    const end = new Date(ev.ends_at)
    const durMin = differenceInMinutes(end, start)
    if (!ev.rrule) {
      if (start < to && end > from) out.push({ ...ev, start, end, key: ev.id })
      continue
    }
    let opts
    try { opts = RRule.parseString(ev.rrule) } catch { continue }
    // UNTIL is written as local wall-clock time with a Z suffix (see buildRRule), so it is already "floating".
    const rule = new RRule({ ...opts, dtstart: toFloating(start) })
    const ex = new Set((ev.exdates || []).map(x => new Date(x).getTime()))
    const occ = rule.between(toFloating(addMinutes(from, -durMin)), toFloating(to), true)
    for (const f of occ) {
      const s = fromFloating(f)
      if (ex.has(s.getTime())) continue
      const e = addMinutes(s, durMin)
      if (s < to && e > from) out.push({ ...ev, start: s, end: e, key: `${ev.id}:${s.getTime()}`, occurrence: s })
    }
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end)
}

/** Lay out timed events for one day column: returns [{ev, top, height, left, width}] in % / minutes. */
export function layoutDay(occurrences, day) {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  const items = occurrences
    .filter(o => !o.all_day && o.start < dayEnd && o.end > dayStart)
    .map(o => {
      const s = o.start < dayStart ? dayStart : o.start
      const e = o.end > dayEnd ? dayEnd : o.end
      const top = differenceInMinutes(s, dayStart)
      return { ev: o, top, bottom: Math.max(top + 20, differenceInMinutes(e, dayStart)) }
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom)

  // cluster overlapping events, then assign columns greedily inside each cluster
  const result = []
  let cluster = [], clusterEnd = -1
  const flush = () => {
    const cols = []
    for (const it of cluster) {
      let c = cols.findIndex(end => end <= it.top)
      if (c === -1) { c = cols.length; cols.push(0) }
      cols[c] = it.bottom
      it.col = c
    }
    for (const it of cluster) result.push({ ...it, cols: cols.length })
    cluster = []
  }
  for (const it of items) {
    if (it.top >= clusterEnd && cluster.length) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.bottom)
  }
  if (cluster.length) flush()
  return result
}

export const allDayOn = (occurrences, day) => {
  const s = startOfDay(day), e = addDays(s, 1)
  return occurrences.filter(o => o.all_day && o.start < e && o.end > s)
}
export const eventsOn = (occurrences, day) => {
  const s = startOfDay(day), e = addDays(s, 1)
  return occurrences.filter(o => o.start < e && o.end > s)
}

export function rangeFor(view, date) {
  if (view === 'day') return { from: startOfDay(date), to: addDays(startOfDay(date), 1) }
  if (view === 'week') { const s = startOfWeek(date, WEEK_OPTS); return { from: s, to: addDays(s, 7) } }
  if (view === 'month') {
    const s = startOfWeek(startOfMonth(date), WEEK_OPTS)
    const e = addDays(endOfWeek(endOfMonth(date), WEEK_OPTS), 1)
    return { from: s, to: startOfDay(e) }
  }
  return { from: startOfDay(date), to: addDays(startOfDay(date), 60) } // agenda
}

export function titleFor(view, date) {
  if (view === 'day') return fmt(date, 'EEE d MMM')
  if (view === 'week') {
    const s = startOfWeek(date, WEEK_OPTS), e = addDays(s, 6)
    return s.getMonth() === e.getMonth() ? fmt(s, 'MMMM yyyy') : `${fmt(s, 'MMM')} – ${fmt(e, 'MMM yyyy')}`
  }
  if (view === 'month') return fmt(date, 'MMMM yyyy')
  return 'Coming up'
}

export function timeLabel(o) {
  if (o.all_day) return 'All day'
  const sameDay = isSameDay(o.start, o.end) || (o.end - startOfDay(o.end) === 0 && differenceInMinutes(o.end, o.start) <= 1440)
  return sameDay
    ? `${fmt(o.start, 'HH:mm')}–${fmt(o.end, 'HH:mm')}`
    : `${fmt(o.start, 'HH:mm')} – ${fmt(o.end, 'EEE HH:mm')}`
}

/* ---------- repeat presets <-> RRULE strings ---------- */
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const dayCode = d => DAYS[(d.getDay() + 6) % 7]

export const REPEATS = [
  ['none', 'Does not repeat'],
  ['daily', 'Every day'],
  ['weekdays', 'Every weekday (Mon–Fri)'],
  ['weekly', 'Every week'],
  ['fortnightly', 'Every 2 weeks'],
  ['monthly', 'Every month'],
  ['yearly', 'Every year']
]

export function buildRRule(preset, start, until) {
  let r
  switch (preset) {
    case 'daily': r = 'FREQ=DAILY'; break
    case 'weekdays': r = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'; break
    case 'weekly': r = `FREQ=WEEKLY;BYDAY=${dayCode(start)}`; break
    case 'fortnightly': r = `FREQ=WEEKLY;INTERVAL=2;BYDAY=${dayCode(start)}`; break
    case 'monthly': r = 'FREQ=MONTHLY'; break
    case 'yearly': r = 'FREQ=YEARLY'; break
    default: return null
  }
  if (until) {
    const u = new Date(until); u.setHours(23, 59, 59)
    r += `;UNTIL=${format(u, "yyyyMMdd'T'HHmmss")}Z`
  }
  return r
}

export function parseRRule(rrule) {
  if (!rrule) return { preset: 'none', until: '' }
  const until = (rrule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/) || []).slice(1).join('-')
  const base = rrule.replace(/;?UNTIL=[^;]+/, '')
  let preset = 'custom'
  if (base === 'FREQ=DAILY') preset = 'daily'
  else if (base === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') preset = 'weekdays'
  else if (/^FREQ=WEEKLY;BYDAY=[A-Z]{2}$/.test(base)) preset = 'weekly'
  else if (/^FREQ=WEEKLY;INTERVAL=2;BYDAY=[A-Z]{2}$/.test(base)) preset = 'fortnightly'
  else if (base === 'FREQ=MONTHLY') preset = 'monthly'
  else if (base === 'FREQ=YEARLY') preset = 'yearly'
  return { preset, until }
}

export { addDays, startOfDay, isSameDay, startOfWeek, format }
