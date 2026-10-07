// Smart add: turns a sentence, a photo or a screenshot into draft events using Gemini.
// POST { text?: string, image?: base64 jpeg/png, mime?: string, now: string (local ISO), tz: string }
// -> { events: Draft[], message: string | null, remaining: number }
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const DAILY_LIMIT = Number(Deno.env.get('SMART_ADD_DAILY_LIMIT') || 30)
// First model that answers wins; later ones are fallbacks if a model is retired or rate-limited.
const MODELS = (Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash').split(',').map(s => s.trim()).filter(Boolean)

const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'fortnightly', 'monthly', 'yearly']
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

const schema = {
  type: 'OBJECT',
  properties: {
    events: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Short, clear title, e.g. "Basketball" or "Data Science lecture"' },
          date: { type: 'STRING', description: 'Start date YYYY-MM-DD' },
          start_time: { type: 'STRING', nullable: true, description: '24h HH:MM, null if all-day' },
          end_time: { type: 'STRING', nullable: true, description: '24h HH:MM' },
          end_date: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD if it ends on a different day' },
          all_day: { type: 'BOOLEAN' },
          location: { type: 'STRING', nullable: true },
          notes: { type: 'STRING', nullable: true, description: 'Useful extra detail only (ticket ref, who with). Keep short.' },
          repeat: { type: 'STRING', enum: REPEATS },
          repeat_days: { type: 'ARRAY', items: { type: 'STRING', enum: DAYS }, description: 'Weekdays for weekly repeats' },
          repeat_until: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD last date, if known' },
          confidence: { type: 'NUMBER', description: '0 to 1: how sure you are about date and time' }
        },
        required: ['title', 'date', 'all_day', 'repeat', 'confidence']
      }
    },
    message: { type: 'STRING', nullable: true, description: 'One short sentence for the user if something was unclear or nothing was found' }
  },
  required: ['events']
}

function instructions(now: string, tz: string) {
  return `You turn messages, posters, screenshots, tickets, timetables and rotas into calendar events for a UK user.
Right now it is ${now} (time zone ${tz}). Dates are UK style (day before month).
Rules:
- Resolve relative dates ("thurs", "tomorrow", "next week Friday") to the next matching date on or after today.
- Times: 24-hour HH:MM. "7" or "7pm" for an evening activity is 19:00. If no end time, leave end_time null.
- If there is no time at all, set all_day true and start_time null.
- A timetable or rota: one event per distinct class/shift. If it is a weekly timetable, use repeat "weekly" with repeat_days set, and the date of its next occurrence. Shifts that end after midnight need end_date set to the next day.
- Group chats: only make events for plans that are actually proposed or agreed, not past ones.
- Titles: short and natural, no emoji, no dates in the title.
- Never invent details that are not shown. If nothing looks like an event, return an empty list and explain in "message".`
}

async function askGemini(key: string, parts: unknown[]) {
  let lastErr = ''
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 }
      }),
      signal: AbortSignal.timeout(45000)
    })
    if (res.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || ''
      try { return JSON.parse(text) } catch { lastErr = 'The AI sent back something unreadable. Try again.'; continue }
    }
    const body = await res.text()
    lastErr = `${model}: ${res.status} ${body.slice(0, 200)}`
    if (res.status === 400 && /API key/i.test(body)) throw new Error('The Gemini API key is wrong. Check the GEMINI_API_KEY secret in Supabase.')
    if (![404, 429, 500, 503].includes(res.status)) break
  }
  console.error('Gemini failed', lastErr)
  if (/429/.test(lastErr)) throw new Error('The AI is busy (free limit reached). Try again in a minute.')
  throw new Error("The AI couldn't read that right now. Try again.")
}

const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const isTime = (s: unknown) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

function clean(e: Record<string, unknown>) {
  if (!isDate(e.date) || !e.title) return null
  const allDay = !!e.all_day || !isTime(e.start_time)
  return {
    title: String(e.title).trim().slice(0, 120),
    date: e.date as string,
    start_time: allDay ? null : e.start_time as string,
    end_time: allDay ? null : (isTime(e.end_time) ? e.end_time as string : null),
    end_date: isDate(e.end_date) ? e.end_date as string : null,
    all_day: allDay,
    location: e.location ? String(e.location).trim().slice(0, 200) : null,
    notes: e.notes ? String(e.notes).trim().slice(0, 500) : null,
    repeat: REPEATS.includes(e.repeat as string) ? e.repeat as string : 'none',
    repeat_days: Array.isArray(e.repeat_days) ? (e.repeat_days as string[]).filter(d => DAYS.includes(d)) : [],
    repeat_until: isDate(e.repeat_until) ? e.repeat_until as string : null,
    confidence: typeof e.confidence === 'number' ? Math.max(0, Math.min(1, e.confidence)) : 0.5
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user) return json({ error: 'Sign in first.' }, 401)

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return json({ error: "Smart add isn't switched on yet (no Gemini API key set in Supabase)." }, 503)

  let body: { text?: string; image?: string; mime?: string; now?: string; tz?: string }
  try { body = await req.json() } catch { return json({ error: 'Bad request' }, 400) }
  const text = (body.text || '').trim().slice(0, 4000)
  const image = body.image || ''
  if (!text && !image) return json({ error: 'Type something or add a photo.' }, 400)
  if (image.length > 7_000_000) return json({ error: 'That image is too big. Try a screenshot or a smaller photo.' }, 413)
  const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(body.mime || '') ? body.mime! : 'image/jpeg'

  const since = new Date(Date.now() - 864e5).toISOString()
  const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since)
  if ((count || 0) >= DAILY_LIMIT) return json({ error: `You've used all ${DAILY_LIMIT} smart adds for today. Try again tomorrow.` }, 429)

  const tz = /^[A-Za-z_]+\/[A-Za-z_]+$/.test(body.tz || '') ? body.tz! : 'Europe/London'
  const now = (body.now || new Date().toISOString()).slice(0, 60)
  const parts: unknown[] = [{ text: instructions(now, tz) }]
  if (image) parts.push({ inline_data: { mime_type: mime, data: image } })
  parts.push({ text: text ? `User's message:\n${text}` : 'Read the image and make the events it describes.' })

  const kind = image ? 'photo' : 'text'
  try {
    const out = await askGemini(key, parts)
    const events = (Array.isArray(out?.events) ? out.events : []).map(clean).filter(Boolean).slice(0, 60)
    await admin.from('ai_usage').insert({ user_id: user.id, kind, ok: true })
    return json({
      events,
      message: out?.message || (events.length ? null : "I couldn't find an event in that."),
      remaining: Math.max(0, DAILY_LIMIT - (count || 0) - 1)
    })
  } catch (e) {
    await admin.from('ai_usage').insert({ user_id: user.id, kind, ok: false })
    return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 502)
  }
})
