// Syncs calendar links (.ics / webcal://) into Klander.
//  - Signed-in user:  POST { source_id }        -> syncs that one source
//  - Scheduled job:   POST with x-cron-secret   -> syncs every source not synced in the last ~3h
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import ICAL from 'npm:ical.js@2.2.1'
import { parseIcs } from '../_shared/ics.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
})

const MAX_BYTES = 8 * 1024 * 1024

function normaliseUrl(raw: string) {
  const u = new URL(raw.trim().replace(/^webcal:\/\//i, 'https://'))
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) and webcal links work.')
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.internal'))
    throw new Error("That link points somewhere Klander can't reach.")
  return u.toString()
}

async function fetchIcs(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Klander Calendar (+https://klander.vercel.app)', Accept: 'text/calendar, */*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000)
  })
  if (!res.ok) throw new Error(`The calendar link returned an error (${res.status}). Check the link still works.`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len > MAX_BYTES) throw new Error('That calendar is too big to import.')
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new Error('That calendar is too big to import.')
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That link didn't return a calendar. Make sure it's the .ics / iCal / webcal link.")
  return text
}

type Source = { id: string; user_id: string; name: string; url: string; category_id: string | null; visibility: string }

async function syncSource(src: Source) {
  try {
    const { data: prof } = await admin.from('profiles').select('timezone').eq('id', src.user_id).single()
    const text = await fetchIcs(normaliseUrl(src.url))
    const { rows } = parseIcs(ICAL, text, { tz: prof?.timezone || 'Europe/London' })

    const { data: existing, error: exErr } = await admin.from('events').select('id, external_uid').eq('source_id', src.id)
    if (exErr) throw exErr
    const keep = new Set(rows.map((r: { external_uid: string }) => r.external_uid))
    const stale = (existing || []).filter(e => !keep.has(e.external_uid)).map(e => e.id)

    const full = rows.map((r: Record<string, unknown>) => ({
      ...r, owner_id: src.user_id, source_id: src.id, source: 'import',
      category_id: src.category_id, visibility: src.visibility
    }))
    for (let i = 0; i < full.length; i += 500) {
      const { error } = await admin.from('events').upsert(full.slice(i, i + 500), { onConflict: 'source_id,external_uid' })
      if (error) throw error
    }
    for (let i = 0; i < stale.length; i += 200) {
      const { error } = await admin.from('events').delete().in('id', stale.slice(i, i + 200))
      if (error) throw error
    }
    const added = rows.length - ((existing?.length || 0) - stale.length)
    await admin.from('calendar_sources').update({
      last_synced_at: new Date().toISOString(), last_error: null, event_count: rows.length
    }).eq('id', src.id)
    if ((added > 0 || stale.length > 0) && src.visibility !== 'private') {
      await admin.from('activity').insert({ actor: src.user_id, verb: 'synced', title: null })
    }
    return { ok: true, count: rows.length, added: Math.max(0, added), removed: stale.length }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await admin.from('calendar_sources').update({ last_error: message.slice(0, 300), last_synced_at: new Date().toISOString() }).eq('id', src.id)
    return { ok: false, error: message }
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  // Scheduled refresh
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret) {
    const { data: ok } = await admin.rpc('check_cron_secret', { s: cronSecret })
    if (!ok) return json({ error: 'Forbidden' }, 403)
    const cutoff = new Date(Date.now() - 170 * 60 * 1000).toISOString()
    const { data: due } = await admin.from('calendar_sources').select('*')
      .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`).order('last_synced_at', { nullsFirst: true }).limit(40)
    const results = []
    for (const s of due || []) results.push({ id: s.id, ...(await syncSource(s)) })
    return json({ synced: results.length, results })
  }

  // Signed-in user
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user) return json({ error: 'Sign in first.' }, 401)
  let body: { source_id?: string } = {}
  try { body = await req.json() } catch { /* empty */ }
  if (!body.source_id) return json({ error: 'source_id is required' }, 400)
  const { data: src } = await admin.from('calendar_sources').select('*').eq('id', body.source_id).single()
  if (!src || src.user_id !== user.id) return json({ error: 'Calendar not found.' }, 404)
  const result = await syncSource(src)
  return json(result, result.ok ? 200 : 422)
})
