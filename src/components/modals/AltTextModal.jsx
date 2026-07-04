import React, { useState, useEffect } from 'react'
import { Image as ImageIcon, AlertTriangle } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'
import { listImagesForAltText, setImageAltText } from '../../lib/pdfCompliance'

export default function AltTextModal() {
  const { pdfBytes, filePath, fileName, theme, closeAltText, setStatus, openDocument } = useStore()
  const isDark = theme === 'dark'

  const [doc,     setDoc]     = useState(null)
  const [images,  setImages]  = useState(null) // [{ ref, pages, alt }]
  const [drafts,  setDrafts]  = useState({})   // index -> edited alt text
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!pdfBytes) return
      setLoading(true)
      const d = await PDFDocument.load(pdfBytes)
      const imgs = listImagesForAltText(d)
      if (cancelled) return
      setDoc(d)
      setImages(imgs)
      setDrafts(Object.fromEntries(imgs.map((img, i) => [i, img.alt])))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [pdfBytes])

  const save = async () => {
    if (!doc || !images) return
    setSaving(true)
    try {
      const withDrafts = images.map((img, i) => ({ ...img, alt: drafts[i] ?? img.alt }))
      setImageAltText(doc, withDrafts)
      const newBytes = await doc.save()
      const reloaded = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setStatus('Alt-Texte gespeichert')
      closeAltText()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = `w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`

  const withAltCount = images ? images.filter((img, i) => (drafts[i] ?? img.alt)?.trim()).length : 0

  return (
    <Modal isDark={isDark} onClose={closeAltText} title="Alt-Texte für Bilder" maxWidth="max-w-xl">
      <div className="p-5 space-y-3" style={{ minWidth: 460 }}>
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <ImageIcon size={14} className="flex-shrink-0 mt-0.5"/>
          <span>
            Ein wiederkehrendes Bild (z. B. Logo) erscheint hier nur einmal — der Text gilt für alle Seiten, auf denen es vorkommt.
            Erzeugt eine minimale Tag-Struktur (Figure je Bildvorkommen); kein vollständiger, PDF/UA-zertifizierter Tag-Baum
            (siehe Barrierefreiheits-Check).
          </span>
        </div>

        {loading && <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Suche Bilder …</div>}

        {!loading && images?.length === 0 && (
          <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Keine Bilder im Dokument gefunden.</div>
        )}

        {!loading && images?.length > 0 && (
          <>
            <div className={`text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
              {withAltCount} von {images.length} Bild(ern) haben einen Alternativtext
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {images.map((img, i) => (
                <div key={img.ref.toString()} className={`rounded-lg border px-3 py-2 ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
                  <div className={`text-[11px] mb-1 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                    Bild {i + 1} — Seite{img.pages.length > 1 ? 'n' : ''} {img.pages.map(p => p + 1).join(', ')}
                  </div>
                  <input className={inp} placeholder="Alternativtext (z. B. „Firmenlogo“, „Diagramm: Umsatz nach Quartal“)"
                    value={drafts[i] ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [i]: e.target.value }))}/>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeAltText}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
        <button onClick={save} disabled={saving || loading || !images?.length}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <ImageIcon size={14}/> {saving ? 'Wird gespeichert …' : 'Speichern'}
        </button>
      </div>
    </Modal>
  )
}
