import React, { useState, useEffect, useRef, createContext, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useFloatingMenu, FloatingMenu } from './FloatingMenu.jsx'
import {
  FolderOpen, Save, Printer, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ZoomIn, ZoomOut, Maximize, AlignJustify, RotateCcw, RotateCw,
  Hand, MousePointer2, Highlighter, Underline, Strikethrough,
  StickyNote, Type, Pen, Eraser, Merge, Scissors, ScanText,
  PanelLeftClose, PanelLeftOpen, Settings, FileText, ChevronDown,
  Square, AlertTriangle, CheckCheck, Moon, Stamp, PenTool, Undo2, Redo2, Rows3, Presentation,
  FileDown, QrCode, Crop, Layers, Search, Archive, SplitSquareHorizontal, BookmarkPlus, Package2,
  Wrench, Eye, Pin, Terminal, Keyboard,
  ShieldCheck, FileSpreadsheet, FileCheck2, Accessibility, Library, Lock, Images,
  Upload, Download, BadgeCheck, Stethoscope, Table2, SquarePlus, Shapes, ClipboardList, Award
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { navigateToPage } from '../lib/navigate'

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 175, 200, 300, 400]
const COLORS = ['#f59e0b','#ef4444','#3b82f6','#10b981','#a855f7','#ec4899','#000000','#ffffff']

// Whether every button in the toolbar shows a text label next to its icon.
const LabelsContext = createContext(false)

