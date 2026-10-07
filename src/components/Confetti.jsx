import { useEffect, useRef } from 'react'

/** A short burst of confetti, drawn on a canvas, then removes itself. Respects reduced motion. */
export default function Confetti({ colours = ['#2b4cff', '#ff5d8f', '#ffb020', '#22c55e', '#a855f7'], onDone }) {
  const ref = useRef(null)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onDone?.(); return }
    const c = ref.current, ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = c.width = innerWidth * dpr, H = c.height = innerHeight * dpr
    const bits = Array.from({ length: 140 }, () => ({
      x: Math.random() * W, y: -Math.random() * H * 0.5, w: (6 + Math.random() * 6) * dpr, h: (8 + Math.random() * 8) * dpr,
      vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 3) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      c: colours[Math.floor(Math.random() * colours.length)]
    }))
    let raf, t0 = performance.now()
    const tick = t => {
      ctx.clearRect(0, 0, W, H)
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.vy += 0.05 * dpr; b.r += b.vr
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r))); ctx.restore()
      }
      if (t - t0 < 4500) raf = requestAnimationFrame(tick); else onDone?.()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <canvas ref={ref} className="confetti" style={{ width: '100%', height: '100%' }} aria-hidden="true" />
}
