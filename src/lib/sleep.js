import { expandEvents } from './dates'

/** Sleep blocks after shifts: one per shift occurrence, `hours` long. */
export function sleepBlocks(occurrences, isShift, hours = 7) {
  if (!hours) return []
  return occurrences
    .filter(o => !o.all_day && isShift(o))
    .map(o => ({
      id: `sleep-${o.key}`, key: `sleep-${o.key}`, title: 'Sleep', sleep: true, all_day: false,
      start: o.end, end: new Date(o.end.getTime() + hours * 3600e3), visibility: 'busy'
    }))
}

/** Sleep intervals from friend_busy_v2 rows (shift rows carry is_shift + sleep_hours). */
export function friendSleepRows(rows, from, to) {
  const out = []
  for (const r of rows.filter(x => x.is_shift && !x.all_day)) {
    const h = Number(r.sleep_hours) || 7
    for (const o of expandEvents([r], new Date(from.getTime() - 864e5), to)) {
      out.push({ owner_id: r.owner_id, starts_at: o.end.toISOString(), ends_at: new Date(o.end.getTime() + h * 3600e3).toISOString(), all_day: false, rrule: null, exdates: [] })
    }
  }
  return out
}
