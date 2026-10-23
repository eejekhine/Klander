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
// Photos are harder (tables, small print, handwriting), so they try the strongest model first and think before answering.
const PHOTO_MODELS = (Deno.env.get('GEMINI_PHOTO_MODEL') || 'gemini-3.5-pro,gemini-2.5-pro').split(',').map(s => s.trim()).filter(Boolean).concat(MODELS)

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
          weekday: { type: 'STRING', enum: DAYS, nullable: true, description: 'The weekday of this date as shown or implied in the source (MO..SU)' },
          source: { type: 'STRING', nullable: true, description: 'The exact words from the photo or message this event came from (max 80 characters)' },
          confidence: { type: 'NUMBER', description: '0 to 1: how sure you are about date and time' }
        },
        required: ['title', 'date', 'all_day', 'repeat', 'confidence']
      }
    },
    message: { type: 'STRING', nullable: true, description: 'One short sentence for the user if something was unclear or nothing was found' }
  },
  required: ['events']
}

const HEX = { type: 'STRING', description: 'Hex colour like #1a2b3c' }
const themeSchema = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'A short, fun name for the theme (2-3 words)' },
    bg: HEX, surface: HEX, surface2: HEX, ink: HEX, muted: HEX, line: HEX, accent: HEX, now: HEX,
    font: { type: 'INTEGER', description: '0 modern, 1 handwritten planner, 2 monospace studio, 3 tall sporty, 4 pixel arcade, 5 elegant serif, 6 very readable' },
    style: { type: 'STRING', enum: ['filled', 'outline', 'solid', 'glow'] },
    radius: { type: 'INTEGER', description: 'Corner roundness 0-16' }
  },
  required: ['name', 'bg', 'surface', 'surface2', 'ink', 'muted', 'line', 'accent', 'now', 'font', 'style', 'radius']
}
const THEME_RULES = `You design colour themes for a calendar app called Klander. Turn the user's vibe into a theme.
- bg is the page background, surface is cards, surface2 is subtle panels, line is borders, ink is main text, muted is secondary text, accent is buttons and highlights, now is the current-time line.
- Text must be easy to read: ink on bg needs strong contrast (at least 7:1), muted at least 4.5:1, accent at least 3:1 against bg.
- Keep it tasteful and usable for daily use; avoid pure neon on pure white. Dark vibes (night, rain, space) should use a dark bg.
- Pick the font and event style that best match the vibe. Glow suits neon/night; solid suits bold/sporty; outline suits minimal; filled suits most.`

// "Edit by sentence": pick which of your upcoming events the user means and what to change
const editSchema = {
  type: 'OBJECT',
  properties: {
    changes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          index: { type: 'INTEGER', description: 'Index of the event in the list' },
          delete: { type: 'BOOLEAN', description: 'True only if the user clearly wants it cancelled/removed' },
          title: { type: 'STRING', nullable: true },
          date: { type: 'STRING', nullable: true, description: 'New start date YYYY-MM-DD if it moves day' },
          start_time: { type: 'STRING', nullable: true, description: 'New start 24h HH:MM' },
          end_time: { type: 'STRING', nullable: true, description: 'New end 24h HH:MM' },
          location: { type: 'STRING', nullable: true }
        },
        required: ['index', 'delete']
      }
    },
    message: { type: 'STRING', nullable: true, description: 'One short sentence if it is unclear which event, or nothing matches' }
  },
  required: ['changes']
}
function editInstructions(now: string, tz: string, list: string) {
  return `You change events in a UK user's calendar from a short instruction like "move gym to 7" or "cancel dentist" or "push basketball back an hour".
Right now it is ${now} (time zone ${tz}).
Their upcoming events (index · title · start → end · location):
${list}
Rules:
- Pick the event(s) the user means. Prefer the next upcoming one with a matching title.
- Only fill in fields that change. "move to 7" for an evening event means 19:00. Keep the same length unless they say otherwise (then give the new end_time too).
- "push back an hour" means start and end both one hour later.
- delete only for clear cancel/remove words.
- If you can't tell which event, return no changes and ask in "message".`
}

