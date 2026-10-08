// Sends Klander notifications to phones (Web Push), and creates event reminders.
// - Every minute pg_cron POSTs here with x-cron-secret.
// - A signed-in user can POST { test: true } to get a test notification.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import rrulePkg from 'npm:rrule@2.8.1'
// rrule is a CommonJS package, so take RRule off the default export
// deno-lint-ignore no-explicit-any
const RRule = (rrulePkg as any).RRule

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const SOCIAL = new Set(['friend_event', 'invite', 'rsvp', 'broadcast', 'broadcast_reply', 'request', 'accepted', 'poll', 'poll_vote', 'message', 'week', 'week_reaction'])

/* ---------- VAPID keys: made once, kept in the database ---------- */
async function vapid() {
  let { data: pub } = await admin.rpc('app_secret', { n: 'vapid_public' })
  let { data: priv } = await admin.rpc('app_secret', { n: 'vapid_private' })
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys()
    await admin.rpc('set_app_secret', { n: 'vapid_public', v: k.publicKey })
    await admin.rpc('set_app_secret', { n: 'vapid_private', v: k.privateKey })
    pub = (await admin.rpc('app_secret', { n: 'vapid_public' })).data
    priv = (await admin.rpc('app_secret', { n: 'vapid_private' })).data
  }
  webpush.setVapidDetails('mailto:klander.app@proton.me', pub, priv)
  return pub as string
}

