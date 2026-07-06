import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// ── Floating menu plumbing ───────────────────────────────────────────────
// The toolbar row uses `overflow-x-auto`, and per the CSS spec that forces
// the other axis to `overflow-y: auto` too — so any dropdown positioned
// `absolute` inside the row gets silently clipped to the row's own height.
// Rendering dropdown content through a portal, positioned `fixed` from the
// trigger's own bounding rect, sidesteps that clipping entirely.
export function useFloatingMenu({ placement = 'below' } = {}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const menuRef   = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    const update = () => {
      if (!anchorRef.current) return
      const r = anchorRef.current.getBoundingClientRect()
      // 'above' anchors the menu to the bottom edge of the viewport (growing
      // upward) instead of a fixed `top`, since a status-bar trigger sits at
      // the very bottom of the window and a downward menu would run offscreen.
      setPos(placement === 'above'
        ? { bottom: window.innerHeight - r.top + 4, left: r.left }
        : { top: r.bottom + 4, left: r.left })
    }
    update()
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('resize', update)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return { open, setOpen, anchorRef, menuRef, pos }
}

export function FloatingMenu({ open, pos, menuRef, children }) {
  if (!open) return null
  return createPortal(
    <div ref={menuRef} style={{ position: 'fixed', ...pos, zIndex: 9999 }}>
      {children}
    </div>,
    document.body
  )
}
