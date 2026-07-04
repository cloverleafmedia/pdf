import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen, Save, Printer, ChevronsLeft, ChevronsRight,
  ZoomIn, ZoomOut, Maximize, AlignJustify, RotateCcw, RotateCw,
  Hand, MousePointer2, Highlighter, Underline, Strikethrough,
  StickyNote, Type, Pen, Eraser, Merge, Scissors, ScanText,
  PanelLeftClose, PanelLeftOpen, Settings, FileText, Square,
  Moon, Stamp, PenTool, Undo2, Redo2, Rows3, Presentation,
  FileDown, QrCode, Crop, Layers, Search, Archive, SplitSquareHorizontal,
  BookmarkPlus, Package2, Keyboard, CornerDownLeft,
  ShieldCheck, FileSpreadsheet, FileCheck2, Accessibility, Library, Lock, Images,
  Upload, Download,
} from 'lucide-react'
import { useStore } from '../store/useStore'

// Simple subsequence fuzzy match: every char of `query` must appear in
// `text`, in order (not necessarily contiguous). Returns a score (lower is
// better) or null if it doesn't match at all — good enough without pulling
// in a fuzzy-search dependency for a few dozen static commands.
function fuzzyScore(text, query) {
  if (!query) return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  const idx = t.indexOf(q)
  if (idx !== -1) return idx // substring match — best case, ranked by position
  let ti = 0, qi = 0, gaps = 0
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) { qi++ } else { gaps++ }
    ti++
  }
  return qi === q.length ? 1000 + gaps : null
}

