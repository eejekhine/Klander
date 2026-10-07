import { useRef, useState } from 'react'
import Sheet from './Sheet'
import {
  FONTS, PRESETS, DEFAULT_THEME, applyThemeConfig, codeToTheme, getResolved, ratio, sanitize,
  themeFromImage, themeName, themeToCode
} from '../lib/themes'
import { aiTheme } from '../lib/smart'

const STYLES = [['filled', 'Filled'], ['outline', 'Outline'], ['solid', 'Solid'], ['glow', 'Glow']]
const DENSITY = [[40, 'Compact'], [52, 'Comfy'], [64, 'Roomy']]
const SCALE = [[1, 'Normal'], [1.15, 'Large'], [1.3, 'Larger']]
const MODES = [['system', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']]

export default function AppearanceSheet({ data, onClose }) {
  const original = useRef({ cfg: { ...DEFAULT_THEME, ...(data.profile.theme_config || {}) }, mode: data.profile.theme })
  const [cfg, setCfg] = useState(original.current.cfg)
  const [mode, setMode] = useState(data.profile.theme || 'system')
  const [code, setCode] = useState('')
  const [vibe, setVibe] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const update = (patch, m = mode, replace = false) => {
    const next = replace ? { ...patch } : { ...cfg, ...patch }
    setCfg(next); setMode(m)
    applyThemeConfig(next, m)
    setMsg(''); setError('')
  }
  const choosePreset = key => update({ preset: key, density: cfg.density, textScale: cfg.textScale, fun: cfg.fun }, mode, true)

  const cancel = () => { applyThemeConfig(original.current.cfg, original.current.mode); onClose() }
  const save = async () => {
    setBusy('save'); setError('')
    try {
      await data.updateProfile({ theme_config: sanitize(cfg), theme: mode })
      try { localStorage.setItem('klander:theme', mode) } catch { /* ignore */ }
      onClose()
    } catch (e) { setError(e.message); setBusy('') }
  }

  const fromPhoto = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy('photo')
    try { const t = await themeFromImage(f); update({ ...t, style: cfg.style, radius: cfg.radius, font: cfg.font }); setMsg('Made a theme from your photo. Tweak it, then save.') }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const fromVibe = async () => {
    if (!vibe.trim()) return
    setBusy('vibe')
    try { const t = await aiTheme(vibe.trim()); update(t); setMsg(`"${t.name}" is ready. Tweak it, then save.`) }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const applyCode = () => {
    try { update(codeToTheme(code)); setMsg('Theme loaded from code.'); setCode('') } catch (err) { setError(err.message) }
  }
  const copyCode = async () => {
    const c = themeToCode(cfg)
    try { await navigator.clipboard.writeText(c); setMsg('Theme code copied. Send it to a friend.') } catch { setCode(c); setMsg('Copy the code from the box.') }
  }

  const r = getResolved()
  const accentNow = r?.tokens?.accent || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2b4cff'
  const cr = r?.bg && /^#/.test(accentNow) ? ratio(accentNow, r.bg) : null

  return (
    <Sheet title="Appearance" onClose={cancel}
      actions={<button className="btn primary" style={{ padding: '8px 14px' }} disabled={busy === 'save'} onClick={save}>Save</button>}>

      <div className="group">
        <h3>Theme</h3>
        <div className="theme-grid">
          {Object.entries(PRESETS).map(([key, p]) => {
            const sw = p.t ? [p.t.bg, p.t.surface2, p.t.accent, p.t.now] : p.swatch
            return (
              <button key={key} type="button" className="theme-card" aria-pressed={cfg.preset === key} onClick={() => choosePreset(key)}>
                <div className="swatch-row">{sw.map((c, i) => <i key={i} style={{ background: c }} />)}</div>
                <b style={{ fontFamily: FONTS[p.font].display, fontSize: key === 'arcade' ? 10 : key === 'paper' || key === 'courtside' ? 19 : 14 }}>{p.name}</b>
                <small>{p.desc}</small>
              </button>
            )
          })}
          {cfg.preset === 'custom' && (
            <button type="button" className="theme-card" aria-pressed="true">
              <div className="swatch-row">{['bg', 'surface2', 'accent', 'now'].map(k => <i key={k} style={{ background: cfg.custom?.[k] }} />)}</div>
              <b>{themeName(cfg)}</b><small>Your own theme</small>
            </button>
          )}
        </div>
        {cfg.preset === 'klander' && (
          <div className="seg" role="group" aria-label="Light or dark" style={{ width: '100%' }}>
            {MODES.map(([m, l]) => <button key={m} style={{ flex: 1 }} aria-pressed={mode === m} onClick={() => update({}, m)}>{l}</button>)}
          </div>
        )}
      </div>

      <div className="group">
        <h3>Make your own</h3>
        <label className="field"><span>Describe a vibe</span>
          <div className="row">
            <input id="vibe" className="input grow" value={vibe} onChange={e => setVibe(e.target.value)} placeholder="e.g. rainy lo-fi study night" maxLength={120} />
            <button className="btn primary" onClick={fromVibe} disabled={busy === 'vibe' || !vibe.trim()}>{busy === 'vibe' ? '…' : 'Create'}</button>
          </div>
        </label>
        <button className="btn block" onClick={() => fileRef.current?.click()} disabled={busy === 'photo'}>{busy === 'photo' ? 'Reading colours…' : 'Make a theme from a photo'}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={fromPhoto} />
        <p className="small muted" style={{ margin: 0 }}>Photo themes are made on your phone. The photo isn't uploaded.</p>
      </div>

      <div className="group">
        <h3>Tweak it</h3>
        <div className="field"><span>Accent colour</span>
          <div className="row">
            <input type="color" aria-label="Accent colour" value={/^#/.test(accentNow) ? accentNow : '#2b4cff'} onChange={e => update({ accent: e.target.value })} style={{ width: 52, height: 40, border: '1px solid var(--line)', borderRadius: 10, background: 'none' }} />
            {cfg.accent && <button className="linklike small" onClick={() => update({ accent: undefined })}>Reset</button>}
            {cr && <span className="contrast-note" style={{ color: cr >= 3 ? 'var(--good)' : 'var(--danger)' }}>{cr >= 3 ? `Readable (${cr.toFixed(1)}:1)` : 'Too faint, so Klander adjusts it'}</span>}
          </div>
        </div>
        <div className="field"><span>Event style</span>
          <div className="seg" role="group" style={{ width: '100%' }}>{STYLES.map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={(cfg.style || r?.style) === v} onClick={() => update({ style: v })}>{l}</button>)}</div>
        </div>
        <label className="field"><span>Corners</span>
          <input type="range" min="0" max="16" value={cfg.radius ?? r?.radius ?? 7} onChange={e => update({ radius: +e.target.value })} style={{ accentColor: 'var(--accent)' }} />
        </label>
        <div className="field"><span>Week view height</span>
          <div className="seg" role="group" style={{ width: '100%' }}>{DENSITY.map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={(cfg.density || 52) === v} onClick={() => update({ density: v })}>{l}</button>)}</div>
        </div>
        <label className="field"><span>Fonts</span>
          <select className="input" value={cfg.font ?? r?.font ?? 0} onChange={e => update({ font: +e.target.value })}>
            {FONTS.map((f, i) => <option key={i} value={i}>{f.name}</option>)}
          </select>
        </label>
        <div className="field"><span>Text size</span>
          <div className="seg" role="group" style={{ width: '100%' }}>{SCALE.map(([v, l]) => <button key={v} style={{ flex: 1 }} aria-pressed={(cfg.textScale || 1) === v} onClick={() => update({ textScale: v })}>{l}</button>)}</div>
        </div>
        <div className="toggle-row"><span>Birthday and seasonal touches<br /><small className="muted">Confetti on your birthday, bank holiday colours</small></span>
          <label className="switch"><input type="checkbox" checked={cfg.fun !== false} onChange={e => update({ fun: e.target.checked })} aria-label="Birthday and seasonal touches" /><span /></label>
        </div>
      </div>

      <div className="group">
        <h3>Theme codes</h3>
        <p className="small muted" style={{ margin: 0 }}>Share your look with a code, or paste a friend's.</p>
        <button className="btn block" onClick={copyCode}>Copy my theme code</button>
        <div className="row">
          <input className="input grow small" value={code} onChange={e => setCode(e.target.value)} placeholder="KL1-…" autoCapitalize="none" autoCorrect="off" />
          <button className="btn" onClick={applyCode} disabled={!code.trim()}>Use</button>
        </div>
      </div>

      {msg && <p className="small" style={{ color: 'var(--good)', margin: 0 }}>{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="sheet-sticky">
        <button className="btn grow" onClick={() => { update({ ...DEFAULT_THEME }, 'system', true) }}>Reset to default</button>
        <button className="btn primary grow" onClick={save} disabled={busy === 'save'}>Save theme</button>
      </div>
    </Sheet>
  )
}
