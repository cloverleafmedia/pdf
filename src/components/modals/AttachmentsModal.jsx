import React, { useState, useEffect } from 'react'
import { Paperclip, Download, FolderOpen, FileText } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { reloadPdfDoc } from '../../lib/reloadPdfDoc'
import { formatBytes } from '../../lib/formatBytes'

export default function AttachmentsModal() {
  const {
    pdfDoc, pdfBytes, filePath, fileName, theme, closeAttachments, setStatus, openDocument,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, pdfBytes: state.pdfBytes, filePath: state.filePath, fileName: state.fileName, theme: state.theme, closeAttachments: state.closeAttachments, setStatus: state.setStatus, openDocument: state.openDocument })))
  const isDark = theme === 'dark'

  const [attachments, setAttachments] = useState(null) // null = loading, [] = none
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // pdf.js's getAttachments() doesn't always include `content` inline — load
  // it up front for every attachment so both the size display and the
  // "Extrahieren" button work without a second round-trip per click. Real
  // PDFs rarely carry more than a handful of embedded files, so this is
  // simpler than a lazy per-row fetch for a case that's unlikely to matter.
  useEffect(() => {
    if (!pdfDoc) { setAttachments([]); return }
    let cancelled = false
    pdfDoc.getAttachments().then(async (map) => {
      if (!map) { if (!cancelled) setAttachments([]); return }
      const list = []
      for (const [id, entry] of map) {
        const content = entry.content || await pdfDoc.getAttachmentContent(id)
        list.push({ id, filename: entry.filename, description: entry.description, content })
      }
      if (!cancelled) setAttachments(list)
    }).catch(() => { if (!cancelled) setAttachments([]) })
    return () => { cancelled = true }
  }, [pdfDoc])

  const extract = async (att) => {
    setError('')
    const r = await window.api?.saveAttachment(att.filename)
    if (r?.canceled || !r?.filePath) return
    try {
      await window.api?.writeAttachment(r.filePath, att.content)
      setStatus(`Anhang "${att.filename}" gespeichert`)
    } catch (e) {
      setError('Fehler beim Speichern: ' + e.message)
    }
  }

  const addAttachment = async () => {
    setError('')
    const r = await window.api?.openAttachment()
    if (r?.canceled || !r?.filePaths?.length) return
    const srcPath = r.filePaths[0]
    setBusy(true)
    try {
      const buf = await window.api?.readAttachment(srcPath)
      const bytes = new Uint8Array(buf)
      const name = srcPath.split(/[\\/]/).pop()
      const doc = await PDFDocument.load(pdfBytes)
      await doc.attach(bytes, name)
      const newBytes = await doc.save()
      const reloaded = await reloadPdfDoc(newBytes)
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setStatus(`Anhang "${name}" hinzugefügt`)
    } catch (e) {
      setError('Fehler beim Hinzufügen: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isDark={isDark} onClose={closeAttachments} title="Anhänge">
      <div className="p-5 space-y-3" style={{ minWidth: 420 }}>
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <Paperclip size={14} className="flex-shrink-0 mt-0.5"/>
          <span>Im PDF eingebettete Dateien anzeigen, extrahieren oder neue hinzufügen.</span>
        </div>

        {attachments === null && (
          <div className={`text-sm text-center py-6 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Lädt …</div>
        )}
        {attachments?.length === 0 && (
          <div className={`text-sm text-center py-6 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Keine Anhänge in diesem Dokument.</div>
        )}
        {attachments?.length > 0 && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {attachments.map(att => (
              <div key={att.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
                <FileText size={14} className={isDark ? 'text-zinc-500 flex-shrink-0' : 'text-gray-400 flex-shrink-0'}/>
                <div className="flex-1 min-w-0">
                  <div className={`truncate ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{att.filename}</div>
                  <div className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                    {formatBytes(att.content?.byteLength)}{att.description ? ` · ${att.description}` : ''}
                  </div>
                </div>
                <button onClick={() => extract(att)} title="Extrahieren"
                  className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <Download size={14}/>
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="text-xs text-red-400">{error}</div>}

        <button onClick={addAttachment} disabled={busy || !pdfBytes}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50
            ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
          <FolderOpen size={14}/> {busy ? 'Wird hinzugefügt …' : 'Datei hinzufügen …'}
        </button>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeAttachments}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
      </div>
    </Modal>
  )
}