/* ---------- time zone helpers (rrule works in "floating" wall-clock time) ---------- */
function wall(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(d).filter(x => x.type !== 'literal').map(x => [x.type, +x.value]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}
const floating = (d: Date, tz: string) => new Date(wall(d, tz))
function fromFloating(f: Date, tz: string) {
  const g = f.getTime()
  let t = g - (wall(new Date(g), tz) - g)
  const off2 = wall(new Date(t), tz) - t
  if (g - off2 !== t) t = g - off2
  return new Date(t)
}
function minutesOfDay(d: Date, tz: string) {
  const w = new Date(wall(d, tz)); return w.getUTCHours() * 60 + w.getUTCMinutes()
}
function inQuiet(s: { quiet_start: string | null; quiet_end: string | null } | undefined, tz: string, now: Date) {
  if (!s?.quiet_start || !s?.quiet_end) return false
  const toM = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5)
  const a = toM(s.quiet_start), b = toM(s.quiet_end), m = minutesOfDay(now, tz)
  return a === b ? false : a < b ? m >= a && m < b : m >= a || m < b
}
const hhmm = (d: Date, tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
const before = (m: number) => (m === 0 ? 'Starting now' : m < 60 ? `In ${m} minutes` : m < 1440 ? `In ${m / 60} hour${m === 60 ? '' : 's'}` : `In ${m / 1440} day${m === 1440 ? '' : 's'}`)

/* ---------- reminders ---------- */
type Ev = { id: string; owner_id: string; title: string; location: string | null; starts_at: string; ends_at: string; rrule: string | null; exdates: string[] | null; remind_minutes: number | null; category_id?: string | null; all_day?: boolean; visibility?: string }
function nextStarts(e: Ev, tz: string, from: Date, to: Date): Date[] {
  const start = new Date(e.starts_at)
  if (!e.rrule) return start >= from && start < to ? [start] : []
  try {
    const rule = new RRule({ ...RRule.parseString(e.rrule), dtstart: floating(start, tz) })
    const ex = new Set((e.exdates || []).map(x => new Date(x).getTime()))
    return rule.between(floating(from, tz), floating(to, tz), true).map((f: Date) => fromFloating(f, tz)).filter((s: Date) => !ex.has(s.getTime()) && s >= from && s < to)
  } catch { return [] }
}

async function makeReminders(now: Date) {
  const { data: settings } = await admin.from('notify_settings').select('user_id, reminders, default_reminder')
  const sMap = new Map((settings || []).map(s => [s.user_id, s]))
  const { data: profiles } = await admin.from('profiles').select('id, timezone')
  const tzOf = new Map((profiles || []).map(p => [p.id, p.timezone || 'Europe/London']))
  const soon = new Date(now.getTime() + 8 * 864e5).toISOString()
  const { data: cats } = await admin.from('categories').select('id, default_reminder')
  const catRem = new Map((cats || []).map(c => [c.id, c.default_reminder]))
  const cols = 'id, owner_id, title, location, starts_at, ends_at, rrule, exdates, remind_minutes, category_id'
  const { data: own } = await admin.from('events').select(cols).eq('all_day', false).is('source_id', null)
    .or(`rrule.not.is.null,and(starts_at.gt.${now.toISOString()},starts_at.lt.${soon})`)
  const { data: going } = await admin.from('event_invites').select(`user_id, events(${cols})`).eq('status', 'going')
  const jobs: { user: string; e: Ev; mins: number }[] = []
  for (const e of (own || []) as Ev[]) {
    const s = sMap.get(e.owner_id)
    if (s && !s.reminders) continue
    const mins = e.remind_minutes ?? (e.category_id ? catRem.get(e.category_id) : null) ?? s?.default_reminder ?? null
    if (mins == null || mins < 0) continue
    jobs.push({ user: e.owner_id, e, mins })
  }
  for (const g of (going || []) as unknown as { user_id: string; events: Ev }[]) {
    const s = sMap.get(g.user_id)
    if (!g.events || !s?.reminders || s.default_reminder == null || s.default_reminder < 0) continue
    jobs.push({ user: g.user_id, e: g.events, mins: s.default_reminder })
  }
  const rows = []
  for (const j of jobs) {
    const tz = tzOf.get(j.user) || 'Europe/London'
    // fire between (start - mins) and 15 minutes after that, if the run was late
    const from = new Date(now.getTime() + j.mins * 60000 - 15 * 60000), to = new Date(now.getTime() + j.mins * 60000 + 60000)
    for (const s of nextStarts(j.e, tz, from, to)) {
      if (s <= now && j.mins > 0) continue
      rows.push({
        user_id: j.user, kind: 'reminder', title: j.e.title,
        body: `${before(j.mins)} · ${hhmm(s, tz)}${j.e.location ? ` · ${j.e.location}` : ''}`,
        url: '/', ref: `${j.e.id}:${s.toISOString()}:${j.mins}`, dedupe_key: `rem:${j.user}:${j.e.id}:${s.toISOString()}:${j.mins}`
      })
    }
  }
  if (rows.length) await admin.from('notifications').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
  return rows.length
}

/* ---------- shifts + sleep ---------- */
/** Users who are asleep after a shift right now (for quiet hours that follow sleep). */
async function sleepingNow(users: string[], now: Date, tzOf: Map<string, string>) {
  if (!users.length) return new Set<string>()
  const [{ data: cats }, { data: profs }] = await Promise.all([
    admin.from('categories').select('id, user_id').eq('is_shift', true).in('user_id', users),
    admin.from('profiles').select('id, sleep_hours').in('id', users)
  ])
  const asleep = new Set<string>()
  if (!cats?.length) return asleep
  const sleepH = new Map((profs || []).map(p => [p.id, Number(p.sleep_hours) || 7]))
  const { data: evs } = await admin.from('events').select('id, owner_id, starts_at, ends_at, rrule, exdates').in('category_id', cats.map(c => c.id))
  for (const e of (evs || []) as Ev[]) {
    const tz = tzOf.get(e.owner_id) || 'Europe/London'
    const dur = new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()
    const h = sleepH.get(e.owner_id) || 7
    for (const st of nextStarts(e, tz, new Date(now.getTime() - dur - h * 3600e3 - 864e5), now)) {
      const end = st.getTime() + dur
      if (now.getTime() >= end && now.getTime() < end + h * 3600e3) asleep.add(e.owner_id)
    }
  }
  return asleep
}

/* ---------- morning brief ---------- */
// Uni timetables have long titles like "Lecture, Module name 12384-2610, Lecturer": keep the useful bit
const short = (t: string) => t.replace(/\s+\d{4,}-\d{3,}.*$/, '').split(',').slice(0, 2).join(',').trim().slice(0, 34)
const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
async function makeBriefs(now: Date) {
  const { data: subs } = await admin.from('notify_settings').select('user_id, brief_time').eq('morning_brief', true)
  if (!subs?.length) return 0
  const users = subs.map(s => s.user_id)
  const { data: profs } = await admin.from('profiles').select('id, timezone').in('id', users)
  const tzOf = new Map((profs || []).map(p => [p.id, p.timezone || 'Europe/London']))
  const due = subs.filter(s => {
    const tz = tzOf.get(s.user_id) || 'Europe/London'
    const m = minutesOfDay(now, tz), b = +s.brief_time.slice(0, 2) * 60 + +s.brief_time.slice(3, 5)
    return m >= b && m < b + 10
  })
  let made = 0
  for (const s of due) {
    const uid = s.user_id, tz = tzOf.get(uid) || 'Europe/London'
    const key = dayKey(now, tz)
    const dedupe = `brief:${uid}:${key}`
    const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('dedupe_key', dedupe)
    if (count) continue
    // today's window in the user's time zone
    const startW = fromFloating(new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10))), tz)
    const endW = new Date(startW.getTime() + 864e5)
    const cols = 'id, owner_id, title, location, starts_at, ends_at, rrule, exdates, remind_minutes, all_day'
    const [{ data: mine }, { data: going }, { data: links }] = await Promise.all([
      admin.from('events').select(cols).eq('owner_id', uid).or(`rrule.not.is.null,and(starts_at.lt.${endW.toISOString()},ends_at.gt.${startW.toISOString()})`),
      admin.from('event_invites').select(`events(${cols})`).eq('user_id', uid).eq('status', 'going'),
      admin.from('friendships').select('requester, addressee').eq('status', 'accepted').or(`requester.eq.${uid},addressee.eq.${uid}`)
    ])
    const evs = [...(mine || []), ...((going || []) as unknown as { events: Ev }[]).map(g => g.events).filter(Boolean)] as Ev[]
    const today: { t: Date; title: string; allDay: boolean }[] = []
    for (const e of evs) {
      const dur = new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()
      for (const st of nextStarts(e, tz, new Date(startW.getTime() - (e.all_day ? 0 : dur)), endW)) {
        if (st.getTime() + dur > startW.getTime()) today.push({ t: st, title: e.title, allDay: !!e.all_day })
      }
    }
    today.sort((a, b) => a.t.getTime() - b.t.getTime())
    const friends = (links || []).map(l => (l.requester === uid ? l.addressee : l.requester))
    // birthdays today
    let bdays: string[] = []
    if (friends.length) {
      const { data: b } = await admin.from('birthdays').select('user_id, birthday').in('user_id', friends)
      const md = key.slice(5)
      const ids = (b || []).filter(x => x.birthday.slice(5) === md).map(x => x.user_id)
      if (ids.length) { const { data: ps } = await admin.from('profiles').select('display_name, username').in('id', ids); bdays = (ps || []).map(p => (p.display_name || p.username).split(' ')[0]) }
    }
    // friends free this evening (18:00–23:00, nothing on)
    let free: string[] = []
    if (friends.length) {
      const eveS = new Date(startW.getTime() + 18 * 3600e3), eveE = new Date(startW.getTime() + 23 * 3600e3)
      const { data: fe } = await admin.from('events').select(cols).in('owner_id', friends).eq('all_day', false).or(`rrule.not.is.null,and(starts_at.lt.${eveE.toISOString()},ends_at.gt.${eveS.toISOString()})`)
      const busy = new Set<string>()
      for (const e of (fe || []) as Ev[]) {
        const dur = new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()
        if (nextStarts(e, tz, new Date(eveS.getTime() - dur), eveE).some(st => st.getTime() + dur > eveS.getTime())) busy.add(e.owner_id)
      }
      const freeIds = friends.filter(f => !busy.has(f)).slice(0, 4)
      if (freeIds.length) { const { data: ps } = await admin.from('profiles').select('display_name, username').in('id', freeIds); free = (ps || []).map(p => (p.display_name || p.username).split(' ')[0]) }
    }
    const timed = today.filter(x => !x.allDay)
    const parts = [
      timed.length ? `${timed.length} ${timed.length === 1 ? 'thing' : 'things'} today: ${timed.slice(0, 3).map(x => `${short(x.title)} ${hhmm(x.t, tz)}`).join(', ')}${timed.length > 3 ? '…' : ''}` : 'Nothing booked today',
      ...today.filter(x => x.allDay).slice(0, 2).map(x => short(x.title)),
      ...(bdays.length ? [`🎂 ${bdays.join(', ')}'s birthday`] : []),
      ...(free.length ? [`Free tonight: ${free.join(', ')}`] : [])
    ]
    const { error } = await admin.from('notifications').insert({ user_id: uid, kind: 'brief', title: 'Your day', body: parts.join(' · ').slice(0, 300), url: '/', dedupe_key: dedupe, ref: key })
    if (!error) made++
  }
  return made
}

