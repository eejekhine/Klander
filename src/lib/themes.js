import { useEffect, useState } from 'react'

/* =====================================================================
   Klander theme engine
   A theme is a small config object saved in profiles.theme_config:
   { preset, accent, style, radius, density, font, textScale, fun, custom, name }
   It is turned into CSS variables on <html>, so every screen updates at once.
   ===================================================================== */

export const FONTS = [
  { name: 'Klander (Unbounded + DM Sans)', display: '"Unbounded", "Arial Black", system-ui, sans-serif', body: '"DM Sans", system-ui, sans-serif', css: 'Unbounded:wght@600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700' },
  { name: 'Planner (Caveat + Nunito)', display: '"Caveat", cursive', body: '"Nunito", system-ui, sans-serif', css: 'Caveat:wght@600;700&family=Nunito:wght@400;600;700', titleScale: 1.35 },
  { name: 'Studio (IBM Plex Mono)', display: '"IBM Plex Mono", ui-monospace, monospace', body: '"IBM Plex Mono", ui-monospace, monospace', css: 'IBM+Plex+Mono:wght@400;600' },
  { name: 'Court (Bebas Neue + DM Sans)', display: '"Bebas Neue", Impact, sans-serif', body: '"DM Sans", system-ui, sans-serif', css: 'Bebas+Neue&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700', titleScale: 1.3, track: '.03em' },
  { name: 'Arcade (Press Start 2P + DM Sans)', display: '"Press Start 2P", monospace', body: '"DM Sans", system-ui, sans-serif', css: 'Press+Start+2P&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700', titleScale: .62 },
  { name: 'Botanical (Fraunces + Nunito)', display: '"Fraunces", Georgia, serif', body: '"Nunito", system-ui, sans-serif', css: 'Fraunces:opsz,wght@9..144,600;9..144,700&family=Nunito:wght@400;600;700' },
  { name: 'Easy to read (Atkinson Hyperlegible)', display: '"Atkinson Hyperlegible", system-ui, sans-serif', body: '"Atkinson Hyperlegible", system-ui, sans-serif', css: 'Atkinson+Hyperlegible:wght@400;700' }
]

/* Presets. 'klander' follows the phone's light/dark setting; the rest are fixed looks. */
export const PRESETS = {
  klander: { name: 'Klander', desc: 'The default. Follows light/dark on your phone.', font: 0, style: 'filled', radius: 7, swatch: ['#f3f4f8', '#2b4cff', '#e0477a'] },
  nightshift: { name: 'Night Shift', desc: 'Low-glare amber for late starts. Dims after 22:00.', dark: true, dynamic: 'night', font: 0, style: 'outline', radius: 6,
    t: { bg: '#0d0f14', surface: '#171b24', surface2: '#20252f', ink: '#ece6d8', muted: '#9a927f', line: '#262b36', accent: '#ffb020', now: '#ff5a3c' } },
  paper: { name: 'Paper Planner', desc: 'Handwritten headings on dotted paper.', font: 1, style: 'filled', radius: 4,
    t: { bg: '#fbf8f1', surface: '#ffffff', surface2: '#efe9dc', ink: '#2b2a33', muted: '#6f6a5b', line: '#e6dfcf', accent: '#2d5bd1', now: '#d94a4a' },
    pattern: 'radial-gradient(#d9d1bf 1px, transparent 1.3px) 0 0/14px 14px' },
  studio: { name: 'Studio Desk', desc: 'Mixing-desk greys and a level-meter now line.', dark: true, font: 2, style: 'solid', radius: 2, meter: true,
    t: { bg: '#1b1d1f', surface: '#26292d', surface2: '#2e3236', ink: '#e6e8ea', muted: '#9aa1a7', line: '#363a3f', accent: '#3ddc84', now: '#3ddc84' } },
  courtside: { name: 'Courtside', desc: 'Hardwood floor and court-line orange.', font: 3, style: 'solid', radius: 3,
    t: { bg: '#f4e4cc', surface: '#fff7ea', surface2: '#e6cfa8', ink: '#2a1d12', muted: '#6e5640', line: '#d9bb8e', accent: '#c2410c', now: '#1d4ed8' },
    pattern: 'repeating-linear-gradient(90deg, transparent 0 46px, rgba(140,90,40,.07) 46px 48px)' },
  arcade: { name: 'Arcade', desc: 'Neon on black with glowing events.', dark: true, font: 4, style: 'glow', radius: 0,
    t: { bg: '#08040f', surface: '#130b26', surface2: '#1d1236', ink: '#f2eaff', muted: '#a596c8', line: '#2a1c4d', accent: '#ff3df2', now: '#29f5ff' } },
  botanical: { name: 'Botanical', desc: 'Soft greens and a serif title.', font: 5, style: 'filled', radius: 12,
    t: { bg: '#eef3ec', surface: '#fbfdf9', surface2: '#dbe6d6', ink: '#1f2d24', muted: '#56685b', line: '#cfdcc9', accent: '#2f6f4f', now: '#c2410c' } },
  sunrise: { name: 'Sunrise', desc: 'Warms up at dawn and dims at night.', dynamic: 'day', font: 0, style: 'filled', radius: 14,
    t: { bg: '#fff6ee', surface: '#ffffff', surface2: '#ffe0c7', ink: '#2b1b17', muted: '#76574e', line: '#f3d6bf', accent: '#e8451f', now: '#7c3aed' } },
  contrast: { name: 'High contrast', desc: 'Maximum readability. Bold edges.', dark: true, font: 6, style: 'outline', radius: 4, hc: true,
    t: { bg: '#000000', surface: '#0b0b0b', surface2: '#1a1a1a', ink: '#ffffff', muted: '#e0e0e0', line: '#ffffff', accent: '#ffd400', now: '#ff3b3b' } }
}