// Pass 1 for photos: read everything first, so nothing is skipped and nothing is guessed.
const transcriptSchema = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['poster', 'ticket', 'timetable', 'rota', 'chat', 'email', 'handwritten', 'other'] },
    year_shown: { type: 'INTEGER', nullable: true, description: 'A year printed anywhere in the image, if any' },
    people: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Names of people who have their own rows/columns (rotas, timetables), if any' },
    transcript: { type: 'STRING', description: 'Everything readable, faithfully. Tables: one line per row, cells separated by " | ", with the header row first. Mark unreadable bits as [?].' }
  },
  required: ['kind', 'transcript']
}
const TRANSCRIBE = `Transcribe this image exactly so another step can turn it into calendar events.
- Copy every date, weekday, time, name, place, room and title you can see. Do not summarise and do not skip rows, columns or small print.
- Tables (rotas, timetables): write the header row first, then one line per row with cells separated by " | ". Keep empty cells as "-". Keep the column order.
- Chats: one line per message as "Name: text", oldest first, including any time stamps shown.
- Write [?] for anything you can't read rather than guessing.`

function instructions(now: string, tz: string, who = '') {
  return `You turn messages, posters, screenshots, tickets, timetables and rotas into calendar events for a UK user.
Right now it is ${now} (time zone ${tz}). Dates are UK style (day before month).
Rules:
- Resolve relative dates ("thurs", "tomorrow", "next week Friday") to the next matching date on or after today.
- Times: 24-hour HH:MM. "7" or "7pm" for an evening activity is 19:00. If no end time, leave end_time null.
- If there is no time at all, set all_day true and start_time null.
- A timetable or rota: one event per distinct class/shift. If it is a weekly timetable, use repeat "weekly" with repeat_days set, and the date of its next occurrence. Shifts that end after midnight need end_date set to the next day.
- Group chats: only make events for plans that are actually proposed or agreed, not past ones.
- Titles: short and natural, no emoji, no dates in the title.
- Never invent details that are not shown. If nothing looks like an event, return an empty list and explain in "message".
- Go through the source line by line and make an event for EVERY matching item; don't stop after the first few.
- Dates: if the source shows a weekday next to a date (e.g. "Mon 27"), the date you give MUST fall on that weekday. Put that weekday in "weekday". Use the year printed in the source; if none, use the next occurrence on or after today.
- Times: "6-10" for an evening shift is 18:00-22:00; "12pm" is noon; "12am" is midnight; "9-5" is 09:00-17:00. Use AM/PM and context (opening hours, night shifts) to decide.
- Rotas and timetables that list several people: only make events for ${who ? `the user, "${who}" (their row or column may show a first name, surname or initials)` : 'the user'}. If you can't tell which row is theirs, make no events and say in "message" which names you can see so they can tell you.
- Uni timetables: module or class name as the title, room as location, module code and lecturer in notes. Week ranges like "Wks 1-11" mean repeat weekly with repeat_until at the end of that range if you can work out the date.
- Posters and tickets: the event name as the title, the venue as location, door or start time as start_time.
- "source": copy the exact words each event came from, so the user can check it.
- Before answering, check each event against the source once more: right date, right weekday, right times, nothing missing.${who ? `\nThe user is called ${who}.` : ''}`
}

const thinkingFor = (model: string) => /^gemini-2\.5/.test(model) ? { thinkingBudget: -1 } : /^gemini-3/.test(model) ? { thinkingLevel: 'high' } : null

