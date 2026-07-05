import React, { useState, useEffect } from 'react'
import { Accessibility, CheckCircle2, XCircle, Info } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { checkStructure, checkDisplayDocTitle, checkTransparencyAndColorSpace, checkFormFieldLabels, checkImageAltText } from '../../lib/pdfCompliance'

function Row({ status, title, detail, isDark }) {
  const Icon = status === 'pass' ? CheckCircle2 : status === 'fail' ? XCircle : Info
  const color = status === 'pass' ? 'text-clover-500' : status === 'fail' ? 'text-red-500' : (isDark ? 'text-zinc-500' : 'text-gray-400')
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
      <Icon size={15} className={`flex-shrink-0 mt-0.5 ${color}`}/>
      <div>
        <div className={`text-sm ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{title}</div>
        {detail && <div className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{detail}</div>}
      </div>
    </div>
  )
}

export default function AccessibilityCheckModal() {
  const {
    pdfBytes, theme, closeA11y, fileName, openAltText,
  } = useStore(useShallow(state => ({ pdfBytes: state.pdfBytes, theme: state.theme, closeA11y: state.closeA11y, fileName: state.fileName, openAltText: state.openAltText })))
  const isDark = theme === 'dark'
  const [checks, setChecks] = useState(null)
  const [running, setRunning] = useState(false)

  const run = async () => {
    if (!pdfBytes) return
    setRunning(true)
    try {
      const doc = await PDFDocument.load(pdfBytes)
      const structure = checkStructure(doc)
      const title = doc.getTitle()
      const displayDocTitle = checkDisplayDocTitle(doc)
      const formFields = checkFormFieldLabels(doc)
      const altText = checkImageAltText(doc)
      const transparency = checkTransparencyAndColorSpace(doc)

      const results = [
        {
          status: structure.isMarked ? 'pass' : 'fail',
          title: 'Dokument als getaggt markiert (/MarkInfo)',
          detail: structure.isMarked ? undefined : 'Fehlt — Screenreader können nicht sicher erkennen, dass Tags vorhanden sind.',
        },
        {
          status: structure.hasStructTree ? 'pass' : 'fail',
          title: 'Struktur-Baum (Tags) vorhanden',
          detail: structure.hasStructTree ? undefined : 'Kein StructTreeRoot — Lesereihenfolge und Semantik (Überschrift, Absatz, Tabelle …) fehlen für Screenreader.',
        },
        {
          status: structure.lang ? 'pass' : 'fail',
          title: 'Dokumentsprache gesetzt',
          detail: structure.lang ? `Gesetzt auf "${structure.lang}"` : 'Fehlt — Screenreader wissen nicht, welche Sprache vorgelesen werden soll.',
        },
        {
          status: title ? 'pass' : 'fail',
          title: 'Titel in Metadaten gesetzt',
          detail: title ? `"${title}"` : 'Fehlt — Fenstertitel/Screenreader zeigen sonst nur den Dateinamen.',
        },
        {
          status: displayDocTitle ? 'pass' : 'fail',
          title: 'Viewer zeigt Titel statt Dateiname (/ViewerPreferences/DisplayDocTitle)',
          detail: displayDocTitle ? undefined : 'Fehlt — selbst mit gesetztem Titel zeigen die meisten Viewer sonst nur den Dateinamen an.',
        },
        {
          status: formFields.total === 0 ? 'info' : (formFields.withLabel === formFields.total ? 'pass' : 'fail'),
          title: 'Formularfelder mit Beschriftung (Tooltip/TU)',
          detail: formFields.total === 0
            ? 'Keine Formularfelder im Dokument.'
            : `${formFields.withLabel} von ${formFields.total} Feld(ern) haben eine Beschriftung.`,
        },
        {
          status: !altText.supported
            ? 'info'
            : altText.total === 0
              ? 'info'
              : (altText.withAlt === altText.total ? 'pass' : 'fail'),
          title: 'Bild-Alternativtexte (Figure /Alt)',
          detail: !altText.supported
            ? 'Ohne Tag-Struktur nicht prüfbar (siehe oben).'
            : altText.total === 0
              ? 'Keine als Bild (Figure) getaggten Elemente gefunden.'
              : `${altText.withAlt} von ${altText.total} Bild(ern) haben einen Alternativtext.`,
        },
        {
          status: transparency.hasTransparency || transparency.colorSpaceRisk ? 'info' : 'pass',
          title: 'Transparenz / Farbräume (Heuristik, kein Ersatz für veraPDF)',
          detail: transparency.colorSpaceRisk
            ? `Farbraum ohne OutputIntent gefunden: ${transparency.nonStandardColorSpaces.join(', ')}.`
            : transparency.hasTransparency
              ? 'Transparenzgruppe(n) gefunden — PDF/A-1 verbietet Transparenz.'
              : 'Keine auffälligen Transparenzgruppen oder Farbräume ohne OutputIntent gefunden.',
        },
      ]
      setChecks(results)
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => { run() }, [pdfBytes])

  const passed = checks?.filter(c => c.status === 'pass').length ?? 0
  const failed = checks?.filter(c => c.status === 'fail').length ?? 0

  return (
    <Modal isDark={isDark} onClose={closeA11y} title="Barrierefreiheits-Check (PDF/UA)">
      <div className="p-5 space-y-3" style={{ minWidth: 440 }}>
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <Accessibility size={14} className="flex-shrink-0 mt-0.5"/>
          <span>Prüft "{fileName}" gegen zentrale PDF/UA-Kriterien. Reine Prüfung — behebt Probleme nicht automatisch, da echtes Tagging/Alt-Text-Zuordnung manuelle Arbeit im Struktur-Baum erfordert.</span>
        </div>

        {running && <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Prüfe …</div>}

        {checks && !running && (
          <>
            <div className={`text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
              {passed} bestanden · {failed} nicht bestanden
            </div>
            <div className="space-y-1.5">
              {checks.map((c, i) => <Row key={i} {...c} isDark={isDark}/>)}
            </div>
            <button onClick={openAltText}
              className={`w-full px-3 py-1.5 rounded-lg text-xs border transition-colors
                ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              Alt-Texte bearbeiten …
            </button>
          </>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeA11y}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
      </div>
    </Modal>
  )
}
