import React, { useState } from 'react'
import { FileSpreadsheet, FolderOpen, Table2, PlayCircle } from 'lucide-react'
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { dedupeFilename } from '../../lib/dedupeFilename'

// Minimal RFC4180-ish CSV parser: handles quoted fields (with embedded commas,
// quotes doubled as "", and newlines inside quotes). Good enough for the
// spreadsheet exports (Excel/Numbers/Google Sheets) this feature targets —
// not a full CSV-dialect parser, so no dependency needed for such a small job.
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => { pushField(); rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') pushField()
      else if (c === '\n') pushRow()
      else if (c === '\r') { /* skip, \n handles the row break */ }
      else field += c
    }
  }
  if (field.length || row.length) pushRow()
  const filtered = rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''))
  if (!filtered.length) return { headers: [], rows: [] }
  const headers = filtered[0]
  const dataRows = filtered.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
  return { headers, rows: dataRows }
}

function setFieldValue(form, name, value) {
  let field
  try { field = form.getField(name) } catch { return false }
  if (!field) return false
  try {
    if (field instanceof PDFTextField) field.setText(String(value ?? ''))
    else if (field instanceof PDFCheckBox) {
      const truthy = ['true', '1', 'x', 'ja', 'yes'].includes(String(value).trim().toLowerCase())
      truthy ? field.check() : field.uncheck()
    }
    else if (field instanceof PDFDropdown || field instanceof PDFOptionList) field.select(String(value))
    else if (field instanceof PDFRadioGroup) field.select(String(value))
    else return false
    return true
  } catch { return false }
}