export default function CommandPalette() {
  const { t } = useTranslation()
  const s = useStore()
  const { commandPaletteOpen, closeCommandPalette, pdfDoc, activeTool, nightMode, twoPageView, magnifierActive, toolbarLabels } = s
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const listRef  = useRef(null)
  const isDark = s.theme === 'dark'

  useEffect(() => {
    if (commandPaletteOpen) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [commandPaletteOpen])

  const run = (fn) => () => { closeCommandPalette(); fn() }

  const commands = useMemo(() => [
    // ── Datei ──────────────────────────────────────────────────────────
    { group: 'Datei', label: t('toolbar.open'), icon: <FolderOpen size={15}/>, shortcut: 'Strg+O',
      action: run(async () => { const r = await window.api?.openPDF(); if (!r?.canceled && r?.filePaths?.[0]) window._loadPDF?.(r.filePaths[0]) }) },
    { group: 'Datei', label: 'Speichern', icon: <Save size={15}/>, shortcut: 'Strg+S', disabled: !pdfDoc,
      action: run(() => window._savePDF?.()) },
    { group: 'Datei', label: 'Speichern als …', icon: <Save size={15}/>, disabled: !pdfDoc,
      action: run(() => window._savePDF?.(true)) },
    { group: 'Datei', label: t('toolbar.print'), icon: <Printer size={15}/>, shortcut: 'Strg+P', disabled: !pdfDoc,
      action: run(() => s.openPrintDialog()) },
    { group: 'Bearbeiten', label: 'Rückgängig', icon: <Undo2 size={15}/>, shortcut: 'Strg+Z', disabled: !pdfDoc || !s.annotationHistory?.length,
      action: run(() => s.undoAnnotation()) },
    { group: 'Bearbeiten', label: 'Wiederholen', icon: <Redo2 size={15}/>, shortcut: 'Strg+Y', disabled: !pdfDoc || !s.annotationFuture?.length,
      action: run(() => s.redoAnnotation()) },

    // ── Navigation ─────────────────────────────────────────────────────
    { group: 'Navigation', label: t('toolbar.firstPage'), icon: <ChevronsLeft size={15}/>, disabled: !pdfDoc,
      action: run(() => document.getElementById('page-1')?.scrollIntoView({ behavior: 'smooth' })) },
    { group: 'Navigation', label: t('toolbar.lastPage'), icon: <ChevronsRight size={15}/>, disabled: !pdfDoc,
      action: run(() => document.getElementById(`page-${s.totalPages}`)?.scrollIntoView({ behavior: 'smooth' })) },
    { group: 'Navigation', label: 'Sidebar umschalten', icon: sidebarIcon(s.sidebarOpen), shortcut: 'Strg+B',
      action: run(() => s.toggleSidebar()) },
    { group: 'Navigation', label: 'Suche öffnen', icon: <Search size={15}/>, shortcut: 'Strg+F', disabled: !pdfDoc,
      action: run(() => s.setSidebarTab('search')) },

    // ── Zoom ───────────────────────────────────────────────────────────
    { group: 'Zoom', label: t('toolbar.zoomIn'), icon: <ZoomIn size={15}/>, shortcut: 'Strg++', disabled: !pdfDoc,
      action: run(() => s.zoomIn()) },
    { group: 'Zoom', label: t('toolbar.zoomOut'), icon: <ZoomOut size={15}/>, shortcut: 'Strg+-', disabled: !pdfDoc,
      action: run(() => s.zoomOut()) },
    { group: 'Zoom', label: t('toolbar.fitWidth'), icon: <AlignJustify size={15}/>, disabled: !pdfDoc,
      action: run(() => window._fitWidth?.()) },
    { group: 'Zoom', label: t('toolbar.fitPage'), icon: <Maximize size={15}/>, disabled: !pdfDoc,
      action: run(() => window._fitPage?.()) },
    { group: 'Zoom', label: 'Seite drehen (links)', icon: <RotateCcw size={15}/>, disabled: !pdfDoc,
      action: run(() => s.rotatePageLeft(s.currentPage)) },
    { group: 'Zoom', label: 'Seite drehen (rechts)', icon: <RotateCw size={15}/>, disabled: !pdfDoc,
      action: run(() => s.rotatePageRight(s.currentPage)) },

    // ── Werkzeuge ──────────────────────────────────────────────────────
    { group: 'Werkzeuge', label: t('toolbar.hand'), icon: <Hand size={15}/>, disabled: !pdfDoc, active: activeTool === 'hand',
      action: run(() => s.setActiveTool('hand')) },
    { group: 'Werkzeuge', label: t('toolbar.select'), icon: <MousePointer2 size={15}/>, disabled: !pdfDoc, active: activeTool === 'select',
      action: run(() => s.setActiveTool('select')) },
    { group: 'Werkzeuge', label: t('toolbar.highlight'), icon: <Highlighter size={15}/>, disabled: !pdfDoc, active: activeTool === 'highlight',
      action: run(() => s.setActiveTool('highlight')) },
    { group: 'Werkzeuge', label: t('toolbar.underline'), icon: <Underline size={15}/>, disabled: !pdfDoc, active: activeTool === 'underline',
      action: run(() => s.setActiveTool('underline')) },
    { group: 'Werkzeuge', label: t('toolbar.strikethrough'), icon: <Strikethrough size={15}/>, disabled: !pdfDoc, active: activeTool === 'strikethrough',
      action: run(() => s.setActiveTool('strikethrough')) },
    { group: 'Werkzeuge', label: t('toolbar.note'), icon: <StickyNote size={15}/>, disabled: !pdfDoc, active: activeTool === 'note',
      action: run(() => s.setActiveTool('note')) },
    { group: 'Werkzeuge', label: t('toolbar.textBox'), icon: <Type size={15}/>, disabled: !pdfDoc, active: activeTool === 'text',
      action: run(() => s.setActiveTool('text')) },
    { group: 'Werkzeuge', label: t('toolbar.draw'), icon: <Pen size={15}/>, disabled: !pdfDoc, active: activeTool === 'draw',
      action: run(() => s.setActiveTool('draw')) },
    { group: 'Werkzeuge', label: t('toolbar.eraser'), icon: <Eraser size={15}/>, disabled: !pdfDoc, active: activeTool === 'eraser',
      action: run(() => s.setActiveTool('eraser')) },
    { group: 'Werkzeuge', label: 'Schwärzen', icon: <Square size={15}/>, disabled: !pdfDoc, active: activeTool === 'redact',
      action: run(() => s.setActiveTool('redact')) },
    { group: 'Werkzeuge', label: 'Formular ausfüllen', icon: <FileText size={15}/>, disabled: !pdfDoc, active: activeTool === 'form',
      action: run(() => s.setActiveTool(activeTool === 'form' ? 'hand' : 'form')) },

    // ── Dokument ───────────────────────────────────────────────────────
    { group: 'Dokument', label: t('toolbar.merge'), icon: <Merge size={15}/>, disabled: !pdfDoc, action: run(() => window._mergePDF?.()) },
    { group: 'Dokument', label: t('toolbar.split'), icon: <Scissors size={15}/>, disabled: !pdfDoc, action: run(() => s.openSplit()) },
    { group: 'Dokument', label: 'OCR', icon: <ScanText size={15}/>, disabled: !pdfDoc, action: run(() => s.openOCR()) },
    { group: 'Dokument', label: 'Wasserzeichen', icon: <Stamp size={15}/>, disabled: !pdfDoc, action: run(() => s.openWatermark()) },
    { group: 'Dokument', label: 'Unterschrift', icon: <PenTool size={15}/>, disabled: !pdfDoc, action: run(() => s.openSignature()) },
    { group: 'Dokument', label: 'Kopf- & Fußzeile', icon: <Rows3 size={15}/>, disabled: !pdfDoc, action: run(() => s.openHeaderFooter()) },
    { group: 'Dokument', label: 'Komprimieren', icon: <Archive size={15}/>, disabled: !pdfDoc, action: run(() => s.openCompress()) },
    { group: 'Dokument', label: 'Als Bilder exportieren', icon: <FileDown size={15}/>, disabled: !pdfDoc, action: run(() => s.openExportImages()) },
    { group: 'Dokument', label: 'QR-Code einfügen', icon: <QrCode size={15}/>, disabled: !pdfDoc, action: run(() => s.openQRCode()) },
    { group: 'Dokument', label: 'Seite beschneiden', icon: <Crop size={15}/>, disabled: !pdfDoc, action: run(() => s.openCrop()) },
    { group: 'Dokument', label: 'Batch-Verarbeitung', icon: <Package2 size={15}/>, action: run(() => s.openBatch()) },
    { group: 'Dokument', label: 'PDFs vergleichen', icon: <SplitSquareHorizontal size={15}/>, disabled: !pdfDoc, action: run(() => s.openCompare()) },
    { group: 'Dokument', label: 'Anmerkungen exportieren', icon: <BookmarkPlus size={15}/>, disabled: !pdfDoc, action: run(() => window._exportAnnotations?.()) },
    { group: 'Dokument', label: 'Anmerkungen als XFDF exportieren', icon: <Download size={15}/>, disabled: !pdfDoc, action: run(() => window._exportAnnotationsXFDF?.()) },
    { group: 'Dokument', label: 'Anmerkungen aus XFDF importieren', icon: <Upload size={15}/>, disabled: !pdfDoc, action: run(() => window._importAnnotationsXFDF?.()) },
    { group: 'Dokument', label: 'Dokument bereinigen', icon: <ShieldCheck size={15}/>, disabled: !pdfDoc, action: run(() => s.openSanitize()) },
    { group: 'Dokument', label: 'Serienbrief', icon: <FileSpreadsheet size={15}/>, action: run(() => s.openMailMerge()) },
    { group: 'Dokument', label: 'PDF/A-Export', icon: <FileCheck2 size={15}/>, disabled: !pdfDoc, action: run(() => s.openPdfa()) },
    { group: 'Dokument', label: 'Barrierefreiheits-Check', icon: <Accessibility size={15}/>, disabled: !pdfDoc, action: run(() => s.openA11y()) },
    { group: 'Dokument', label: 'Bibliothek', icon: <Library size={15}/>, action: run(() => s.openLibrary()) },
    { group: 'Dokument', label: 'Verschlüsseln', icon: <Lock size={15}/>, disabled: !pdfDoc, action: run(() => s.openEncrypt()) },
    { group: 'Dokument', label: 'Bilder zu PDF', icon: <Images size={15}/>, action: run(() => s.openImagesToPdf()) },

    // ── Ansicht ────────────────────────────────────────────────────────
    { group: 'Ansicht', label: 'Nachtmodus umschalten', icon: <Moon size={15}/>, disabled: !pdfDoc, active: nightMode,
      action: run(() => s.toggleNightMode()) },
    { group: 'Ansicht', label: 'Präsentation starten', icon: <Presentation size={15}/>, shortcut: 'F5', disabled: !pdfDoc,
      action: run(() => s.togglePresentation()) },
    { group: 'Ansicht', label: 'Zwei-Seiten-Ansicht umschalten', icon: <Layers size={15}/>, disabled: !pdfDoc, active: twoPageView,
      action: run(() => s.setTwoPageView(!twoPageView)) },
    { group: 'Ansicht', label: 'Lupe umschalten', icon: <Search size={15}/>, disabled: !pdfDoc, active: magnifierActive,
      action: run(() => s.toggleMagnifier()) },
    { group: 'Ansicht', label: toolbarLabels ? 'Toolbar-Beschriftungen ausblenden' : 'Toolbar-Beschriftungen anzeigen',
      icon: <span className="text-[11px] font-bold w-[15px] text-center inline-block">Aa</span>, active: toolbarLabels,
      action: run(() => s.setToolbarLabels(!toolbarLabels)) },

    // ── Sonstiges ──────────────────────────────────────────────────────
    { group: 'Sonstiges', label: t('file.properties'), icon: <FileText size={15}/>, disabled: !pdfDoc, action: run(() => s.openProperties()) },
    { group: 'Sonstiges', label: t('settings.title'), icon: <Settings size={15}/>, action: run(() => s.openSettings()) },
    { group: 'Sonstiges', label: 'Tastenkombinationen anzeigen', icon: <Keyboard size={15}/>, shortcut: '?', action: run(() => s.openShortcuts()) },
  ], [pdfDoc, activeTool, nightMode, twoPageView, magnifierActive, toolbarLabels, s.sidebarOpen, s.currentPage, s.totalPages, s.annotationHistory, s.annotationFuture])

  const results = useMemo(() => {
    if (!query.trim()) return commands
    return commands
      .map(c => ({ c, score: fuzzyScore(`${c.group} ${c.label}`, query.trim()) }))
      .filter(x => x.score !== null)
      .sort((a, b) => a.score - b.score)
      .map(x => x.c)
  }, [commands, query])

  useEffect(() => { setSelected(0) }, [query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!commandPaletteOpen) return null

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { closeCommandPalette(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = results[selected]
      if (cmd && !cmd.disabled) cmd.action()
    }
  }

  let lastGroup = null

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) closeCommandPalette() }}>
      <div className={`w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border
        ${isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'}`}>
        <div className={`flex items-center gap-2 px-3 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
          <Search size={15} className={isDark ? 'text-zinc-500' : 'text-gray-400'}/>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Befehl suchen …"
            className={`flex-1 bg-transparent py-3 text-sm outline-none
              ${isDark ? 'text-zinc-100 placeholder-zinc-500' : 'text-gray-900 placeholder-gray-400'}`}/>
          <kbd className={`text-[10px] px-1.5 py-0.5 rounded border ${isDark ? 'border-zinc-700 text-zinc-500' : 'border-gray-300 text-gray-400'}`}>Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <div className={`px-4 py-6 text-center text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Keine Treffer</div>
          )}
          {results.map((cmd, i) => {
            const showGroupHeader = cmd.group !== lastGroup
            lastGroup = cmd.group
            return (
              <React.Fragment key={cmd.group + cmd.label}>
                {showGroupHeader && (
                  <div className={`px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide
                    ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                    {cmd.group}
                  </div>
                )}
                <button
                  data-idx={i}
                  disabled={cmd.disabled}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => !cmd.disabled && cmd.action()}
                  className={`flex items-center gap-2.5 w-full text-left px-3 py-1.5 text-xs transition-colors
                    ${cmd.disabled
                      ? isDark ? 'text-zinc-600 cursor-default' : 'text-gray-300 cursor-default'
                      : i === selected
                        ? isDark ? 'bg-clover-600/25 text-clover-300' : 'bg-clover-50 text-clover-700'
                        : isDark ? 'text-zinc-200' : 'text-gray-700'
                    }`}>
                  <span className="flex-shrink-0">{cmd.icon}</span>
                  <span className="flex-1">{cmd.label}</span>
                  {cmd.active && <span className="w-1.5 h-1.5 rounded-full bg-clover-500 flex-shrink-0"/>}
                  {cmd.shortcut && (
                    <kbd className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0
                      ${isDark ? 'border-zinc-700 text-zinc-500' : 'border-gray-300 text-gray-400'}`}>{cmd.shortcut}</kbd>
                  )}
                  {i === selected && !cmd.disabled && <CornerDownLeft size={12} className="flex-shrink-0 opacity-60"/>}
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function sidebarIcon(open) {
  return open ? <PanelLeftClose size={15}/> : <PanelLeftOpen size={15}/>
}
