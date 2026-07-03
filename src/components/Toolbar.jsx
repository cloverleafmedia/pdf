import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen, Save, Printer, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ZoomIn, ZoomOut, Maximize, AlignJustify, RotateCcw, RotateCw,
  Hand, MousePointer2, Highlighter, Underline, Strikethrough,
  StickyNote, Type, Pen, Eraser, Merge, Scissors, ScanText,
  PanelLeftClose, PanelLeftOpen, Settings, FileText, ChevronDown,
  Square, AlertTriangle, CheckCheck, Moon, Stamp, PenTool, Undo2, Redo2, Rows3, Presentation,
  FileDown, QrCode, Crop, Layers, Search, Archive, SplitSquareHorizontal, BookmarkPlus, Package2
} from 'lucide-react'
import { useStore } from '../store/useStore'

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 175, 200, 300, 400]
const COLORS = ['#f59e0b','#ef4444','#3b82f6','#10b981','#a855f7','#ec4899','#000000','#ffffff']

export default function Toolbar() {
  const { t } = useTranslation()
  const {
    pdfDoc, currentPage, totalPages, zoom, theme, sidebarOpen, nightMode, twoPageView, magnifierActive,
    activeTool, drawColor, drawWidth, pendingRedactions, annotationHistory, annotationFuture,
    setActiveTool, setZoom, zoomIn, zoomOut, setDrawColor, setDrawWidth,
    setCurrentPage, toggleSidebar, openSettings, openProperties, openSplit, openOCR,
    rotatePageLeft, rotatePageRight, clearRedactions,
    toggleNightMode, openWatermark, openSignature, openHeaderFooter, togglePresentation,
    undoAnnotation, redoAnnotation,
    setTwoPageView, toggleMagnifier,
    openCompress, openExportImages, openQRCode, openCrop, openBatch, openCompare,
  } = useStore()

  const [pageInput, setPageInput]     = useState(String(currentPage))
  const [zoomInput, setZoomInput]     = useState(String(Math.round(zoom)))
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const isDark = theme === 'dark'

  useEffect(() => { setPageInput(String(currentPage)) }, [currentPage])
  useEffect(() => { setZoomInput(String(Math.round(zoom))) }, [zoom])

  const commitPage = () => {
    const n = parseInt(pageInput)
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      setCurrentPage(n)
      document.getElementById(`page-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else setPageInput(String(currentPage))
  }

  const commitZoom = () => {
    const n = parseInt(zoomInput)
    if (!isNaN(n) && n >= 10 && n <= 500) setZoom(n)
    else setZoomInput(String(Math.round(zoom)))
    setZoomMenuOpen(false)
  }

  const openFile = async () => {
    const r = await window.api?.openPDF()
    if (!r?.canceled && r?.filePaths?.[0]) window._loadPDF?.(r.filePaths[0])
  }

  const h = `h-11 flex-shrink-0 overflow-x-auto flex items-center gap-0.5 px-1 border-b
    ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`

  // Redaction bar shown when redact tool active and pending redactions exist
  const showRedactBar = activeTool === 'redact' && pendingRedactions.length > 0

  return (
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
        <TBtn title={t('toolbar.print')}    onClick={() => window.api?.print()}        isDark={isDark} disabled={!pdfDoc}><Printer size={16}/></TBtn>
        <Sep isDark={isDark}/>
        <TBtn title="Rückgängig (Strg+Z)" onClick={undoAnnotation} isDark={isDark} disabled={!pdfDoc || !annotationHistory?.length}><Undo2 size={16}/></TBtn>
        <TBtn title="Wiederholen (Strg+Y)" onClick={redoAnnotation} isDark={isDark} disabled={!pdfDoc || !annotationFuture?.length}><Redo2 size={16}/></TBtn>
        <Sep isDark={isDark}/>

        {/* Navigation */}
        <TBtn title={t('toolbar.firstPage')} onClick={() => scrollTo(1)}                  isDark={isDark} disabled={!pdfDoc}><ChevronsLeft size={16}/></TBtn>
        <TBtn title={t('toolbar.prevPage')}  onClick={() => scrollTo(currentPage - 1)}    isDark={isDark} disabled={!pdfDoc}><ChevronLeft size={16}/></TBtn>
        <div className="flex items-center gap-1 px-1">
          <input className={`w-10 text-center text-xs rounded px-1 py-0.5 border outline-none
              focus:border-clover-500 transition-colors
              ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
            value={pageInput}
            onChange={e => setPageInput(e.target.value)}
            onBlur={commitPage}
            onKeyDown={e => e.key === 'Enter' && commitPage()}
            disabled={!pdfDoc}/>
          <span className={`text-xs select-none ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>/ {totalPages || '—'}</span>
        </div>
        <TBtn title={t('toolbar.nextPage')} onClick={() => scrollTo(currentPage + 1)}  isDark={isDark} disabled={!pdfDoc}><ChevronRight size={16}/></TBtn>
        <TBtn title={t('toolbar.lastPage')} onClick={() => scrollTo(totalPages)}        isDark={isDark} disabled={!pdfDoc}><ChevronsRight size={16}/></TBtn>
        <Sep isDark={isDark}/>

        {/* Zoom */}
        <TBtn title={t('toolbar.zoomOut')} onClick={zoomOut} isDark={isDark} disabled={!pdfDoc}><ZoomOut size={16}/></TBtn>
        <div className="relative flex items-center">
          <input className={`w-14 text-center text-xs rounded-l px-1 py-0.5 border-y border-l outline-none
              focus:border-clover-500
              ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
            value={zoomInput + '%'}
            onChange={e => setZoomInput(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitZoom}
            onKeyDown={e => e.key === 'Enter' && commitZoom()}
            disabled={!pdfDoc}/>
          <button onClick={() => setZoomMenuOpen(o => !o)} disabled={!pdfDoc}
            className={`px-1 py-0.5 rounded-r border text-xs
              ${isDark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-400' : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-500'}`}>
            <ChevronDown size={10}/>
          </button>
          {zoomMenuOpen && (
            <div className={`absolute top-9 left-0 z-50 rounded-lg shadow-2xl border min-w-[110px] py-1
              ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
              {['Seitenbreite', 'Ganze Seite', ...ZOOM_PRESETS.map(p => p + '%')].map(opt => (
                <button key={opt}
                  className={`block w-full text-left px-3 py-1.5 text-xs transition-colors
                    ${isDark ? 'hover:bg-zinc-700 text-zinc-200' : 'hover:bg-gray-100 text-gray-700'}`}
                  onClick={() => {
                    if (opt === 'Seitenbreite') window._fitWidth?.()
                    else if (opt === 'Ganze Seite') window._fitPage?.()
                    else { setZoom(parseInt(opt)); setZoomInput(opt.replace('%','')) }
                    setZoomMenuOpen(false)
                  }}>
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
        <TBtn title={t('toolbar.zoomIn')}  onClick={zoomIn}              isDark={isDark} disabled={!pdfDoc}><ZoomIn size={16}/></TBtn>
        <TBtn title={t('toolbar.fitWidth')} onClick={() => window._fitWidth?.()} isDark={isDark} disabled={!pdfDoc}><AlignJustify size={16}/></TBtn>
        <TBtn title={t('toolbar.fitPage')}  onClick={() => window._fitPage?.()}  isDark={isDark} disabled={!pdfDoc}><Maximize size={16}/></TBtn>
        <Sep isDark={isDark}/>

        {/* Rotate current page */}
        <TBtn title={t('toolbar.rotateLeft')}  onClick={() => rotatePageLeft(currentPage)}  isDark={isDark} disabled={!pdfDoc}><RotateCcw size={16}/></TBtn>
        <TBtn title={t('toolbar.rotateRight')} onClick={() => rotatePageRight(currentPage)} isDark={isDark} disabled={!pdfDoc}><RotateCw size={16}/></TBtn>
        <Sep isDark={isDark}/>

        {/* Tools */}
        {[
          { id: 'hand',          icon: <Hand size={16}/>,           tip: t('toolbar.hand') },
          { id: 'select',        icon: <MousePointer2 size={16}/>,  tip: t('toolbar.select') },
        ].map(({ id, icon, tip }) => (
          <TBtn key={id} title={tip} isDark={isDark} disabled={!pdfDoc}
            active={activeTool === id} onClick={() => setActiveTool(id)}>{icon}</TBtn>
        ))}
        <Sep isDark={isDark}/>

        {/* Annotation tools */}
        {[
          { id: 'highlight',     icon: <Highlighter size={16}/>,   tip: t('toolbar.highlight') },
          { id: 'underline',     icon: <Underline size={16}/>,     tip: t('toolbar.underline') },
          { id: 'strikethrough', icon: <Strikethrough size={16}/>, tip: t('toolbar.strikethrough') },
          { id: 'note',          icon: <StickyNote size={16}/>,    tip: t('toolbar.note') },
          { id: 'text',          icon: <Type size={16}/>,          tip: t('toolbar.textBox') },
          { id: 'draw',          icon: <Pen size={16}/>,           tip: t('toolbar.draw') },
          { id: 'eraser',        icon: <Eraser size={16}/>,        tip: t('toolbar.eraser') },
        ].map(({ id, icon, tip }) => (
          <TBtn key={id} title={tip} isDark={isDark} disabled={!pdfDoc}
            active={activeTool === id} onClick={() => setActiveTool(id)}>{icon}</TBtn>
        ))}

        {/* Stroke width — visible only when draw tool is active */}
        {activeTool === 'draw' && pdfDoc && (
          <div className="flex items-center gap-1 px-1.5 flex-shrink-0">
            <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Dicke</span>
            <input type="range" min={1} max={20} step={1} value={drawWidth}
              onChange={e => setDrawWidth(Number(e.target.value))}
              className="w-16 accent-clover-500" />
            <span className={`text-[10px] w-4 text-right tabular-nums ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{drawWidth}</span>
          </div>
        )}

        {/* Color picker */}
        <div className="relative">
          <button title="Farbe wählen" disabled={!pdfDoc}
            onClick={() => setColorMenuOpen(o => !o)}
            className={`w-7 h-7 rounded border-2 transition-colors flex-shrink-0
              ${isDark ? 'border-zinc-600 hover:border-zinc-400' : 'border-gray-300 hover:border-gray-400'}`}
            style={{ backgroundColor: drawColor }}/>
          {colorMenuOpen && (
            <div className={`absolute top-9 left-0 z-50 p-2 rounded-lg shadow-2xl border
              ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {COLORS.map(c => (
                  <button key={c} onClick={() => { setDrawColor(c); setColorMenuOpen(false) }}
                    className="w-6 h-6 rounded-full border-2 border-transparent hover:border-zinc-400 transition-colors"
                    style={{ backgroundColor: c, border: c === drawColor ? '2px solid #10b981' : undefined }}/>
                ))}
              </div>
              <input type="color" value={drawColor}
                onChange={e => { setDrawColor(e.target.value); setColorMenuOpen(false) }}
                className="w-full h-7 rounded cursor-pointer border-0 p-0"
                title="Benutzerdefinierte Farbe" />
            </div>
          )}
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
        <Sep isDark={isDark}/>

        {/* Document tools */}
        <TBtn title={t('toolbar.merge')} onClick={() => window._mergePDF?.()} isDark={isDark} disabled={!pdfDoc}><Merge size={16}/></TBtn>
        <TBtn title={t('toolbar.split')} onClick={() => openSplit()}           isDark={isDark} disabled={!pdfDoc}><Scissors size={16}/></TBtn>
        <TBtn title="OCR"                onClick={() => openOCR()}             isDark={isDark} disabled={!pdfDoc}><ScanText size={16}/></TBtn>
        <TBtn title="Wasserzeichen"        onClick={() => openWatermark()}      isDark={isDark} disabled={!pdfDoc}><Stamp size={16}/></TBtn>
        <TBtn title="Unterschrift"         onClick={() => openSignature()}      isDark={isDark} disabled={!pdfDoc}><PenTool size={16}/></TBtn>
        <TBtn title="Kopf- & Fußzeile"     onClick={() => openHeaderFooter()}  isDark={isDark} disabled={!pdfDoc}><Rows3 size={16}/></TBtn>
        <Sep isDark={isDark}/>
        <TBtn title={nightMode ? 'Nachtmodus deaktivieren' : 'Nachtmodus'} onClick={toggleNightMode} isDark={isDark} disabled={!pdfDoc} active={nightMode}>
          <Moon size={16}/>
        </TBtn>
        <TBtn title="Präsentation (F5)" onClick={togglePresentation} isDark={isDark} disabled={!pdfDoc}>
          <Presentation size={16}/>
        </TBtn>
        <TBtn title={twoPageView ? 'Einzelseiten-Ansicht' : 'Zwei-Seiten-Ansicht'} onClick={() => setTwoPageView(!twoPageView)} isDark={isDark} disabled={!pdfDoc} active={twoPageView}>
          <Layers size={16}/>
        </TBtn>
        <TBtn title={magnifierActive ? 'Lupe deaktivieren' : 'Lupe'} onClick={toggleMagnifier} isDark={isDark} disabled={!pdfDoc} active={magnifierActive}>
          <Search size={16}/>
        </TBtn>
        <Sep isDark={isDark}/>

        {/* New tools group */}
        <TBtn title="Komprimieren"        onClick={openCompress}      isDark={isDark} disabled={!pdfDoc}><Archive size={16}/></TBtn>
        <TBtn title="Als Bilder exportieren" onClick={openExportImages} isDark={isDark} disabled={!pdfDoc}><FileDown size={16}/></TBtn>
        <TBtn title="QR-Code einfügen"    onClick={openQRCode}        isDark={isDark} disabled={!pdfDoc}><QrCode size={16}/></TBtn>
        <TBtn title="Seite beschneiden"   onClick={openCrop}          isDark={isDark} disabled={!pdfDoc}><Crop size={16}/></TBtn>
        <TBtn title="Batch-Verarbeitung"  onClick={openBatch}         isDark={isDark}><Package2 size={16}/></TBtn>
        <TBtn title="PDFs vergleichen"    onClick={openCompare}       isDark={isDark} disabled={!pdfDoc}><SplitSquareHorizontal size={16}/></TBtn>
        <TBtn title="Anmerkungen exportieren" onClick={() => window._exportAnnotations?.()} isDark={isDark} disabled={!pdfDoc}><BookmarkPlus size={16}/></TBtn>
        <Sep isDark={isDark}/>

        {/* Right side */}
        <div className="flex-1"/>
        <TBtn title={t('file.properties')} onClick={() => openProperties()} isDark={isDark} disabled={!pdfDoc}><FileText size={16}/></TBtn>
        <TBtn title={t('settings.title')}  onClick={() => openSettings()}   isDark={isDark}><Settings size={16}/></TBtn>
      </div>

      {/* Redaction action bar */}
      {showRedactBar && (
        <div className={`flex items-center gap-3 px-4 py-1.5 text-xs border-b
          ${isDark ? 'bg-red-950/40 border-red-900/50 text-red-300' : 'bg-red-50 border-red-100 text-red-700'}`}>
          <AlertTriangle size={13}/>
          <span>{pendingRedactions.length} Schwärzung(en) ausstehend — Schwärzung ist permanent!</span>
          <div className="flex-1"/>
          <button onClick={clearRedactions}
            className={`px-3 py-0.5 rounded text-xs transition-colors
              ${isDark ? 'hover:bg-red-900/40' : 'hover:bg-red-100'}`}>
            Zurücksetzen
          </button>
          <button onClick={() => window._applyRedactions?.()}
            className="flex items-center gap-1.5 px-3 py-0.5 rounded text-xs bg-red-600 hover:bg-red-700 text-white transition-colors">
            <CheckCheck size={12}/> Anwenden
          </button>
        </div>
      )}
    </>
  )
}

function scrollTo(n) {
  document.getElementById(`page-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function TBtn({ children, title, onClick, disabled, active, isDark }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      className={`w-8 h-8 flex items-center justify-center rounded transition-colors flex-shrink-0
        ${active
          ? 'bg-clover-600 text-white shadow-inner'
          : isDark
            ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 disabled:text-zinc-700 disabled:cursor-default'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-default'
        }`}>
      {children}
    </button>
  )
}

function Sep({ isDark }) {
  return <div className={`w-px h-5 mx-0.5 flex-shrink-0 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}/>
}