/* ---------- sending ---------- */
async function sendDue(now: Date, onlyUser?: string) {
  let q = admin.from('notifications').select('id, user_id, kind, title, body, url, created_at').is('sent_at', null).lte('send_after', now.toISOString()).order('id').limit(300)
  if (onlyUser) q = q.eq('user_id', onlyUser)
  const { data: due } = await q
  if (!due?.length) return { sent: 0, quiet: 0, failed: 0 }
  const users = [...new Set(due.map(n => n.user_id))]
  const [{ data: subs }, { data: settings }, { data: profiles }] = await Promise.all([
    admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', users),
    admin.from('notify_settings').select('user_id, quiet_start, quiet_end, quiet_follow_sleep').in('user_id', users),
    admin.from('profiles').select('id, timezone').in('id', users)
  ])
  const sMap = new Map((settings || []).map(s => [s.user_id, s]))
  const tzOf = new Map((profiles || []).map(p => [p.id, p.timezone || 'Europe/London']))
  const asleep = await sleepingNow((settings || []).filter(x => x.quiet_follow_sleep).map(x => x.user_id), now, tzOf)
  let sent = 0, quiet = 0, failed = 0
  const dead = new Set<string>(), okSubs = new Set<string>()
  for (const n of due) {
    const tz = tzOf.get(n.user_id) || 'Europe/London'
    const mine = (subs || []).filter(s => s.user_id === n.user_id)
    const stale = n.kind !== 'reminder' && now.getTime() - new Date(n.created_at).getTime() > 6 * 3600e3
    if (!mine.length || stale || (SOCIAL.has(n.kind) && (inQuiet(sMap.get(n.user_id), tz, now) || asleep.has(n.user_id)))) {
      if (mine.length && !stale) quiet++
      await admin.from('notifications').update({ sent_at: now.toISOString(), pushed: false }).eq('id', n.id)
      continue
    }
    const { count: unread } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', n.user_id).is('read_at', null)
    const payload = JSON.stringify({ title: n.title, body: n.body || '', url: n.url || '/', tag: `${n.kind}-${n.id}`, id: n.id, badge: unread || 0 })
    let any = false
    await Promise.all(mine.map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: n.kind === 'reminder' ? 'high' : 'normal' })
        any = true; okSubs.add(s.id)
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) dead.add(s.id)
        else console.error('push failed', code, String((e as Error).message).slice(0, 200))
      }
    }))
    any ? sent++ : failed++
    await admin.from('notifications').update({ sent_at: now.toISOString(), pushed: any }).eq('id', n.id)
  }
  if (dead.size) await admin.from('push_subscriptions').delete().in('id', [...dead])
  if (okSubs.size) await admin.from('push_subscriptions').update({ last_ok_at: now.toISOString() }).in('id', [...okSubs])
  return { sent, quiet, failed, removed: dead.size }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  const now = new Date()
  const cron = req.headers.get('x-cron-secret')
  if (cron) {
    const { data: ok } = await admin.rpc('check_cron_secret', { s: cron })
    if (!ok) return json({ error: 'Bad secret' }, 401)
    await vapid()
    const reminders = await makeReminders(now)
    const briefs = await makeBriefs(now).catch(e => { console.error('brief', e); return 0 })
    const result = await sendDue(now)
    if (now.getUTCMinutes() === 0) await admin.from('notifications').delete().lt('created_at', new Date(now.getTime() - 30 * 864e5).toISOString())
    return json({ reminders, briefs, ...result })
  }
  // Signed-in user: send yourself a test notification
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user) return json({ error: 'Sign in first.' }, 401)
  await vapid()
  const { count } = await admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  if (!count) return json({ error: "This phone isn't set up for notifications yet. Tap Turn on first." }, 400)
  await admin.from('notifications').insert({ user_id: user.id, kind: 'test', title: 'Klander notifications are on', body: "You'll hear about friends' plans, invites and reminders here.", url: '/' })
  const result = await sendDue(now, user.id)
  return json(result.sent ? { ok: true } : { error: "Couldn't reach this phone. Try turning notifications off and on again." }, result.sent ? 200 : 502)
})
