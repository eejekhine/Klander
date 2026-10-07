// Shared calendar (.ics) helpers for Klander's Edge Functions.
// Plain JS so the same code runs in Deno (Supabase) and Node (tests).

/** Offset (ms) of a time zone from UTC at a given instant. */
function tzOffset(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date)
  const g = t => Number(parts.find(p => p.type === t).value)
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
  return asUtc - date.getTime()
}

/** Wall-clock time in `tz` -> real instant. */
export function zonedToUtc(y, mo, d, h = 0, mi = 0, s = 0, tz = 'Europe/London') {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  let t = guess - tzOffset(new Date(guess), tz)
  t = guess - tzOffset(new Date(t), tz) // second pass settles DST edges
  return new Date(t)
}

/** Instant -> wall-clock parts in `tz`. */
export function utcToZoned(date, tz = 'Europe/London') {
  const local = new Date(date.getTime() + tzOffset(date, tz))
  return {
    y: local.getUTCFullYear(), mo: local.getUTCMonth() + 1, d: local.getUTCDate(),
    h: local.getUTCHours(), mi: local.getUTCMinutes(), s: local.getUTCSeconds()
  }
}

/** ical.js Time -> { date: Date, allDay: boolean } */
function timeToInstant(ICAL, t, tz) {
  if (t.isDate) return { date: zonedToUtc(t.year, t.month, t.day, 0, 0, 0, tz), allDay: true }
  const zone = t.zone
  const known = zone && (zone === ICAL.Timezone.utcTimezone || (zone.tzid && zone.tzid !== 'floating' && zone.component))
  if (known) return { date: t.toJSDate(), allDay: false }
  // Floating time, or a TZID the file didn't define (common with Outlook): try it as an IANA zone, else the user's zone
  const tzid = zone?.tzid && zone.tzid !== 'floating' ? zone.tzid : null
  let useTz = tz
  if (tzid) { try { new Intl.DateTimeFormat('en-GB', { timeZone: tzid }); useTz = tzid } catch { /* not IANA */ } }
  return { date: zonedToUtc(t.year, t.month, t.day, t.hour, t.minute, t.second, useTz), allDay: false }
}

const clip = (s, n) => (s == null ? null : String(s).replace(/\s+$/g, '').slice(0, n) || null)

/**
 * Parse .ics text into rows ready for the events table (minus owner/source fields).
 * Keeps repeating events as RRULEs; moved single occurrences become their own rows.
 */
