import { useEffect, useRef, useState } from 'react'
import Sheet from './Sheet'
import { REPEATS, fmt } from '../lib/dates'
import { draftToEvent, prepareImage, readWithAI, repeatLabel } from '../lib/smart'

const EXAMPLES = ['basketball thurs 7pm at the edge', 'dinner with sam saturday 8 at nandos', 'dentist 14th nov 9:30']
const VIS = [['friends', 'Friends'], ['busy', 'Busy only'], ['private', 'Private']]

export default function SmartAddSheet({ data, onClose, onDone, initialText = '', initialFile = null }) {
  const [stage, setStage] = useState('input') // input | reading | review
  const [text, setText] = useState(initialText)
  const [image, setImage] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [visibility, setVisibility] = useState('friends')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  // Opened with a photo already picked (e.g. "Add a photo" with no event to put it on)
  useEffect(() => { if (initialFile) prepareImage(initialFile).then(setImage).catch(e => setError(e.message)) }, [initialFile])

  // Paste a screenshot straight in (desktop, or iPhone long-press > Paste)
  useEffect(() => {
    const onPaste = async e => {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))
      if (!item) return
      e.preventDefault()
      try { setImage(await prepareImage(item.getAsFile())) } catch (err) { setError(err.message) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const pick = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError('')
    try { setImage(await prepareImage(f)) } catch (err) { setError(err.message) }
  }

  const read = async () => {
    if (!text.trim() && !image) return setError('Type something or add a photo first.')
    setError(''); setStage('reading')
    try {
      const r = await readWithAI({ text: text.trim(), image })
      setDrafts((r.events || []).map((d, i) => ({ ...d, key: i, include: true })))
      setMessage(r.message || '')
      setStage('review')
    } catch (err) { setError(err.message); setStage('input') }
  }

  const edit = (key, patch) => setDrafts(ds => ds.map(d => (d.key === key ? { ...d, ...patch } : d)))
  const chosen = drafts.filter(d => d.include)

  const save = async () => {
    setSaving(true); setError('')
    try {
      const source = image ? 'photo' : 'text'
      for (const d of chosen) {
        if (!d.title.trim()) throw new Error('One of the events has no title.')
        await data.saveEvent({ ...draftToEvent(d, { category_id: categoryId || null, visibility }), source })
      }
      onDone(chosen.length === 1 ? `Added "${chosen[0].title}".` : `Added ${chosen.length} events.`)
    } catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Sheet title="Smart add" onClose={onClose}
      actions={stage === 'review' && chosen.length > 0
        ? <button className="btn primary" style={{ padding: '8px 14px' }} disabled={saving} onClick={save}>{saving ? '…' : `Add ${chosen.length}`}</button>
        : null}>

      {stage !== 'review' && <>
        <div className="group">
          <label className="field"><span>Type it like you'd text it</span>
            <textarea id="smart-text" className="input" rows={3} value={text} onChange={e => setText(e.target.value)}
              placeholder={EXAMPLES[0]} disabled={stage === 'reading'} />
          </label>
          <div className="chips-row">
            {EXAMPLES.map(x => <button key={x} type="button" className="ex-chip" onClick={() => setText(x)}>{x}</button>)}
          </div>
        </div>

        <div className="group">
          <h3>Or use a photo</h3>
          <p className="small muted">A poster, ticket, booking email, group-chat screenshot, timetable or work rota.</p>
          {image
            ? <div className="photo-preview">
                <img src={image.preview} alt="Your photo" />
                <button className="btn" onClick={() => setImage(null)} disabled={stage === 'reading'}>Remove photo</button>
              </div>
            : <button className="btn block" onClick={() => fileRef.current?.click()}>Take or choose a photo</button>}
          <input ref={fileRef} id="smart-file" type="file" accept="image/*" hidden onChange={pick} />
          {image && <p className="small muted">You can add a note above too, like "only the Tuesday ones".</p>}
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" onClick={read} disabled={stage === 'reading' || (!text.trim() && !image)}>
          {stage === 'reading' ? <><span className="spinner" aria-hidden="true" /> Reading…</> : 'Make events'}
        </button>
        <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>Nothing is saved until you check it.</p>
      </>}

      {stage === 'review' && <>
        {message && <p className="notice">{message}</p>}
        {drafts.length === 0 && <button className="btn block" onClick={() => setStage('input')}>Try again</button>}

        {drafts.length > 0 && (
          <div className="group">
            <div className="two">
              <label className="field"><span>Category (all)</span>
                <select id="smart-cat" className="input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  <option value="">None</option>
                  {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Friends see (all)</span>
                <select id="smart-vis" className="input" value={visibility} onChange={e => setVisibility(e.target.value)}>
                  {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}

        {drafts.map(d => (
          <div key={d.key} className={`group draft${d.include ? '' : ' off'}`}>
            <div className="draft-top">
              <label className="switch"><input type="checkbox" checked={d.include} onChange={e => edit(d.key, { include: e.target.checked })} aria-label={`Include ${d.title}`} /><span /></label>
              <input className="title-input" style={{ fontSize: 17 }} value={d.title} onChange={e => edit(d.key, { title: e.target.value })} maxLength={120} aria-label="Title" />
            </div>
            {d.confidence < 0.6 && <p className="check-this">Check the date and time on this one.</p>}
            <label className="field"><span>Date</span>
              <input className="input" type="date" value={d.date} onChange={e => e.target.value && edit(d.key, { date: e.target.value })} />
            </label>
            {d.all_day
              ? <p className="small muted" style={{ margin: 0 }}>All day{d.end_date && d.end_date !== d.date ? ` until ${fmt(new Date(d.end_date), 'd MMM')}` : ''}</p>
              : <div className="two">
                  <label className="field"><span>From</span><input className="input" type="time" value={d.start_time || ''} onChange={e => edit(d.key, { start_time: e.target.value })} /></label>
                  <label className="field"><span>To</span><input className="input" type="time" value={d.end_time || ''} onChange={e => edit(d.key, { end_time: e.target.value || null })} /></label>
                </div>}
            <div className="two">
              <label className="field"><span>Where</span>
                <input className="input" value={d.location || ''} onChange={e => edit(d.key, { location: e.target.value })} placeholder="—" />
              </label>
              <label className="field"><span>Repeat</span>
                <select className="input" value={d.repeat} onChange={e => edit(d.key, { repeat: e.target.value, repeat_days: [] })}>
                  {REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            {repeatLabel(d) && <p className="small muted" style={{ margin: 0 }}>{repeatLabel(d)}</p>}
          </div>
        ))}

        {error && <p className="error" role="alert">{error}</p>}
        {drafts.length > 0 && <>
          <button className="btn primary block" disabled={saving || chosen.length === 0} onClick={save}>
            {saving ? 'Adding…' : chosen.length === 1 ? 'Add 1 event' : `Add ${chosen.length} events`}
          </button>
          <button className="btn ghost block" onClick={() => { setStage('input'); setDrafts([]) }}>Start again</button>
        </>}
      </>}
    </Sheet>
  )
}