function resolveFilename(tmpl, row, index) {
  const resolved = tmpl.replace(/\{index\}/gi, String(index + 1))
    .replace(/\{([^}]+)\}/g, (_, key) => row[key] ?? '')
  return (resolved.trim() || `Datensatz_${index + 1}`).replace(/[<>:"/\\|?*]/g, '_')
}

export default function MailMergeModal() {
  const {
    theme, closeMailMerge, setStatus,
  } = useStore(useShallow(state => ({ theme: state.theme, closeMailMerge: state.closeMailMerge, setStatus: state.setStatus })))
  const isDark = theme === 'dark'

  const [templatePath,  setTemplatePath]  = useState('')
  const [templateBytes, setTemplateBytes] = useState(null)
  const [fields,        setFields]        = useState([])
  const [csvPath,       setCsvPath]       = useState('')
  const [headers,       setHeaders]       = useState([])
  const [rows,          setRows]          = useState([])
  const [filenameTmpl,  setFilenameTmpl]  = useState('Datensatz_{index}')
  const [flatten,       setFlatten]       = useState(true)
  const [running,       setRunning]       = useState(false)
  const [progress,      setProgress]      = useState('')
  const [error,         setError]         = useState('')

  const pickTemplate = async () => {
    const r = await window.api?.openPDF()
    if (r?.canceled || !r?.filePaths?.[0]) return
    setError('')
    try {
      const buf = await window.api?.readFile(r.filePaths[0])
      const bytes = new Uint8Array(buf)
      const doc = await PDFDocument.load(bytes)
      const formFields = doc.getForm().getFields().map(f => f.getName())
      setTemplatePath(r.filePaths[0])
      setTemplateBytes(bytes)
      setFields(formFields)
    } catch (e) {
      setError('PDF konnte nicht gelesen werden: ' + e.message)
    }
  }

  const pickCsv = async () => {
    const r = await window.api?.openCSV()
    if (r?.canceled || !r?.filePaths?.[0]) return
    setError('')
    try {
      const buf = await window.api?.readFile(r.filePaths[0])
      const text = new TextDecoder('utf-8').decode(new Uint8Array(buf))
      const { headers, rows } = parseCSV(text)
      if (!headers.length) { setError('CSV-Datei ist leer oder ungültig'); return }
      setCsvPath(r.filePaths[0])
      setHeaders(headers)
      setRows(rows)
      setFilenameTmpl(`{${headers[0]}}`)
    } catch (e) {
      setError('CSV konnte nicht gelesen werden: ' + e.message)
    }
  }

  const run = async () => {
    if (!templateBytes || !rows.length) return
    setRunning(true)
    setError('')
    try {
      const res = await window.api?.saveDirectory()
      if (res?.canceled || !res?.filePaths?.[0]) { setRunning(false); return }
      const dir = res.filePaths[0]

      // Two rows resolving to the same filename (e.g. a duplicate value in
      // the column used for the filename template) would otherwise silently
      // overwrite each other, while the final status still counted every row
      // as a success. A numeric suffix keeps every row's output on disk.
      const usedNames = new Map()
      let duplicates = 0
      for (let i = 0; i < rows.length; i++) {
        setProgress(`Erzeuge ${i + 1} / ${rows.length} …`)
        const doc = await PDFDocument.load(templateBytes)
        const form = doc.getForm()
        for (const header of headers) setFieldValue(form, header, rows[i][header])
        if (flatten) form.flatten()
        const bytes = await doc.save()
        const baseName = resolveFilename(filenameTmpl, rows[i], i)
        const { name, wasDuplicate } = dedupeFilename(usedNames, baseName)
        if (wasDuplicate) duplicates++
        await window.api?.writeFile(dir + '/' + name + '.pdf', bytes)
      }
      setProgress('')
      setStatus(`${rows.length} PDF(s) erzeugt${duplicates ? ` (davon ${duplicates} mit angepasstem Dateinamen wegen Duplikat)` : ''} → ${dir}`)
      closeMailMerge()
    } catch (e) {
      console.error(e)
      setError('Fehler: ' + e.message)
      setProgress('')
    } finally {
      setRunning(false)
    }
  }

  const btn = `flex-1 flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`
  const inp = `w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500 transition-colors
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`
  const lbl = `block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`

  return (
    <Modal isDark={isDark} onClose={closeMailMerge} title="Serienbrief-Formularausfüllung" maxWidth="max-w-xl">
      <div className="p-5 space-y-4">
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <FileSpreadsheet size={14} className="flex-shrink-0 mt-0.5"/>
          <span>Füllt ein PDF-Formular für jede Zeile einer CSV-Datei aus und speichert je eine Datei — z. B. für Zertifikate, Rechnungen oder Teilnahmebescheinigungen.</span>
        </div>

        <div className="flex gap-2">
          <button onClick={pickTemplate} className={btn}>
            <FolderOpen size={14}/>
            {templatePath ? templatePath.split(/[\\/]/).pop() : 'PDF-Formular wählen …'}
          </button>
          <button onClick={pickCsv} className={btn}>
            <Table2 size={14}/>
            {csvPath ? csvPath.split(/[\\/]/).pop() : 'CSV-Datei wählen …'}
          </button>
        </div>

        {templatePath && (
          <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
            {fields.length
              ? `${fields.length} Formularfeld(er): ${fields.join(', ')}`
              : 'Dieses PDF enthält keine Formularfelder.'}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
              {rows.length} Zeile(n) · Spalten: {headers.join(', ')}
            </div>

            <div>
              <label className={lbl}>Dateiname je PDF</label>
              <input value={filenameTmpl} onChange={e => setFilenameTmpl(e.target.value)} className={inp}
                placeholder="z. B. {Name}_{index}"/>
              <div className={`text-[11px] mt-1 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                Platzhalter: <code className="font-mono">{'{Spaltenname}'}</code> oder <code className="font-mono">{'{index}'}</code> — Vorschau: {resolveFilename(filenameTmpl, rows[0], 0)}.pdf
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={flatten} onChange={e => setFlatten(e.target.checked)} className="accent-clover-500"/>
              <span className={isDark ? 'text-zinc-200' : 'text-gray-800'}>Formularfelder sperren (flach einbetten)</span>
            </label>
          </>
        )}

        {progress && <div className={`text-xs animate-pulse ${isDark ? 'text-clover-400' : 'text-clover-600'}`}>{progress}</div>}
        {error && (
          <div className="text-xs p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300">
            <strong>Fehler:</strong> {error}
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeMailMerge}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={run} disabled={running || !templateBytes || !rows.length}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <PlayCircle size={14}/> {running ? 'Wird erzeugt …' : `${rows.length || ''} PDF(s) erzeugen`}
        </button>
      </div>
    </Modal>
  )
}
