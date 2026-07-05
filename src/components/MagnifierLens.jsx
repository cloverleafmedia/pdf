import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'

const LENS_SIZE   = 200
const ZOOM_FACTOR = 3

export default function MagnifierLens({ containerRef }) {
  const {
    magnifierActive,
  } = useStore(useShallow(state => ({ magnifierActive: state.magnifierActive })))
  const [pos,     setPos]     = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)
  const lensRef               = useRef(null)

  useEffect(() => {
    if (!magnifierActive) { setVisible(false); return }
    const el = containerRef?.current
    if (!el) return

    const onMove = (e) => {
      setPos({ x: e.clientX, y: e.clientY })

      // Find PDF page canvas at this mouse position
      // Walk up from point; PDF canvases have no data-overlay attribute
      const el2 = document.elementFromPoint(e.clientX, e.clientY)
      const pageWrap = el2?.closest('[data-page]')
      if (!pageWrap) { setVisible(false); return }

      // First canvas inside the page wrapper is the PDF render canvas (not the overlay)
      const pdfCanvas = pageWrap.querySelector('canvas:first-of-type')
      if (!pdfCanvas) { setVisible(false); return }

      const cr = pdfCanvas.getBoundingClientRect()
      if (cr.width === 0 || cr.height === 0) { setVisible(false); return }

      // Cursor position in canvas pixel space
      const px = ((e.clientX - cr.left) / cr.width)  * pdfCanvas.width
      const py = ((e.clientY - cr.top)  / cr.height) * pdfCanvas.height

      const lens = lensRef.current
      if (!lens) return
      setVisible(true)

      const ctx     = lens.getContext('2d')
      const srcSize = LENS_SIZE / ZOOM_FACTOR   // source region in canvas pixels
      ctx.clearRect(0, 0, LENS_SIZE, LENS_SIZE)
      try {
        ctx.drawImage(
          pdfCanvas,
          px - srcSize / 2, py - srcSize / 2, srcSize, srcSize,
          0, 0, LENS_SIZE, LENS_SIZE,
        )
      } catch (_) {}
    }

    const onLeave = () => setVisible(false)
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave) }
  }, [magnifierActive, containerRef])

  if (!magnifierActive || !visible) return null

  const OFFSET = 24
  const left = pos.x + OFFSET + LENS_SIZE > window.innerWidth  ? pos.x - LENS_SIZE - OFFSET : pos.x + OFFSET
  const top  = pos.y + OFFSET + LENS_SIZE > window.innerHeight ? pos.y - LENS_SIZE - OFFSET : pos.y + OFFSET

  return (
    <div
      className="fixed z-[100] pointer-events-none rounded-full overflow-hidden shadow-2xl ring-2 ring-clover-500"
      style={{ left, top, width: LENS_SIZE, height: LENS_SIZE }}>
      <canvas ref={lensRef} width={LENS_SIZE} height={LENS_SIZE} className="block" />
    </div>
  )
}
