import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { X, FolderOpen, SplitSquareHorizontal, Loader2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { extractPageWords, buildPageAttributedDiff } from '../lib/textDiff'
import { renderPageToCanvas } from '../lib/renderPage'
import { computeDiffMask, renderDiffOverlay, pagesComparable } from '../lib/pixelDiff'

// Fixed scale for visual-diff rendering (~144 DPI), independent of the live
// UI zoom - keeps diff quality/perf consistent regardless of what zoom the
// user happens to be at, same reasoning as PDFViewer.jsx's REDACTION_RASTER_DPI.
const DIFF_SCALE = 2

export default function CompareView() {
  const { pdfDoc, currentPage, zoom, theme, compareDoc, setCompareDoc, closeCompare } = useStore()
  const isDark = theme === 'dark'
  const [split,   setSplit]   = useState(50)     // % of width for left panel
  const [syncScroll, setSync] = useState(true)
  const [opacity, setOpacity] = useState(1)      // left panel opacity (overlay mode)
  const [mode,    setMode]    = useState('side')  // side | overlay | visual | diff
  const [diffChunks, setDiffChunks] = useState(null) // null = not computed yet
  const [diffLoading, setDiffLoading] = useState(false)
  const leftRef   = useRef(null)
  const rightRef  = useRef(null)
  const dragging  = useRef(false)

  // ── Text diff (computed once per document pair, only in diff mode) ────
  useEffect(() => {
    if (mode !== 'diff' || !pdfDoc || !compareDoc) { setDiffChunks(null); return }
    let cancelled = false
    setDiffLoading(true)
    ;(async () => {
      try {
        const [pagesA, pagesB] = await Promise.all([extractPageWords(pdfDoc), extractPageWords(compareDoc)])
        if (cancelled) return
        setDiffChunks(buildPageAttributedDiff(pagesA, pagesB))
      } catch (e) {
        if (!cancelled) useStore.getState().setStatus('Fehler beim Textvergleich: ' + e.message)
      } finally {
        if (!cancelled) setDiffLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [mode, pdfDoc, compareDoc])

  // ── Load second PDF ────────────────────────────────────────────────────
  const loadSecond = async () => {
    const r = await window.api?.openPDF()
    if (r?.canceled || !r?.filePaths?.[0]) return
    try {
      const buf = await window.api?.readFile(r.filePaths[0])
      const bytes = new Uint8Array(buf)
      // getDocument() transfers/detaches the buffer it's given — pass a copy.
      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
      setCompareDoc(doc, bytes)
    } catch (e) {
      useStore.getState().setStatus('Fehler: ' + e.message)
    }
  }

  // ── Divider drag ───────────────────────────────────────────────────────
  const onDividerDown = (e) => { dragging.current = true; e.preventDefault() }
  const onMouseMove   = useCallback((e) => {
    if (!dragging.current) return
    const containerRect = document.getElementById('compare-container')?.getBoundingClientRect()
    if (!containerRect) return
    const pct = Math.max(20, Math.min(80, (e.clientX - containerRect.left) / containerRect.width * 100))
    setSplit(pct)
  }, [])
  const onMouseUp = () => { dragging.current = false }

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [onMouseMove])

  // ── Synchronized scrolling ─────────────────────────────────────────────
  useEffect(() => {
    if (!syncScroll) return
    const el = leftRef.current
    if (!el) return
    const sync = () => { if (rightRef.current) rightRef.current.scrollTop = el.scrollTop }
    el.addEventListener('scroll', sync)
    return () => el.removeEventListener('scroll', sync)
  }, [syncScroll])

  return (
    <div className={`fixed inset-0 z-[150] flex flex-col ${isDark ? 'bg-zinc-950' : 'bg-gray-200'}`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-2 border-b flex-shrink-0
        ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
        <SplitSquareHorizontal size={16} className="text-clover-400" />
        <span className={`text-sm font-semibold ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>PDF-Vergleich</span>
        <div className="flex-1"/>
        {/* Mode */}
        <div className="flex gap-1">
          {[['side','Nebeneinander'], ['overlay','Übereinander'], ['visual','Visueller Vergleich'], ['diff','Text-Vergleich']].map(([v,l]) => (
            <button key={v} onClick={() => setMode(v)}
              className={`px-3 py-1 rounded text-xs transition-colors
                ${mode === v ? 'bg-clover-600 text-white' : isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-500 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>
        {mode !== 'diff' && mode !== 'visual' && (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={syncScroll} onChange={e => setSync(e.target.checked)} className="accent-clover-500" />
            <span className={isDark ? 'text-zinc-400' : 'text-gray-600'}>Scrollen sync.</span>
          </label>
        )}
        {mode === 'overlay' && (
          <div className="flex items-center gap-2">
            <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Links-Deckkraft</span>
            <input type="range" min={0} max={100} value={Math.round(opacity * 100)}
              onChange={e => setOpacity(Number(e.target.value) / 100)} className="w-24 accent-clover-500" />
          </div>
        )}
        <button onClick={closeCompare}
          className={`p-1.5 rounded transition-colors ${isDark ? 'text-zinc-500 hover:bg-zinc-700' : 'text-gray-400 hover:bg-gray-100'}`}>
          <X size={16}/>
        </button>
      </div>

      {/* Text diff */}
      {mode === 'diff' && (
        <div className="flex-1 overflow-hidden">
          {!compareDoc ? (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <div className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Kein Vergleichs-Dokument geladen</div>
              <button onClick={loadSecond}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-clover-600 hover:bg-clover-700 text-white transition-colors">
                <FolderOpen size={14}/> PDF öffnen
              </button>
            </div>
          ) : diffLoading ? (
            <div className={`h-full flex items-center justify-center gap-2 text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
              <Loader2 size={16} className="animate-spin"/> Text wird verglichen …
            </div>
          ) : (
            <DiffResult chunks={diffChunks} isDark={isDark} />
          )}
        </div>
      )}

      {/* Visual (pixel) diff */}
      {mode === 'visual' && (
        <div className="flex-1 overflow-hidden">
          <VisualDiffPane pdfDoc={pdfDoc} compareDoc={compareDoc} currentPage={currentPage} isDark={isDark} loadSecond={loadSecond} />
        </div>
      )}

      {/* Compare panes */}
      {mode !== 'diff' && mode !== 'visual' && (
      <div id="compare-container" className="flex-1 flex relative overflow-hidden">
        {/* Left pane — current document */}
        <div ref={leftRef}
          className={`overflow-auto flex flex-col items-center py-6 gap-6 ${isDark ? 'bg-zinc-950' : 'bg-gray-300'}`}
          style={{ width: mode === 'side' ? split + '%' : '100%', position: 'relative', zIndex: 1, opacity: mode === 'overlay' ? opacity : 1 }}>
          <DocLabel label="Aktuelles Dokument" isDark={isDark} />
          <PanePages pdfDoc={pdfDoc} page={currentPage} zoom={zoom} />
        </div>

        {/* Divider (side mode only) */}
        {mode === 'side' && (
          <div className="relative flex-shrink-0 flex items-center justify-center w-1 cursor-col-resize z-10"
            style={{ background: isDark ? '#3f3f46' : '#d1d5db' }}
            onMouseDown={onDividerDown}>
            <div className={`absolute w-4 h-8 rounded flex items-center justify-center
              ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}>
              <div className="flex flex-col gap-0.5">
                <span className="w-0.5 h-1 bg-current opacity-30 block"/>
                <span className="w-0.5 h-1 bg-current opacity-30 block"/>
                <span className="w-0.5 h-1 bg-current opacity-30 block"/>
              </div>
            </div>
          </div>
        )}

        {/* Right pane — comparison document */}
        <div ref={rightRef}
          className={`overflow-auto flex flex-col items-center py-6 gap-6 ${isDark ? 'bg-zinc-950' : 'bg-gray-300'}`}
          style={{
            width: mode === 'side' ? (100 - split) + '%' : '100%',
            position: mode === 'overlay' ? 'absolute' : 'relative',
            inset: mode === 'overlay' ? 0 : undefined,
            zIndex: mode === 'overlay' ? 0 : 1,
          }}>
          {compareDoc
            ? <>
                <DocLabel label="Vergleichs-Dokument" isDark={isDark} />
                <PanePages pdfDoc={compareDoc} page={currentPage} zoom={zoom} />
              </>
            : <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Kein Vergleichs-Dokument geladen</div>
                <button onClick={loadSecond}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-clover-600 hover:bg-clover-700 text-white transition-colors">
                  <FolderOpen size={14}/> PDF öffnen
                </button>
              </div>
          }
        </div>
      </div>
      )}
    </div>
  )
}

function PanePages({ pdfDoc, page, zoom }) {
  if (!pdfDoc) return null
  return (
    <PanePage pdfDoc={pdfDoc} pageNum={page} zoom={zoom} />
  )
}

function PanePage({ pdfDoc, pageNum, zoom }) {
  const canvasRef = useRef(null)
  const taskRef   = useRef(null)

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum)
        const dpr  = window.devicePixelRatio || 1
        const scale = (zoom / 100) * dpr
        const vp    = page.getViewport({ scale })
        const canvas = canvasRef.current
        canvas.width  = vp.width
        canvas.height = vp.height
        canvas.style.width  = (vp.width  / dpr) + 'px'
        canvas.style.height = (vp.height / dpr) + 'px'
        taskRef.current?.cancel()
        if (cancelled) return
        taskRef.current = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
        await taskRef.current.promise
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.warn(e)
      }
    }
    render()
    return () => { cancelled = true; taskRef.current?.cancel() }
  }, [pdfDoc, pageNum, zoom])

  return <canvas ref={canvasRef} className="block rounded shadow-lg" />
}

// Per-page (not whole-document) computation, recomputed on navigation - like
// side/overlay already only render currentPage. Rendering every page of both
// documents up front for pixel-diffing would be prohibitively expensive.
function VisualDiffPane({ pdfDoc, compareDoc, currentPage, isDark, loadSecond }) {
  const canvasRef = useRef(null)
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    if (!compareDoc) { setState({ status: 'no-compare' }); return }
    if (currentPage > compareDoc.numPages) { setState({ status: 'no-page' }); return }
    let cancelled = false
    setState({ status: 'loading' })
    ;(async () => {
      try {
        const [pageA, pageB] = await Promise.all([pdfDoc.getPage(currentPage), compareDoc.getPage(currentPage)])
        const vpA = pageA.getViewport({ scale: 1 })
        const vpB = pageB.getViewport({ scale: 1 })
        if (!pagesComparable({ width: vpA.width, height: vpA.height }, { width: vpB.width, height: vpB.height })) {
          if (!cancelled) setState({ status: 'size-mismatch' })
          return
        }

        const [canvasA, canvasB] = await Promise.all([
          renderPageToCanvas(pdfDoc, currentPage, DIFF_SCALE),
          renderPageToCanvas(compareDoc, currentPage, DIFF_SCALE),
        ])
        if (cancelled) return
        const imgA = canvasA.getContext('2d').getImageData(0, 0, canvasA.width, canvasA.height)
        const imgB = canvasB.getContext('2d').getImageData(0, 0, canvasB.width, canvasB.height)
        const mask = computeDiffMask(imgA, imgB)
        const overlay = renderDiffOverlay(imgA, imgB, mask)
        if (cancelled || !canvasRef.current) return

        const outCanvas = canvasRef.current
        outCanvas.width = overlay.width
        outCanvas.height = overlay.height
        outCanvas.getContext('2d').putImageData(new ImageData(overlay.data, overlay.width, overlay.height), 0, 0)
        setState({ status: 'ok' })
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e.message })
      }
    })()
    return () => { cancelled = true }
  }, [pdfDoc, compareDoc, currentPage])

  const centered = (content) => (
    <div className={`h-full flex flex-col items-center justify-center gap-4 text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
      {content}
    </div>
  )

  if (state.status === 'no-compare') {
    return centered(<>
      <div>Kein Vergleichs-Dokument geladen</div>
      <button onClick={loadSecond}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-clover-600 hover:bg-clover-700 text-white transition-colors">
        <FolderOpen size={14}/> PDF öffnen
      </button>
    </>)
  }
  if (state.status === 'no-page') return centered(`Keine Seite ${currentPage} im Vergleichsdokument`)
  if (state.status === 'size-mismatch') return centered('Seiten nicht vergleichbar (unterschiedliche Größe)')
  if (state.status === 'error') return centered(`Fehler: ${state.message}`)
  if (state.status === 'loading') {
    return centered(<><Loader2 size={16} className="animate-spin"/> Seiten werden verglichen …</>)
  }

  return (
    <div className={`h-full overflow-auto flex items-center justify-center p-6 ${isDark ? 'bg-zinc-950' : 'bg-gray-300'}`}>
      <canvas ref={canvasRef} className="block rounded shadow-lg max-w-full" />
    </div>
  )
}

function DocLabel({ label, isDark }) {
  return (
    <div className={`text-xs font-medium px-3 py-1 rounded-full
      ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-gray-500'}`}>
      {label}
    </div>
  )
}

