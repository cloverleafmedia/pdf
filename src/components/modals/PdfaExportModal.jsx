import React, { useState } from 'react'
import { FileCheck2, AlertTriangle, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react'
import { PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { checkFontEmbedding, checkStructure, checkTransparencyAndColorSpace } from '../../lib/pdfCompliance'
import { reloadPdfDoc } from '../../lib/reloadPdfDoc'
import iccUrl from '../../assets/sRGB2014.icc?url'

// sRGB2014 ICC v2 profile, International Color Consortium — freely licensed
// ("may be copied, distributed, embedded, made, used, and sold without
// restriction", see THIRD-PARTY-LICENSES.txt). Deliberately the classic ICC
// v2 monitor-class profile rather than the newer v4 "preference" variant:
// testing against the bundled veraPDF validator showed the v4 profile gets
// flagged ("OutputIntent colour profile is either invalid or does not
// provide BToA information") even though it structurally has the same A2B/B2A
// tables — PDF/A-1 predates ICC v4 and validators are stricter about it. The
// v2 profile is what most existing PDF/A tooling embeds for exactly this
// reason.
async function embedOutputIntent(doc) {
  const iccBytes = new Uint8Array(await (await fetch(iccUrl)).arrayBuffer())
  const iccStream = doc.context.stream(iccBytes, { N: 3, Alternate: PDFName.of('DeviceRGB') })
  const iccRef = doc.context.register(iccStream)
  const outputIntent = doc.context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccRef,
  })
  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([doc.context.register(outputIntent)]))
}

