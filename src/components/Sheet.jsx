import { useEffect } from 'react'

export default function Sheet({ title, onClose, children, actions }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <h2 style={{ textAlign: 'center' }}>{title}</h2>
          <div style={{ minWidth: 70, display: 'flex', justifyContent: 'flex-end' }}>{actions}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
