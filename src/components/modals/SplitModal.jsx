import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Scissors } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { saveAsNewFile } from '../../lib/saveAsNewFile'
import { resolveOutlineBookmarks, bookmarksToRanges } from '../../lib/resolveOutlineDest'
import { parsePageRanges } from '../../lib/parsePageRanges'

// Windows-invalid filename characters + control chars, collapsed to '_'.
function sanitizeFilename(name) {
  const cleaned = (name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  return cleaned || 'Lesezeichen'
}

export default function SplitModal() {
  const { t } = useTranslation()
  const {
    pdfDoc, pdfBytes, totalPages, fileName, theme, closeSplit, setStatus,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, pdfBytes: state.pdfBytes, totalPages: state.totalPages, fileName: state.fileName, theme: state.theme, closeSplit: state.closeSplit, setStatus: state.setStatus })))
  const [mode, setMode]       = useState('range') // 'range' | 'each' | 'bookmarks'
  const [rangeInput, setRangeInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState([])
  const [bookmarkRanges, setBookmarkRanges] = useState(null) // null = loading, [] = none found
  const isDark = theme === 'dark'

  useEffect(() => {
    if (!pdfDoc) return
    pdfDoc.getOutline()
      .then(outline => resolveOutlineBookmarks(pdfDoc, outline || []))
      .then(bookmarks => setBookmarkRanges(bookmarksToRanges(bookmarks, totalPages)))
      .catch(() => setBookmarkRanges([]))
  }, [pdfDoc, totalPages])

  const updatePreview = (val) => {
    setRangeInput(val)
    if (!val.trim()) { setPreview([]); return }
    setPreview(parsePageRanges(val, totalPages))
  }

  const run = async () => {
    if (!pdfBytes) return
    try {
      setLoading(true)

      if (mode === 'each') {
        // Save each page as a separate file
        for (let p = 1; p <= totalPages; p++) {
          const src = await PDFDocument.load(pdfBytes)
          const out = await PDFDocument.create()
          const [copied] = await out.copyPages(src, [p - 1])
          out.addPage(copied)
          const bytes = await out.save()
          await saveAsNewFile(`${fileName?.replace('.pdf','')||'dokument'}_Seite${p}.pdf`, bytes)
        }
      } else if (mode === 'bookmarks') {
        if (!bookmarkRanges?.length) { setLoading(false); return }
        for (const range of bookmarkRanges) {
          const src = await PDFDocument.load(pdfBytes)
          const out = await PDFDocument.create()
          const pageIndices = []
          for (let i = range.startPageIndex; i <= range.endPageIndex; i++) pageIndices.push(i)
          const copied = await out.copyPages(src, pageIndices)
          copied.forEach(pg => out.addPage(pg))
          const bytes = await out.save()
          await saveAsNewFile(`${sanitizeFilename(range.title)}.pdf`, bytes)
        }
        setStatus(`${bookmarkRanges.length} Datei(en) nach Lesezeichen erstellt`)
      } else {
        const pages = parsePageRanges(rangeInput, totalPages)
        if (!pages.length) { setLoading(false); return }
        const src = await PDFDocument.load(pdfBytes)
        const out = await PDFDocument.create()
        const copied = await out.copyPages(src, pages.map(p => p - 1))
        copied.forEach(pg => out.addPage(pg))
        const bytes = await out.save()
        const savedPath = await saveAsNewFile(`${fileName?.replace('.pdf','')||'dokument'}_Split.pdf`, bytes)
        if (savedPath) setStatus(`${pages.length} Seite(n) extrahiert`)
      }
      setLoading(false)
      closeSplit()
    } catch (e) { setLoading(false); setStatus('Fehler: ' + e.message) }
  }

  return (
    <Modal isDark={isDark} onClose={closeSplit} title="PDF teilen / Seiten extrahieren">
      <div className="p-5 space-y-4">

        {/* Mode */}
        <div className="flex gap-2">
          {[
            { id: 'range', label: 'Seitenbereich' },
            { id: 'each',  label: 'Jede Seite einzeln' },
            { id: 'bookmarks', label: 'Nach Lesezeichen', disabled: !bookmarkRanges?.length },
          ].map(opt => (
            <button key={opt.id} onClick={() => !opt.disabled && setMode(opt.id)} disabled={opt.disabled}
              title={opt.disabled ? 'Dieses Dokument hat keine (Top-Level-)Lesezeichen' : undefined}
              className={`flex-1 py-2 rounded-lg text-sm transition-colors border disabled:opacity-40 disabled:cursor-default
                ${mode === opt.id
                  ? 'border-clover-500 bg-clover-600 text-white'
                  : isDark ? 'border-zinc-700 text-zinc-400 hover:border-zinc-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {mode === 'range' && (
          <>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Seiten (z.B. <code className="font-mono">1-3, 5, 7-9</code>)
              </label>
              <input
                className={`w-full px-3 py-2 rounded-lg border text-sm
                  ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}
                  focus:outline-none focus:border-clover-500`}
                placeholder="z.B. 1-5, 8, 10-12"
                value={rangeInput}
                onChange={e => updatePreview(e.target.value)}
              />
            </div>

            {preview.length > 0 && (
              <div className={`text-xs p-2 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-50 text-gray-500'}`}>
                <span className="font-medium text-clover-400">{preview.length}</span> Seite(n): {preview.join(', ')}
              </div>
            )}
          </>
        )}

        {mode === 'each' && (
          <div className={`text-xs p-3 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-50 text-gray-500'}`}>
            Es werden <span className="font-medium text-clover-400">{totalPages}</span> separate PDF-Dateien erstellt.
            Du wirst für jede Datei nach einem Speicherort gefragt.
          </div>
        )}

        {mode === 'bookmarks' && (
          <div className="space-y-2">
            <div className={`text-xs p-2 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-50 text-gray-500'}`}>
              Es werden <span className="font-medium text-clover-400">{bookmarkRanges?.length || 0}</span> Datei(en) erstellt,
              eine je Top-Level-Lesezeichen. Du wirst für jede Datei nach einem Speicherort gefragt.
            </div>
            <div className={`text-xs rounded border divide-y max-h-40 overflow-y-auto ${isDark ? 'border-zinc-700 divide-zinc-700' : 'border-gray-200 divide-gray-200'}`}>
              {(bookmarkRanges || []).map((r, i) => (
                <div key={i} className={`px-2 py-1.5 flex justify-between gap-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                  <span className="truncate">{r.title || '(ohne Titel)'}</span>
                  <span className={`flex-shrink-0 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                    S. {r.startPageIndex + 1}–{r.endPageIndex + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeSplit}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={run} disabled={loading || (mode === 'range' && !preview.length)}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 disabled:opacity-50 text-white transition-colors">
          <Scissors size={14}/>
          {loading ? 'Verarbeite …' : 'Extrahieren'}
        </button>
      </div>
    </Modal>
  )
}
