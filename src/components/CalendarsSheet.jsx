import { useEffect, useState } from 'react'
import Sheet from './Sheet'
import { ago, familyLinkOn, getFamilyLink, getFeedLinks, stopFamilyLink } from '../lib/sync'

const VIS = [['friends', 'Friends'], ['busy', 'Busy only'], ['private', 'Private']]

const HELP = [
  ['Uni timetable', 'On your timetable page look for "Subscribe", "iCal", "Export" or "Add to calendar", and copy the link (it often starts webcal:// or ends .ics).'],
  ['Google Calendar', 'calendar.google.com → Settings → click the calendar on the left → "Secret address in iCal format" → copy.'],
  ['Outlook', 'outlook.com → Settings → Calendar → Shared calendars → Publish a calendar → choose "Can view all details" → copy the ICS link.'],
  ['Apple / iCloud', 'Calendar app → tap (i) next to a calendar → turn on Public Calendar → Share Link → copy.']
]

export default function CalendarsSheet({ data, cal, onClose }) {
  const [adding, setAdding] = useState(cal.sources.length === 0)
  const [form, setForm] = useState({ name: '', url: '', category_id: '', visibility: 'busy' })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [links, setLinks] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [showHelp, setShowHelp] = useState(false)

  const run = async (key, fn) => {
    setBusy(key); setError(''); setMsg('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const add = e => {
    e.preventDefault()
    run('add', async () => {
      const r = await cal.add(form)
      setMsg(r?.ok === false ? '' : `Added ${r?.count ?? 0} events.`)
      setForm({ name: '', url: '', category_id: '', visibility: 'busy' }); setAdding(false)
    })
  }

  const copy = async text => {
    try { await navigator.clipboard.writeText(text); setMsg('Link copied.') } catch { setMsg('Press and hold the link to copy it.') }
  }

  return (
    <Sheet title="Calendars" onClose={onClose}>
      <div className="group">
        <h3>Linked calendars</h3>
        <p className="small muted">Paste a calendar link and Klander keeps it up to date every few hours. Imported events can't be edited here. Change them where they came from.</p>
        {cal.sources.map(s => (
          <div key={s.id} className="source">
            <div className="source-top">
              <div style={{ minWidth: 0 }}>
                <b>{s.name}</b>
                <div className="small muted">
                  {s.last_error ? <span style={{ color: 'var(--danger)' }}>{s.last_error}</span> : `${s.event_count} events · updated ${ago(s.last_synced_at)}`}
                </div>
              </div>
              <button className="btn" style={{ padding: '6px 10px' }} disabled={!!busy} onClick={() => run(s.id, async () => {
                const r = await cal.sync(s.id); setMsg(`${s.name}: ${r.count} events (${r.added} new, ${r.removed} removed).`)
              })}>{busy === s.id ? 'Syncing…' : 'Sync now'}</button>
            </div>
            <div className="two">
              <label className="field"><span>Category</span>
                <select className="input" value={s.category_id || ''} onChange={e => run('u' + s.id, () => cal.update(s.id, { category_id: e.target.value || null }))}>
                  <option value="">None</option>
                  {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Friends see</span>
                <select className="input" value={s.visibility} onChange={e => run('u' + s.id, () => cal.update(s.id, { visibility: e.target.value }))}>
                  {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            {confirm === s.id
              ? <div className="row"><button className="btn danger" onClick={() => run('d', async () => { await cal.remove(s.id); setConfirm(null) })}>Remove and delete its events</button><button className="btn ghost" onClick={() => setConfirm(null)}>Keep</button></div>
              : <button className="linklike small" style={{ color: 'var(--danger)', justifySelf: 'start' }} onClick={() => setConfirm(s.id)}>Remove this calendar</button>}
          </div>
        ))}

        {adding ? (
          <form className="group" style={{ background: 'var(--bg)' }} onSubmit={add}>
            <label className="field"><span>Calendar link</span>
              <input id="src-url" className="input" required value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="webcal://… or https://….ics" autoCapitalize="none" autoCorrect="off" inputMode="url" />
            </label>
            <label className="field"><span>Name</span>
              <input id="src-name" className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Uni timetable" maxLength={60} />
            </label>
            <div className="two">
              <label className="field"><span>Category</span>
                <select id="src-cat" className="input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">None</option>
                  {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Friends see</span>
                <select id="src-vis" className="input" value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })}>
                  {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <button className="btn primary" disabled={busy === 'add'}>{busy === 'add' ? 'Importing…' : 'Add calendar'}</button>
              {cal.sources.length > 0 && <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>}
            </div>
            <button type="button" className="linklike small" style={{ justifySelf: 'start' }} onClick={() => setShowHelp(h => !h)}>{showHelp ? 'Hide' : 'Where do I find the link?'}</button>
            {showHelp && <div className="help">{HELP.map(([t, d]) => <p key={t} className="small"><b>{t}:</b> {d}</p>)}</div>}
          </form>
        ) : <button className="btn block" onClick={() => setAdding(true)}>+ Add a calendar link</button>}
        {msg && <p className="small" style={{ color: 'var(--good)' }}>{msg}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="group">
        <h3>See Klander in other apps</h3>
        <p className="small muted">Subscribe to your Klander events from Apple Calendar, Google Calendar or Outlook. It's read-only there, and only includes events you made in Klander. Anyone with this link can see those events, so keep it to yourself.</p>
        {!links
          ? <button className="btn block" disabled={busy === 'feed'} onClick={() => run('feed', async () => setLinks(await getFeedLinks()))}>Get my calendar link</button>
          : <>
              <a className="btn block" href={links.webcal}>Add to Apple Calendar</a>
              <a className="btn block" href={links.google} target="_blank" rel="noreferrer">Add to Google Calendar</a>
              <a className="btn block" href={links.outlook} target="_blank" rel="noreferrer">Add to Outlook</a>
              <div className="row">
                <input id="feed-link" className="input small grow" readOnly value={links.https} onFocus={e => e.target.select()} />
                <button className="btn" onClick={() => copy(links.https)}>Copy</button>
              </div>
              <p className="small muted">Google can take up to a day to show changes. Apple is usually within the hour.</p>
              <button className="linklike small" style={{ justifySelf: 'start' }} onClick={() => run('feed', async () => { setLinks(await getFeedLinks(true)); setMsg('New link made. The old one no longer works.') })}>Make a new link (stops the old one working)</button>
            </>}
      </div>

      <FamilyLink copy={copy} />
    </Sheet>
  )
}

/** A separate link for family (e.g. a parent on Apple Calendar): your week, without the private stuff. */
function FamilyLink({ copy }) {
  const [on, setOn] = useState(null)
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { familyLinkOn().then(setOn).catch(() => setOn(false)) }, [])
  const run = async fn => { setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'My calendar', text: 'Tap to add my calendar to yours (it updates by itself):', url: link.webcal }); return } catch { return } }
    copy(link.webcal)
  }
  return (
    <div className="group">
      <h3>Family link</h3>
      <p className="small muted" style={{ margin: 0 }}>Let family follow your week in their own calendar app (great for Apple Calendar). They see your normal events, "Busy" for busy-only and close-friends events, and never anything Private. They can't see your friends or chats.</p>
      {on === null ? null : !link
        ? <button className="btn block" disabled={busy} onClick={() => run(async () => { setLink(await getFamilyLink()); setOn(true) })}>{on ? 'Show my family link' : 'Make a family link'}</button>
        : <>
            <button className="btn primary block" onClick={share}>Send it to family</button>
            <div className="row">
              <input className="input small grow" readOnly value={link.webcal} onFocus={e => e.target.select()} />
              <button className="btn" onClick={() => copy(link.webcal)}>Copy</button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>On their iPhone: open the link and tap Subscribe. Or in Apple Calendar: File → New Calendar Subscription and paste it.</p>
            <button className="linklike small danger-text" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => run(async () => { await stopFamilyLink(); setLink(null); setOn(false) })}>Stop sharing (the link stops working)</button>
          </>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
