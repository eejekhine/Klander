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
const SOCIAL = new Set(['friend_event', 'invite', 'rsvp', 'broadcast', 'broadcast_reply', 'request', 'accepted', 'poll', 'poll_vote', 'message'])

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
type Ev = { id: string; owner_id: string; title: string; location: string | null; starts_at: string; ends_at: string; rrule: string | null; exdates: string[] | null; remind_minutes: number | null }
function nextStarts(e: Ev, tz: string, from: Date, to: Date): Date[] {
  const start = new Date(e.starts_at)
  if (!e.rrule) return start >= from && start < to ? [start] : []
  try {
    const rule = new RRule({ ...RRule.parseString(e.rrule), dtstart: floating(start, tz) })
    const ex = new Set((e.exdates || []).map(x => new Date(x).getTime()))
    return rule.between(floating(from, tz), floating(to, tz), true).map(f => fromFloating(f, tz)).filter(s => !ex.has(s.getTime()) && s >= from && s < to)
  } catch { return [] }
}

async function makeReminders(now: Date) {
  const { data: settings } = await admin.from('notify_settings').select('user_id, reminders, default_reminder')
  const sMap = new Map((settings || []).map(s => [s.user_id, s]))
  const { data: profiles } = await admin.from('profiles').select('id, timezone')
  const tzOf = new Map((profiles || []).map(p => [p.id, p.timezone || 'Europe/London']))
  const soon = new Date(now.getTime() + 8 * 864e5).toISOString()
  const cols = 'id, owner_id, title, location, starts_at, ends_at, rrule, exdates, remind_minutes'
  const { data: own } = await admin.from('events').select(cols).eq('all_day', false).is('source_id', null)
    .or(`rrule.not.is.null,and(starts_at.gt.${now.toISOString()},starts_at.lt.${soon})`)
  const { data: going } = await admin.from('event_invites').select(`user_id, events(${cols})`).eq('status', 'going')
  const jobs: { user: string; e: Ev; mins: number }[] = []
  for (const e of (own || []) as Ev[]) {
    const s = sMap.get(e.owner_id)
    if (s && !s.reminders) continue
    const mins = e.remind_minutes ?? s?.default_reminder ?? null
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
        url: '/', ref: `${j.e.id}:${s.toISOString()}:${j.mins}`
      })
    }
  }
  if (rows.length) await admin.from('notifications').upsert(rows, { onConflict: 'user_id,ref', ignoreDuplicates: true })
  return rows.length
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
    admin.from('notify_settings').select('user_id, quiet_start, quiet_end').in('user_id', users),
    admin.from('profiles').select('id, timezone').in('id', users)
  ])
  const sMap = new Map((settings || []).map(s => [s.user_id, s]))
  const tzOf = new Map((profiles || []).map(p => [p.id, p.timezone || 'Europe/London']))
  let sent = 0, quiet = 0, failed = 0
  const dead = new Set<string>(), okSubs = new Set<string>()
  for (const n of due) {
    const tz = tzOf.get(n.user_id) || 'Europe/London'
    const mine = (subs || []).filter(s => s.user_id === n.user_id)
    const stale = n.kind !== 'reminder' && now.getTime() - new Date(n.created_at).getTime() > 6 * 3600e3
    if (!mine.length || stale || (SOCIAL.has(n.kind) && inQuiet(sMap.get(n.user_id), tz, now))) {
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
    const result = await sendDue(now)
    if (now.getUTCMinutes() === 0) await admin.from('notifications').delete().lt('created_at', new Date(now.getTime() - 30 * 864e5).toISOString())
    return json({ reminders, ...result })
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
