import { useRef, useState } from 'react'
import { addEventPhoto, deleteEventPhoto, useEventPhotos } from '../lib/memories'
import { Avatar } from './FriendsSheet'

/** Photos on an event. Everyone who was there can add theirs; the host can remove any. */
export default function EventPhotos({ eventId, uid, canAdd, isHost, takenAt, people = {}, me }) {
  const { photos, urls, reload } = useEventPhotos(eventId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState(null)
  const fileRef = useRef(null)
  if (!canAdd && photos.length === 0) return null
  const pick = async e => {
    const files = [...(e.target.files || [])].slice(0, 6); e.target.value = ''
    if (!files.length) return
    setBusy(true); setError('')
    try { for (const f of files) await addEventPhoto(uid, eventId, f, takenAt); await reload() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const remove = async p => { setError(''); try { await deleteEventPhoto(p); setView(null); await reload() } catch (err) { setError(err.message) } }
  const who = id => (id === uid ? me : people[id])
  return (
    <div className="group">
      <h3>Photos{photos.length ? ` (${photos.length})` : ''}</h3>
      <div className="photo-grid">
        {photos.map(p => (
          <button key={p.id} className="photo-tile" onClick={() => setView(p)} aria-label="Open photo">
            {urls[p.path] ? <img src={urls[p.path]} alt="" loading="lazy" /> : <span />}
            {p.user_id !== uid && who(p.user_id) && <span className="photo-by"><Avatar person={who(p.user_id)} size={18} /></span>}
          </button>
        ))}
        {canAdd && (
          <button className="photo-tile add" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <span className="spinner" /> : <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z"/></svg>}
            <small>{busy ? 'Adding…' : 'Add'}</small>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pick} />
      {canAdd && photos.length === 0 && <p className="small muted" style={{ margin: 0 }}>Add photos and they'll show up in your My Week. Everyone going can add theirs too.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {view && (
        <div className="photo-view" onClick={() => setView(null)}>
          <img src={urls[view.path]} alt="" />
          {(view.user_id === uid || isHost) && <button className="btn danger photo-del" onClick={e => { e.stopPropagation(); remove(view) }}>Delete photo</button>}
        </div>
      )}
    </div>
  )
}