const xmlEscape = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Full-ish XMP packet, not just the bare PDF/A id block: veraPDF's rules also
// check that dc:format is present and that Info-dict Producer/Creator/ModDate
// are *equivalent* to their XMP counterparts (pdf:Producer, xmp:CreatorTool,
// xmp:ModifyDate) — found by actually running veraPDF against our own output
// and fixing what it flagged, rather than guessing.
function buildXmp({ title, producer, isoDate }) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>1</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:format>application/pdf</dc:format>
   ${title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>` : ''}
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>${xmlEscape(producer)}</pdf:Producer>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>${xmlEscape(producer)}</xmp:CreatorTool>
   <xmp:ModifyDate>${isoDate}</xmp:ModifyDate>
   <xmp:CreateDate>${isoDate}</xmp:CreateDate>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

export default function PdfaExportModal() {
  const {
    pdfBytes, filePath, fileName, theme, closePdfa, setStatus, openDocument,
  } = useStore(useShallow(state => ({ pdfBytes: state.pdfBytes, filePath: state.filePath, fileName: state.fileName, theme: state.theme, closePdfa: state.closePdfa, setStatus: state.setStatus, openDocument: state.openDocument })))
  const isDark = theme === 'dark'

  const [running,    setRunning]    = useState(false)
  const [gaps,       setGaps]       = useState(null)
  const [checking,   setChecking]   = useState(false)
  const [veraResult, setVeraResult] = useState(null)

  const run = async () => {
    if (!pdfBytes) return
    setRunning(true)
    setGaps(null)
    setVeraResult(null)
    try {
      const doc = await PDFDocument.load(pdfBytes)

      // Achievable, low-risk steps: strip content PDF/A explicitly forbids and
      // tag the document with PDF/A identification metadata (XMP).
      const namesDict = doc.catalog.lookup(PDFName.of('Names'))
      if (namesDict) { namesDict.delete(PDFName.of('JavaScript')); namesDict.delete(PDFName.of('EmbeddedFiles')) }
      doc.catalog.delete(PDFName.of('OpenAction'))

      const now = new Date()
      const producer = 'CloverleafPDF'
      doc.setProducer(producer)
      doc.setCreator(producer)
      doc.setCreationDate(now)
      doc.setModificationDate(now)
      const isoDate = now.toISOString().replace(/\.\d{3}Z$/, 'Z')

      const xmpBytes = new TextEncoder().encode(buildXmp({ title: doc.getTitle(), producer, isoDate }))
      const stream = doc.context.stream(xmpBytes, { Type: PDFName.of('Metadata'), Subtype: PDFName.of('XML') })
      doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream))
      await embedOutputIntent(doc)

      // PDF/UA: make viewers show the actual title instead of the filename.
      doc.catalog.set(PDFName.of('ViewerPreferences'), doc.context.obj({ DisplayDocTitle: true }))

      // PDF/UA tab order: /Tabs /R (row order, computed from annotation rects)
      // is the honest choice here rather than /S (structure order) - this
      // app's StructTreeRoot only ever tags image Alt-Text (Figure elements),
      // never Widget ordering, so declaring /S would be syntactically valid
      // but claim a structure-based order that doesn't exist. /R's algorithm
      // (top-to-bottom, then left-to-right) already matches what
      // formFieldOrder.js#sortFieldsReadingOrder() computes for the app's own
      // keyboard tab order.
      for (const page of doc.getPages()) {
        page.node.set(PDFName.of('Tabs'), PDFName.of('R'))
      }

      // PDF/A forbids xref streams (classic xref table only) and requires a
      // trailer /ID.
      const idHex = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')
      const idString = PDFHexString.of(idHex)
      doc.context.trailerInfo.ID = doc.context.obj([idString, idString])

      // What's left that we can't fix automatically — reported honestly rather
      // than claiming full compliance we can't verify without a real validator.
      const fonts = checkFontEmbedding(doc)
      const structure = checkStructure(doc)
      const transparency = checkTransparencyAndColorSpace(doc)
      const foundGaps = []
      if (fonts.unembedded.length) foundGaps.push(`${fonts.unembedded.length} Schriftart(en) nicht eingebettet: ${fonts.unembedded.join(', ')}`)
      if (structure.hasEncryption) foundGaps.push('Dokument ist verschlüsselt (PDF/A erlaubt keine Verschlüsselung)')
      if (transparency.hasTransparency) foundGaps.push('Transparenzgruppe(n) gefunden (PDF/A-1 verbietet Transparenz) — nur heuristisch erkannt, siehe veraPDF-Prüfung')
      if (transparency.colorSpaceRisk) foundGaps.push(`Farbraum ohne OutputIntent: ${transparency.nonStandardColorSpaces.join(', ')} — nur heuristisch erkannt, siehe veraPDF-Prüfung`)

      const newBytes = await doc.save({ useObjectStreams: false })
      const reloaded = await reloadPdfDoc(newBytes)
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

  const runVeraPdf = async () => {
    if (!pdfBytes) return
    setChecking(true)
    setVeraResult(null)
    try {
      const r = await window.api?.validatePdfA(pdfBytes)
      setVeraResult(r)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Modal isDark={isDark} onClose={closePdfa} title="PDF/A-Export" maxWidth="max-w-xl">
      <div className="p-5 space-y-4">
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5"/>
          <span>
            Bestmöglicher PDF/A-orientierter Export: PDF/A-Kennzeichnung (XMP), sRGB-Farbprofil (OutputIntent) werden gesetzt,
            JavaScript/Anhänge werden entfernt, klassische Xref-Tabelle statt Xref-Stream. Zusätzlich kannst du das Ergebnis
            unten mit dem mitgelieferten <strong>veraPDF</strong> prüfen lassen — dem in der Archivbranche üblichen,
            unabhängigen PDF/A-Validator (ISO 19005).
          </span>
        </div>

        {gaps && gaps.length > 0 && (
          <div className={`rounded-lg border px-3 py-2 space-y-1.5 ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`text-xs font-medium flex items-center gap-1.5 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
              <FileCheck2 size={13}/> Bekannte Lücken (ohne veraPDF ermittelt)
            </div>
            {gaps.map((g, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5 text-amber-500"/>
                {g}
              </div>
            ))}
          </div>
        )}

        {gaps && gaps.length === 0 && (
          <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800 text-clover-400' : 'bg-clover-50 text-clover-700'}`}>
            <CheckCircle2 size={13} className="flex-shrink-0"/> Keine bekannten Lücken gefunden (Schriften eingebettet, keine Verschlüsselung).
          </div>
        )}

        {gaps && (
          <button onClick={runVeraPdf} disabled={checking}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50
              ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            <ShieldCheck size={14}/> {checking ? 'Wird geprüft …' : 'Mit veraPDF prüfen'}
          </button>
        )}

        {veraResult && !veraResult.available && (
          <div className={`text-xs p-3 rounded-lg ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-50 text-gray-600'}`}>
            veraPDF ist nicht gebündelt (nur in Entwicklung ohne <code className="font-mono">npm run setup:verapdf</code> oder in
            einem Build ohne diesen Schritt). Die obigen Lücken sind unsere eigene Einschätzung, keine Zertifizierung.
          </div>
        )}

        {veraResult?.available && !veraResult.success && (
          <div className="text-xs p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300">
            <strong>Fehler bei der Prüfung:</strong> {veraResult.error}
          </div>
        )}

        {veraResult?.success && (
          <div className={`rounded-lg border px-3 py-2 space-y-2 ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`flex items-center gap-2 text-sm font-medium ${veraResult.compliant ? 'text-clover-500' : 'text-red-500'}`}>
              {veraResult.compliant ? <CheckCircle2 size={15}/> : <XCircle size={15}/>}
              {veraResult.compliant ? 'PDF/A-1b-konform (veraPDF-geprüft)' : 'Nicht PDF/A-1b-konform'}
            </div>
            <div className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
              {veraResult.passedRules} Regeln bestanden · {veraResult.failedRules} nicht bestanden
            </div>
            {veraResult.failures?.length > 0 && (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {veraResult.failures.map((f, i) => (
                  <div key={i} className={`text-xs border-t pt-1.5 first:border-0 first:pt-0 ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
                    <div className={isDark ? 'text-zinc-300' : 'text-gray-700'}>ISO 19005-1, {f.clause}: {f.description}</div>
                    {f.errorMessage && <div className={isDark ? 'text-zinc-500' : 'text-gray-500'}>{f.errorMessage}</div>}
                  </div>
                ))}
              </div>
            )}
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