async function askGemini(key: string, parts: unknown[], responseSchema: unknown = schema, opts: { models?: string[]; think?: boolean } = {}) {
  let lastErr = ''
  models: for (const model of opts.models || MODELS) {
    for (const think of opts.think && thinkingFor(model) ? [true, false] : [false]) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: responseSchema === themeSchema ? 0.7 : 0.1, ...(think ? { thinkingConfig: thinkingFor(model) } : {}) }
        }),
        signal: AbortSignal.timeout(90000)
      }).catch(e => new Response(String(e), { status: 503 }))
      if (res.ok) {
        const data = await res.json()
        const text = data?.candidates?.[0]?.content?.parts?.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || '').join('') || ''
        try { return JSON.parse(text) } catch { lastErr = 'The AI sent back something unreadable. Try again.'; continue models }
      }
      const body = await res.text()
      lastErr = `${model}: ${res.status} ${body.slice(0, 200)}`
      if (res.status === 400 && /API key/i.test(body)) throw new Error('The Gemini API key is wrong. Check the GEMINI_API_KEY secret in Supabase.')
      if (res.status === 400 && think) continue // this model doesn't take the thinking setting: same model without it
      if ([400, 403, 404, 429, 500, 503].includes(res.status)) continue models // retired, not on this plan, busy: next model
      break models
    }
  }
  console.error('Gemini failed', lastErr)
  if (/429/.test(lastErr)) throw new Error('The AI is busy (free limit reached). Try again in a minute.')
  throw new Error("The AI couldn't read that right now. Try again.")
}