export const DEFAULT_THEME = { preset: 'klander', style: null, radius: null, density: 52, font: null, textScale: 1, fun: true }

/* ---------- colour maths ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const isHex = h => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h)
export const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
export const rgb2hex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')
export const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)) }
export const lum = h => { const c = hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
export const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
export const onColor = h => (ratio(h, '#ffffff') >= ratio(h, '#111111') ? '#ffffff' : '#111111')
/** Push a colour towards black or white until it reaches `min` contrast against `bg`, keeping its hue. */
export function ensureContrast(c, bg, min) {
  if (!isHex(c) || !isHex(bg)) return c
  const target = lum(bg) > 0.4 ? '#000000' : '#ffffff'
  let v = c, k = 0
  while (ratio(v, bg) < min && k < 20) { v = mix(v, target, 0.1); k++ }
  return v
}

/* ---------- state + subscribers ---------- */
let current = { ...DEFAULT_THEME }
let resolved = null
const subs = new Set()
export const getTheme = () => current
export const getResolved = () => resolved
export function useThemeState() {
  const [, force] = useState(0)
  useEffect(() => { const f = () => force(n => n + 1); subs.add(f); return () => subs.delete(f) }, [])
  return { config: current, resolved }
}

/* ---------- fonts loaded on demand ---------- */
const loadedFonts = new Set([0])
function loadFont(i) {
  if (loadedFonts.has(i) || !FONTS[i]) return
  loadedFonts.add(i)
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = `https://fonts.googleapis.com/css2?family=${FONTS[i].css}&display=swap`
  document.head.appendChild(l)
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

/** Time-of-day shift for dynamic presets. */
function dynamicShift(t, mode, hour) {
  const o = { ...t }
  const night = '#06060c'
  if (mode === 'day') {
    if (hour >= 5 && hour < 9) { const k = (9 - hour) / 4 * 0.3; o.bg = mix(t.bg, '#ff9a5a', k); o.surface2 = mix(t.surface2, '#ff9a5a', k) }
    else if (hour >= 18 && hour < 22) { const k = (hour - 17) / 5 * 0.18; o.bg = mix(t.bg, '#ff7a45', k) }
  }
  if (hour >= 22 || hour < 5) {
    const k = mode === 'night' ? 0.45 : 0.82
    o.bg = mix(t.bg, night, k); o.surface = mix(t.surface, night, k * 0.9); o.surface2 = mix(t.surface2, night, k * 0.9); o.line = mix(t.line, night, k * 0.6)
    if (lum(o.bg) < 0.2 && lum(t.ink) < 0.4) { o.ink = '#e9e4da'; o.muted = '#a69f90' }
  }
  return o
}

/** Work out the final tokens for a config (or null for the plain Klander look). */
export function resolveTheme(cfg, { mode = 'system', hour = new Date().getHours() } = {}) {
  const preset = PRESETS[cfg.preset] || (cfg.preset === 'custom' ? null : PRESETS.klander)
  let tokens = null, dark
  if (cfg.preset === 'custom' && cfg.custom && isHex(cfg.custom.bg)) tokens = { ...cfg.custom }
  else if (preset?.t) tokens = { ...preset.t }
  if (tokens) {
    dark = lum(tokens.bg) < 0.25
    if (preset?.dynamic) { tokens = dynamicShift(tokens, preset.dynamic, hour); dark = lum(tokens.bg) < 0.25 }
    if (isHex(cfg.accent)) tokens.accent = cfg.accent
    // Contrast guard
    tokens.ink = ensureContrast(tokens.ink || (dark ? '#f0f0f0' : '#151827'), tokens.bg, 7)
    tokens.muted = ensureContrast(tokens.muted || mix(tokens.ink, tokens.bg, 0.4), tokens.bg, 4.5)
    tokens.surface ||= dark ? mix(tokens.bg, '#ffffff', 0.06) : '#ffffff'
    tokens.surface2 ||= mix(tokens.bg, dark ? '#ffffff' : '#000000', 0.08)
    tokens.line ||= mix(tokens.bg, tokens.ink, 0.14)
    tokens.accent = ensureContrast(tokens.accent || '#2b4cff', tokens.bg, 3)
    tokens.now = ensureContrast(tokens.now || '#e0477a', tokens.bg, 3)
  } else {
    dark = mode === 'dark' || (mode === 'system' && systemDark())
    if (isHex(cfg.accent)) tokens = { accent: ensureContrast(cfg.accent, dark ? '#0f111a' : '#f3f4f8', 3) }
  }
  const fontIndex = Number.isInteger(cfg.font) ? cfg.font : (preset?.font ?? 0)
  return {
    tokens, dark,
    bg: tokens?.bg || (dark ? '#0f111a' : '#f3f4f8'),
    font: FONTS[fontIndex] ? fontIndex : 0,
    style: cfg.style || preset?.style || 'filled',
    radius: Number.isFinite(cfg.radius) ? clamp(cfg.radius, 0, 16) : (preset?.radius ?? 7),
    density: [40, 52, 64].includes(cfg.density) ? cfg.density : 52,
    textScale: [1, 1.15, 1.3].includes(cfg.textScale) ? cfg.textScale : 1,
    pattern: preset?.pattern || 'none',
    meter: !!preset?.meter, hc: !!preset?.hc, dynamic: !!preset?.dynamic,
    fun: cfg.fun !== false
  }
}

let dynTimer = null
/** Apply a theme config to the page. mode = profile.theme (system/light/dark) for the default look. */
export function applyThemeConfig(cfg = DEFAULT_THEME, mode) {
  current = { ...DEFAULT_THEME, ...(cfg || {}) }
  const m = mode || (() => { try { return localStorage.getItem('klander:theme') || 'system' } catch { return 'system' } })()
  const r = resolveTheme(current, { mode: m })
  resolved = r
  const root = document.documentElement
  const set = (k, v) => root.style.setProperty(k, v)
  const vars = ['--bg', '--surface', '--surface-2', '--ink', '--muted', '--line', '--accent', '--accent-ink', '--accent-soft', '--now']
  vars.forEach(v => root.style.removeProperty(v))
  if (r.tokens?.bg) {
    root.setAttribute('data-theme', r.dark ? 'dark' : 'light')
    set('--bg', r.tokens.bg); set('--surface', r.tokens.surface); set('--surface-2', r.tokens.surface2)
    set('--ink', r.tokens.ink); set('--muted', r.tokens.muted); set('--line', r.tokens.line); set('--now', r.tokens.now)
  } else if (m === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', m)
  if (r.tokens?.accent) {
    set('--accent', r.tokens.accent); set('--accent-ink', onColor(r.tokens.accent))
    set('--accent-soft', mix(r.tokens.accent, r.tokens.surface || (r.dark ? '#181b27' : '#ffffff'), r.dark ? 0.78 : 0.86))
  }
  loadFont(r.font)
  const f = FONTS[r.font]
  set('--display', f.display); set('--body', f.body)
  set('--title-scale', String(f.titleScale || 1)); set('--title-track', f.track || '-.01em')
  set('--r', `${r.radius}px`); set('--zoom', String(r.textScale)); set('--pattern', r.pattern)
  root.dataset.evstyle = r.style
  root.dataset.meter = r.meter ? '1' : '0'
  root.dataset.hc = r.hc ? '1' : '0'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', r.bg)
  clearInterval(dynTimer)
  if (r.dynamic) dynTimer = setInterval(() => applyThemeConfig(current, m), 5 * 60 * 1000)
  subs.forEach(f => f())
  try { localStorage.setItem('klander:theme-config', JSON.stringify(current)) } catch { /* ignore */ }
  return r
}

/** Apply the last-used theme straight away on load (before the profile arrives). */
export function applySavedTheme() {
  let cfg = null
  try { cfg = JSON.parse(localStorage.getItem('klander:theme-config')) } catch { /* ignore */ }
  applyThemeConfig(cfg || DEFAULT_THEME)
}

/* ---------- event colours that stay readable on any theme ---------- */
export function harmonize(c) {
  const bg = resolved?.bg || '#f3f4f8'
  return ensureContrast(c, bg, 2.6)
}
export const evVars = c => ({ '--c': c, '--oc': onColor(c) })

/* ---------- theme codes ---------- */
const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))
export function themeToCode(cfg) {
  const c = sanitize(cfg)
  return 'KL1-' + b64e(JSON.stringify(c))
}
export function codeToTheme(code) {
  const m = String(code || '').trim().match(/^KL1-([A-Za-z0-9_-]+)$/)
  if (!m) throw new Error('That isn\'t a Klander theme code. They start with KL1-')
  let obj
  try { obj = JSON.parse(b64d(m[1])) } catch { throw new Error('That theme code is damaged. Copy it again.') }
  return sanitize(obj)
}
/** Only keep known keys with valid values, so codes and AI output can't inject anything odd. */
export function sanitize(cfg = {}) {
  const out = { preset: PRESETS[cfg.preset] || cfg.preset === 'custom' ? cfg.preset : 'klander' }
  if (isHex(cfg.accent)) out.accent = cfg.accent
  if (['filled', 'outline', 'solid', 'glow'].includes(cfg.style)) out.style = cfg.style
  if (Number.isFinite(cfg.radius)) out.radius = clamp(Math.round(cfg.radius), 0, 16)
  if ([40, 52, 64].includes(cfg.density)) out.density = cfg.density
  if (Number.isInteger(cfg.font) && FONTS[cfg.font]) out.font = cfg.font
  if ([1, 1.15, 1.3].includes(cfg.textScale)) out.textScale = cfg.textScale
  if (cfg.fun === false) out.fun = false
  if (typeof cfg.name === 'string') out.name = cfg.name.slice(0, 40)
  if (out.preset === 'custom') {
    const c = cfg.custom || {}
    const keys = ['bg', 'surface', 'surface2', 'ink', 'muted', 'line', 'accent', 'now']
    out.custom = Object.fromEntries(keys.filter(k => isHex(c[k])).map(k => [k, c[k]]))
    if (!out.custom.bg) { out.preset = 'klander'; delete out.custom }
  }
  return out
}
export const themeName = cfg => (cfg?.preset === 'custom' ? (cfg.name || 'Custom') : PRESETS[cfg?.preset]?.name || 'Klander')

