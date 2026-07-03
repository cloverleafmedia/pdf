import React, { useState, useRef, useEffect, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

const HANDLE = 10   // handle square size in px

export default function CropModal() {
  const { pdfDoc, pdfBytes, filePath, fileName, currentPage, totalPages, theme, closeCrop, setStatus, openDocument } = useStore()
  const isDark    = theme === 'dark'
  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)

  const [pageSize, setPageSize] = useState({ w: 0, h: 0 })
  // Crop in %, origin top-left
  const [crop, setCrop]    = useState({ x: 5, y: 5, w: 90, h: 90 })
  const [applyTo, setApplyTo] = useState('current')
  const [running, setRunning] = useState(false)

  // drag state: { handle, sx, sy, startCrop }
  const dragRef = useRef(null)

  // ── Render preview ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    const render = async () => {
      const page  = await pdfDoc.getPage(currentPage)
      const vp0   = page.getViewport({ scale: 1 })
      const MAX   = 380
      const scale = MAX / Math.max(vp0.width, vp0.height)
      const vp    = page.getViewport({ scale })
      const canvas = canvasRef.current
      canvas.width  = Math.round(vp.width)
      canvas.height = Math.round(vp.height)
      if (!cancelled)
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
      setPageSize({ w: canvas.width, h: canvas.height })
    }
    render().catch(() => {})
    return () => { cancelled = true }
  }, [pdfDoc, currentPage])

  // ── Mouse handlers on the wrap div ─────────────────────────────────────
  const pxToPct = useCallback((dx, dy) => ({
    dx: pageSize.w ? (dx / pageSize.w) * 100 : 0,
    dy: pageSize.h ? (dy / pageSize.h) * 100 : 0,
  }), [pageSize])

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const { dx, dy } = pxToPct(e.clientX - d.sx, e.clientY - d.sy)
      const { x, y, w, h } = d.startCrop
      const MIN = 5

      let nx = x, ny = y, nw = w, nh = h

      if (d.handle === 'move') {
        nx = Math.max(0, Math.min(x + dx, 100 - w))
        ny = Math.max(0, Math.min(y + dy, 100 - h))
      } else {
        if (d.handle.includes('w')) { nx = Math.min(x + dx, x + w - MIN); nw = w - (nx - x) }
        if (d.handle.includes('e')) { nw = Math.max(MIN, w + dx) }
        if (d.handle.includes('n')) { ny = Math.min(y + dy, y + h - MIN); nh = h - (ny - y) }
        if (d.handle.includes('s')) { nh = Math.max(MIN, h + dy) }

        nx = Math.max(0, nx); ny = Math.max(0, ny)
        nw = Math.min(nw, 100 - nx); nh = Math.min(nh, 100 - ny)
      }

      setCrop({ x: nx, y: ny, w: nw, h: nh })
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [pxToPct])

  const startDrag = (e, handle) => {
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { handle, sx: e.clientX, sy: e.clientY, startCrop: { ...crop } }
  }

  // ── Apply crop via pdf-lib ─────────────────────────────────────────────
  const applyCrop = async () => {
    if (!pdfBytes) return
    setRunning(true)
    try {
      const doc   = await PDFDocument.load(pdfBytes)
      const pages = applyTo === 'all' ? doc.getPages() : [doc.getPage(currentPage - 1)]
      for (const page of pages) {
        const { width: pw, height: ph } = page.getSize()
        // setCropBox(x_left, y_bottom, width, height)  — PDF coords: y=0 at bottom
        page.setCropBox(
          (crop.x / 100) * pw,
          (1 - (crop.y + crop.h) / 100) * ph,
          (crop.w / 100) * pw,
          (crop.h / 100) * ph,
        )
      }
      const newBytes = await doc.save()
      const reloaded = await pdfjsLib.getDocument({ data: newBytes }).promise
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setStatus('Beschnitt angewendet (nicht-destruktiv)')
      closeCrop()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  // Layout helpers
  const px = (pct) => (pct / 100) * pageSize.w
  const py = (pct) => (pct / 100) * pageSize.h

  const handles = [
    { id: 'nw', x: px(crop.x),           y: py(crop.y)           },
    { id: 'n',  x: px(crop.x + crop.w/2),y: py(crop.y)           },
    { id: 'ne', x: px(crop.x + crop.w),  y: py(crop.y)           },
    { id: 'w',  x: px(crop.x),           y: py(crop.y + crop.h/2)},
    { id: 'e',  x: px(crop.x + crop.w),  y: py(crop.y + crop.h/2)},
    { id: 'sw', x: px(crop.x),           y: py(crop.y + crop.h)  },
    { id: 's',  x: px(crop.x + crop.w/2),y: py(crop.y + crop.h)  },
    { id: 'se', x: px(crop.x + crop.w),  y: py(crop.y + crop.h)  },
  ]

  const cursor = { nw:'nw-resize', n:'n-resize', ne:'ne-resize', w:'w-resize', e:'e-resize', sw:'sw-resize', s:'s-resize', se:'se-resize', move:'move' }

  return (
    <Modal isDark={isDark} onClose={closeCrop} title="Seite beschneiden">
      <div className="p-5 space-y-4">

        {/* Preview canvas with crop overlay */}
        <div ref={wrapRef} className="relative inline-block select-none overflow-hidden rounded"
          style={{ width: pageSize.w || 380, height: pageSize.h || 537 }}>

          <canvas ref={canvasRef} className="block absolute top-0 left-0" />

          {/* 4 dim areas outside the crop rect */}
          {pageSize.w > 0 && (<>
            {/* top */}
            <div className="absolute left-0 right-0 top-0 bg-black/50 pointer-events-none"
              style={{ height: py(crop.y) }} />
            {/* bottom */}
            <div className="absolute left-0 right-0 bottom-0 bg-black/50 pointer-events-none"
              style={{ height: pageSize.h - py(crop.y + crop.h) }} />
            {/* left */}
            <div className="absolute bg-black/50 pointer-events-none"
              style={{ top: py(crop.y), height: py(crop.h), left: 0, width: px(crop.x) }} />
            {/* right */}
            <div className="absolute bg-black/50 pointer-events-none"
              style={{ top: py(crop.y), height: py(crop.h), left: px(crop.x + crop.w), right: 0 }} />

            {/* Crop rect border + move drag area */}
            <div className="absolute border-2 border-white/80"
              style={{
                left: px(crop.x), top: py(crop.y),
                width: px(crop.w), height: py(crop.h),
                cursor: 'move',
                boxSizing: 'border-box',
              }}
              onMouseDown={e => startDrag(e, 'move')} />

            {/* Handles */}
            {handles.map(h => (
              <div key={h.id}
                className="absolute bg-white border border-gray-600 shadow"
                style={{
                  width: HANDLE, height: HANDLE,
                  left: h.x - HANDLE / 2,
                  top:  h.y - HANDLE / 2,
                  cursor: cursor[h.id],
                  zIndex: 10,
                }}
                onMouseDown={e => startDrag(e, h.id)} />
            ))}
          </>)}
        </div>

        {/* Numeric controls */}
        <div className="grid grid-cols-4 gap-2">
          {[['Links %', 'x'], ['Oben %', 'y'], ['Breite %', 'w'], ['Höhe %', 'h']].map(([l, k]) => (
            <div key={k}>
              <label className={`block text-xs mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{l}</label>
              <input type="number" min={0} max={100} value={Math.round(crop[k])}
                onChange={e => setCrop(c => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value)))
                  return { ...c, [k]: v }
                })}
                className={`w-full px-2 py-1 text-sm rounded border outline-none focus:border-clover-500
                  ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`}
              />
            </div>
          ))}
        </div>

        {/* Apply-to */}
        <div className="flex gap-2">
          {[['current', `Nur Seite ${currentPage}`], ['all', 'Alle Seiten']].map(([v, l]) => (
            <button key={v} onClick={() => setApplyTo(v)}
              className={`flex-1 py-1.5 rounded-lg border text-sm transition-colors
                ${applyTo === v ? 'bg-clover-600 text-white border-clover-600' : isDark ? 'border-zinc-700 text-zinc-300' : 'border-gray-200 text-gray-600'}`}>
              {l}
            </button>
          ))}
        </div>

        <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          CropBox ist nicht-destruktiv — der Originalinhalt bleibt erhalten.
        </p>
      </div>

      <div className={`flex justify-between px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={() => setCrop({ x: 0, y: 0, w: 100, h: 100 })}
          className={`px-3 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-500 hover:bg-gray-100'}`}>
          Zurücksetzen
        </button>
        <div className="flex gap-2">
          <button onClick={closeCrop}
            className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
            Abbrechen
          </button>
          <button onClick={applyCrop} disabled={running}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white disabled:opacity-50">
            {running ? 'Wird angewendet …' : 'Anwenden'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