export default function Toolbar() {
  const { t } = useTranslation()
  const {
    pdfDoc, currentPage, totalPages, zoom, theme, sidebarOpen, nightMode, twoPageView, magnifierActive, activeTool, lastAnnotateTool, drawColor, drawWidth, pendingRedactions, annotationHistory, annotationFuture, toolbarLabels, pinnedTools, pendingFormFields, newFieldType, shapeType, setActiveTool, setZoom, zoomIn, zoomOut, setDrawColor, setDrawWidth, setCurrentPage, toggleSidebar, openSettings, openProperties, openSplit, openOCR, rotatePageLeft, rotatePageRight, setNewFieldType, clearFormFieldDrafts, setShapeType, toggleNightMode, openWatermark, openSignature, openHeaderFooter, togglePresentation, undoAnnotation, redoAnnotation, setTwoPageView, toggleMagnifier, setToolbarLabels, togglePinnedTool, openCompress, openExportImages, openQRCode, openCrop, openBatch, openCompare, openCommandPalette, openShortcuts, openPrintDialog, openSanitize, openMailMerge, openPdfa, openA11y, openLibrary, openEncrypt, openImagesToPdf, openSignatureVerify, openTableExtract, openCommentsSummary, openStamp,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, currentPage: state.currentPage, totalPages: state.totalPages, zoom: state.zoom, theme: state.theme, sidebarOpen: state.sidebarOpen, nightMode: state.nightMode, twoPageView: state.twoPageView, magnifierActive: state.magnifierActive, activeTool: state.activeTool, lastAnnotateTool: state.lastAnnotateTool, drawColor: state.drawColor, drawWidth: state.drawWidth, pendingRedactions: state.pendingRedactions, annotationHistory: state.annotationHistory, annotationFuture: state.annotationFuture, toolbarLabels: state.toolbarLabels, pinnedTools: state.pinnedTools, pendingFormFields: state.pendingFormFields, newFieldType: state.newFieldType, shapeType: state.shapeType, setActiveTool: state.setActiveTool, setZoom: state.setZoom, zoomIn: state.zoomIn, zoomOut: state.zoomOut, setDrawColor: state.setDrawColor, setDrawWidth: state.setDrawWidth, setCurrentPage: state.setCurrentPage, toggleSidebar: state.toggleSidebar, openSettings: state.openSettings, openProperties: state.openProperties, openSplit: state.openSplit, openOCR: state.openOCR, rotatePageLeft: state.rotatePageLeft, rotatePageRight: state.rotatePageRight, setNewFieldType: state.setNewFieldType, clearFormFieldDrafts: state.clearFormFieldDrafts, setShapeType: state.setShapeType, toggleNightMode: state.toggleNightMode, openWatermark: state.openWatermark, openSignature: state.openSignature, openHeaderFooter: state.openHeaderFooter, togglePresentation: state.togglePresentation, undoAnnotation: state.undoAnnotation, redoAnnotation: state.redoAnnotation, setTwoPageView: state.setTwoPageView, toggleMagnifier: state.toggleMagnifier, setToolbarLabels: state.setToolbarLabels, togglePinnedTool: state.togglePinnedTool, openCompress: state.openCompress, openExportImages: state.openExportImages, openQRCode: state.openQRCode, openCrop: state.openCrop, openBatch: state.openBatch, openCompare: state.openCompare, openCommandPalette: state.openCommandPalette, openShortcuts: state.openShortcuts, openPrintDialog: state.openPrintDialog, openSanitize: state.openSanitize, openMailMerge: state.openMailMerge, openPdfa: state.openPdfa, openA11y: state.openA11y, openLibrary: state.openLibrary, openEncrypt: state.openEncrypt, openImagesToPdf: state.openImagesToPdf, openSignatureVerify: state.openSignatureVerify, openTableExtract: state.openTableExtract, openCommentsSummary: state.openCommentsSummary, openStamp: state.openStamp })))

  const [pageInput, setPageInput]     = useState(String(currentPage))
  const [zoomInput, setZoomInput]     = useState(String(Math.round(zoom)))
  const [searchRedactQuery, setSearchRedactQuery] = useState('')
  const [searchRedactRegex, setSearchRedactRegex] = useState(false)
  const isDark = theme === 'dark'

  const zoomMenu  = useFloatingMenu()
  const colorMenu = useFloatingMenu()

  useEffect(() => { setPageInput(String(currentPage)) }, [currentPage])
  useEffect(() => { setZoomInput(String(Math.round(zoom))) }, [zoom])

  const commitPage = () => {
    const n = parseInt(pageInput)
    if (!isNaN(n) && n >= 1 && n <= totalPages) navigateToPage(n)
    else setPageInput(String(currentPage))
  }

  const commitZoom = () => {
    const n = parseInt(zoomInput)
    if (!isNaN(n) && n >= 10 && n <= 500) setZoom(n)
    else setZoomInput(String(Math.round(zoom)))
    zoomMenu.setOpen(false)
  }

  const openFile = async () => {
    const r = await window.api?.openPDF()
    if (!r?.canceled && r?.filePaths?.[0]) window._loadPDF?.(r.filePaths[0])
  }


  const h = `min-h-11 flex-shrink-0 overflow-x-auto flex items-center gap-0.5 px-1 py-1 border-b no-print
    ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`

  // Redaction bar shown when redact tool active and pending redactions exist
  const showRedactBar = activeTool === 'redact'
  const showNewFieldBar = activeTool === 'newfield'
  const showShapeBar = activeTool === 'shape'

  const isAnnotateColorTool = ['highlight', 'underline', 'strikethrough', 'draw', 'note', 'text'].includes(activeTool)

  // ── Grouped tool definitions (Adobe-style flyout menus) ──────────────────
  const annotateItems = [
    { id: 'highlight',     icon: <Highlighter size={15}/>,   label: t('toolbar.highlight') },
    { id: 'underline',     icon: <Underline size={15}/>,     label: t('toolbar.underline') },
    { id: 'strikethrough', icon: <Strikethrough size={15}/>, label: t('toolbar.strikethrough') },
    { id: 'note',          icon: <StickyNote size={15}/>,    label: t('toolbar.note') },
    { id: 'text',          icon: <Type size={15}/>,          label: t('toolbar.textBox') },
    { id: 'draw',          icon: <Pen size={15}/>,           label: t('toolbar.draw') },
    { id: 'eraser',        icon: <Eraser size={15}/>,        label: t('toolbar.eraser') },
  ]

  const documentItems = [
    { id: 'merge',       icon: <Merge size={15}/>,               label: t('toolbar.merge'),         onClick: () => window._mergePDF?.(),  disabled: !pdfDoc },
    { id: 'repair',      icon: <Stethoscope size={15}/>,         label: 'PDF reparieren',           onClick: () => window._repairPDF?.(), disabled: !pdfDoc },
    { id: 'split',       icon: <Scissors size={15}/>,            label: t('toolbar.split'),          onClick: openSplit,                   disabled: !pdfDoc },
    { id: 'ocr',         icon: <ScanText size={15}/>,            label: 'OCR',                       onClick: openOCR,                     disabled: !pdfDoc },
    { id: 'watermark',   icon: <Stamp size={15}/>,               label: 'Wasserzeichen',             onClick: openWatermark,               disabled: !pdfDoc },
    { id: 'signature',   icon: <PenTool size={15}/>,             label: 'Unterschrift',              onClick: openSignature,               disabled: !pdfDoc },
    { id: 'headerfooter',icon: <Rows3 size={15}/>,               label: 'Kopf- & Fußzeile',          onClick: openHeaderFooter,            disabled: !pdfDoc },
    { id: 'compress',    icon: <Archive size={15}/>,             label: 'Komprimieren',              onClick: openCompress,                disabled: !pdfDoc },
    { id: 'exportimg',   icon: <FileDown size={15}/>,            label: 'Als Bilder exportieren',    onClick: openExportImages,            disabled: !pdfDoc },
    { id: 'qrcode',      icon: <QrCode size={15}/>,              label: 'QR-Code einfügen',          onClick: openQRCode,                  disabled: !pdfDoc },
    { id: 'crop',        icon: <Crop size={15}/>,                label: 'Seite beschneiden',         onClick: openCrop,                    disabled: !pdfDoc },
    { id: 'batch',       icon: <Package2 size={15}/>,            label: 'Batch-Verarbeitung',        onClick: openBatch },
    { id: 'compare',     icon: <SplitSquareHorizontal size={15}/>, label: 'PDFs vergleichen',         onClick: openCompare,                 disabled: !pdfDoc },
    { id: 'exportannot', icon: <BookmarkPlus size={15}/>,        label: 'Anmerkungen exportieren',   onClick: () => window._exportAnnotations?.(), disabled: !pdfDoc },
    { id: 'exportxfdf',  icon: <Download size={15}/>,            label: 'Anmerkungen als XFDF exportieren', onClick: () => window._exportAnnotationsXFDF?.(), disabled: !pdfDoc },
    { id: 'importxfdf',  icon: <Upload size={15}/>,              label: 'Anmerkungen aus XFDF importieren', onClick: () => window._importAnnotationsXFDF?.(), disabled: !pdfDoc },
    { id: 'sanitize',    icon: <ShieldCheck size={15}/>,         label: 'Dokument bereinigen',       onClick: openSanitize,                disabled: !pdfDoc },
    { id: 'verifysig',   icon: <BadgeCheck size={15}/>,          label: 'Signatur prüfen',           onClick: openSignatureVerify,         disabled: !pdfDoc },
    { id: 'mailmerge',   icon: <FileSpreadsheet size={15}/>,     label: 'Serienbrief',               onClick: openMailMerge },
    { id: 'pdfa',        icon: <FileCheck2 size={15}/>,          label: 'PDF/A-Export',              onClick: openPdfa,                    disabled: !pdfDoc },
    { id: 'a11y',        icon: <Accessibility size={15}/>,       label: 'Barrierefreiheits-Check',   onClick: openA11y,                    disabled: !pdfDoc },
    { id: 'library',     icon: <Library size={15}/>,             label: 'Bibliothek',                onClick: openLibrary },
    { id: 'encrypt',     icon: <Lock size={15}/>,                label: 'Verschlüsseln',             onClick: openEncrypt,                 disabled: !pdfDoc },
    { id: 'imagestopdf', icon: <Images size={15}/>,              label: 'Bilder zu PDF',             onClick: openImagesToPdf },
    { id: 'tableextract', icon: <Table2 size={15}/>,             label: 'Tabellen als CSV exportieren', onClick: openTableExtract, disabled: !pdfDoc },
    { id: 'commentssummary', icon: <ClipboardList size={15}/>,   label: 'Kommentar-Zusammenfassung', onClick: openCommentsSummary, disabled: !pdfDoc },
    { id: 'stamp',        icon: <Award size={15}/>,              label: 'Stempel',                   onClick: openStamp,                 disabled: !pdfDoc },
  ]

  const viewItems = [
    { id: 'night',        icon: <Moon size={15}/>,         label: 'Nachtmodus',        toggled: nightMode,       onClick: toggleNightMode },
    { id: 'presentation', icon: <Presentation size={15}/>, label: 'Präsentation (F5)', toggled: false,           onClick: togglePresentation },
    { id: 'twopage',      icon: <Layers size={15}/>,       label: 'Zwei-Seiten-Ansicht', toggled: twoPageView,   onClick: () => setTwoPageView(!twoPageView) },
    { id: 'magnifier',    icon: <Search size={15}/>,       label: 'Lupe',              toggled: magnifierActive, onClick: toggleMagnifier },
  ]

  return (
    <LabelsContext.Provider value={toolbarLabels}>
      <>
        <div className={h}>
          {/* Sidebar toggle */}
          <TBtn title={sidebarOpen ? 'Sidebar schließen' : 'Sidebar öffnen'} onClick={toggleSidebar} isDark={isDark}>
            {sidebarOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}
          </TBtn>
          <Sep isDark={isDark}/>

          {/* File */}
          <TBtn title={t('toolbar.open')}     onClick={openFile}                         isDark={isDark}><FolderOpen size={16}/></TBtn>
          <TBtn title="Speichern (Strg+S)"    onClick={() => window._savePDF?.()}        isDark={isDark} disabled={!pdfDoc}><Save size={16}/></TBtn>
          <TBtn title="Speichern als …"       onClick={() => window._savePDF?.(true)}    isDark={isDark} disabled={!pdfDoc}><Save size={14}/><span className="text-[9px] -ml-0.5 font-bold">+</span></TBtn>
          <TBtn title={t('toolbar.print')}    onClick={openPrintDialog}                  isDark={isDark} disabled={!pdfDoc}><Printer size={16}/></TBtn>
          <Sep isDark={isDark}/>
          <TBtn title="Rückgängig (Strg+Z)" onClick={undoAnnotation} isDark={isDark} disabled={!pdfDoc || !annotationHistory?.length}><Undo2 size={16}/></TBtn>
          <TBtn title="Wiederholen (Strg+Y)" onClick={redoAnnotation} isDark={isDark} disabled={!pdfDoc || !annotationFuture?.length}><Redo2 size={16}/></TBtn>
          <Sep isDark={isDark}/>

          {/* Navigation */}
          <TBtn title={t('toolbar.firstPage')} onClick={() => scrollTo(1)}                  isDark={isDark} disabled={!pdfDoc}><ChevronsLeft size={16}/></TBtn>
          <TBtn title={t('toolbar.prevPage')}  onClick={() => scrollTo(currentPage - 1)}    isDark={isDark} disabled={!pdfDoc}><ChevronLeft size={16}/></TBtn>
          <div className="flex items-center gap-1 px-1 flex-shrink-0">
            <input className={`w-10 text-center text-xs rounded px-1 py-0.5 border outline-none
                focus:border-clover-500 transition-colors
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
              value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              onBlur={commitPage}
              onKeyDown={e => e.key === 'Enter' && commitPage()}
              disabled={!pdfDoc}/>
            <span className={`text-xs select-none whitespace-nowrap flex-shrink-0 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>/ {totalPages || '—'}</span>
          </div>
          <TBtn title={t('toolbar.nextPage')} onClick={() => scrollTo(currentPage + 1)}  isDark={isDark} disabled={!pdfDoc}><ChevronRight size={16}/></TBtn>
          <TBtn title={t('toolbar.lastPage')} onClick={() => scrollTo(totalPages)}        isDark={isDark} disabled={!pdfDoc}><ChevronsRight size={16}/></TBtn>
          <Sep isDark={isDark}/>

          {/* Zoom */}
          <TBtn title={t('toolbar.zoomOut')} onClick={zoomOut} isDark={isDark} disabled={!pdfDoc}><ZoomOut size={16}/></TBtn>
          <div className="flex items-center flex-shrink-0">
            <input className={`w-14 text-center text-xs rounded-l px-1 py-0.5 border-y border-l outline-none
                focus:border-clover-500
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
              value={zoomInput + '%'}
              onChange={e => setZoomInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={commitZoom}
              onKeyDown={e => e.key === 'Enter' && commitZoom()}
              disabled={!pdfDoc}/>
            <button ref={zoomMenu.anchorRef} onClick={() => zoomMenu.setOpen(o => !o)} disabled={!pdfDoc}
              className={`px-1 py-0.5 rounded-r border text-xs
                ${isDark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-400' : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-500'}`}>
              <ChevronDown size={10}/>
            </button>
          </div>
          <TBtn title={t('toolbar.zoomIn')}  onClick={zoomIn}              isDark={isDark} disabled={!pdfDoc}><ZoomIn size={16}/></TBtn>
          <TBtn title={t('toolbar.fitWidth')} onClick={() => window._fitWidth?.()} isDark={isDark} disabled={!pdfDoc}><AlignJustify size={16}/></TBtn>
          <TBtn title={t('toolbar.fitPage')}  onClick={() => window._fitPage?.()}  isDark={isDark} disabled={!pdfDoc}><Maximize size={16}/></TBtn>
          <Sep isDark={isDark}/>

          {/* Rotate current page */}
          <TBtn title={t('toolbar.rotateLeft')}  onClick={() => rotatePageLeft(currentPage)}  isDark={isDark} disabled={!pdfDoc}><RotateCcw size={16}/></TBtn>
          <TBtn title={t('toolbar.rotateRight')} onClick={() => rotatePageRight(currentPage)} isDark={isDark} disabled={!pdfDoc}><RotateCw size={16}/></TBtn>
          <Sep isDark={isDark}/>

          {/* Hand / Select */}
          <TBtn title={t('toolbar.hand')}   isDark={isDark} disabled={!pdfDoc} active={activeTool === 'hand'}   onClick={() => setActiveTool('hand')}><Hand size={16}/></TBtn>
          <TBtn title={t('toolbar.select')} isDark={isDark} disabled={!pdfDoc} active={activeTool === 'select'} onClick={() => setActiveTool('select')}><MousePointer2 size={16}/></TBtn>
          <Sep isDark={isDark}/>

          {/* Annotate group — split button: main part repeats the last-used annotate
              tool with one click, chevron opens the full list to pick a different one */}
          <ToolGroup title="Anmerkungen" icon={<Highlighter size={16}/>} isDark={isDark} disabled={!pdfDoc}
            items={annotateItems} activeId={activeTool} onSelect={(it) => setActiveTool(it.id)}
            splitItem={annotateItems.find(a => a.id === lastAnnotateTool) || annotateItems[0]}/>

          {/* Stroke width — visible only when draw tool is active */}
          {activeTool === 'draw' && pdfDoc && (
            <div className="flex items-center gap-1 px-1.5 flex-shrink-0">
              <span className={`text-[10px] whitespace-nowrap ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Dicke</span>
              <input type="range" min={1} max={20} step={1} value={drawWidth}
                onChange={e => setDrawWidth(Number(e.target.value))}
                className="w-16 accent-clover-500" />
              <span className={`text-[10px] w-4 text-right tabular-nums ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{drawWidth}</span>
            </div>
          )}

          {/* Color picker — relevant whenever an annotate-color tool is active */}
          <div className="flex-shrink-0">
            <button ref={colorMenu.anchorRef} title="Farbe wählen" disabled={!pdfDoc}
              onClick={() => colorMenu.setOpen(o => !o)}
              className={`w-7 h-7 rounded border-2 transition-colors flex-shrink-0
                ${isAnnotateColorTool ? (isDark ? 'border-zinc-400' : 'border-gray-500') : (isDark ? 'border-zinc-600 hover:border-zinc-400' : 'border-gray-300 hover:border-gray-400')}`}
              style={{ backgroundColor: drawColor }}/>
          </div>
          <Sep isDark={isDark}/>

          {/* Redaction + Form fill */}
          <TBtn title="Schwärzen" isDark={isDark} disabled={!pdfDoc}
            active={activeTool === 'redact'} onClick={() => setActiveTool('redact')}>
            <Square size={16}/>
          </TBtn>
          <TBtn title="Formular ausfüllen" isDark={isDark} disabled={!pdfDoc}
            active={activeTool === 'form'} onClick={() => setActiveTool(activeTool === 'form' ? 'hand' : 'form')}>
            <FileText size={16}/>
          </TBtn>
          <TBtn title="Formularfeld erstellen" isDark={isDark} disabled={!pdfDoc}
            active={activeTool === 'newfield'} onClick={() => setActiveTool(activeTool === 'newfield' ? 'hand' : 'newfield')}>
            <SquarePlus size={16}/>
          </TBtn>
          <TBtn title="Form einfügen (Rechteck/Kreis/Pfeil)" isDark={isDark} disabled={!pdfDoc}
            active={activeTool === 'shape'} onClick={() => setActiveTool(activeTool === 'shape' ? 'hand' : 'shape')}>
            <Shapes size={16}/>
          </TBtn>
          <Sep isDark={isDark}/>

          {/* Document tools group — group itself stays enabled even without a doc, since
              "Batch-Verarbeitung" works on files chosen fresh from disk. Pinnable: each
              item can be pinned to sit directly on the main bar for quick access. */}
          <ToolGroup title="Dokument" icon={<Wrench size={16}/>} isDark={isDark}
            items={documentItems} onSelect={(it) => it.onClick?.()}
            pinnable pinnedIds={pinnedTools} onTogglePin={togglePinnedTool}/>

          {/* Pinned document tools — promoted out of the Dokument flyout onto the main bar */}
          {documentItems.filter(it => pinnedTools.includes(it.id)).map(it => (
            <TBtn key={it.id} title={it.label} onClick={it.onClick} isDark={isDark} disabled={it.disabled}>
              {it.icon}
            </TBtn>
          ))}

          {/* View options group */}
          <ToolGroup title="Ansicht" icon={<Eye size={16}/>} isDark={isDark} disabled={!pdfDoc}
            items={viewItems} onSelect={(it) => it.onClick?.()} showToggleState/>
          <Sep isDark={isDark}/>

          {/* Right side */}
          <div className="flex-1"/>
          <TBtn title="Befehle durchsuchen (Strg+K)" onClick={openCommandPalette} isDark={isDark}><Terminal size={16}/></TBtn>
          <TBtn title="Tastenkombinationen (?)" onClick={openShortcuts} isDark={isDark}><Keyboard size={16}/></TBtn>
          <TBtn title={toolbarLabels ? 'Beschriftungen ausblenden' : 'Beschriftungen anzeigen'}
            onClick={() => setToolbarLabels(!toolbarLabels)} isDark={isDark} active={toolbarLabels} textOnly>
            Aa
          </TBtn>
          <TBtn title={t('file.properties')} onClick={() => openProperties()} isDark={isDark} disabled={!pdfDoc}><FileText size={16}/></TBtn>
          <TBtn title={t('settings.title')}  onClick={() => openSettings()}   isDark={isDark}><Settings size={16}/></TBtn>
        </div>

        {/* Zoom preset menu (portal) */}
        <FloatingMenu open={zoomMenu.open} pos={zoomMenu.pos} menuRef={zoomMenu.menuRef}>
          <div className={`rounded-lg shadow-2xl border min-w-[110px] py-1
            ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
            {['Seitenbreite', 'Ganze Seite', ...ZOOM_PRESETS.map(p => p + '%')].map(opt => (
              <button key={opt}
                className={`block w-full text-left px-3 py-1.5 text-xs transition-colors whitespace-nowrap
                  ${isDark ? 'hover:bg-zinc-700 text-zinc-200' : 'hover:bg-gray-100 text-gray-700'}`}
                onClick={() => {
                  if (opt === 'Seitenbreite') window._fitWidth?.()
                  else if (opt === 'Ganze Seite') window._fitPage?.()
                  else { setZoom(parseInt(opt)); setZoomInput(opt.replace('%','')) }
                  zoomMenu.setOpen(false)
                }}>
                {opt}
              </button>
            ))}
          </div>
        </FloatingMenu>

        {/* Color picker menu (portal) */}
        <FloatingMenu open={colorMenu.open} pos={colorMenu.pos} menuRef={colorMenu.menuRef}>
          <div className={`p-2 rounded-lg shadow-2xl border
            ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => { setDrawColor(c); colorMenu.setOpen(false) }}
                  className="w-6 h-6 rounded-full border-2 border-transparent hover:border-zinc-400 transition-colors"
                  style={{ backgroundColor: c, border: c === drawColor ? '2px solid #10b981' : undefined }}/>
              ))}
            </div>
            <input type="color" value={drawColor}
              onChange={e => { setDrawColor(e.target.value); colorMenu.setOpen(false) }}
              className="w-full h-7 rounded cursor-pointer border-0 p-0"
              title="Benutzerdefinierte Farbe" />
          </div>
        </FloatingMenu>

        {/* Redaction action bar */}
        {showRedactBar && (
          <div className={`flex items-center gap-3 px-4 py-1.5 text-xs border-b
            ${isDark ? 'bg-red-950/40 border-red-900/50 text-red-300' : 'bg-red-50 border-red-100 text-red-700'}`}>
            <AlertTriangle size={13}/>
            <span>
              {pendingRedactions.length > 0
                ? `${pendingRedactions.length} Schwärzung(en) ausstehend — Schwärzung ist permanent! Geschwärzte Seiten werden zu einem Bild: Text, Formularfelder und Verknüpfungen auf diesen Seiten gehen dabei verloren. Zusätzlich gehen für das gesamte Dokument vorhandene Barrierefreiheits-Tags (inkl. Alt-Texte) und Lesezeichen verloren.`
                : 'Bereiche zum Schwärzen aufziehen, oder automatisch nach Mustern suchen.'}
            </span>
            <div className="flex-1"/>
            <input value={searchRedactQuery} onChange={e => setSearchRedactQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchRedactQuery.trim() && window._searchRedact?.(searchRedactQuery, { regex: searchRedactRegex })}
              placeholder="Suchbegriff …"
              className={`w-36 px-2 py-0.5 rounded text-xs border outline-none focus:border-clover-500
                ${isDark ? 'bg-zinc-900 border-red-900/50 text-zinc-100 placeholder-zinc-600' : 'bg-white border-red-200 text-gray-900 placeholder-gray-400'}`}/>
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" checked={searchRedactRegex} onChange={e => setSearchRedactRegex(e.target.checked)} className="accent-clover-500"/>
              Regex
            </label>
            <button onClick={() => searchRedactQuery.trim() && window._searchRedact?.(searchRedactQuery, { regex: searchRedactRegex })}
              disabled={!searchRedactQuery.trim()}
              className={`flex items-center gap-1.5 px-3 py-0.5 rounded text-xs transition-colors disabled:opacity-40
                ${isDark ? 'hover:bg-red-900/40' : 'hover:bg-red-100'}`}>
              <Search size={12}/> Suchen & markieren
            </button>
            <button onClick={() => window._autoDetectPII?.()}
              className={`flex items-center gap-1.5 px-3 py-0.5 rounded text-xs transition-colors
                ${isDark ? 'hover:bg-red-900/40' : 'hover:bg-red-100'}`}>
              <Search size={12}/> IBAN/E-Mail/Telefon erkennen
            </button>
            {pendingRedactions.length > 0 && (
              <button onClick={() => window._applyRedactions?.()}
                className="flex items-center gap-1.5 px-3 py-0.5 rounded text-xs bg-red-600 hover:bg-red-700 text-white transition-colors">
                <CheckCheck size={12}/> Anwenden
              </button>
            )}
          </div>
        )}

        {/* New form-field action bar */}
        {showNewFieldBar && (
          <div className={`flex items-center gap-3 px-4 py-1.5 text-xs border-b
            ${isDark ? 'bg-blue-950/40 border-blue-900/50 text-blue-300' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
            <SquarePlus size={13}/>
            <span>Bereich für ein neues Formularfeld aufziehen. Name direkt im Feld bearbeitbar, Position/Größe mit dem Hand-Werkzeug anpassbar.</span>
            <div className="flex-1"/>
            <div className="flex gap-1">
              {[['text', 'Textfeld'], ['checkbox', 'Kontrollkästchen'], ['dropdown', 'Dropdown'], ['listbox', 'Listenfeld'], ['radio', 'Radio-Gruppe']].map(([v, l]) => (
                <button key={v} onClick={() => setNewFieldType(v)}
                  className={`px-3 py-0.5 rounded text-xs transition-colors
                    ${newFieldType === v ? 'bg-blue-600 text-white' : isDark ? 'hover:bg-blue-900/40' : 'hover:bg-blue-100'}`}>
                  {l}
                </button>
              ))}
            </div>
            {pendingFormFields.length > 0 && (
              <button onClick={clearFormFieldDrafts}
                className={`px-3 py-0.5 rounded text-xs transition-colors
                  ${isDark ? 'hover:bg-blue-900/40' : 'hover:bg-blue-100'}`}>
                Alle verwerfen ({pendingFormFields.length})
              </button>
            )}
          </div>
        )}

        {/* Shape action bar */}
        {showShapeBar && (
          <div className={`flex items-center gap-3 px-4 py-1.5 text-xs border-b
            ${isDark ? 'bg-violet-950/40 border-violet-900/50 text-violet-300' : 'bg-violet-50 border-violet-100 text-violet-700'}`}>
            <Shapes size={13}/>
            <span>
              {shapeType === 'arrow'
                ? 'Klicken für Start, dann klicken für Ende des Pfeils.'
                : 'Bereich für die Form aufziehen.'}
            </span>
            <div className="flex-1"/>
            <div className="flex gap-1">
              {[['rectangle', 'Rechteck'], ['circle', 'Kreis'], ['arrow', 'Pfeil']].map(([v, l]) => (
                <button key={v} onClick={() => setShapeType(v)}
                  className={`px-3 py-0.5 rounded text-xs transition-colors
                    ${shapeType === v ? 'bg-violet-600 text-white' : isDark ? 'hover:bg-violet-900/40' : 'hover:bg-violet-100'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    </LabelsContext.Provider>
  )
}

function scrollTo(n) {
  navigateToPage(n, { setPage: false })
}

function TBtn({ children, title, onClick, disabled, active, isDark, textOnly }) {
  const showLabels = useContext(LabelsContext)
  const label = typeof title === 'string' ? title : null

  if (textOnly) {
    // e.g. the "Aa" label toggle — always renders as a small text pill, not an icon
    return (
      <button title={title} onClick={onClick} disabled={disabled}
        className={`h-8 min-w-8 px-1.5 flex items-center justify-center rounded transition-colors flex-shrink-0 text-xs font-semibold
          ${toolbarButtonClasses(active, isDark)}`}>
        {children}
      </button>
    )
  }

  return (
    <button title={title} onClick={onClick} disabled={disabled}
      className={`h-8 flex-shrink-0 flex items-center justify-center rounded transition-colors
        ${showLabels ? 'px-2 gap-1.5' : 'w-8'}
        ${toolbarButtonClasses(active, isDark)}`}>
      {children}
      {showLabels && label && <span className="text-[11px] whitespace-nowrap">{label}</span>}
    </button>
  )
}

// A toolbar button that opens a dropdown flyout of related tools —
// this is what keeps the primary row from ballooning to 40 always-visible icons.
// `splitItem`, if given, turns this into a split button (à la Office/Adobe ribbon):
// the main part repeats that item with one click, the chevron opens the full list.
// `pinnable` adds a pin toggle to each row so items can be promoted onto the main bar.
function ToolGroup({ title, icon, isDark, disabled, items, activeId, onSelect, showToggleState, splitItem, pinnable, pinnedIds, onTogglePin }) {
  const showLabels = useContext(LabelsContext)
  const { open, setOpen, anchorRef, menuRef, pos } = useFloatingMenu()

  const isGroupActive = activeId != null && items.some(it => it.id === activeId)

  const btnBase = (isActive) => `h-8 flex items-center gap-1 transition-colors flex-shrink-0
    ${toolbarButtonClasses(isActive, isDark)}`

  return (
    <div className="flex-shrink-0 flex items-stretch">
      {splitItem && (
        <button title={splitItem.label} disabled={disabled} onClick={() => onSelect(splitItem)}
          className={`${btnBase(activeId === splitItem.id)} px-2 rounded rounded-r-none border-r
            ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
          {splitItem.icon}
          {showLabels && <span className="text-[11px] whitespace-nowrap">{splitItem.label}</span>}
        </button>
      )}
      <button ref={anchorRef} title={title} disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`${btnBase(!splitItem && isGroupActive)} px-2 rounded ${splitItem ? 'rounded-l-none' : ''}`}>
        {!splitItem && icon}
        {!splitItem && showLabels && <span className="text-[11px] whitespace-nowrap">{title}</span>}
        <ChevronDown size={11}/>
      </button>
      <FloatingMenu open={open} pos={pos} menuRef={menuRef}>
        <div className={`rounded-lg shadow-2xl border py-1 min-w-[220px] max-h-[70vh] overflow-y-auto
          ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
          {items.map(it => {
            const pinned = pinnable && pinnedIds?.includes(it.id)
            return (
              <div key={it.id} className="flex items-stretch">
                <button disabled={it.disabled}
                  onClick={() => { if (it.disabled) return; onSelect(it); setOpen(false) }}
                  className={`flex items-center gap-2.5 flex-1 text-left px-3 py-1.5 text-xs transition-colors
                    ${it.disabled
                      ? isDark ? 'text-zinc-600 cursor-default' : 'text-gray-300 cursor-default'
                      : activeId === it.id || (showToggleState && it.toggled)
                        ? isDark ? 'bg-clover-600/20 text-clover-400' : 'bg-clover-50 text-clover-700'
                        : isDark ? 'hover:bg-zinc-700 text-zinc-200' : 'hover:bg-gray-100 text-gray-700'
                  }`}>
                  {it.icon}
                  <span className="flex-1">{it.label}</span>
                  {showToggleState && it.toggled && <CheckCheck size={13}/>}
                </button>
                {pinnable && (
                  <button title={pinned ? 'Von Werkzeugleiste lösen' : 'An Werkzeugleiste anheften'}
                    onClick={(e) => { e.stopPropagation(); onTogglePin(it.id) }}
                    className={`px-2 flex items-center transition-colors
                      ${pinned
                        ? 'text-clover-500'
                        : isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-300 hover:text-gray-500'}`}>
                    <Pin size={13} fill={pinned ? 'currentColor' : 'none'}/>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </FloatingMenu>
    </div>
  )
}

// Active/dark/light state classes shared by every toolbar button variant
// (TBtn's icon and text-only forms, ToolGroup's split/flyout trigger).
function toolbarButtonClasses(active, isDark) {
  return active
    ? 'bg-clover-600 text-white shadow-inner'
    : isDark
      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 disabled:text-zinc-700 disabled:cursor-default'
      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-default'
}

function Sep({ isDark }) {
  return <div className={`w-px h-5 mx-0.5 flex-shrink-0 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}/>
}
