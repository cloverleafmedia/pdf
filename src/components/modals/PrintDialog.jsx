import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Printer, AlertCircle, ChevronLeft, ChevronRight, Minus, Plus, SlidersHorizontal } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

// "1-3,5,7-9" (1-based, as the user types it) -> [{from, to}] 1-based inclusive,
// clamped to the document. Returns null if the string doesn't parse at all.
function parseRangeString(str, totalPages) {
  const parts = str.split(',').map(s => s.trim()).filter(Boolean)
  if (!parts.length) return null
  const ranges = []
  for (const part of parts) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) return null
    let from = parseInt(m[1], 10)
    let to = m[2] ? parseInt(m[2], 10) : from
    if (from > to) [from, to] = [to, from]
    from = Math.max(1, from)
    to = Math.min(totalPages, to)
    if (from > totalPages || to < 1) continue
    ranges.push({ from, to })
  }
  return ranges.length ? ranges : null
}

function expandRanges(ranges) {
  const pages = new Set()
  for (const r of ranges) for (let p = r.from; p <= r.to; p++) pages.add(p)
  return [...pages].sort((a, b) => a - b)
}

export default function PrintDialog() {
  const { theme, pdfDoc, currentPage, totalPages, closePrintDialog, setStatus } = useStore()
  const isDark = theme === 'dark'

  const [printers,    setPrinters]    = useState(null) // null = still loading
  const [selected,    setSelected]    = useState('')
  const [scope,       setScope]       = useState('all') // all | current | custom
  const [customRange, setCustomRange] = useState('')
  const [copies,      setCopies]      = useState(1)
  const [printing,    setPrinting]    = useState(false)
  const [error,       setError]       = useState('')
  const [previewIdx,  setPreviewIdx]  = useState(0) // index into resolvedPages

  useEffect(() => {
    window.api?.getPrinters().then(list => {
      setPrinters(list || [])
      const def = list?.find(p => p.isDefault) || list?.[0]
      if (def) setSelected(def.name)
    })
  }, [])

  // Pages that will actually print, given the current scope/range — this is
  // what both the preview and the "Drucken" button act on.
  let resolvedPages = []
  let rangeError = false
  if (scope === 'all') {
    resolvedPages = Array.from({ length: totalPages }, (_, i) => i + 1)
  } else if (scope === 'current') {
    resolvedPages = [currentPage]
  } else {
    const parsed = customRange.trim() ? parseRangeString(customRange, totalPages) : null
    if (parsed) resolvedPages = expandRanges(parsed)
    else rangeError = !!customRange.trim()
  }

  useEffect(() => { setPreviewIdx(0) }, [scope, customRange])
  const previewPage = resolvedPages[Math.min(previewIdx, Math.max(resolvedPages.length - 1, 0))]

  // ── Live preview canvas ───────────────────────────────────────────────
  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)
  useEffect(() => {
    let cancelled = false
    const render = async () => {
      if (!pdfDoc || !previewPage || !canvasRef.current) return
      try {
        const page = await pdfDoc.getPage(previewPage)
        const vp0 = page.getViewport({ scale: 1 })
        const scale = Math.min(280 / vp0.width, 360 / vp0.height)
        const vp = page.getViewport({ scale })
        const canvas = canvasRef.current
        canvas.width = vp.width
        canvas.height = vp.height
        renderTaskRef.current?.cancel()
        if (cancelled) return
        renderTaskRef.current = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
        await renderTaskRef.current.promise
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.warn('Print preview:', e)
      }
    }
    render()
    return () => { cancelled = true; renderTaskRef.current?.cancel() }
  }, [pdfDoc, previewPage])

  const toElectronRanges = useCallback(() => {
    if (scope === 'all') return undefined
    if (scope === 'current') return [{ from: currentPage - 1, to: currentPage - 1 }]
    const parsed = parseRangeString(customRange, totalPages)
    return parsed ? parsed.map(r => ({ from: r.from - 1, to: r.to - 1 })) : undefined
  }, [scope, customRange, currentPage, totalPages])

  const doPrint = async (opts = {}) => {
    if (!selected) return
    setPrinting(true)
    setError('')
    try {
      const r = await window.api?.print({
        deviceName: selected,
        pageRanges: toElectronRanges(),
        copies,
        ...opts,
      })
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

  const lbl = `block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`
  const inp = `w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500 transition-colors
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`

  return (
    <Modal isDark={isDark} onClose={closePrintDialog} title="Drucken">
      <div className="p-5 flex gap-5">
        {/* Settings column */}
        <div className="w-64 flex-shrink-0 space-y-4">
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
            <div>
              <label className={lbl}>Drucker</label>
              <select value={selected} onChange={e => setSelected(e.target.value)} className={inp}>
                {printers.map(p => (
                  <option key={p.name} value={p.name}>{p.displayName}{p.isDefault ? ' (Standard)' : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={lbl}>Seiten</label>
            <div className="space-y-1.5">
              {[
                { id: 'all',     l: `Alle (${totalPages})` },
                { id: 'current', l: `Aktuelle Seite (${currentPage})` },
              ].map(opt => (
                <label key={opt.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors
                    ${scope === opt.id ? 'border-clover-500 bg-clover-600/10' : isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="radio" name="scope" checked={scope === opt.id} onChange={() => setScope(opt.id)} className="accent-clover-500"/>
                  <span className={isDark ? 'text-zinc-200' : 'text-gray-800'}>{opt.l}</span>
                </label>
              ))}
              <label
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors
                  ${scope === 'custom' ? 'border-clover-500 bg-clover-600/10' : isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="scope" checked={scope === 'custom'} onChange={() => setScope('custom')} className="accent-clover-500"/>
                <span className={isDark ? 'text-zinc-200' : 'text-gray-800'}>Seiten:</span>
                <input value={customRange} onFocus={() => setScope('custom')}
                  onChange={e => { setCustomRange(e.target.value); setScope('custom') }}
                  placeholder="z. B. 1-3,5"
                  className={`flex-1 min-w-0 px-2 py-0.5 text-xs rounded border outline-none focus:border-clover-500
                    ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}/>
              </label>
              {rangeError && (
                <div className={`text-[11px] ${isDark ? 'text-red-400' : 'text-red-600'}`}>Ungültiger Seitenbereich</div>
              )}
            </div>
          </div>

          <div>
            <label className={lbl}>Kopien</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setCopies(c => Math.max(1, c - 1))}
                className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors
                  ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <Minus size={13}/>
              </button>
              <input type="number" min={1} max={99} value={copies}
                onChange={e => setCopies(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
                className={`w-14 text-center px-2 py-1 text-sm rounded-lg border outline-none focus:border-clover-500
                  ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`}/>
              <button onClick={() => setCopies(c => Math.min(99, c + 1))}
                className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors
                  ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <Plus size={13}/>
              </button>
            </div>
          </div>

          <button onClick={() => doPrint({ silent: false })} disabled={printing || !selected}
            title="Öffnet den Windows-Druckdialog für druckerspezifische Einstellungen (Farbe, Duplex, Papierfach …)"
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50
              ${isDark ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            <SlidersHorizontal size={12}/> Erweiterte Druckereinstellungen …
          </button>

          {error && (
            <div className="text-xs p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300">
              <strong>Fehler:</strong> {error}
            </div>
          )}
        </div>

        {/* Preview column */}
        <div className="flex-1 flex flex-col items-center">
          <div className={`text-[10px] mb-2 uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>
            Druckansicht{resolvedPages.length > 0 ? ` — ${resolvedPages.length} Seite${resolvedPages.length !== 1 ? 'n' : ''}` : ''}
          </div>
          <div className={`flex-1 w-full flex items-center justify-center rounded-lg border overflow-hidden
            ${isDark ? 'bg-zinc-950 border-zinc-700' : 'bg-gray-100 border-gray-200'}`} style={{ minHeight: 300 }}>
            {previewPage
              ? <canvas ref={canvasRef} className="shadow-lg" style={{ background: '#fff' }}/>
              : <span className={`text-xs ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Keine Seiten ausgewählt</span>}
          </div>
          {resolvedPages.length > 1 && (
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => setPreviewIdx(i => Math.max(0, i - 1))} disabled={previewIdx === 0}
                className={`p-1 rounded transition-colors disabled:opacity-30 ${isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-500 hover:bg-gray-100'}`}>
                <ChevronLeft size={16}/>
              </button>
              <span className={`text-xs tabular-nums ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Seite {previewPage} ({previewIdx + 1}/{resolvedPages.length})
              </span>
              <button onClick={() => setPreviewIdx(i => Math.min(resolvedPages.length - 1, i + 1))} disabled={previewIdx === resolvedPages.length - 1}
                className={`p-1 rounded transition-colors disabled:opacity-30 ${isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-500 hover:bg-gray-100'}`}>
                <ChevronRight size={16}/>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closePrintDialog}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={() => doPrint()} disabled={printing || !selected || resolvedPages.length === 0}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <Printer size={14}/> {printing ? 'Wird gedruckt …' : 'Drucken'}
        </button>
      </div>
    </Modal>
  )
}
