import React, { useState } from 'react'
import { Images, ArrowUp, ArrowDown, X, FilePlus } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { saveAsNewFile } from '../../lib/saveAsNewFile'

// Images are assumed scanned/exported at 96 DPI (the same convention the
// screen uses) so a typical photo becomes a plausible physical page size
// instead of a page literally as many points wide as the image is pixels.
const ASSUMED_DPI = 96
const PT_PER_PX = 72 / ASSUMED_DPI

export default function ImagesToPdfModal() {
  const {
    theme, closeImagesToPdf, setStatus, fileName,
  } = useStore(useShallow(state => ({ theme: state.theme, closeImagesToPdf: state.closeImagesToPdf, setStatus: state.setStatus, fileName: state.fileName })))
  const isDark = theme === 'dark'

  const [files,   setFiles]   = useState([]) // [{ path, name }]
  const [running, setRunning] = useState(false)

  const pickImages = async () => {
    const r = await window.api?.openImages()
    if (r?.canceled || !r?.filePaths?.length) return
    setFiles(prev => [...prev, ...r.filePaths.map(p => ({ path: p, name: p.split(/[\\/]/).pop() }))])
  }

  const remove = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx))
  const move = (idx, dir) => setFiles(prev => {
    const next = [...prev]
    const target = idx + dir
    if (target < 0 || target >= next.length) return prev
    ;[next[idx], next[target]] = [next[target], next[idx]]
    return next
  })

  const build = async () => {
    if (!files.length) return
    setRunning(true)
    try {
      setStatus('Erstelle PDF aus Bildern …')
      const doc = await PDFDocument.create()
      for (const f of files) {
        const buf = await window.api?.readFile(f.path)
        const bytes = new Uint8Array(buf)
        const isJpg = /\.jpe?g$/i.test(f.path)
        const image = isJpg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
        const pw = image.width * PT_PER_PX
        const ph = image.height * PT_PER_PX
        const page = doc.addPage([pw, ph])
        page.drawImage(image, { x: 0, y: 0, width: pw, height: ph })
      }
      const pdfBytes = await doc.save()

      const savedPath = await saveAsNewFile('bilder.pdf', pdfBytes)
      if (!savedPath) { setStatus(''); return }
      window._loadPDF?.(savedPath, !!fileName)
      setStatus(`PDF aus ${files.length} Bild(ern) erstellt`)
      closeImagesToPdf()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal isDark={isDark} onClose={closeImagesToPdf} title="Bilder zu PDF">
      <div className="p-5 space-y-4" style={{ minWidth: 420 }}>
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <Images size={14} className="flex-shrink-0 mt-0.5"/>
          <span>Fügt mehrere JPG/PNG-Bilder zu einem neuen PDF zusammen — eine Seite pro Bild, in der Reihenfolge unten.</span>
        </div>

        <button onClick={pickImages}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors
            ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
          <FilePlus size={14}/> Bilder auswählen …
        </button>

        {files.length > 0 && (
          <div className={`rounded-lg border divide-y max-h-64 overflow-y-auto ${isDark ? 'border-zinc-700 divide-zinc-700' : 'border-gray-200 divide-gray-100'}`}>
            {files.map((f, i) => (
              <div key={f.path + i} className="flex items-center gap-2 px-3 py-1.5">
                <span className={`text-[11px] w-5 text-right tabular-nums ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{i + 1}</span>
                <span className={`flex-1 text-xs truncate ${isDark ? 'text-zinc-200' : 'text-gray-800'}`} title={f.name}>{f.name}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className={`p-1 rounded disabled:opacity-30 ${isDark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`}><ArrowUp size={13}/></button>
                <button onClick={() => move(i, 1)} disabled={i === files.length - 1}
                  className={`p-1 rounded disabled:opacity-30 ${isDark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`}><ArrowDown size={13}/></button>
                <button onClick={() => remove(i)}
                  className={`p-1 rounded ${isDark ? 'hover:bg-red-900/40 text-red-400' : 'hover:bg-red-50 text-red-500'}`}><X size={13}/></button>
              </div>
            ))}
          </div>
        )}

        <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          {files.length} Bild(er) ausgewählt
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeImagesToPdf}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={build} disabled={running || !files.length}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <Images size={14}/> {running ? 'Wird erstellt …' : 'PDF erstellen …'}
        </button>
      </div>
    </Modal>
  )
}
