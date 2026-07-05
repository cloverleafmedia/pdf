import React, { useState, useEffect } from 'react'
import { AlertTriangle, Table2, FolderDown } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { extractTablesFromDocument } from '../../lib/tableDetect'
import { writeCSV } from '../../lib/csvWrite'

export default function TableExtractModal() {
  const {
    pdfDoc, theme, closeTableExtract, setStatus,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, theme: state.theme, closeTableExtract: state.closeTableExtract, setStatus: state.setStatus })))
  const isDark = theme === 'dark'

  const [scanning, setScanning] = useState(true)
  const [tables,   setTables]   = useState([])
  const [checked,  setChecked]  = useState(new Set())
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!pdfDoc) { setScanning(false); return }
    setScanning(true)
    extractTablesFromDocument(pdfDoc).then(result => {
      if (cancelled) return
      setTables(result)
      setChecked(new Set(result.map((_, i) => i)))
      setScanning(false)
    })
    return () => { cancelled = true }
  }, [pdfDoc])

  const toggle = (i) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const exportChecked = async () => {
    const selected = tables.filter((_, i) => checked.has(i))
    if (!selected.length) return
    setExporting(true)
    try {
      const res = await window.api?.saveDirectory()
      if (res?.canceled || !res?.filePaths?.[0]) { setExporting(false); return }
      const dir = res.filePaths[0]
      let done = 0
      for (const t of selected) {
        const csv = writeCSV(null, t.rows)
        const bytes = new TextEncoder().encode(csv)
        const path = `${dir}/tabelle_s${t.pageNum}_${t.tableIndex + 1}.csv`
        await window.api?.writeFile(path, bytes)
        done++
      }
      setStatus(`${done} Tabelle(n) exportiert nach ${dir}`)
      closeTableExtract()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal isDark={isDark} onClose={closeTableExtract} title="Tabellen als CSV exportieren" maxWidth="max-w-xl">
      <div className="p-5 space-y-4">
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5"/>
          <span>
            Erkennung funktioniert am besten bei klar ausgerichteten Tabellen mit sichtbaren Spaltenabständen
            (z. B. Rechnungen, Berichte). Verschmolzene Zellen, verschachtelte Tabellen oder Tabellen ohne
            sichtbare Abstände werden u. U. nicht oder falsch erkannt.
          </span>
        </div>

        {scanning && (
          <div className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Durchsuche Dokument nach Tabellen …</div>
        )}

        {!scanning && tables.length === 0 && (
          <div className={`text-xs p-3 rounded-lg ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-50 text-gray-600'}`}>
            Keine Tabellen gefunden.
          </div>
        )}

        {!scanning && tables.length > 0 && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {tables.map((t, i) => (
              <label key={i}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm cursor-pointer
                  ${isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} className="accent-clover-500"/>
                <Table2 size={14} className={isDark ? 'text-zinc-500' : 'text-gray-400'}/>
                <span className={isDark ? 'text-zinc-300' : 'text-gray-700'}>
                  Seite {t.pageNum}, Tabelle {t.tableIndex + 1} — {t.rows.length} Zeile(n) × {t.rows[0]?.length || 0} Spalte(n)
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeTableExtract}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
        <button onClick={exportChecked} disabled={exporting || !checked.size}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <FolderDown size={14}/> {exporting ? 'Exportiere …' : 'In Ordner exportieren'}
        </button>
      </div>
    </Modal>
  )
}