const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const isTime = (s: unknown) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const dayOf = (d: string) => WD[new Date(`${d}T12:00:00Z`).getUTCDay()]
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/** Fix the two mistakes AI makes most with dates: a date that doesn't match the weekday shown, and last year's date. */
function fixDate(e: Record<string, unknown>, today: string, yearShown: number | null) {
  let date = e.date as string, conf = typeof e.confidence === 'number' ? e.confidence : 0.5, fixed = false
  if (!yearShown && date < shift(today, -45)) {
    const next = `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`
    if (next >= shift(today, -45) && next <= shift(today, 330)) { date = next; fixed = true }
  }
  const wd = e.weekday as string
  if (DAYS.includes(wd) && dayOf(date) !== wd) {
    const near = [-1, 1, -2, 2, -3, 3].map(n => shift(date, n)).find(d => dayOf(d) === wd)
    if (near) { date = near; fixed = true }
  }
  if (fixed) {
    if (isDate(e.end_date)) e.end_date = shift(e.end_date as string, (Date.parse(date) - Date.parse(e.date as string)) / 864e5)
    conf = Math.min(conf, 0.55)
  }
  return { ...e, date, confidence: conf }
}

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
    source: e.source ? String(e.source).trim().slice(0, 120) : null,
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

  let body: { text?: string; image?: string; mime?: string; now?: string; tz?: string; mode?: string; who?: string; today?: string; events?: { i: number; title: string; start: string; end: string; location?: string }[] }
  try { body = await req.json() } catch { return json({ error: 'Bad request' }, 400) }
  const text = (body.text || '').trim().slice(0, 4000)
  const image = body.image || ''
  if (!text && !image && body.mode !== 'theme') return json({ error: 'Type something or add a photo.' }, 400)
  if (body.mode === 'edit' && (!Array.isArray(body.events) || !body.events.length)) return json({ error: "You've got nothing coming up to change." }, 400)
  if (image.length > 7_000_000) return json({ error: 'That image is too big. Try a screenshot or a smaller photo.' }, 413)
  const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(body.mime || '') ? body.mime! : 'image/jpeg'

  const since = new Date(Date.now() - 864e5).toISOString()
  const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since)
  if ((count || 0) >= DAILY_LIMIT) return json({ error: `You've used all ${DAILY_LIMIT} smart adds for today. Try again tomorrow.` }, 429)

  if (body.mode === 'edit') {
    const tz = /^[A-Za-z_]+\/[A-Za-z_]+$/.test(body.tz || '') ? body.tz! : 'Europe/London'
    const now = (body.now || new Date().toISOString()).slice(0, 60)
    const list = body.events!.slice(0, 60).map(e => `${e.i} · ${String(e.title).slice(0, 80)} · ${String(e.start).slice(0, 30)} → ${String(e.end).slice(0, 30)}${e.location ? ` · ${String(e.location).slice(0, 60)}` : ''}`).join('\n')
    try {
      const out = await askGemini(key, [{ text: editInstructions(now, tz, list) }, { text: `Instruction: ${text}` }], editSchema)
      await admin.from('ai_usage').insert({ user_id: user.id, kind: 'text', ok: true })
      const changes = (Array.isArray(out?.changes) ? out.changes : []).filter((c: { index: number }) => Number.isInteger(c.index) && body.events!.some(e => e.i === c.index)).slice(0, 5)
        .map((c: Record<string, unknown>) => ({
          index: c.index, delete: !!c.delete,
          title: c.title ? String(c.title).slice(0, 120) : null,
          date: isDate(c.date) ? c.date : null,
          start_time: isTime(c.start_time) ? c.start_time : null,
          end_time: isTime(c.end_time) ? c.end_time : null,
          location: c.location ? String(c.location).slice(0, 200) : null
        }))
      return json({ changes, message: out?.message || (changes.length ? null : "I couldn't tell which event you meant."), remaining: Math.max(0, DAILY_LIMIT - (count || 0) - 1) })
    } catch (e) {
      await admin.from('ai_usage').insert({ user_id: user.id, kind: 'text', ok: false })
      return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 502)
    }
  }

  if (body.mode === 'theme') {
    const vibe = (body.text || '').trim().slice(0, 200)
    if (!vibe) return json({ error: 'Describe a vibe first.' }, 400)
    try {
      const t = await askGemini(key, [{ text: THEME_RULES }, { text: `Vibe: ${vibe}` }], themeSchema)
      await admin.from('ai_usage').insert({ user_id: user.id, kind: 'theme', ok: true })
      return json({ theme: t, remaining: Math.max(0, DAILY_LIMIT - (count || 0) - 1) })
    } catch (e) {
      await admin.from('ai_usage').insert({ user_id: user.id, kind: 'theme', ok: false })
      return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 502)
    }
  }

  const tz = /^[A-Za-z_]+\/[A-Za-z_]+$/.test(body.tz || '') ? body.tz! : 'Europe/London'
  const now = (body.now || new Date().toISOString()).slice(0, 60)
  const today = isDate(body.today) ? body.today! : new Date().toISOString().slice(0, 10)
  const who = (body.who || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 60)
  const kind = image ? 'photo' : 'text'
  try {
    const parts: unknown[] = [{ text: instructions(now, tz, who) }]
    let yearShown: number | null = null
    if (image) {
      // Pass 1: read the whole image faithfully. Pass 2: turn that reading (and the image) into events.
      const pic = { inline_data: { mime_type: mime, data: image } }
      const read = await askGemini(key, [{ text: TRANSCRIBE }, pic], transcriptSchema, { models: PHOTO_MODELS, think: true })
      yearShown = Number.isInteger(read?.year_shown) ? read.year_shown : null
      parts.push(pic)
      parts.push({ text: `What the image says (read carefully in an earlier step, use it with the image):\nType: ${read?.kind || 'other'}${read?.people?.length ? `\nPeople listed: ${read.people.join(', ')}` : ''}\n---\n${String(read?.transcript || '').slice(0, 12000)}\n---` })
    }
    parts.push({ text: text ? `User's message:\n${text}` : 'Make the events this image describes.' })
    const out = await askGemini(key, parts, schema, image ? { models: PHOTO_MODELS, think: true } : { think: true })
    const events = (Array.isArray(out?.events) ? out.events : []).filter((e: Record<string, unknown>) => isDate(e?.date)).map((e: Record<string, unknown>) => fixDate(e, today, yearShown)).map(clean).filter(Boolean).slice(0, 60)
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
