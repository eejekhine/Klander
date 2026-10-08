import { addDays, addWeeks, differenceInMinutes, startOfMonth, addMonths } from 'date-fns'
import { expandEvents, fmt, WEEK_OPTS } from './dates'
import { startOfWeek } from 'date-fns'
import { supabase } from './supabase'

/** UK uni-style terms: Autumn (Sep–Dec), Spring (Jan–Mar), Summer (Apr–Aug). */
export function termOf(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth()
  if (m >= 8) return { key: `autumn-${y}`, label: `Autumn term ${y}`, short: 'Autumn term', from: new Date(y, 8, 1), to: new Date(y + 1, 0, 1) }
  if (m <= 2) return { key: `spring-${y}`, label: `Spring term ${y}`, short: 'Spring term', from: new Date(y, 0, 1), to: new Date(y, 3, 1) }
  return { key: `summer-${y}`, label: `Summer ${y}`, short: 'Summer', from: new Date(y, 3, 1), to: new Date(y, 8, 1) }
}

/** The period picker: this month, this term, this year (each ends now for "so far" stats). */
export function periodOf(kind, now = new Date()) {
  if (kind === 'month') return { kind, label: fmt(now, 'MMMM'), from: startOfMonth(now), to: addMonths(startOfMonth(now), 1) }
  if (kind === 'year') return { kind, label: String(now.getFullYear()), from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) }
  const t = termOf(now)
  return { kind: 'term', label: t.label, from: t.from, to: t.to, term: t }
}

/** Is it the end of a term (time to show the Wrapped card)? */
export function wrappedSeason(now = new Date()) {
  const m = now.getMonth(), d = now.getDate()
  return (m === 11 && d >= 10) || (m === 2 && d >= 20) || (m === 7) || (m === 6 && d >= 15)
}

const mins = o => Math.max(0, differenceInMinutes(o.end, o.start))

/**
 * Your time, so far, in a period. Only your own events and plans you're going to.
 * events: your events (data.events); plans: plans you're going to; catMap: id → category.
 */
export function summarise({ events, plans = [], catMap = {}, from, to, now = new Date() }) {
  const end = to < now ? to : now
  const own = expandEvents(events, from, end).filter(o => !o.all_day && o.start >= from)
  const went = expandEvents(plans, from, end).filter(o => !o.all_day && o.start >= from).map(o => ({ ...o, plan: true }))
  const occ = [...own, ...went]
  const byCat = {}
  let total = 0
  const perWeek = {}
  const perDow = Array(7).fill(0)
  for (const o of occ) {
    const m = mins(o)
    total += m
    const c = o.plan ? { name: 'Plans with friends', colour: '#f97316' } : catMap[o.category_id] || { name: 'Other', colour: '#94a3b8' }
    const k = c.name
    byCat[k] ||= { name: k, colour: c.colour, minutes: 0, count: 0 }
    byCat[k].minutes += m; byCat[k].count += 1
    const wk = +startOfWeek(o.start, WEEK_OPTS)
    perWeek[wk] = (perWeek[wk] || 0) + m
    perDow[(o.start.getDay() + 6) % 7] += 1
  }
  const cats = Object.values(byCat).sort((a, b) => b.minutes - a.minutes).map(c => ({ ...c, hours: Math.round(c.minutes / 6) / 10 }))
  const bw = Object.entries(perWeek).sort((a, b) => b[1] - a[1])[0]
  const dow = perDow.indexOf(Math.max(...perDow))
  return {
    count: occ.length,
    hours: Math.round(total / 60),
    cats,
    plans: went.length,
    busiestWeek: bw ? { start: new Date(+bw[0]), hours: Math.round(bw[1] / 60) } : null,
    busiestDay: occ.length ? fmt(addDays(new Date(2024, 0, 1), dow), 'EEEE') : null // 1 Jan 2024 was a Monday
  }
}

/**
 * Streaks: weeks in a row with at least one event in a category, counting back from this week.
 * This week only breaks the streak once it's over, so "3 weeks running" stays true on a Monday.
 */