/* ---------- theme from a photo (runs on the phone; nothing uploaded) ---------- */
export function themeFromImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const S = 64, c = document.createElement('canvas'); c.width = S; c.height = S
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, S, S)
      URL.revokeObjectURL(img.src)
      const d = x.getImageData(0, 0, S, S).data, px = []
      for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]])
      resolve(paletteToCustom(kmeans(px, 5).map(rgb2hex)))
    }
    img.onerror = () => reject(new Error('Couldn\'t read that photo. Try a JPG or a screenshot.'))
    img.src = URL.createObjectURL(file)
  })
}
export function kmeans(px, k) {
  let cen = Array.from({ length: k }, (_, i) => px[Math.floor((i + 0.5) / k * px.length)].slice())
  for (let it = 0; it < 12; it++) {
    const sum = cen.map(() => [0, 0, 0, 0])
    for (const p of px) {
      let bi = 0, bd = Infinity
      cen.forEach((c, i) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; bi = i } })
      const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++
    }
    cen = cen.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c))
  }
  return cen
}
const sat = h => { const [r, g, b] = hex2rgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0 }
export function paletteToCustom(hexes) {
  const byL = [...hexes].sort((a, b) => lum(a) - lum(b))
  const dark = lum(byL[Math.floor(byL.length / 2)]) < 0.22
  const bg = dark ? mix(byL[0], '#000000', 0.35) : mix(byL[byL.length - 1], '#ffffff', 0.6)
  const bySat = [...hexes].sort((a, b) => sat(b) - sat(a))
  const ink = dark ? '#eef0f4' : '#16171c'
  return {
    preset: 'custom', name: 'From my photo',
    custom: {
      bg, ink,
      surface: dark ? mix(bg, '#ffffff', 0.07) : '#ffffff',
      surface2: mix(bg, dark ? '#ffffff' : '#000000', 0.08),
      muted: mix(ink, bg, 0.42), line: mix(bg, ink, 0.14),
      accent: ensureContrast(bySat[0], bg, 3), now: ensureContrast(bySat[1] || '#e0477a', bg, 3)
    }
  }
}

