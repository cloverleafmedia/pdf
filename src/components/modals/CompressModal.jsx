import React, { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

export default function CompressModal() {
  const { pdfBytes, filePath, fileName, theme, closeCompress, setStatus, openDocument } = useStore()
  const isDark = theme === 'dark'
  const [removeMetadata,  setRemoveMeta]  = useState(true)
  const [objectStreams,   setObjStreams]   = useState(true)
  const [running,         setRunning]      = useState(false)
  const [resultSize,      setResultSize]   = useState(null)

  const compress = async () => {
    if (!pdfBytes) return
    setRunning(true)
    setResultSize(null)
    try {
      const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

      if (removeMetadata) {
        doc.setTitle('')
        doc.setAuthor('')
        doc.setSubject('')
        doc.setKeywords([])
        doc.setProducer('')
        doc.setCreator('')
      }

      const newBytes = await doc.save({ useObjectStreams: objectStreams })
      setResultSize(newBytes.byteLength)

      // getDocument() transfers/detaches the buffer it's given — pass a copy.
      const reloaded = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setStatus(`Komprimiert: ${fmt(pdfBytes.byteLength)} → ${fmt(newBytes.byteLength)}`)
      closeCompress()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  const saved = pdfBytes && resultSize ? pdfBytes.byteLength - resultSize : 0
  const pct   = pdfBytes && resultSize ? Math.round((1 - resultSize / pdfBytes.byteLength) * 100) : 0

  return (
    <Modal isDark={isDark} onClose={closeCompress} title="PDF komprimieren">
      <div className="p-5 space-y-4 max-w-sm">
        <div className={`text-sm ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
          Aktuelle Größe: <span className="font-semibold">{fmt(pdfBytes?.byteLength || 0)}</span>
        </div>

        <Option isDark={isDark} checked={removeMetadata} onChange={setRemoveMeta}
          label="Metadaten entfernen"
          hint="Entfernt Autor, Titel, Schlüsselwörter und Erstellungsinformationen" />

        <Option isDark={isDark} checked={objectStreams} onChange={setObjStreams}
          label="Objekt-Streams aktivieren"
          hint="Komprimiert interne PDF-Strukturen (PDF 1.5+)" />

        <div className={`text-xs rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          Hinweis: Für maximale Komprimierung empfiehlt sich ein spezialisiertes Tool wie Ghostscript,
          da PDF-Bilddaten hiermit nicht verändert werden.
        </div>

        {resultSize && (
          <div className={`text-sm rounded-lg px-3 py-2 font-medium ${isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
            Ersparnis: {fmt(saved)} ({pct}% kleiner)
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeCompress}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={compress} disabled={running}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50">
          {running ? 'Wird komprimiert …' : 'Komprimieren'}
        </button>
      </div>
    </Modal>
  )
}

function Option({ isDark, checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 accent-clover-500 w-4 h-4 flex-shrink-0" />
      <div>
        <div className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{label}</div>
        <div className={`text-xs mt-0.5 ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{hint}</div>
      </div>
    </label>
  )
}

function fmt(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}
