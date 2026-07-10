import React, { useState, useRef, useEffect } from 'react'
import QRCode from 'qrcode'
import { PDFDocument, degrees } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { reloadPdfDoc } from '../../lib/reloadPdfDoc'
import { visualPageSize, visualPointToRawPoint } from '../../lib/pageRotation'

const POSITIONS = [
  { id: 'top-left',     label: 'Oben links' },
  { id: 'top-right',    label: 'Oben rechts' },
  { id: 'bottom-left',  label: 'Unten links' },
  { id: 'bottom-right', label: 'Unten rechts' },
]

export default function QRCodeModal() {
  const {
    pdfBytes, filePath, fileName, currentPage, totalPages, theme, closeQRCode, setStatus, openDocument,
  } = useStore(useShallow(state => ({ pdfBytes: state.pdfBytes, filePath: state.filePath, fileName: state.fileName, currentPage: state.currentPage, totalPages: state.totalPages, theme: state.theme, closeQRCode: state.closeQRCode, setStatus: state.setStatus, openDocument: state.openDocument })))
  const isDark = theme === 'dark'
  const [text,     setText]    = useState('https://')
  const [size,     setSize]    = useState(80)
  const [position, setPos]     = useState('bottom-right')
  const [applyTo,  setApplyTo] = useState('current')  // current | all
  const [margin,   setMargin]  = useState(20)
  const [running,  setRunning] = useState(false)
  const previewRef             = useRef(null)

  useEffect(() => {
    if (!text.trim() || !previewRef.current) return
    QRCode.toCanvas(previewRef.current, text, { width: 100, margin: 1 }).catch(() => {})
  }, [text])

  const apply = async () => {
    if (!pdfBytes || !text.trim()) return
    setRunning(true)
    try {
      const canvas = document.createElement('canvas')
      await QRCode.toCanvas(canvas, text, { width: size * 4, margin: 1 })
      const pngData = canvas.toDataURL('image/png').split(',')[1]
      const pngBytes = Uint8Array.from(atob(pngData), c => c.charCodeAt(0))

      const doc  = await PDFDocument.load(pdfBytes)
      const img  = await doc.embedPng(pngBytes)

      const pages = applyTo === 'all'
        ? Array.from({ length: totalPages }, (_, i) => i)
        : [currentPage - 1]

      for (const pi of pages) {
        const page = doc.getPage(pi)
        const { width: pw, height: ph } = page.getSize()
        // "top-left" etc. are visual corners - a page with a native /Rotate
        // baked in (common for scanned documents) needs the corner mapped
        // through that rotation, or the code ends up on the wrong corner
        // (and, since it's never counter-rotated below, rotated itself) -
        // same class of bug already fixed for Kopf-/Fußzeile.
        const nativeRotation = page.getRotation().angle
        const { width: vw, height: vh } = visualPageSize(pw, ph, nativeRotation)
        let visualX, visualY
        switch (position) {
          case 'top-left':     visualX = margin;              visualY = vh - size - margin; break
          case 'top-right':    visualX = vw - size - margin;  visualY = vh - size - margin; break
          case 'bottom-left':  visualX = margin;              visualY = margin;              break
          case 'bottom-right': visualX = vw - size - margin;  visualY = margin;               break
          default:              visualX = vw - size - margin; visualY = margin
        }
        const { x, y } = visualPointToRawPoint(visualX, visualY, pw, ph, nativeRotation)
        page.drawImage(img, { x, y, width: size, height: size, rotate: nativeRotation ? degrees(-nativeRotation) : undefined })
      }

      const newBytes = await doc.save()
      const reloaded = await reloadPdfDoc(newBytes)
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setStatus('QR-Code eingebettet')
      closeQRCode()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  const inp = `w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`
  const lbl = `block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`

  return (
    <Modal isDark={isDark} onClose={closeQRCode} title="QR-Code einfügen">
      <div className="p-5 space-y-4 max-w-sm">
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            <div>
              <label className={lbl}>URL oder Text</label>
              <input className={inp} value={text} onChange={e => setText(e.target.value)}
                placeholder="https://beispiel.de" />
            </div>

            <div>
              <label className={lbl}>Größe: {size} pt</label>
              <input type="range" min={30} max={150} value={size} onChange={e => setSize(Number(e.target.value))}
                className="w-full accent-clover-500" />
            </div>

            <div>
              <label className={lbl}>Abstand zur Seite: {margin} pt</label>
              <input type="range" min={5} max={50} value={margin} onChange={e => setMargin(Number(e.target.value))}
                className="w-full accent-clover-500" />
            </div>
          </div>

          <div className="flex-shrink-0">
            <label className={lbl}>Vorschau</label>
            <div className={`rounded-lg overflow-hidden border ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
              <canvas ref={previewRef} width={100} height={100} />
            </div>
          </div>
        </div>

        <div>
          <label className={lbl}>Position</label>
          <div className="grid grid-cols-2 gap-1.5">
            {POSITIONS.map(p => (
              <button key={p.id} onClick={() => setPos(p.id)}
                className={`py-1.5 px-2 rounded-lg border text-xs transition-colors
                  ${position === p.id ? 'bg-clover-600 text-white border-clover-600' : isDark ? 'border-zinc-700 text-zinc-300 hover:border-zinc-600' : 'border-gray-200 text-gray-600'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={lbl}>Auf welche Seiten</label>
          <div className="flex gap-2">
            {[['current', `Nur S. ${currentPage}`], ['all', 'Alle Seiten']].map(([v, l]) => (
              <button key={v} onClick={() => setApplyTo(v)}
                className={`flex-1 py-1.5 rounded-lg border text-sm transition-colors
                  ${applyTo === v ? 'bg-clover-600 text-white border-clover-600' : isDark ? 'border-zinc-700 text-zinc-300' : 'border-gray-200 text-gray-600'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeQRCode}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={apply} disabled={running || !text.trim()}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50">
          {running ? 'Wird eingefügt …' : 'QR-Code einfügen'}
        </button>
      </div>
    </Modal>
  )
}
