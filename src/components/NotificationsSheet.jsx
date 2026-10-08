import { useEffect, useState } from 'react'
import Sheet from './Sheet'
import { Avatar } from './FriendsSheet'
import { ago } from '../lib/sync'
import { REMINDERS, pushSupport } from '../lib/notify'

const KINDS = [
  ['friend_events', 'Friends add or change events', 'Grouped, so a busy friend sends one alert, not ten'],
  ['plans', 'Invites and answers', 'Someone invites you, or says Going to your plan'],
  ['broadcasts', 'Up for something', 'A friend is free and looking for plans'],
  ['chat', 'Messages', 'New chat messages (mute a single chat from inside it)'],
  ['requests', 'Friend requests', ''],
  ['reminders', 'Reminders for your events', '']
]
const first = p => (p?.display_name || p?.username || '').split(/\s+/)[0]

export default function NotificationsSheet({ n, people, friends, onClose, onOpen }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const support = pushSupport()
  const s = n.settings

  // Opening the inbox marks everything as read
  useEffect(() => { const t = setTimeout(() => n.markAllRead(), 1200); return () => clearTimeout(t) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key, fn, done) => {
    setBusy(key); setMsg(''); setError('')
    try { await fn(); if (done) setMsg(done) } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const save = patch => run('save', () => n.saveSettings(patch))

  return (
    <Sheet title="Notifications" onClose={onClose}>
      <div className="group">
        {n.subscribed ? (
          <>
            <div className="toggle-row"><span><b>On for this device</b><br /><small className="muted">You'll get alerts even when Klander is closed.</small></span><span className="rsvp going">On</span></div>
            <div className="row">
              <button className="btn grow" disabled={!!busy} onClick={() => run('test', n.sendTest, 'Test sent. It should pop up in a few seconds.')}>{busy === 'test' ? 'Sending…' : 'Send a test'}</button>
              <button className="btn ghost grow" disabled={!!busy} onClick={() => run('off', n.disable, 'Turned off on this device.')}>Turn off here</button>
            </div>
          </>
        ) : support === 'ios-browser' ? (
          <>
            <b>Get notifications on your iPhone</b>
            <ol className="steps">
              <li>Tap the <b>Share</b> button in Safari.</li>
              <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
              <li>Open Klander from your Home Screen and come back here.</li>
            </ol>
            <p className="small muted" style={{ margin: 0 }}>Apple only allows notifications for web apps that are on your Home Screen.</p>
          </>
        ) : support === 'unsupported' ? (
          <p className="small muted" style={{ margin: 0 }}>This browser can't show notifications. Try Klander on your phone from the Home Screen.</p>
        ) : (
          <>
            <b>Turn on notifications</b>
            <p className="small muted" style={{ margin: 0 }}>Hear about invites, friends' plans and your reminders, even when Klander is closed.</p>
            <button className="btn primary block" disabled={!!busy} onClick={() => run('on', n.enable, "You're all set. Try sending a test.")}>{busy === 'on' ? 'Turning on…' : 'Turn on notifications'}</button>
          </>
        )}
        {msg && <p className="small" style={{ color: 'var(--good)', margin: 0 }}>{msg}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="group">
        <h3>Recent</h3>
        {n.items.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing yet. Invites, friends' plans and reminders will show up here.</p>}
        {n.items.slice(0, 30).map(i => {
          const p = people[i.actor]
          return (
            <button key={i.id} className={`note-row${i.read_at ? '' : ' unread'}`} onClick={() => onOpen(i.url)}>
              {p ? <Avatar person={p} size={32} /> : <span className="note-icon" aria-hidden="true">{i.kind === 'reminder' ? <ClockIcon /> : <BellIcon />}</span>}
              <span><b>{i.title}</b>{i.body && <small>{i.body}</small>}</span>
              <small className="muted">{ago(i.created_at)}</small>
            </button>
          )
        })}
      </div>

      {s && (
        <>
          <div className="group">
            <h3>Tell me when</h3>
            {KINDS.map(([k, l, d]) => (
              <div key={k} className="toggle-row">
                <span>{l}{d && <><br /><small className="muted">{d}</small></>}</span>
                <label className="switch"><input type="checkbox" checked={!!s[k]} onChange={e => save({ [k]: e.target.checked })} aria-label={l} /><span /></label>
              </div>
            ))}
            <label className="field"><span>Default reminder for your events</span>
              <select className="input" value={s.default_reminder ?? ''} onChange={e => save({ default_reminder: e.target.value === '' ? null : +e.target.value })}>
                {REMINDERS.map(([v, l]) => <option key={l} value={v ?? ''}>{l}</option>)}
              </select>
            </label>
            <p className="small muted" style={{ margin: 0 }}>Change it for one event in that event's settings. Plans you're going to use this too.</p>
          </div>

          <div className="group">
            <h3>Morning brief</h3>
            <div className="toggle-row"><span>A summary of your day<br /><small className="muted">What's on, birthdays and who's free tonight</small></span>
              <label className="switch"><input type="checkbox" checked={!!s.morning_brief} onChange={e => save({ morning_brief: e.target.checked })} aria-label="Morning brief" /><span /></label>
            </div>
            {s.morning_brief && (
              <label className="field"><span>Send it at</span>
                <input className="input" type="time" value={(s.brief_time || '08:00').slice(0, 5)} onChange={e => e.target.value && save({ brief_time: e.target.value })} />
              </label>
            )}
            {s.morning_brief && <p className="small muted" style={{ margin: 0 }}>Work nights? Set it for when you wake up, like 16:00.</p>}
          </div>

          <div className="group">
            <h3>Quiet hours</h3>
            <div className="toggle-row"><span>Hold friend alerts while you sleep<br /><small className="muted">They wait in Recent. Your own reminders still come through.</small></span>
              <label className="switch"><input type="checkbox" checked={!!s.quiet_start} onChange={e => save(e.target.checked ? { quiet_start: '23:00', quiet_end: '08:00' } : { quiet_start: null, quiet_end: null })} aria-label="Quiet hours" /><span /></label>
            </div>
            {s.quiet_start && (
              <div className="two">
                <label className="field"><span>From</span><input className="input" type="time" value={s.quiet_start.slice(0, 5)} onChange={e => e.target.value && save({ quiet_start: e.target.value })} /></label>
                <label className="field"><span>Until</span><input className="input" type="time" value={(s.quiet_end || '08:00').slice(0, 5)} onChange={e => e.target.value && save({ quiet_end: e.target.value })} /></label>
              </div>
            )}
            {s.quiet_start && <p className="small muted" style={{ margin: 0 }}>Work nights? Set it to when you sleep, like 09:00 to 16:00.</p>}
            <div className="toggle-row"><span>Also be quiet while I sleep after a shift<br /><small className="muted">Uses your shift categories and sleep length from Settings</small></span>
              <label className="switch"><input type="checkbox" checked={!!s.quiet_follow_sleep} onChange={e => save({ quiet_follow_sleep: e.target.checked })} aria-label="Quiet after shifts" /><span /></label>
            </div>
          </div>

          {friends.length > 0 && (
            <div className="group">
              <h3>Mute a friend</h3>
              <p className="small muted" style={{ margin: 0 }}>You'll still see their week, just no alerts from them.</p>
              <div className="pick-row">
                {friends.map(f => {
                  const muted = s.muted.includes(f.id)
                  return (
                    <button key={f.id} className="pchip" aria-pressed={!muted} onClick={() => save({ muted: muted ? s.muted.filter(x => x !== f.id) : [...s.muted, f.id] })}>
                      <Avatar person={f} size={22} />{first(f)}{muted ? ' · muted' : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}

export const BellIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-1.7 1.7A1 1 0 0 0 4 19.4h16a1 1 0 0 0 .7-1.7z"/></svg>
)
const ClockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.3 2-1 1.7L11 13V6h2z"/></svg>
)
