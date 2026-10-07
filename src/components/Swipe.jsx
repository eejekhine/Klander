import { useRef, useState } from 'react'

/**
 * Swipe left/right to move between weeks (or days/months).
 * The content follows your finger, then slides out and the next period slides in.
 * Vertical scrolling still works normally (touch-action: pan-y).
 */
export default function Swipe({ onSwipe, children, disabled = false }) {
  const ref = useRef(null)
  const g = useRef(null) // gesture state
  const moved = useRef(false)
  const [dx, setDx] = useState(0)
  const [anim, setAnim] = useState(false)

  const reset = () => { g.current = null; setAnim(true); setDx(0) }

  const down = e => {
    if (disabled || e.button > 0) return
    g.current = { x: e.clientX, y: e.clientY, t: performance.now(), dir: null, id: e.pointerId }
    moved.current = false
  }
  const move = e => {
    const s = g.current
    if (!s || s.id !== e.pointerId) return
    const ddx = e.clientX - s.x, ddy = e.clientY - s.y
    if (!s.dir) {
      if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.3) { s.dir = 'h'; moved.current = true; try { ref.current.setPointerCapture(e.pointerId) } catch { /* ignore */ } setAnim(false) }
      else if (Math.abs(ddy) > 12) { g.current = null; return }
      else return
    }
    setDx(ddx * 0.92)
  }
  const up = e => {
    const s = g.current
    if (!s || s.dir !== 'h') { g.current = null; return }
    const ddx = e.clientX - s.x
    const v = Math.abs(ddx) / Math.max(1, performance.now() - s.t)
    const w = ref.current?.offsetWidth || 360
    g.current = null
    if (Math.abs(ddx) > w * 0.22 || (v > 0.45 && Math.abs(ddx) > 30)) {
      const dir = ddx < 0 ? 1 : -1
      setAnim(true); setDx(-dir * w)
      setTimeout(() => {
        onSwipe(dir)
        setAnim(false); setDx(dir * w * 0.6)
        requestAnimationFrame(() => requestAnimationFrame(() => { setAnim(true); setDx(0) }))
      }, 150)
    } else reset()
  }
  // A swipe shouldn't also count as tapping the event under your finger
  const clickCapture = e => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false } }

  return (
    <div ref={ref} className="swipe" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={reset} onClickCapture={clickCapture}
      style={{ transform: dx ? `translate3d(${dx}px,0,0)` : undefined, transition: anim ? 'transform .16s cubic-bezier(.2,.7,.3,1)' : 'none', opacity: dx ? Math.max(0.55, 1 - Math.abs(dx) / 900) : 1 }}>
      {children}
    </div>
  )
}
