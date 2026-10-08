// Public, read-only calendar feed so Apple / Google / Outlook can subscribe to your Klander events.
// GET /functions/v1/feed?token=SECRET   (the secret token is the only key, like Google's "secret iCal address")
// Family links show Friends events and Busy-only/Close ones as "Busy"; Private events never appear.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildIcs } from '../_shared/ics.js'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
})

Deno.serve(async req => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Use GET', { status: 405 })
  const url = new URL(req.url)
  const token = (url.searchParams.get('token') || '').replace(/\.ics$/i, '')
  if (!/^[0-9a-f]{36}$/.test(token)) return new Response('Not found', { status: 404 })

  // Your own link, or a family link (Friends + Busy only, never Private)
  let owner: string | null = null, family = false
  const { data: ft } = await admin.from('feed_tokens').select('user_id').eq('token', token).maybeSingle()
  if (ft) owner = ft.user_id
  else {
    const { data: fam } = await admin.from('family_feed_tokens').select('user_id').eq('token', token).eq('active', true).maybeSingle()
    if (fam) { owner = fam.user_id; family = true }
  }
  if (!owner) return new Response('Not found', { status: 404 })

  const cols = 'id, title, location, notes, starts_at, ends_at, all_day, rrule, exdates, updated_at, visibility'
  const q = admin.from('events').select(cols).eq('owner_id', owner).limit(5000)
  const [{ data: prof }, { data: rows }] = await Promise.all([
    admin.from('profiles').select('display_name, username, timezone').eq('id', owner).single(),
    // Your link: only events made in Klander (imported ones already live where they came from).
    // Family link: everything except Private, so family sees the whole week (uni, shifts too).
    family ? q.neq('visibility', 'private') : q.is('source_id', null)
  ])
  const events = family
    ? (rows || []).map(e => (e.visibility === 'friends' ? { ...e, notes: null } : { ...e, title: 'Busy', location: null, notes: null }))
    : rows || []
  const who = prof?.display_name || prof?.username || 'me'
  const name = family ? `${who} (Klander)` : `Klander · ${who}`
  const body = buildIcs(events, { name, tz: prof?.timezone || 'Europe/London' })
  return new Response(req.method === 'HEAD' ? null : body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="klander.ics"',
      'Cache-Control': 'private, max-age=300'
    }
  })
})
