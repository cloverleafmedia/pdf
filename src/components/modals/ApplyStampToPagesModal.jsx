import React, { useState } from 'react'
import { Copy } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { parsePageRanges } from '../../lib/parsePageRanges'

export default function ApplyStampToPagesModal() {
  const {
    theme, totalPages, annotations, applyStampSourceId, addAnnotations, closeApplyStamp,
  } = useStore(useShallow(state => ({ theme: state.theme, totalPages: state.totalPages, annotations: state.annotations, applyStampSourceId: state.applyStampSourceId, addAnnotations: state.addAnnotations, closeApplyStamp: state.closeApplyStamp })))
  const isDark = theme === 'dark'

  const [scope, setScope] = useState('all') // 'all' | 'range'
  const [rangeInput, setRangeInput] = useState('')

  const source = annotations.find(a => a.id === applyStampSourceId)
  const targetPages = source
    ? (scope === 'all' ? Array.from({ length: totalPages }, (_, i) => i + 1) : parsePageRanges(rangeInput, totalPages))
        .filter(p => p !== source.page)
    : []

  const apply = () => {
    if (!source || !targetPages.length) return
    // Reuses the source stamp's CSS-pixel x/y/w/h as-is on every target page
    // - correct as long as target pages render at the same size as the
    // source page (true for the overwhelming majority of documents, which
    // have uniform page dimensions). A document mixing page sizes will place
    // the stamp at the same pixel offset regardless of each target page's
    // actual size, which may look wrong there - no per-page re-projection
    // in v1.
    const { id, ...rest } = source
    addAnnotations(targetPages.map(p => ({ ...rest, page: p })))
    closeApplyStamp()
  }

  const inp = `w-full px-3 py-2 text-sm rounded-lg border outline-none focus:border-clover-500 transition-colors
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`

  return (
    <Modal isDark={isDark} onClose={closeApplyStamp} title="Stempel auf Seiten anwenden">
      <div className="p-5 space-y-4" style={{ minWidth: 360 }}>
        {!source ? (
          <div className="text-sm text-red-400">Der ausgewählte Stempel wurde nicht gefunden.</div>
        ) : (
          <>
            <div className={`text-xs rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
              Platziert eine Kopie dieses Stempels (gleiche Position, Größe und Drehung) auf jeder gewählten Seite. Jede Kopie bleibt danach einzeln verschiebbar, skalierbar und löschbar.
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Seiten</label>
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
                {[{ id: 'all', l: `Alle (${totalPages})` }, { id: 'range', l: 'Bereich' }].map(opt => (
                  <button key={opt.id} onClick={() => setScope(opt.id)}
                    className={`flex-1 py-2 text-sm transition-colors
                      ${scope === opt.id ? 'bg-clover-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {opt.l}
                  </button>
                ))}
              </div>
              {scope === 'range' && (
                <input
                  className={inp + ' mt-2'}
                  placeholder="z.B. 1-5, 8, 10-12"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                />
              )}
              <div className={`text-xs mt-2 p-2 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-50 text-gray-500'}`}>
                {targetPages.length
                  ? <><span className="font-medium text-clover-400">{targetPages.length}</span> Seite(n): {targetPages.join(', ')}</>
                  : 'Keine gültigen Zielseiten (die Quellseite selbst wird übersprungen)'}
              </div>
            </div>
          </>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeApplyStamp}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={apply} disabled={!source || !targetPages.length}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <Copy size={14}/> Anwenden
        </button>
      </div>
    </Modal>
  )
}
