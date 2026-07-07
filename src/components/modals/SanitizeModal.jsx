import React, { useState } from 'react'
import { ShieldCheck, CheckCircle2, MinusCircle } from 'lucide-react'
import { PDFDocument, PDFName } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { reloadPdfDoc } from '../../lib/reloadPdfDoc'
import { removeJavaScript } from '../../lib/pdfCompliance'

const OPTIONS = [
  { id: 'metadata',     label: 'Metadaten entfernen',            hint: 'Titel, Autor, Thema, Stichwörter, Programm' },
  { id: 'javascript',   label: 'JavaScript entfernen',           hint: 'Eingebettete Skripte und automatische Aktionen' },
  { id: 'attachments',  label: 'Anhänge entfernen',              hint: 'Eingebettete Dateien im PDF' },
  { id: 'hiddenLayers', label: 'Ebenen-Konfiguration entfernen', hint: 'Optionale Inhalte werden dauerhaft sichtbar statt ausblendbar' },
]

// Runs the checks/removals and returns a short report of what was actually
// found & removed — so the user sees what the tool did, not just a spinner.
async function sanitizePdf(pdfBytes, opts) {
  const doc = await PDFDocument.load(pdfBytes)
  const report = []

  if (opts.metadata) {
    const had = doc.getTitle() || doc.getAuthor() || doc.getSubject() || doc.getCreator() || doc.getProducer() || (doc.getKeywords() || '')
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer(''); doc.setCreator('')
    const hadXmp = !!doc.catalog.get(PDFName.of('Metadata'))
    doc.catalog.delete(PDFName.of('Metadata'))
    report.push(had || hadXmp ? 'Metadaten gefunden und entfernt' : 'Keine Metadaten gefunden')
  }
  if (opts.javascript) {
    const hadJs = removeJavaScript(doc)
    report.push(hadJs ? 'JavaScript gefunden und entfernt' : 'Kein JavaScript gefunden')
  }
  if (opts.attachments) {
    const namesDict = doc.catalog.lookup(PDFName.of('Names'))
    const hadAttachments = !!(namesDict && namesDict.lookup(PDFName.of('EmbeddedFiles')))
    if (namesDict) namesDict.delete(PDFName.of('EmbeddedFiles'))
    report.push(hadAttachments ? 'Anhänge gefunden und entfernt' : 'Keine Anhänge gefunden')
  }
  if (opts.hiddenLayers) {
    const hadOCG = !!doc.catalog.get(PDFName.of('OCProperties'))
    doc.catalog.delete(PDFName.of('OCProperties'))
    report.push(hadOCG ? 'Ebenen-Konfiguration gefunden und entfernt' : 'Keine Ebenen-Konfiguration gefunden')
  }

  const bytes = await doc.save()
  return { bytes, report }
}

export default function SanitizeModal() {
  const {
    pdfBytes, filePath, fileName, theme, closeSanitize, setStatus, openDocument,
  } = useStore(useShallow(state => ({ pdfBytes: state.pdfBytes, filePath: state.filePath, fileName: state.fileName, theme: state.theme, closeSanitize: state.closeSanitize, setStatus: state.setStatus, openDocument: state.openDocument })))
  const isDark = theme === 'dark'

  const [selected, setSelected] = useState(new Set(OPTIONS.map(o => o.id)))
  const [running,  setRunning]  = useState(false)
  const [report,   setReport]   = useState(null)

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const run = async () => {
    if (!pdfBytes || selected.size === 0) return
    setRunning(true)
    setReport(null)
    try {
      const opts = Object.fromEntries(OPTIONS.map(o => [o.id, selected.has(o.id)]))
      const { bytes, report } = await sanitizePdf(pdfBytes, opts)
      const reloaded = await reloadPdfDoc(bytes)
      openDocument(reloaded, bytes, filePath, fileName, bytes.byteLength)
      setReport(report)
      setStatus('Dokument bereinigt')
    } catch (e) {
      console.error(e)
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal isDark={isDark} onClose={closeSanitize} title="Dokument bereinigen">
      <div className="p-5 space-y-4" style={{ minWidth: 420 }}>
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <ShieldCheck size={14} className="flex-shrink-0 mt-0.5"/>
          <span>Entfernt versteckte Informationen aus dem PDF, bevor du es weitergibst — nützlich zusätzlich zum Schwärzen sichtbarer Inhalte.</span>
        </div>

        <div className="space-y-1.5">
          {OPTIONS.map(o => (
            <label key={o.id}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors
                ${selected.has(o.id) ? 'border-clover-500 bg-clover-600/10' : isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="accent-clover-500 mt-0.5"/>
              <div>
                <div className={isDark ? 'text-zinc-200' : 'text-gray-800'}>{o.label}</div>
                <div className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{o.hint}</div>
              </div>
            </label>
          ))}
        </div>

        {report && (
          <div className={`rounded-lg border px-3 py-2 space-y-1 ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
            {report.map((line, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                {line.includes('gefunden und entfernt')
                  ? <CheckCircle2 size={13} className="text-clover-500 flex-shrink-0"/>
                  : <MinusCircle size={13} className={isDark ? 'text-zinc-600 flex-shrink-0' : 'text-gray-300 flex-shrink-0'}/>}
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeSanitize}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
        <button onClick={run} disabled={running || selected.size === 0}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <ShieldCheck size={14}/> {running ? 'Wird bereinigt …' : 'Bereinigen'}
        </button>
      </div>
    </Modal>
  )
}
