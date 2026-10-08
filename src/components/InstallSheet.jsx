import { useState } from 'react'
import Sheet from './Sheet'
import { isInstalled, platform, useInstallPrompt } from '../lib/install'

// Little drawings of the screens you'll see. The part to tap is highlighted in the accent colour.
const HL = { fill: 'var(--accent)', stroke: 'var(--accent)' }
const ring = (cx, cy, r = 13) => <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--accent)" strokeWidth="3" className="tap-ring" />
const Phone = ({ children }) => (
  <svg viewBox="0 0 200 150" aria-hidden="true">
    <rect x="45" y="4" width="110" height="142" rx="16" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
    {children}
  </svg>
)
const Page = () => <><rect x="55" y="18" width="90" height="14" rx="4" fill="var(--accent)" /><rect x="55" y="38" width="60" height="8" rx="3" fill="var(--surface-2)" /><rect x="55" y="50" width="80" height="8" rx="3" fill="var(--surface-2)" /><rect x="55" y="62" width="45" height="8" rx="3" fill="var(--surface-2)" /></>
const ShareIcon = ({ x, y, on }) => <g transform={`translate(${x - 7} ${y - 9})`} fill="none" stroke={on ? HL.stroke : 'var(--muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8v9h11V8" /><path d="M8.5 1v11M4.5 5l4-4 4 4" /></g>
const Dots = ({ x, y, on }) => <g fill={on ? HL.fill : 'var(--muted)'}>{[-6, 0, 6].map(d => <circle key={d} cx={x + d} cy={y} r="2" />)}</g>

const ART = {
  'ios-share': (
    <Phone><Page />
      <rect x="51" y="112" width="98" height="26" rx="13" fill="var(--surface-2)" />
      <rect x="62" y="120" width="52" height="10" rx="5" fill="var(--surface)" />
      <ShareIcon x={124} y={125} on /><Dots x={140} y={125} />
      {ring(124, 125)}
    </Phone>
  ),
  'ios-dots': (
    <Phone><Page />
      <rect x="51" y="112" width="98" height="26" rx="13" fill="var(--surface-2)" />
      <rect x="62" y="120" width="60" height="10" rx="5" fill="var(--surface)" />
      <Dots x={137} y={125} on />{ring(137, 125)}
    </Phone>
  ),
  'ios-sheet': (
    <Phone>
      <rect x="45" y="40" width="110" height="106" rx="14" fill="var(--surface-2)" />
      {[0, 1, 3].map(n => <rect key={n} x="55" y={52 + n * 21} width="90" height="16" rx="5" fill="var(--surface)" />)}
      <rect x="55" y="94" width="90" height="16" rx="5" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <rect x="61" y="99" width="50" height="6" rx="3" fill="var(--accent)" /><rect x="131" y="97" width="9" height="10" rx="2" fill="none" stroke="var(--accent)" strokeWidth="1.6" /><path d="M135.5 99.5v5M133 102h5" stroke="var(--accent)" strokeWidth="1.4" />
    </Phone>
  ),
  'ios-add': (
    <Phone>
      <rect x="55" y="16" width="20" height="8" rx="3" fill="var(--surface-2)" /><rect x="125" y="14" width="22" height="12" rx="4" fill="var(--accent)" />{ring(136, 20, 15)}
      <rect x="58" y="38" width="26" height="26" rx="7" fill="var(--accent)" /><path d="M64 46h14M64 52h10M64 58h12" stroke="var(--accent-ink)" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="90" y="44" width="46" height="8" rx="3" fill="var(--surface-2)" /><rect x="90" y="56" width="32" height="6" rx="3" fill="var(--surface-2)" />
      <rect x="55" y="76" width="90" height="18" rx="5" fill="var(--surface-2)" /><rect x="61" y="82" width="44" height="6" rx="3" fill="var(--muted)" opacity=".5" />
      <rect x="121" y="79" width="20" height="12" rx="6" fill="var(--good)" /><circle cx="135" cy="85" r="4.5" fill="#fff" />
    </Phone>
  ),
  'home': (
    <Phone>
      {[0, 1, 2, 3].map(c => [0, 1, 2].map(r => (c === 1 && r === 1) ? null : <rect key={`${c}${r}`} x={56 + c * 23} y={20 + r * 28} width="17" height="17" rx="5" fill="var(--surface-2)" />))}
      <rect x="79" y="48" width="17" height="17" rx="5" fill="var(--accent)" /><path d="M83 53h9M83 57h6M83 61h8" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
      {ring(87.5, 56.5, 14)}
      <text x="87.5" y="75" textAnchor="middle" fontSize="7" fill="var(--ink)" fontWeight="600">Klander</text>
      <rect x="55" y="118" width="90" height="20" rx="9" fill="var(--surface-2)" />
    </Phone>
  ),
  'chrome-ios': (
    <Phone>
      <rect x="51" y="12" width="98" height="16" rx="8" fill="var(--surface-2)" /><rect x="58" y="17" width="54" height="6" rx="3" fill="var(--surface)" />
      <ShareIcon x={133} y={20} on />{ring(133, 20, 11)}
      <rect x="55" y="38" width="90" height="12" rx="4" fill="var(--accent)" /><rect x="55" y="56" width="60" height="8" rx="3" fill="var(--surface-2)" /><rect x="55" y="68" width="80" height="8" rx="3" fill="var(--surface-2)" />
    </Phone>
  ),
  'android-menu': (
    <Phone>
      <rect x="51" y="12" width="98" height="16" rx="8" fill="var(--surface-2)" /><rect x="58" y="17" width="60" height="6" rx="3" fill="var(--surface)" />
      <g fill="var(--accent)">{[-4, 0, 4].map(d => <circle key={d} cx="138" cy={20 + d} r="1.8" />)}</g>{ring(138, 20, 11)}
      <rect x="55" y="38" width="90" height="12" rx="4" fill="var(--accent)" /><rect x="55" y="56" width="60" height="8" rx="3" fill="var(--surface-2)" /><rect x="55" y="68" width="80" height="8" rx="3" fill="var(--surface-2)" />
    </Phone>
  ),
  'android-list': (
    <Phone>
      <rect x="82" y="12" width="68" height="104" rx="8" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      {[0, 1, 2, 4, 5].map(n => <rect key={n} x="88" y={20 + n * 16} width="54" height="7" rx="3" fill="var(--surface-2)" />)}
      <rect x="86" y="81" width="60" height="13" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" /><rect x="90" y="85" width="44" height="5" rx="2.5" fill="var(--accent)" />
    </Phone>
  ),
  'android-install': (
    <Phone>
      <rect x="52" y="44" width="96" height="62" rx="10" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <rect x="60" y="52" width="18" height="18" rx="5" fill="var(--accent)" /><rect x="84" y="56" width="44" height="7" rx="3" fill="var(--surface-2)" />
      <rect x="62" y="84" width="30" height="12" rx="6" fill="var(--surface-2)" /><rect x="104" y="84" width="36" height="12" rx="6" fill="var(--accent)" />{ring(122, 90, 16)}
    </Phone>
  ),
  'computer': (
    <svg viewBox="0 0 200 150" aria-hidden="true">
      <rect x="14" y="20" width="172" height="110" rx="10" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <rect x="14" y="20" width="172" height="22" rx="10" fill="var(--surface-2)" /><rect x="40" y="26" width="110" height="10" rx="5" fill="var(--surface)" />
      <g transform="translate(134 26)" stroke="var(--accent)" strokeWidth="1.6" fill="none"><rect x="0" y="0" width="12" height="9" rx="1.5" /><path d="M6 2.5v4M4 4.8l2 2 2-2" /></g>{ring(140, 31, 10)}
      <rect x="26" y="54" width="70" height="12" rx="4" fill="var(--accent)" /><rect x="26" y="72" width="140" height="8" rx="3" fill="var(--surface-2)" /><rect x="26" y="86" width="110" height="8" rx="3" fill="var(--surface-2)" />
    </svg>
  )
}

const STEPS = {
  iphone: [
    { art: 'ios-share', title: 'Tap Share', body: <>In Safari, tap the <b>Share</b> button (a square with an arrow going up). On iOS 26, tap <b>•••</b> next to the address bar first, then <b>Share</b>.</> },
    { art: 'ios-sheet', title: 'Tap Add to Home Screen', body: <>Scroll down the list and tap <b>Add to Home Screen</b>. Can't see it? Scroll to the bottom, tap <b>Edit Actions</b> and add it.</> },
    { art: 'ios-add', title: 'Tap Add', body: <>Leave <b>Open as Web App</b> switched on, then tap <b>Add</b> in the top corner.</> },
    { art: 'home', title: 'Open it from your Home Screen', body: <>Tap the new <b>Klander</b> icon. Sign in once more (the Home Screen app keeps its own sign-in), then tap the bell to turn on notifications.</> }
  ],
  'iphone-other': [
    { art: 'chrome-ios', title: 'Tap Share', body: <>In Chrome, tap the <b>Share</b> button in the address bar. (In other browsers, look for Share in the menu. If you can't find it, open klander.vercel.app in <b>Safari</b> instead.)</> },
    { art: 'ios-sheet', title: 'Tap Add to Home Screen', body: <>Scroll down and tap <b>Add to Home Screen</b>.</> },
    { art: 'ios-add', title: 'Tap Add', body: <>Tap <b>Add</b> in the top corner.</> },
    { art: 'home', title: 'Open it from your Home Screen', body: <>Tap the new <b>Klander</b> icon and sign in once more. Then tap the bell to turn on notifications.</> }
  ],
  android: [
    { art: 'android-menu', title: 'Open the menu', body: <>In Chrome, tap <b>⋮</b> in the top right. (Samsung Internet: tap <b>☰</b> at the bottom.)</> },
    { art: 'android-list', title: 'Tap Add to Home screen', body: <>Tap <b>Add to Home screen</b> or <b>Install app</b>. (Samsung Internet: <b>Add page to</b> → <b>Home screen</b>.)</> },
    { art: 'android-install', title: 'Tap Install', body: <>Tap <b>Install</b> (or <b>Add</b>). It may take a few seconds to appear.</> },
    { art: 'home', title: 'Open it from your Home Screen', body: <>Tap the <b>Klander</b> icon. It opens full screen, like a normal app. Turn on notifications from the bell.</> }
  ],
  computer: [
    { art: 'computer', title: 'Install it on your computer', body: <>In <b>Chrome</b> or <b>Edge</b>, click the install icon at the right of the address bar (or the menu → <b>Install Klander</b>). On a Mac in <b>Safari</b>: <b>File</b> → <b>Add to Dock</b>.</> },
    { art: 'home', title: 'Best on your phone', body: <>Klander is made for your phone. Open <b>klander.vercel.app</b> there and follow this guide again. It picks the right steps for your phone.</> }
  ]
}
const LABELS = [['iphone', 'iPhone'], ['android', 'Android'], ['computer', 'Computer']]

/** Step-by-step guide to putting Klander on your Home Screen, with pictures. */
export default function InstallSheet({ onClose }) {
  const here = platform()
  const [plat, setPlat] = useState(here)
  const [i, setI] = useState(0)
  const [done, setDone] = useState('')
  const ip = useInstallPrompt()
  const steps = STEPS[plat]
  const step = steps[Math.min(i, steps.length - 1)]
  const last = i >= steps.length - 1
  const pick = p => { setPlat(p === 'iphone' && here === 'iphone-other' ? 'iphone-other' : p); setI(0) }
  const tab = plat === 'iphone-other' ? 'iphone' : plat

  const oneTap = async () => {
    const r = await ip.prompt()
    if (r === 'accepted') setDone('Installed. Open Klander from your Home Screen.')
  }

  if (isInstalled()) return (
    <Sheet title="Home Screen" onClose={onClose}>
      <div className="install-art">{ART.home}</div>
      <h3 style={{ textAlign: 'center', margin: 0 }}>You're all set</h3>
      <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>You're already using Klander from your Home Screen. Notifications can be turned on from the bell.</p>
      <button className="btn primary block" onClick={onClose}>Done</button>
    </Sheet>
  )

  return (
    <Sheet title="Add to Home Screen" onClose={onClose}>
      <p className="small muted" style={{ margin: 0 }}>Klander then opens full screen like a normal app, loads faster, and can send you notifications. It takes 20 seconds.</p>
      <div className="seg" role="group" aria-label="Your device" style={{ width: '100%' }}>
        {LABELS.map(([k, l]) => <button key={k} style={{ flex: 1 }} aria-pressed={tab === k} onClick={() => pick(k)}>{l}</button>)}
      </div>

      {ip.canPrompt && plat !== 'iphone' && plat !== 'iphone-other' && (
        <div className="group install-quick">
          <b>Quickest way</b>
          <button className="btn primary block" onClick={oneTap}>Install Klander</button>
          <small className="muted">Or follow the steps below.</small>
        </div>
      )}
      {done && <p className="small" style={{ color: 'var(--good)', margin: 0 }}>{done}</p>}

      <div className="install-step" key={`${plat}-${i}`}>
        <div className="install-art">{ART[step.art]}</div>
        <small className="install-n">Step {i + 1} of {steps.length}</small>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </div>
      <div className="tour-dots" aria-hidden="true">{steps.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
      <div className="row">
        {i > 0 && <button className="btn grow" onClick={() => setI(i - 1)}>Back</button>}
        <button className="btn primary grow" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Done' : 'Next'}</button>
      </div>
      {plat === 'iphone' && <p className="small muted" style={{ margin: 0 }}>Tip: close this guide, do the steps, and come back to it any time from Help &amp; tips.</p>}
    </Sheet>
  )
}
