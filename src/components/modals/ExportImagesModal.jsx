import React, { useState } from 'react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'

const DPI_OPTIONS = [72, 96, 150, 300]

export default function ExportImagesModal() {
  const {
    pdfDoc, totalPages, currentPage, theme, closeExportImages, setStatus,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, totalPages: state.totalPages, currentPage: state.currentPage, theme: state.theme, closeExportImages: state.closeExportImages, setStatus: state.setStatus })))
  const isDark  = theme === 'dark'
  const [format,   setFormat]  = useState('png')
  const [dpi,      setDpi]     = useState(150)
  const [mode,     setMode]    = useState('all')   // all | current | range
  const [from,     setFrom]    = useState(1)
  const [to,       setTo]      = useState(totalPages)
  const [quality,  setQuality] = useState(90)
  const [running,  setRunning] = useState(false)

  const pageRange = () => {
    if (mode === 'current') return [currentPage]
    if (mode === 'range') return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const exportImages = async () => {
    if (!pdfDoc) return
    const pages = pageRange().filter(n => n >= 1 && n <= totalPages)
    if (!pages.length) return
    setRunning(true)
    setStatus('Wähle Ausgabeordner …')
    try {
      const res = await window.api?.saveDirectory()
      if (res?.canceled || !res?.filePaths?.[0]) { setRunning(false); setStatus(''); return }
      const dir = res.filePaths[0]
      const scale = dpi / 72
      let done = 0
      const baseName = 'seite'

      for (const n of pages) {
        setStatus(`Exportiere Seite ${n} …`)
        const page    = await pdfDoc.getPage(n)
        const vp      = page.getViewport({ scale })
        const canvas  = document.createElement('canvas')
        canvas.width  = vp.width
        canvas.height = vp.height
        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport: vp }).promise

        const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
        const blob     = await new Promise(res2 => canvas.toBlob(res2, mimeType, quality / 100))
        const buf      = await blob.arrayBuffer()
        const suffix   = format === 'jpg' ? 'jpg' : 'png'
        const outPath  = `${dir}/${baseName}_${String(n).padStart(3, '0')}.${suffix}`
        await window.api?.writeFile(outPath, new Uint8Array(buf))
        done++
      }

      setStatus(`${done} Seite(n) exportiert nach ${dir}`)
      closeExportImages()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  const inp = `w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`
  const lbl = `block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`

  return (
    <Modal isDark={isDark} onClose={closeExportImages} title="Seiten als Bilder exportieren">
      <div className="p-5 space-y-4 max-w-sm">
        {/* Format */}
        <div>
          <label className={lbl}>Format</label>
          <div className="flex gap-2">
            {['png', 'jpg'].map(f => (
              <button key={f} onClick={() => setFormat(f)}
                className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition-colors uppercase
                  ${format === f ? 'bg-clover-600 text-white border-clover-600' : isDark ? 'border-zinc-700 text-zinc-300 hover:border-zinc-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div>
          <label className={lbl}>Auflösung</label>
          <div className="flex gap-2">
            {DPI_OPTIONS.map(d => (
              <button key={d} onClick={() => setDpi(d)}
                className={`flex-1 py-1.5 rounded-lg border text-sm transition-colors
                  ${dpi === d ? 'bg-clover-600 text-white border-clover-600' : isDark ? 'border-zinc-700 text-zinc-300 hover:border-zinc-600' : 'border-gray-200 text-gray-600'}`}>
                {d}
              </button>
            ))}
          </div>
          <div className={`text-xs mt-1 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>DPI — höher = bessere Qualität, größere Dateien</div>
        </div>

        {/* Quality (JPEG only) */}
        {format === 'jpg' && (
          <div>
            <label className={lbl}>JPEG-Qualität: {quality}%</label>
            <input type="range" min={50} max={100} value={quality} onChange={e => setQuality(Number(e.target.value))}
              className="w-full accent-clover-500" />
          </div>
        )}

        {/* Page range */}
        <div>
          <label className={lbl}>Seiten</label>
          <div className="flex gap-2 mb-2">
            {[['all','Alle'], ['current','Aktuelle'], ['range','Bereich']].map(([v,l]) => (
              <button key={v} onClick={() => setMode(v)}
                className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors
                  ${mode === v ? 'bg-clover-600 text-white border-clover-600' : isDark ? 'border-zinc-700 text-zinc-300' : 'border-gray-200 text-gray-600'}`}>
                {l}
              </button>
            ))}
          </div>
          {mode === 'range' && (
            <div className="flex gap-2 items-center">
              <input type="number" min={1} max={totalPages} value={from} onChange={e => setFrom(Number(e.target.value))} className={inp + ' w-20'} />
              <span className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>–</span>
              <input type="number" min={1} max={totalPages} value={to} onChange={e => setTo(Number(e.target.value))} className={inp + ' w-20'} />
            </div>
          )}
        </div>

        <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          {pageRange().filter(n => n >= 1 && n <= totalPages).length} Seite(n) werden exportiert
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeExportImages}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={exportImages} disabled={running}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50">
          {running ? 'Exportiere …' : 'Exportieren'}
        </button>
      </div>
    </Modal>
  )
}