export function parseIcs(ICAL, text, { tz = 'Europe/London', now = new Date(), pastDays = 120, futureDays = 550, max = 3000 } = {}) {
  const comp = new ICAL.Component(ICAL.parse(text))
  for (const vtz of comp.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(vtz) } catch { /* duplicate */ }
  }
  const calName = comp.getFirstPropertyValue('x-wr-calname') || null
  const from = new Date(now.getTime() - pastDays * 864e5)
  const to = new Date(now.getTime() + futureDays * 864e5)

  const masters = new Map()
  const overrides = []
  for (const ve of comp.getAllSubcomponents('vevent')) {
    const status = String(ve.getFirstPropertyValue('status') || '').toUpperCase()
    const ev = new ICAL.Event(ve)
    if (!ev.uid || !ev.startDate) continue
    if (ev.isRecurrenceException()) overrides.push({ ev, cancelled: status === 'CANCELLED' })
    else if (status !== 'CANCELLED') masters.set(ev.uid, ev)
  }

  const rows = new Map()
  const toRow = (ev, uidKey) => {
    const s = timeToInstant(ICAL, ev.startDate, tz)
    let e
    if (ev.endDate) e = timeToInstant(ICAL, ev.endDate, tz).date
    else e = new Date(s.date.getTime() + (s.allDay ? 864e5 : 36e5))
    if (e < s.date) e = s.date
    if (s.allDay && e.getTime() === s.date.getTime()) e = new Date(s.date.getTime() + 864e5)
    return {
      external_uid: clip(uidKey, 500),
      title: clip(ev.summary, 300) || '(No title)',
      location: clip(ev.location, 200),
      notes: clip(ev.description, 2000),
      starts_at: s.date.toISOString(),
      ends_at: e.toISOString(),
      all_day: s.allDay,
      rrule: null,
      exdates: []
    }
  }

  for (const [uid, ev] of masters) {
    const row = toRow(ev, uid)
    const rr = ev.component.getFirstPropertyValue('rrule')
    if (rr) {
      row.rrule = rr.toString()
      const until = rr.until ? timeToInstant(ICAL, rr.until, tz).date : null
      if (until && until < from) continue
      for (const p of ev.component.getAllProperties('exdate')) {
        for (const v of p.getValues()) row.exdates.push(timeToInstant(ICAL, v, tz).date.toISOString())
      }
    } else if (new Date(row.ends_at) < from || new Date(row.starts_at) > to) continue
    rows.set(uid, row)
  }

  for (const { ev, cancelled } of overrides) {
    const master = rows.get(ev.uid)
    const rid = timeToInstant(ICAL, ev.recurrenceId, tz).date.toISOString()
    if (master && !master.exdates.includes(rid)) master.exdates.push(rid)
    if (cancelled) continue
    const row = toRow(ev, `${ev.uid}::${rid}`)
    if (new Date(row.ends_at) < from || new Date(row.starts_at) > to) continue
    rows.set(row.external_uid, row)
  }

  return { calName, rows: [...rows.values()].slice(0, max) }
}

/* ---------------- building a feed ---------------- */

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const pad = n => String(n).padStart(2, '0')
const utcStamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
const localStamp = p => `${p.y}${pad(p.mo)}${pad(p.d)}T${pad(p.h)}${pad(p.mi)}${pad(p.s)}`
const dateStamp = p => `${p.y}${pad(p.mo)}${pad(p.d)}`

// Fold lines to 75 octets as RFC 5545 asks
function fold(line) {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out = []
  let cur = ''
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

const LONDON_VTZ = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/London',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'TZNAME:BST', 'DTSTART:19810329T010000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'TZNAME:GMT', 'DTSTART:19961027T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'
]

/** Klander's own events -> .ics text. Timed events use Europe/London so repeats survive clock changes. */
export function buildIcs(events, { name = 'Klander', tz = 'Europe/London', now = new Date() } = {}) {
  const useLondon = tz === 'Europe/London'
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Klander//Klander Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, `X-WR-TIMEZONE:${tz}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H']
  if (useLondon) L.push(...LONDON_VTZ)
  const stamp = utcStamp(now)
  const dt = (prop, iso, allDay) => {
    const d = new Date(iso)
    if (allDay) return `${prop};VALUE=DATE:${dateStamp(utcToZoned(d, tz))}`
    return useLondon ? `${prop};TZID=Europe/London:${localStamp(utcToZoned(d, tz))}` : `${prop}:${utcStamp(d)}`
  }
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:${e.id}@klander`, `DTSTAMP:${stamp}`, dt('DTSTART', e.starts_at, e.all_day), dt('DTEND', e.ends_at, e.all_day),
      `SUMMARY:${esc(e.title)}`)
    if (e.location) L.push(`LOCATION:${esc(e.location)}`)
    if (e.notes) L.push(`DESCRIPTION:${esc(e.notes)}`)
    if (e.rrule) L.push(`RRULE:${e.rrule}`)
    for (const x of e.exdates || []) L.push(dt('EXDATE', x, e.all_day))
    if (e.updated_at) L.push(`LAST-MODIFIED:${utcStamp(new Date(e.updated_at))}`)
    L.push('END:VEVENT')
  }
  L.push('END:VCALENDAR')
  return L.map(fold).join('\r\n') + '\r\n'
}