// Single scrollable reading-flow diff, not two synced panes — the two
// documents may have completely different page counts/layouts, so there's
// no meaningful way to keep two independent canvases in lockstep here.
function DiffResult({ chunks, isDark }) {
  if (!chunks) return null
  if (chunks.every(c => c.type === 'common')) {
    return (
      <div className={`h-full flex items-center justify-center text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
        Keine Unterschiede gefunden
      </div>
    )
  }

  let lastBadgePage = null
  return (
    <div className={`h-full overflow-y-auto p-6 leading-relaxed text-sm ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
      {chunks.map((chunk, i) => {
        const showBadge = chunk.type !== 'common' && chunk.page !== lastBadgePage
        if (chunk.type !== 'common') lastBadgePage = chunk.page
        return (
          <span key={i}>
            {showBadge && (
              <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full mx-1 align-middle select-none
                ${isDark ? 'bg-black/40 text-zinc-400' : 'bg-black/10 text-gray-500'}`}>
                S. {chunk.page}
              </span>
            )}
            <span className={
              chunk.type === 'added'   ? (isDark ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800') :
              chunk.type === 'removed' ? (isDark ? 'bg-red-900/50 text-red-300 line-through' : 'bg-red-100 text-red-800 line-through') :
              ''
            }>
              {chunk.text}{' '}
            </span>
          </span>
        )
      })}
    </div>
  )
}
