import React, { useState, useEffect } from 'react'
import { Printer, AlertCircle } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

export default function PrintDialog() {
  const { theme, closePrintDialog, setStatus } = useStore()
  const isDark = theme === 'dark'

  const [printers,  setPrinters]  = useState(null) // null = still loading
  const [selected,  setSelected]  = useState('')
  const [printing,  setPrinting]  = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    window.api?.getPrinters().then(list => {
      setPrinters(list || [])
      const def = list?.find(p => p.isDefault) || list?.[0]
      if (def) setSelected(def.name)
    })
  }, [])

  const doPrint = async () => {
    if (!selected) return
    setPrinting(true)
    setError('')
    try {
      const r = await window.api?.print(selected)
      if (r && !r.success && r.reason !== 'cancelled') {
        setError(r.reason || 'Drucken fehlgeschlagen')
        return
      }
      setStatus('Gedruckt')
      closePrintDialog()
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Modal isDark={isDark} onClose={closePrintDialog} title="Drucker auswählen">
      <div className="p-5 space-y-3 min-w-[320px]">
        {printers === null && (
          <div className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Drucker werden gesucht …</div>
        )}

        {printers?.length === 0 && (
          <div className={`text-xs p-3 rounded-lg flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-50 text-gray-600'}`}>
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5"/>
            <span>Kein Drucker gefunden. Bitte einen Drucker in den Windows-Einstellungen einrichten.</span>
          </div>
        )}

        {printers && printers.length > 0 && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {printers.map(p => (
              <label key={p.name}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors
                  ${selected === p.name
                    ? 'border-clover-500 bg-clover-600/10'
                    : isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="printer" value={p.name} checked={selected === p.name}
                  onChange={() => setSelected(p.name)} className="accent-clover-500"/>
                <span className={`flex-1 truncate ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{p.displayName}</span>
                {p.isDefault && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${isDark ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-100 text-gray-500'}`}>
                    Standard
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        {error && (
          <div className="text-xs p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300">
            <strong>Fehler:</strong> {error}
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closePrintDialog}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={doPrint} disabled={printing || !selected}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <Printer size={14}/> {printing ? 'Wird gedruckt …' : 'Drucken'}
        </button>
      </div>
    </Modal>
  )
}
