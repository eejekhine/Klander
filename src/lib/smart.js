import { addDays, addMinutes, parse } from 'date-fns'
import { supabase } from './supabase'
import { buildRRule, fmt, startOfDay } from './dates'

/** Shrink a photo/screenshot so it uploads fast and stays within the AI's limits. */
export function prepareImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      const dataUrl = c.toDataURL('image/jpeg', 0.85)
      resolve({ base64: dataUrl.split(',')[1], mime: 'image/jpeg', preview: dataUrl })
    }
    img.onerror = () => reject(new Error("Couldn't open that image. Try a screenshot or a JPG."))
    img.src = URL.createObjectURL(file)
  })
}

export async function readWithAI({ text, image }) {
  const now = new Date()
  const { data, error } = await supabase.functions.invoke('smart-add', {
    body: {
      text, image: image?.base64, mime: image?.mime,
      now: fmt(now, "EEEE d MMMM yyyy, HH:mm"),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London'
    }
  })
  if (error) {
    let msg = "Couldn't reach smart add. Check your connection."
    try { msg = (await error.context.json()).error || msg } catch { /* keep */ }
    throw new Error(msg)
  }
  return data
}

const at = (date, time) => parse(`${date} ${time || '00:00'}`, 'yyyy-MM-dd HH:mm', new Date())

/** AI draft -> the shape saveEvent() expects. */
export function draftToEvent(d, { category_id = null, visibility = 'friends' } = {}) {
  let s, e
  if (d.all_day) {
    s = startOfDay(at(d.date))
    e = addDays(startOfDay(at(d.end_date && d.end_date >= d.date ? d.end_date : d.date)), 1)
  } else {
    s = at(d.date, d.start_time)
    if (d.end_time) {
      e = at(d.end_date || d.date, d.end_time)
      if (e <= s) e = addDays(e, 1) // e.g. 23:30 -> 08:30 night shift
    } else e = addMinutes(s, 60)
  }
  let rrule = null
  if (d.repeat === 'weekly' && d.repeat_days?.length) {
    rrule = `FREQ=WEEKLY;BYDAY=${d.repeat_days.join(',')}`
    if (d.repeat_until) rrule += `;UNTIL=${d.repeat_until.replace(/-/g, '')}T235959Z`
  } else if (d.repeat && d.repeat !== 'none') {
    rrule = buildRRule(d.repeat, s, d.repeat_until || null)
  }
  return {
    title: d.title, all_day: !!d.all_day, starts_at: s.toISOString(), ends_at: e.toISOString(),
    location: d.location || '', notes: d.notes || '', rrule, exdates: [], category_id, visibility
  }
}

const DAY_NAMES = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' }
export function repeatLabel(d) {
  if (!d.repeat || d.repeat === 'none') return null
  const days = d.repeat_days?.length ? ` on ${d.repeat_days.map(x => DAY_NAMES[x]).join(', ')}` : ''
  const until = d.repeat_until ? ` until ${fmt(at(d.repeat_until), 'd MMM')}` : ''
  const base = { daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', fortnightly: 'Every 2 weeks', monthly: 'Every month', yearly: 'Every year' }[d.repeat]
  return `${base}${d.repeat === 'weekly' ? days : ''}${until}`
}

/** "Describe a vibe" -> a custom theme config (validated and contrast-checked by the theme engine). */
export async function aiTheme(vibe) {
  const { data, error } = await supabase.functions.invoke('smart-add', { body: { mode: 'theme', text: vibe } })
  if (error) {
    let msg = "Couldn't make that theme right now."
    try { msg = (await error.context.json()).error || msg } catch { /* keep */ }
    throw new Error(msg)
  }
  const t = data?.theme
  if (!t || !/^#[0-9a-f]{6}$/i.test(t.bg || '')) throw new Error("The AI didn't send back a usable theme. Try describing it differently.")
  return {
    preset: 'custom', name: String(t.name || 'My vibe').slice(0, 40),
    custom: { bg: t.bg, surface: t.surface, surface2: t.surface2, ink: t.ink, muted: t.muted, line: t.line, accent: t.accent, now: t.now },
    font: Number.isInteger(t.font) && t.font >= 0 && t.font <= 6 ? t.font : 0,
    style: ['filled', 'outline', 'solid', 'glow'].includes(t.style) ? t.style : 'filled',
    radius: Number.isFinite(t.radius) ? Math.max(0, Math.min(16, Math.round(t.radius))) : 8
  }
}

/** "move gym to 7": ask the AI which upcoming event you mean and what to change. */
export async function editWithAI(text, events) {
  const { data, error } = await supabase.functions.invoke('smart-add', {
    body: {
      mode: 'edit', text,
      now: fmt(new Date(), "EEEE d MMMM yyyy, HH:mm"),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
      events: events.map((o, i) => ({ i, title: o.title, start: fmt(o.start, 'EEE d MMM yyyy HH:mm'), end: fmt(o.end, 'EEE d MMM HH:mm'), location: o.location || '' }))
    }
  })
  if (error) {
    let msg = "Couldn't reach smart add. Check your connection."
    try { msg = (await error.context.json()).error || msg } catch { /* keep */ }
    throw new Error(msg)
  }
  return data
}

/** Work out the new start/end for a proposed change to one occurrence. */
export function applyChange(occ, c) {
  const dur = occ.end - occ.start
  const date = c.date || fmt(occ.start, 'yyyy-MM-dd')
  const start = c.start_time ? at(date, c.start_time) : c.date ? at(date, fmt(occ.start, 'HH:mm')) : occ.start
  let end
  if (c.end_time) { end = at(date, c.end_time); if (end <= start) end = addDays(end, 1) }
  else end = new Date(start.getTime() + dur)
  return { start, end, title: c.title || occ.title, location: c.location ?? occ.location ?? '' }
}
