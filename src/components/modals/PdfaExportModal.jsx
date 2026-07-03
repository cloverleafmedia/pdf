import React, { useState } from 'react'
import { FileCheck2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PDFDocument, PDFName } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'
import { checkFontEmbedding, checkStructure } from '../../lib/pdfCompliance'

function buildXmp() {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>1</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

export default function PdfaExportModal() {
  const { pdfBytes, filePath, fileName, theme, closePdfa, setStatus, openDocument } = useStore()
  const isDark = theme === 'dark'

  const [running, setRunning] = useState(false)
  const [gaps,    setGaps]    = useState(null)

  const run = async () => {
    if (!pdfBytes) return
    setRunning(true)
    setGaps(null)
    try {
      const doc = await PDFDocument.load(pdfBytes)

      // Achievable, low-risk steps: strip content PDF/A explicitly forbids and
      // tag the document with PDF/A identification metadata (XMP).
      const namesDict = doc.catalog.lookup(PDFName.of('Names'))
      if (namesDict) { namesDict.delete(PDFName.of('JavaScript')); namesDict.delete(PDFName.of('EmbeddedFiles')) }
      doc.catalog.delete(PDFName.of('OpenAction'))

      const xmpBytes = new TextEncoder().encode(buildXmp())
      const stream = doc.context.stream(xmpBytes, { Type: PDFName.of('Metadata'), Subtype: PDFName.of('XML') })
      const ref = doc.context.register(stream)
      doc.catalog.set(PDFName.of('Metadata'), ref)
      doc.setProducer('CloverleafPDF')

      // What's left that we can't fix automatically — reported honestly rather
      // than claiming full compliance we can't verify without a real validator.
      const fonts = checkFontEmbedding(doc)
      const structure = checkStructure(doc)
      const foundGaps = []
      if (fonts.unembedded.length) foundGaps.push(`${fonts.unembedded.length} Schriftart(en) nicht eingebettet: ${fonts.unembedded.join(', ')}`)
      if (structure.hasEncryption) foundGaps.push('Dokument ist verschlüsselt (PDF/A erlaubt keine Verschlüsselung)')
      foundGaps.push('Kein ICC-Farbprofil eingebettet (OutputIntent) — für echte PDF/A-Konformität nötig')

      const newBytes = await doc.save()
      const reloaded = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setGaps(foundGaps)
      setStatus('PDF/A-Metadaten eingebettet')
    } catch (e) {
      console.error(e)
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal isDark={isDark} onClose={closePdfa} title="PDF/A-Export">
      <div className="p-5 space-y-4" style={{ minWidth: 420 }}>
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5"/>
          <span>
            Bestmöglicher PDF/A-orientierter Export: PDF/A-Kennzeichnung (XMP) wird gesetzt, JavaScript/Anhänge werden entfernt.
            Das ist <strong>keine zertifizierte PDF/A-Validierung</strong> (z. B. veraPDF) — für rechtlich verbindliche Archivierung
            das Ergebnis vorher damit prüfen.
          </span>
        </div>

        {gaps && (
          <div className={`rounded-lg border px-3 py-2 space-y-1.5 ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`text-xs font-medium flex items-center gap-1.5 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
              <FileCheck2 size={13}/> Verbleibende Lücken zur vollen Konformität
            </div>
            {gaps.map((g, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5 text-amber-500"/>
                {g}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closePdfa}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
        <button onClick={run} disabled={running}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <CheckCircle2 size={14}/> {running ? 'Wird verarbeitet …' : 'PDF/A-Metadaten anwenden'}
        </button>
      </div>
    </Modal>
  )
}
