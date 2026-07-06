import React, { useMemo, useState } from 'react'
import { ClipboardList, Download, FileText } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { groupAnnotationsByPage, buildCommentsSummaryText, buildCommentsSummaryPdf, TYPE_LABELS } from '../../lib/commentsSummary'
import { ANNOTATION_ICONS } from '../../lib/annotationIcons'
import { saveAsNewFile } from '../../lib/saveAsNewFile'

export default function CommentsSummaryModal() {
  const {
    annotations, fileName, theme, closeCommentsSummary, setStatus,
  } = useStore(useShallow(state => ({ annotations: state.annotations, fileName: state.fileName, theme: state.theme, closeCommentsSummary: state.closeCommentsSummary, setStatus: state.setStatus })))
  const isDark = theme === 'dark'
  const [exportingPdf, setExportingPdf] = useState(false)

  const byPage = useMemo(() => groupAnnotationsByPage(annotations), [annotations])
  const replyCount = useMemo(() => annotations.reduce((n, a) => n + (a.replies?.length || 0), 0), [annotations])

  const exportTxt = () => {
    const text = buildCommentsSummaryText(annotations)
    const blob = new Blob([text], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = (fileName || 'dokument').replace('.pdf', '') + '_kommentare.txt'
    a.click(); URL.revokeObjectURL(url)
  }

  const exportPdf = async () => {
    setExportingPdf(true)
    try {
      const bytes = await buildCommentsSummaryPdf(annotations)
      const savedPath = await saveAsNewFile((fileName || 'dokument').replace('.pdf', '') + '_kommentare.pdf', bytes)
      if (savedPath) setStatus('Kommentar-Bericht gespeichert: ' + savedPath.split(/[\\/]/).pop())
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <Modal isDark={isDark} onClose={closeCommentsSummary} title="Kommentar-Zusammenfassung">
      <div className="p-5 space-y-3" style={{ minWidth: 440 }}>
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <ClipboardList size={14} className="flex-shrink-0 mt-0.5"/>
          <span>Übersicht aller Anmerkungen in "{fileName}" mitsamt Antwort-Threads, gruppiert nach Seite.</span>
        </div>

        {!annotations.length ? (
          <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Noch keine Anmerkungen.</div>
        ) : (
          <>
            <div className={`text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
              {annotations.length} Anmerkung(en) auf {byPage.length} Seite(n){replyCount > 0 ? `, davon ${replyCount} mit Antworten` : ''}
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {byPage.map(([page, items]) => (
                <div key={page} className={`rounded-lg text-xs ${isDark ? 'bg-zinc-800/60' : 'bg-gray-50'}`}>
                  <div className={`px-2 pt-1.5 pb-1 font-semibold ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                    Seite {page}
                  </div>
                  <div className="px-2 pb-2 space-y-1.5">
                    {items.map(a => (
                      <div key={a.id}>
                        <div className="flex items-start gap-2">
                          <span className="flex-shrink-0">{ANNOTATION_ICONS[a.type] || '📎'}</span>
                          <div className="flex-1 min-w-0">
                            <span className={isDark ? 'text-zinc-300' : 'text-gray-700'}>{TYPE_LABELS[a.type] || a.type}</span>
                            {(a.type === 'note' || a.type === 'text') && a.text && (
                              <div className={`truncate ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{a.text}</div>
                            )}
                          </div>
                        </div>
                        {(a.replies || []).map(r => (
                          <div key={r.id} className={`ml-6 mt-0.5 ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                            ↳ {new Date(r.time).toLocaleString('de-DE')}: {r.text}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeCommentsSummary}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
        <button onClick={exportPdf} disabled={!annotations.length || exportingPdf}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-50 disabled:cursor-default
            ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
          <FileText size={14}/> {exportingPdf ? 'Wird erstellt …' : 'Als PDF exportieren'}
        </button>
        <button onClick={exportTxt} disabled={!annotations.length}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <Download size={14}/> Als TXT exportieren
        </button>
      </div>
    </Modal>
  )
}
