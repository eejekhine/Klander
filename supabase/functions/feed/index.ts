// Public, read-only calendar feed so Apple / Google / Outlook can subscribe to your Klander events.
// GET /functions/v1/feed?token=SECRET   (the secret token is the only key, like Google's "secret iCal address")
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

  const { data: ft } = await admin.from('feed_tokens').select('user_id').eq('token', token).maybeSingle()
  if (!ft) return new Response('Not found', { status: 404 })

  const [{ data: prof }, { data: events }] = await Promise.all([
    admin.from('profiles').select('display_name, username, timezone').eq('id', ft.user_id).single(),
    // Only events made in Klander: imported ones already live in the calendar they came from
    admin.from('events').select('id, title, location, notes, starts_at, ends_at, all_day, rrule, exdates, updated_at')
      .eq('owner_id', ft.user_id).is('source_id', null).limit(5000)
  ])
  const name = `Klander · ${prof?.display_name || prof?.username || 'me'}`
  const body = buildIcs(events || [], { name, tz: prof?.timezone || 'Europe/London' })
  return new Response(req.method === 'HEAD' ? null : body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="klander.ics"',
      'Cache-Control': 'private, max-age=300'
    }
  })
})
