import { useState } from 'react'
import Sheet from './Sheet'
import { Avatar } from './FriendsSheet'
import { fmt } from '../lib/dates'
import { tally } from '../lib/social'

const VOTES = [['yes', 'Works'], ['maybe', 'Maybe'], ['no', "Can't"]]
const first = p => (p?.display_name || p?.username || '').split(/\s+/)[0]

/** A time poll: friends vote on options, the host picks one and it becomes a plan. */
export default function PollSheet({ poll: p0, social, uid, me, people, onDecide, onClose }) {
  const poll = social.polls.find(p => p.id === p0.id) || p0
  const mine = poll.owner_id === uid
  const host = mine ? me : people[poll.owner_id]
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const decided = poll.decided_option
  const best = Math.max(0, ...poll.options.map(o => tally(o).score))
  const voters = new Set(poll.options.flatMap(o => o.votes.map(v => v.user_id)))
  const waiting = poll.invitees.filter(id => !voters.has(id))
  const who = id => (id === uid ? me : people[id])

  const act = async (key, fn) => { setBusy(key); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }

  return (
    <Sheet title="Find a time" onClose={onClose}>
      <div className="group">
        <div className="person-row">
          <Avatar person={host} size={42} />
          <div className="who"><b style={{ fontSize: 18 }}>{poll.title}</b><small>{mine ? 'Your poll' : `${first(host)} is asking`}{poll.location ? ` · ${poll.location}` : ''}</small></div>
        </div>
        {poll.note && <p className="small" style={{ margin: 0 }}>{poll.note}</p>}
        {decided
          ? <p className="banner" style={{ margin: 0 }}>Decided: {fmt(new Date(poll.options.find(o => o.id === decided)?.starts_at || Date.now()), 'EEE d MMM, HH:mm')}. It's in the plans.</p>
          : <p className="small muted" style={{ margin: 0 }}>{mine ? 'Pick a time once people have voted.' : 'Tap what works for you. You can change your answer.'}</p>}
      </div>

      <div className="group">
        <h3>Times</h3>
        {poll.options.map(o => {
          const t = tally(o)
          const myVote = o.votes.find(v => v.user_id === uid)?.vote
          const s = new Date(o.starts_at), e = new Date(o.ends_at)
          return (
            <div key={o.id} className={`poll-opt${decided === o.id ? ' won' : ''}${!decided && t.score === best && best > 0 ? ' best' : ''}`}>
              <div className="poll-opt-head">
                <span><b>{fmt(s, 'EEE d MMM')}</b> <span className="muted">{fmt(s, 'HH:mm')}–{fmt(e, 'HH:mm')}</span></span>
                <small>{t.yes} yes{t.maybe ? ` · ${t.maybe} maybe` : ''}{t.no ? ` · ${t.no} can't` : ''}</small>
              </div>
              <div className="poll-voters">
                {o.votes.filter(v => v.vote !== 'no').map(v => who(v.user_id) && (
                  <span key={v.user_id} className={`voter ${v.vote}`} title={`${first(who(v.user_id))}: ${v.vote}`}><Avatar person={who(v.user_id)} size={22} /></span>
                ))}
              </div>
              {!decided && !mine && (
                <div className="seg" role="group" style={{ width: '100%' }}>
                  {VOTES.map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={myVote === v} onClick={() => act('v', () => social.vote(o.id, myVote === v ? null : v))}>{l}</button>)}
                </div>
              )}
              {!decided && mine && (
                <button className={`btn ${t.score === best && best > 0 ? 'primary' : ''} block`} disabled={!!busy} onClick={() => act('d' + o.id, () => onDecide(poll, o))}>
                  {busy === 'd' + o.id ? 'Making the plan…' : 'Pick this time'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="group">
        <h3>Asked</h3>
        <div className="pick-row">
          {poll.invitees.map(id => who(id) && (
            <span key={id} className="pchip static"><Avatar person={who(id)} size={22} />{first(who(id))}{waiting.includes(id) ? <small className="muted"> · not yet</small> : <small className="rsvp going">voted</small>}</span>
          ))}
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {mine && (!confirmDel
        ? <button className="btn danger block" onClick={() => setConfirmDel(true)}>Delete poll</button>
        : <div className="row"><button className="btn danger grow" onClick={() => act('del', async () => { await social.deletePoll(poll.id); onClose() })}>Delete</button><button className="btn grow" onClick={() => setConfirmDel(false)}>Keep</button></div>)}
    </Sheet>
  )
}