/* ---------- seasonal touches ---------- */
function easter(y) { // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, month - 1, day)
}
const nthMonday = (y, mo, n) => { const d = new Date(y, mo, 1); const off = (8 - d.getDay()) % 7; return new Date(y, mo, 1 + off + 7 * (n - 1)) }
const lastMonday = (y, mo) => { const d = new Date(y, mo + 1, 0); return new Date(y, mo, d.getDate() - ((d.getDay() + 6) % 7)) }
const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
export function seasonalFor(d = new Date()) {
  const y = d.getFullYear(), md = `${d.getMonth() + 1}-${d.getDate()}`
  const e = easter(y)
  const fixed = { '1-1': ['New Year\'s Day', '#f5b301'], '2-14': ['Valentine\'s Day', '#e0477a'], '10-31': ['Halloween', '#f97316'], '11-5': ['Bonfire Night', '#ef4444'],
    '12-24': ['Christmas Eve', '#16a34a'], '12-25': ['Christmas Day', '#dc2626'], '12-26': ['Boxing Day', '#16a34a'], '12-31': ['New Year\'s Eve', '#f5b301'] }
  if (fixed[md]) return { label: fixed[md][0], colour: fixed[md][1] }
  const goodFriday = new Date(e); goodFriday.setDate(e.getDate() - 2)
  const easterMon = new Date(e); easterMon.setDate(e.getDate() + 1)
  const list = [[goodFriday, 'Good Friday'], [e, 'Easter Sunday'], [easterMon, 'Easter Monday'], [nthMonday(y, 4, 1), 'Early May bank holiday'],
    [lastMonday(y, 4), 'Spring bank holiday'], [lastMonday(y, 7), 'Summer bank holiday']]
  for (const [date, label] of list) if (same(date, d)) return { label, colour: '#7c3aed' }
  return null
}
