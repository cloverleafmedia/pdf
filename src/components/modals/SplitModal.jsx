import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Scissors } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

function parseRanges(input, total) {
  const pages = new Set()
  const parts = input.split(',').map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      for (let i = Math.max(1, a); i <= Math.min(total, b || total); i++) pages.add(i)
    } else {
      const n = Number(part)
      if (n >= 1 && n <= total) pages.add(n)
    }
  }
  return [...pages].sort((a, b) => a - b)
}

export default function SplitModal() {
  const { t } = useTranslation()
  const { pdfBytes, totalPages, fileName, theme, closeSplit, setStatus } = useStore()
  const [mode, setMode]       = useState('range') // 'range' | 'each'
  const [rangeInput, setRangeInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState([])
  const isDark = theme === 'dark'

  const updatePreview = (val) => {
    setRangeInput(val)
    if (!val.trim()) { setPreview([]); return }
    setPreview(parseRanges(val, totalPages))
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
          const r = await window.api?.savePDF(`${fileName?.replace('.pdf','')||'dokument'}_Seite${p}.pdf`)
          if (!r?.canceled && r?.filePath) await window.api?.writeFile(r.filePath, bytes)
        }
      } else {
        const pages = parseRanges(rangeInput, totalPages)
        if (!pages.length) { setLoading(false); return }
        const src = await PDFDocument.load(pdfBytes)
        const out = await PDFDocument.create()
        const copied = await out.copyPages(src, pages.map(p => p - 1))
        copied.forEach(pg => out.addPage(pg))
        const bytes = await out.save()
        const r = await window.api?.savePDF(`${fileName?.replace('.pdf','')||'dokument'}_Split.pdf`)
        if (!r?.canceled && r?.filePath) {
          await window.api?.writeFile(r.filePath, bytes)
          setStatus(`${pages.length} Seite(n) extrahiert`)
        }
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
          ].map(opt => (
            <button key={opt.id} onClick={() => setMode(opt.id)}
              className={`flex-1 py-2 rounded-lg text-sm transition-colors border
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
