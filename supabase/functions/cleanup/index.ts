// Daily tidy-up so Klander stays inside the free storage allowance.
// Deletes chat photos from deleted messages, photos older than 6 months, and uploads that never got sent.
// Called once a day by pg_cron with x-cron-secret.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  const { data: ok } = await admin.rpc('check_cron_secret', { s: req.headers.get('x-cron-secret') || '' })
  if (!ok) return json({ error: 'Bad secret' }, 401)

  let removed = 0, rounds = 0
  while (rounds++ < 10) {
    const { data: rows, error } = await admin.rpc('chat_photos_to_remove', { lim: 500 })
    if (error) return json({ error: error.message }, 500)
    if (!rows?.length) break
    const paths = [...new Set(rows.map((r: { path: string }) => r.path))]
    for (let i = 0; i < paths.length; i += 100) {
      const { error: rmErr } = await admin.storage.from('chat').remove(paths.slice(i, i + 100))
      if (rmErr) return json({ error: rmErr.message, removed }, 500)
    }
    const ids = rows.map((r: { message_id: number | null }) => r.message_id).filter(Boolean)
    if (ids.length) await admin.rpc('mark_photos_removed', { ids })
    removed += paths.length
    if (rows.length < 500) break
  }
  return json({ removed })
})
