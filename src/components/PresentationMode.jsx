import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../store/useStore'
import { ChevronLeft, ChevronRight, X, Maximize2 } from 'lucide-react'

export default function PresentationMode() {
  const { pdfDoc, totalPages, currentPage, togglePresentation, nightMode } = useStore()
  const [page, setPage]     = useState(currentPage)
  const [size, setSize]     = useState({ w: 0, h: 0 })
  const [ui,   setUi]       = useState(true)
  const canvasRef           = useRef(null)
  const renderTaskRef       = useRef(null)
  const uiTimer             = useRef(null)

  const clamp = (n) => Math.max(1, Math.min(n, totalPages))

  const go = useCallback((delta) => setPage(p => clamp(p + delta)), [totalPages])

  // Render current page filling the viewport
  useEffect(() => {
    const render = async () => {
      if (!pdfDoc || !canvasRef.current) return
      const pg      = await pdfDoc.getPage(page)
      const vp0     = pg.getViewport({ scale: 1 })
      const scale   = Math.min(window.innerWidth / vp0.width, window.innerHeight / vp0.height)
      const vp      = pg.getViewport({ scale })
      const canvas  = canvasRef.current
      const dpr     = window.devicePixelRatio || 1
      canvas.width  = vp.width  * dpr
      canvas.height = vp.height * dpr
      canvas.style.width  = vp.width  + 'px'
      canvas.style.height = vp.height + 'px'
      setSize({ w: vp.width, h: vp.height })
      renderTaskRef.current?.cancel()
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      renderTaskRef.current = pg.render({ canvasContext: ctx, viewport: vp })
      try {
        await renderTaskRef.current.promise
        if (nightMode) canvas.style.filter = 'invert(1) hue-rotate(180deg)'
        else canvas.style.filter = ''
      } catch (_) {}
    }
    render()
    return () => renderTaskRef.current?.cancel()
  }, [pdfDoc, page, nightMode])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')                          { togglePresentation(); return }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1) }
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')  { e.preventDefault(); go(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, togglePresentation])

  // Auto-hide UI on mouse idle
  const resetUiTimer = () => {
    setUi(true)
    clearTimeout(uiTimer.current)
    uiTimer.current = setTimeout(() => setUi(false), 2500)
  }
  useEffect(() => { resetUiTimer(); return () => clearTimeout(uiTimer.current) }, [])

  return (
    <div
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
      onMouseMove={resetUiTimer}
      onClick={resetUiTimer}
      style={{ cursor: ui ? 'default' : 'none' }}
    >
      {/* PDF canvas */}
      <canvas ref={canvasRef} className="block shadow-2xl" />

      {/* Page counter */}
      {ui && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
          <button onClick={() => go(-1)} disabled={page <= 1}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors disabled:opacity-30">
            <ChevronLeft size={20}/>
          </button>
          <span className="text-white/80 text-sm font-medium tabular-nums select-none">
            {page} / {totalPages}
          </span>
          <button onClick={() => go(1)} disabled={page >= totalPages}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors disabled:opacity-30">
            <ChevronRight size={20}/>
          </button>
        </div>
      )}

      {/* Close button */}
      {ui && (
        <button onClick={togglePresentation}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          title="Beenden (Esc)">
          <X size={18}/>
        </button>
      )}

      {/* Slide area clickable for next/prev */}
      <div className="absolute inset-0 flex" style={{ pointerEvents: 'none' }}>
        <div className="flex-1" style={{ pointerEvents: 'all', cursor: ui ? 'w-resize' : 'none' }}
          onClick={() => go(-1)} />
        <div style={{ width: size.w, pointerEvents: 'none' }} />
        <div className="flex-1" style={{ pointerEvents: 'all', cursor: ui ? 'e-resize' : 'none' }}
          onClick={() => go(1)} />
      </div>
    </div>
  )
}
