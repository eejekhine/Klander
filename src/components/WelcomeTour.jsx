import { useEffect, useRef, useState } from 'react'
import { TOUR as ALL } from '../lib/help'
import { isInstalled, isMobile } from '../lib/install'

const TOUR = ALL.filter(s => !s.onlyIfNotInstalled || (isMobile() && !isInstalled()))

const ART = {
  hello: <svg viewBox="0 0 120 90" aria-hidden="true"><rect x="18" y="14" width="84" height="66" rx="12" fill="var(--surface)" stroke="var(--line)" strokeWidth="2"/><rect x="18" y="14" width="84" height="18" rx="12" fill="var(--accent)"/><rect x="30" y="42" width="22" height="12" rx="4" fill="var(--accent-soft)"/><rect x="58" y="42" width="32" height="12" rx="4" fill="color-mix(in srgb, var(--now) 25%, var(--surface))"/><rect x="30" y="60" width="38" height="12" rx="4" fill="color-mix(in srgb, var(--good) 25%, var(--surface))"/></svg>,
  swipe: <svg viewBox="0 0 120 90" aria-hidden="true"><rect x="10" y="16" width="70" height="58" rx="10" fill="var(--surface)" stroke="var(--line)" strokeWidth="2"/><rect x="58" y="16" width="52" height="58" rx="10" fill="var(--surface-2)" opacity=".7"/><path d="M92 46H40m0 0 10-9m-10 9 10 9" stroke="var(--accent)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  add: <svg viewBox="0 0 120 90" aria-hidden="true"><rect x="22" y="12" width="76" height="52" rx="12" fill="var(--surface)" stroke="var(--line)" strokeWidth="2"/><path d="M38 30h44M38 44h30" stroke="var(--muted)" strokeWidth="5" strokeLinecap="round"/><rect x="44" y="62" width="32" height="22" rx="8" fill="var(--accent)"/><path d="M60 67v12M54 73h12" stroke="var(--accent-ink)" strokeWidth="4" strokeLinecap="round"/></svg>,
  friends: <svg viewBox="0 0 120 90" aria-hidden="true"><circle cx="34" cy="40" r="15" fill="#e0477a"/><circle cx="60" cy="40" r="15" fill="#11a3a0"/><circle cx="86" cy="40" r="15" fill="#f08c1a" opacity=".35"/><circle cx="70" cy="51" r="5" fill="var(--good)" stroke="var(--bg)" strokeWidth="2"/><rect x="20" y="64" width="80" height="10" rx="5" fill="var(--surface-2)"/></svg>,
  plans: <svg viewBox="0 0 120 90" aria-hidden="true"><rect x="14" y="20" width="92" height="50" rx="12" fill="var(--surface)" stroke="var(--line)" strokeWidth="2"/><rect x="24" y="32" width="30" height="26" rx="6" fill="color-mix(in srgb, var(--good) 22%, var(--surface))" stroke="var(--good)"/><path d="m31 45 5 5 10-11" stroke="var(--good)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"/><path d="M64 38h32M64 50h22" stroke="var(--muted)" strokeWidth="5" strokeLinecap="round"/></svg>,
  install: <svg viewBox="0 0 120 90" aria-hidden="true"><rect x="38" y="6" width="44" height="78" rx="9" fill="var(--surface)" stroke="var(--line)" strokeWidth="2"/>{[0,1,2].map(c=>[0,1,2].map(r=> (c===1&&r===1)?null:<rect key={`${c}${r}`} x={44+c*12} y={14+r*14} width="8" height="8" rx="2.5" fill="var(--surface-2)"/>))}<rect x="54" y="26" width="12" height="12" rx="3.5" fill="var(--accent)"/><circle cx="60" cy="32" r="11" fill="none" stroke="var(--accent)" strokeWidth="2.5"/><path d="M60 50v16m0 0-6-6m6 6 6-6" stroke="var(--accent)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 60 58)"/></svg>,
  help: <svg viewBox="0 0 120 90" aria-hidden="true"><circle cx="60" cy="45" r="30" fill="var(--accent-soft)"/><path d="M50 38a10 10 0 1 1 14 9c-3 1.5-4 3-4 6" stroke="var(--accent)" strokeWidth="6" fill="none" strokeLinecap="round"/><circle cx="60" cy="63" r="4" fill="var(--accent)"/></svg>
}

/** A short swipeable welcome tour, shown once to new people (and any time from Help). */
export default function WelcomeTour({ onDone }) {
  const [i, setI] = useState(0)
  const start = useRef(null)
  const last = i === TOUR.length - 1
  const step = TOUR[i]
  useEffect(() => {
    const onKey = e => { if (e.key === 'ArrowRight') setI(n => Math.min(TOUR.length - 1, n + 1)); if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1)); if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])
  return (
    <div className="tour-backdrop" role="dialog" aria-modal="true" aria-label="Welcome tour">
      <div className="tour" onPointerDown={e => { start.current = e.clientX }}
        onPointerUp={e => { if (start.current == null) return; const d = e.clientX - start.current; start.current = null; if (d < -40 && !last) setI(i + 1); if (d > 40 && i > 0) setI(i - 1) }}>
        <button className="tour-skip linklike" onClick={onDone}>{last ? '' : 'Skip'}</button>
        <div className="tour-art" key={step.art}>{ART[step.art]}</div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-dots" aria-hidden="true">{TOUR.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
        <div className="row">
          {i > 0 && <button className="btn grow" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn primary grow" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "Let's go" : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}