export function streaks({ events, categories, now = new Date(), maxWeeks = 52 }) {
  const thisWeek = startOfWeek(now, WEEK_OPTS)
  const from = addWeeks(thisWeek, -maxWeeks)
  const occ = expandEvents(events.filter(e => e.category_id), from, addWeeks(thisWeek, 1))
  const out = []
  for (const c of categories) {
    if (c.is_shift) continue
    const weeks = new Set(occ.filter(o => o.category_id === c.id && o.start <= now).map(o => +startOfWeek(o.start, WEEK_OPTS)))
    const doneThisWeek = weeks.has(+thisWeek)
    let w = doneThisWeek ? thisWeek : addWeeks(thisWeek, -1)
    let n = 0
    while (weeks.has(+w)) { n++; w = addWeeks(w, -1) }
    // longest run in the window
    let best = 0, run = 0
    for (let i = maxWeeks; i >= 0; i--) { if (weeks.has(+addWeeks(thisWeek, -i))) { run++; best = Math.max(best, run) } else run = 0 }
    if (n >= 2 || best >= 3) out.push({ id: c.id, name: c.name, colour: c.colour, weeks: n, doneThisWeek, best })
  }
  return out.sort((a, b) => b.weeks - a.weeks || b.best - a.best)
}

/** Who you made plans with (counts only you and each friend can see). */
export async function hangouts(from, to) {
  const { data, error } = await supabase.rpc('hangout_counts', { p_from: from.toISOString(), p_to: to.toISOString() })
  if (error) throw error
  return (Array.isArray(data) ? data : []).sort((a, b) => b.plans - a.plans || new Date(b.last_at) - new Date(a.last_at))
}

const first = p => (p?.display_name || p?.username || '').split(/\s+/)[0]

/** The end-of-term Wrapped story (slides for StoryViewer). */
export function buildWrapped({ term, sum, streakList, saw, people, photo }) {
  const slides = [{ type: 'big', key: 'w-cover', tone: 'cover', eyebrow: 'Klander Wrapped', big: term.label, sub: `${sum.count} things · ${sum.hours} hours planned` }]
  const top = sum.cats[0]
  if (top) slides.push({ type: 'big', key: 'w-top', eyebrow: 'Most of your time went to', big: top.name, sub: `${top.hours} hours across ${top.count} ${top.count === 1 ? 'event' : 'events'}`, list: sum.cats.slice(1, 4).map(c => ({ label: c.name, value: `${c.hours}h` })) })
  const friends = saw.filter(h => people[h.friend_id])
  if (friends.length) {
    const f = friends[0]
    slides.push({ type: 'big', key: 'w-friend', eyebrow: 'Your number one', big: first(people[f.friend_id]), person: f.friend_id, sub: `${f.plans} ${f.plans === 1 ? 'plan' : 'plans'} together`, people: friends.slice(1, 6).map(h => h.friend_id) })
  }
  if (photo) slides.push({ type: 'photo', key: 'w-photo', path: photo.path, at: photo.taken_at, title: photo.title || 'A favourite', caption: photo.caption || '' })
  const st = [...streakList].sort((a, b) => b.best - a.best)[0]
  if (st) slides.push({ type: 'big', key: 'w-streak', eyebrow: 'Longest streak', big: `${st.best} weeks`, sub: `of ${st.name} in a row` })
  if (sum.busiestWeek) slides.push({ type: 'big', key: 'w-week', eyebrow: 'Busiest week', big: `w/c ${fmt(sum.busiestWeek.start, 'd MMM')}`, sub: `${sum.busiestWeek.hours} hours planned${sum.busiestDay ? ` · ${sum.busiestDay}s were your busiest day` : ''}` })
  slides.push({ type: 'big', key: 'w-end', tone: 'cover', eyebrow: 'That was', big: term.short, sub: friends.length ? `Plans with ${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}. Here's to the next one.` : "Here's to the next one." })
  return slides
}
