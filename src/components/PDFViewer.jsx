import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { useStore } from '../store/useStore'
import MagnifierLens from './MagnifierLens'
import { flattenAnnotations } from '../lib/annotationFlatten'
import { findPIIRedactions, findTextRedactions } from '../lib/piiDetection'
import { chunk } from '../lib/chunk'
import { sortFieldsReadingOrder } from '../lib/formFieldOrder'
import { renderPageToCanvas } from '../lib/renderPage'
import { rectToPdfPoints, pdfPointRectToRasterPixels, isTextContentEmpty } from '../lib/redactionRects'

// DPI redacted pages are rasterized at before being flattened into the PDF -
// high enough to stay legible/printable, matching ExportImagesModal's top DPI option.
const REDACTION_RASTER_DPI = 300

// Shared fill for both the live-drag redaction preview and the confirmed
// pending-redaction overlay, so drawing a box looks the same before and after mouseup.
const REDACTION_FILL = 'rgba(0,0,0,0.55)'

// Tool-id groups checked in multiple places below (text-selection annotations
// vs. freehand-drag tools) — kept as single constants so both checks can't drift.
const HIGHLIGHT_TOOLS = ['highlight', 'underline', 'strikethrough']
const DRAW_TOOLS = ['draw', 'note', 'text', 'redact', 'eraser']

// Post-redaction confirmation: reload the freshly-redacted bytes and confirm
// the pages we just rasterized really carry no extractable text anymore.
async function verifyNoResidualText(newBytes, redactedPages) {
  const doc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
  const dirtyPages = []
  for (const pageNum of redactedPages) {
    const page = await doc.getPage(pageNum)
    const { items } = await page.getTextContent()
    if (!isTextContentEmpty(items)) dirtyPages.push(pageNum)
  }
  return { ok: dirtyPages.length === 0, dirtyPages }
}

export default function PDFViewer() {
  const {
    pdfDoc, pdfBytes, filePath, fileName, totalPages, zoom, pageRotations, theme, twoPageView,
    openDocument, setPdfBytes, setDirty, setZoom, setStatus, clearRedactions,
  } = useStore()

  const containerRef = useRef(null)
  const isDark = theme === 'dark'

  // ── Fit helpers ──────────────────────────────────────────────────────────
  const fitWidth = useCallback(async () => {
    if (!pdfDoc || !containerRef.current) return
    const s = useStore.getState()
    const page = await pdfDoc.getPage(s.currentPage)
    const vp = page.getViewport({ scale: 1, rotation: s.pageRotations[s.currentPage] || 0 })
    setZoom(Math.round(((containerRef.current.clientWidth - 64) / vp.width) * 100))
  }, [pdfDoc])

  const fitPage = useCallback(async () => {
    if (!pdfDoc || !containerRef.current) return
    const s = useStore.getState()
    const page = await pdfDoc.getPage(s.currentPage)
    const vp = page.getViewport({ scale: 1, rotation: s.pageRotations[s.currentPage] || 0 })
    const w = containerRef.current.clientWidth  - 64
    const h = containerRef.current.clientHeight - 64
    setZoom(Math.round(Math.min(w / vp.width, h / vp.height) * 100))
  }, [pdfDoc])

  useEffect(() => { window._fitWidth = fitWidth; window._fitPage = fitPage }, [fitWidth, fitPage])

  // ── Ctrl+Scroll zoom ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const s = useStore.getState()
      if (e.deltaY < 0) s.zoomIn()
      else s.zoomOut()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [pdfDoc])

  // ── Save (with annotation flattening) ────────────────────────────────────
  useEffect(() => {
    window._savePDF = async (forceDialog = false) => {
      const { pdfBytes: b, filePath: fp, fileName: fn, annotations, formValues, annotationOpacity } = useStore.getState()
      if (!b) return
      try {
        setStatus('Speichern …')
        // Embed all UI annotations + filled form field values permanently into PDF bytes before writing
        const bytes = await flattenAnnotations(b, annotations, formValues, annotationOpacity)
        let target = fp
        if (!target || forceDialog) {
          const r = await window.api?.savePDF(fn)
          if (r?.canceled || !r?.filePath) { setStatus(''); return }
          target = r.filePath
          useStore.getState().setFilePath(target)
          useStore.getState().setFileName(target.split(/[\\/]/).pop())
        }
        await window.api?.writeFile(target, bytes)
        useStore.getState().setDirty(false)
        setStatus('Gespeichert')
      } catch (e) { setStatus('Fehler: ' + e.message) }
    }
  }, [])

  // ── Merge ────────────────────────────────────────────────────────────────
  useEffect(() => {
    window._mergePDF = async () => {
      const r = await window.api?.openPDF()
      if (r?.canceled || !r?.filePaths?.length) return
      try {
        setStatus('Zusammenführen …')
        const { pdfBytes: b, filePath: fp, fileName: fn } = useStore.getState()
        const base = await PDFDocument.load(b)
        for (const fp2 of r.filePaths) {
          const buf = await window.api?.readFile(fp2)
          const src = await PDFDocument.load(new Uint8Array(buf))
          const pages = await base.copyPages(src, src.getPageIndices())
          pages.forEach(p => base.addPage(p))
        }
        const merged = await base.save()
        const reloaded = await pdfjsLib.getDocument({ data: merged.slice() }).promise
        openDocument(reloaded, merged, fp, fn, merged.byteLength)
        setStatus('Zusammengeführt')
      } catch (e) { setStatus('Fehler: ' + e.message) }
    }
  }, [])

  // ── Repair (bundled qpdf) ────────────────────────────────────────────────
  // Terminal action like encryption, not a live reload: writes straight to a
  // new file via "Speichern unter" instead of replacing the open document -
  // keeps this simple/consistent with EncryptModal's flow rather than
  // introducing a second "repaired bytes replace the live doc" code path.
  useEffect(() => {
    window._repairPDF = async () => {
      const { pdfBytes: b, fileName: fn } = useStore.getState()
      if (!b) return
      try {
        setStatus('Repariere …')
        const result = await window.api?.repairPDF(b)
        if (!result?.available) { setStatus('qpdf ist nicht gebündelt (nur in Entwicklung ohne npm run setup:qpdf)'); return }
        if (!result.success) { setStatus('Fehler: ' + (result.error || 'Reparatur fehlgeschlagen')); return }
        const r = await window.api?.savePDF(fn)
        if (r?.canceled || !r?.filePath) { setStatus(''); return }
        await window.api?.writeFile(r.filePath, result.bytes)
        setStatus('Repariert gespeichert: ' + r.filePath.split(/[\/]/).pop())
      } catch (e) { setStatus('Fehler: ' + e.message) }
    }
  }, [])

  // ── Apply redactions ─────────────────────────────────────────────────────
  // True redaction, not just a black overlay: a rectangle drawn on top of the
  // existing content stream (the old approach) leaves the original text/image
  // data fully intact and extractable underneath - the classic real-world PDF
  // redaction failure. Instead, any page with a redaction gets rasterized to
  // an image with the black boxes baked into its pixels, then that image
  // becomes the page's entire content; pages without redactions are copied
  // through unchanged (so text/search/selection elsewhere is unaffected).
  // Known, accepted tradeoff: form fields/links on a redacted page are lost
  // along with the text (see the warning banner in Toolbar.jsx).
  // Note: like the previous implementation, this does not account for
  // pageRotations - a pre-existing gap, out of scope here.
  useEffect(() => {
    window._applyRedactions = async () => {
      const { pendingRedactions: rects, pdfDoc: doc, pdfBytes: b, filePath: fp, fileName: fn, totalPages: n } = useStore.getState()
      if (!rects.length) return
      try {
        setStatus('Schwärze …')
        const byPage = new Map()
        for (const r of rects) {
          if (!byPage.has(r.pageNum)) byPage.set(r.pageNum, [])
          byPage.get(r.pageNum).push(r)
        }

        const srcDoc = await PDFDocument.load(b)
        const outDoc = await PDFDocument.create()
        const scale = REDACTION_RASTER_DPI / 72

        for (let pageNum = 1; pageNum <= n; pageNum++) {
          if (!byPage.has(pageNum)) {
            const [copied] = await outDoc.copyPages(srcDoc, [pageNum - 1])
            outDoc.addPage(copied)
            continue
          }
          const srcPage = srcDoc.getPage(pageNum - 1)
          const { width: pw, height: ph } = srcPage.getSize()

          const canvas = await renderPageToCanvas(doc, pageNum, scale)
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#000'
          for (const rect of byPage.get(pageNum)) {
            const pdfRect = rectToPdfPoints(rect, pw, ph)
            const px = pdfPointRectToRasterPixels(pdfRect, ph, scale)
            ctx.fillRect(px.x, px.y, px.width, px.height)
          }

          const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
          const pngBytes = new Uint8Array(await blob.arrayBuffer())
          const pngImage = await outDoc.embedPng(pngBytes)
          const newPage = outDoc.addPage([pw, ph])
          newPage.drawImage(pngImage, { x: 0, y: 0, width: pw, height: ph })
        }

        const newB = await outDoc.save()
        const redactedPages = [...byPage.keys()]
        const verification = await verifyNoResidualText(newB, redactedPages)

        const reloaded = await pdfjsLib.getDocument({ data: newB.slice() }).promise
        openDocument(reloaded, newB, fp, fn, newB.byteLength)
        clearRedactions()
        setStatus(verification.ok
          ? `✓ ${redactedPages.length} Seite(n) geprüft — kein Restdaten gefunden`
          : `⚠ Achtung: Textreste gefunden auf Seite(n) ${verification.dirtyPages.join(', ')}`)
      } catch (e) { setStatus('Fehler: ' + e.message) }
    }
  }, [])

  // ── Auto-detect PII (IBAN / E-Mail / Telefonnummer) as redaction suggestions ──
  useEffect(() => {
    window._autoDetectPII = async () => {
      const { pdfDoc: doc, pageRotations: rot, addRedaction: addRect } = useStore.getState()
      if (!doc) return
      try {
        setStatus('Suche nach IBAN/E-Mail/Telefonnummer …')
        const matches = await findPIIRedactions(doc, rot)
        matches.forEach(m => addRect({
          pageNum: m.pageNum, x: m.x, y: m.y, w: m.w, h: m.h,
          logicalW: m.logicalW, logicalH: m.logicalH,
        }))
        setStatus(matches.length ? `${matches.length} Treffer gefunden` : 'Keine Treffer gefunden')
      } catch (e) { setStatus('Fehler: ' + e.message) }
    }
  }, [])

  // ── Search & mark for redaction (free-text / regex) ────────────────────
  useEffect(() => {
    window._searchRedact = async (query, opts) => {
      const { pdfDoc: doc, pageRotations: rot, addRedaction: addRect } = useStore.getState()
      if (!doc || !query?.trim()) return
      try {
        setStatus(`Suche nach "${query}" …`)
        const matches = await findTextRedactions(doc, rot, query, opts)
        matches.forEach(m => addRect({
          pageNum: m.pageNum, x: m.x, y: m.y, w: m.w, h: m.h,
          logicalW: m.logicalW, logicalH: m.logicalH,
        }))
        setStatus(matches.length ? `${matches.length} Treffer gefunden` : 'Keine Treffer gefunden')
      } catch (e) { setStatus('Fehler: ' + (opts?.regex ? 'Ungültiger regulärer Ausdruck' : e.message)) }
    }
  }, [])

  // ── Scroll → currentPage sync ────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el || !pdfDoc) return
    const obs = new IntersectionObserver((entries) => {
      let best = null, bestRatio = 0
      entries.forEach(e => { if (e.intersectionRatio > bestRatio) { bestRatio = e.intersectionRatio; best = e.target } })
      if (best) useStore.getState().setCurrentPage(parseInt(best.dataset.page))
    }, { root: el, threshold: [0.1, 0.5, 0.9] })
    const timer = setTimeout(() => { el.querySelectorAll('[data-page]').forEach(p => obs.observe(p)) }, 150)
    return () => { clearTimeout(timer); obs.disconnect() }
  }, [pdfDoc, totalPages])

  if (!pdfDoc) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <div ref={containerRef}
      className={`print-area h-full overflow-y-auto overflow-x-auto ${isDark ? 'bg-zinc-950' : 'bg-gray-300'}`}>
      {twoPageView ? (
        <div className="flex flex-col items-center py-8 gap-8">
          {chunk(pages, 2).map((pair, i) => (
            <div key={i} className="flex gap-6 items-start">
              {pair.map(n => <PDFPage key={n} pageNum={n} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 gap-8">
          {pages.map(n => <PDFPage key={n} pageNum={n} />)}
        </div>
      )}
      <MagnifierLens containerRef={containerRef} />
    </div>
  )
}

// ── Single PDF page ────────────────────────────────────────────────────────
function PDFPage({ pageNum }) {
  const {
    pdfDoc, zoom, pageRotations, theme, activeTool, nightMode,
    drawColor, drawWidth, annotationOpacity, annotations,
    pendingRedactions, addAnnotation, addRedaction, removeAnnotation, updateAnnotation,
    formValues, setFormValue,
  } = useStore()

  const canvasRef     = useRef(null)
  const textLayerRef  = useRef(null)
  const overlayRef    = useRef(null)
  const renderTaskRef = useRef(null)
  const textLayerInst = useRef(null)
  const drawingRef    = useRef(false)
  const pathRef       = useRef([])
  const rectStartRef  = useRef(null)

  const [size, setSize]           = useState({ w: 0, h: 0 })
  const [inlineInput, setInline]  = useState(null)
  // Dragging a placed annotation (hand tool)
  const [annotDrag, setAnnotDrag] = useState(null) // { id, sx, sy, ox, oy }

  // ── Form fields overlay ─────────────────────────────────────────────────
  const [formFields, setFormFields] = useState([])

  useEffect(() => {
    if (!pdfDoc || activeTool !== 'form') { setFormFields([]); return }
    pdfDoc.getPage(pageNum).then(async (page) => {
      const vp   = page.getViewport({ scale: 1 })  // PDF units
      const anns = await page.getAnnotations()
      const widgets = anns
        .filter(a => a.subtype === 'Widget' && a.fieldType)
        .map(f => ({ ...f, _pdfW: vp.width, _pdfH: vp.height }))
      // Reading-order tab index: PDF y increases upward, so a smaller `top`
      // (= larger rect[3]/y2, negated) means visually higher on the page.
      // This sort key is scale-independent - correct regardless of current
      // zoom - so it doesn't need the live CSS `size` used for rendering.
      const sorted = sortFieldsReadingOrder(
        widgets.map(f => ({ ...f, top: f.rect ? -f.rect[3] : 0, left: f.rect ? f.rect[0] : 0 }))
      )
      setFormFields(sorted)
    }).catch(() => {})
  }, [pdfDoc, pageNum, activeTool])

  // ── Annotation drag (hand tool) ─────────────────────────────────────────
  useEffect(() => {
    if (!annotDrag) return
    const onMove = (e) => {
      const dx = e.clientX - annotDrag.sx
      const dy = e.clientY - annotDrag.sy
      updateAnnotation(annotDrag.id, { x: annotDrag.ox + dx, y: annotDrag.oy + dy })
    }
    const onUp = () => setAnnotDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [annotDrag, updateAnnotation])

  const isDark   = theme === 'dark'
  const rotation = pageRotations[pageNum] || 0

  // ── Render PDF canvas + text layer ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const render = async () => {
      if (!pdfDoc || !canvasRef.current) return
      try {
        const page         = await pdfDoc.getPage(pageNum)
        const dpr          = window.devicePixelRatio || 1
        const displayScale = zoom / 100
        const renderScale  = displayScale * dpr

        const renderVp  = page.getViewport({ scale: renderScale,  rotation })
        const displayVp = page.getViewport({ scale: displayScale, rotation })

        // Canvas at physical pixel size, CSS at logical size
        const canvas  = canvasRef.current
        canvas.width  = renderVp.width
        canvas.height = renderVp.height
        canvas.style.width  = Math.round(displayVp.width)  + 'px'
        canvas.style.height = Math.round(displayVp.height) + 'px'
        const logW = Math.round(displayVp.width)
        const logH = Math.round(displayVp.height)
        setSize({ w: logW, h: logH })

        renderTaskRef.current?.cancel()
        if (cancelled) return
        renderTaskRef.current = page.render({ canvasContext: canvas.getContext('2d'), viewport: renderVp })
        await renderTaskRef.current.promise

        // Text layer — uses display viewport (CSS pixels) so spans align with visual text
        if (textLayerRef.current && !cancelled) {
          try {
            textLayerInst.current?.cancel()
            textLayerRef.current.replaceChildren()
            textLayerRef.current.style.width  = logW + 'px'
            textLayerRef.current.style.height = logH + 'px'

            const { TextLayer } = pdfjsLib
            const tl = new TextLayer({
              textContentSource: page.streamTextContent(),
              container: textLayerRef.current,
              viewport: displayVp,
            })
            textLayerInst.current = tl
            await tl.render()
          } catch (e) {
            if (e?.name !== 'AbortException') console.warn('TextLayer:', e)
          }
        }
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.warn('Render:', e)
      }
    }
    render()
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      textLayerInst.current?.cancel()
    }
  }, [pdfDoc, pageNum, zoom, rotation])

  // ── Night mode filter on PDF canvas ──────────────────────────────────────
  useEffect(() => {
    if (canvasRef.current)
      canvasRef.current.style.filter = nightMode ? 'invert(1) hue-rotate(180deg)' : ''
  }, [nightMode, size])

  // ── Sync overlay canvas size ──────────────────────────────────────────────
  useEffect(() => {
    const ov = overlayRef.current
    if (!ov || !size.w) return
    const dpr = window.devicePixelRatio || 1
    ov.width  = size.w * dpr
    ov.height = size.h * dpr
    redraw()
  }, [size])

  // ── Redraw annotation overlay ────────────────────────────────────────────
  const redraw = useCallback(() => {
    const ov = overlayRef.current
    if (!ov || !size.w) return
    const dpr = window.devicePixelRatio || 1
    const ctx = ov.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    for (const a of annotations.filter(a => a.page === pageNum)) {
      ctx.save()

      if (a.rects?.length) {
        // Text-selection-based annotation (highlight / underline / strikethrough)
        for (const rect of a.rects) {
          switch (a.type) {
            case 'highlight':
              ctx.globalAlpha = annotationOpacity
              ctx.fillStyle = a.color || '#fbbf24'
              ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
              break
            case 'underline':
              ctx.globalAlpha = 1
              ctx.strokeStyle = a.color || '#3b82f6'
              ctx.lineWidth = 2; ctx.lineCap = 'square'
              ctx.beginPath()
              ctx.moveTo(rect.x, rect.y + rect.h - 0.5)
              ctx.lineTo(rect.x + rect.w, rect.y + rect.h - 0.5)
              ctx.stroke()
              break
            case 'strikethrough':
              ctx.globalAlpha = 1
              ctx.strokeStyle = a.color || '#ef4444'
              ctx.lineWidth = 2; ctx.lineCap = 'square'
              ctx.beginPath()
              ctx.moveTo(rect.x, rect.y + rect.h * 0.55)
              ctx.lineTo(rect.x + rect.w, rect.y + rect.h * 0.55)
              ctx.stroke()
              break
          }
        }
      } else if (a.path?.length) {
        // Freehand drawing
        switch (a.type) {
          case 'draw':
            ctx.globalAlpha = 1; ctx.strokeStyle = a.color || '#f59e0b'
            ctx.lineWidth = a.width || 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; break
        }
        ctx.beginPath()
        ctx.moveTo(a.path[0].x, a.path[0].y)
        for (let i = 1; i < a.path.length; i++) ctx.lineTo(a.path[i].x, a.path[i].y)
        ctx.stroke()
      }

      ctx.restore()
    }

    // Draw pending redaction boxes
    for (const r of pendingRedactions.filter(r => r.pageNum === pageNum)) {
      ctx.save()
      ctx.fillStyle = REDACTION_FILL; ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2; ctx.setLineDash([6, 3])
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.restore()
    }
  }, [annotations, pendingRedactions, pageNum, size, annotationOpacity])

  useEffect(() => { redraw() }, [redraw])

  // ── Mouse helpers ────────────────────────────────────────────────────────
  const getPos = (e) => {
    const rect = overlayRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // ── Apply text-selection annotation (highlight / underline / strikethrough) ──
  const applyTextAnnotation = useCallback(() => {
    if (!HIGHLIGHT_TOOLS.includes(activeTool)) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const pageEl = document.getElementById(`page-${pageNum}`)
    if (!pageEl) return
    const pageBounds = pageEl.getBoundingClientRect()

    const pageRects = []
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i)
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 2 || r.height < 2) continue
        if (r.right < pageBounds.left - 5 || r.left > pageBounds.right + 5 ||
            r.bottom < pageBounds.top - 5 || r.top > pageBounds.bottom + 5) continue
        pageRects.push({
          x: r.left - pageBounds.left,
          y: r.top - pageBounds.top,
          w: r.width,
          h: r.height,
        })
      }
    }

    if (pageRects.length) {
      addAnnotation({ type: activeTool, page: pageNum, rects: pageRects, color: drawColor, pageW: size.w, pageH: size.h })
      selection.removeAllRanges()
    }
  }, [activeTool, pageNum, drawColor, addAnnotation, size])

  const onMouseDown = (e) => {
    const tool = activeTool
    if (!DRAW_TOOLS.includes(tool)) return
    e.preventDefault()

    // ── Eraser: remove annotation near click ──────────────────────────
    if (tool === 'eraser') {
      const pos = getPos(e)
      for (const ann of annotations.filter(a => a.page === pageNum)) {
        const hitRect   = ann.rects?.some(r =>
          pos.x >= r.x - 8 && pos.x <= r.x + r.w + 8 &&
          pos.y >= r.y - 8 && pos.y <= r.y + r.h + 8)
        const hitPath   = ann.path?.some(pt => Math.hypot(pt.x - pos.x, pt.y - pos.y) < 18)
        const hitAnchor = typeof ann.x === 'number' && Math.hypot(ann.x - pos.x, ann.y - pos.y) < 24
        if (hitRect || hitPath || hitAnchor) { removeAnnotation(ann.id); return }
      }
      return
    }

    // ── Note / Text → inline input widget ────────────────────────────
    if (tool === 'note' || tool === 'text') {
      const pos = getPos(e)
      setInline({ type: tool, x: pos.x, y: pos.y })
      return
    }

    // ── Redact → start rect ───────────────────────────────────────────
    if (tool === 'redact') {
      rectStartRef.current = getPos(e)
      drawingRef.current = true
      return
    }

    // ── Freehand drawing ──────────────────────────────────────────────
    drawingRef.current = true
    pathRef.current = [getPos(e)]
  }

  const onMouseMove = (e) => {
    if (!drawingRef.current || !overlayRef.current) return
    const pos = getPos(e)

    if (activeTool === 'redact' && rectStartRef.current) {
      redraw()
      const dpr = window.devicePixelRatio || 1
      const ctx = overlayRef.current.getContext('2d')
      const s   = rectStartRef.current
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = REDACTION_FILL; ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2; ctx.setLineDash([6, 3])
      ctx.fillRect(s.x, s.y, pos.x - s.x, pos.y - s.y)
      ctx.strokeRect(s.x, s.y, pos.x - s.x, pos.y - s.y)
      ctx.restore()
      return
    }

    pathRef.current.push(pos)
    redraw()

    const dpr = window.devicePixelRatio || 1
    const ctx = overlayRef.current.getContext('2d')
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const path = pathRef.current
    ctx.globalAlpha  = 1
    ctx.strokeStyle  = drawColor
    ctx.lineWidth    = drawWidth
    ctx.lineCap      = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
    ctx.stroke()
    ctx.restore()
  }

  const onMouseUp = (e) => {
    if (!drawingRef.current) return
    drawingRef.current = false

    if (activeTool === 'redact' && rectStartRef.current) {
      const pos = getPos(e)
      const s   = rectStartRef.current
      const x = Math.min(s.x, pos.x), y = Math.min(s.y, pos.y)
      const w = Math.abs(pos.x - s.x),  h = Math.abs(pos.y - s.y)
      if (w > 5 && h > 5) addRedaction({ pageNum, x, y, w, h, logicalW: size.w, logicalH: size.h })
      rectStartRef.current = null
      redraw()
      return
    }

    if (pathRef.current.length > 1)
      addAnnotation({ type: activeTool, page: pageNum, path: [...pathRef.current], color: drawColor, width: drawWidth, pageW: size.w, pageH: size.h })
    pathRef.current = []
  }

  const isDrawTool     = DRAW_TOOLS.includes(activeTool)
  const isTextAnnotTool = HIGHLIGHT_TOOLS.includes(activeTool)
  const isSelectTool   = activeTool === 'select'
  const isFormTool     = activeTool === 'form'

  const confirmInline = (text) => {
    if (text?.trim()) addAnnotation({ type: inlineInput.type, page: pageNum, x: inlineInput.x, y: inlineInput.y, text, pageW: size.w, pageH: size.h })
    setInline(null)
  }

  return (
    <div
      id={`page-${pageNum}`}
      data-page={pageNum}
      className="pdf-page-wrap relative flex-shrink-0 rounded overflow-visible"
      style={{ width: size.w || 600, height: size.h || 800 }}
    >
      {/* 1. PDF canvas */}
      <canvas ref={canvasRef} className="block" style={{ display: 'block' }} />

      {/* 2. Text layer — for text selection and text-based annotations */}
      <div
        ref={textLayerRef}
        className={`textLayer absolute top-0 left-0 ${(isSelectTool || isTextAnnotTool) ? 'select-enabled' : 'select-disabled'}`}
        onMouseUp={isTextAnnotTool ? applyTextAnnotation : undefined}
      />

      {/* 3. Drawing overlay — for annotations */}
      <canvas
        ref={overlayRef}
        className="absolute top-0 left-0"
        style={{
          width:          size.w + 'px',
          height:         size.h + 'px',
          cursor:         isDrawTool ? 'crosshair' : 'default',
          pointerEvents:  isDrawTool ? 'all' : 'none',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />

      {/* 4. Inline input widget (note / text box) */}
      {inlineInput && (
        <InlineInput
          type={inlineInput.type}
          x={inlineInput.x}
          y={inlineInput.y}
          isDark={isDark}
          onConfirm={confirmInline}
          onCancel={() => setInline(null)}
        />
      )}

      {/* 5. Sticky note icons */}
      {annotations.filter(a => a.page === pageNum && a.type === 'note').map(a => (
        <DraggableAnnotationMarker key={a.id} activeTool={activeTool}
          className={`absolute text-xl select-none z-10
            ${activeTool === 'hand' ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
          style={{ left: a.x - 10, top: a.y - 10, userSelect: 'none' }}
          title={activeTool === 'hand' ? 'Ziehen zum Verschieben · Rechtsklick zum Löschen' : a.text}
          onDragStart={(e) => setAnnotDrag({ id: a.id, sx: e.clientX, sy: e.clientY, ox: a.x, oy: a.y })}
          onRemove={() => removeAnnotation(a.id)}>
          📌
        </DraggableAnnotationMarker>
      ))}

      {/* 6. Text box overlays */}
      {annotations.filter(a => a.page === pageNum && a.type === 'text').map(a => (
        <DraggableAnnotationMarker key={a.id} activeTool={activeTool}
          className={`absolute text-xs px-2.5 py-1.5 rounded border shadow-sm max-w-[260px] min-w-[60px] break-words leading-relaxed z-10
            ${activeTool === 'hand' ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none select-none'}
            ${isDark ? 'bg-zinc-800/95 text-zinc-100 border-zinc-500' : 'bg-white text-gray-900 border-gray-400'}`}
          style={{ left: a.x, top: a.y, userSelect: 'none' }}
          title={activeTool === 'hand' ? 'Ziehen zum Verschieben · Rechtsklick zum Löschen' : undefined}
          onDragStart={(e) => setAnnotDrag({ id: a.id, sx: e.clientX, sy: e.clientY, ox: a.x, oy: a.y })}
          onRemove={() => removeAnnotation(a.id)}>
          {a.text}
        </DraggableAnnotationMarker>
      ))}

      {/* 7. Form fields overlay */}
      {isFormTool && size.w > 0 && formFields.map((field, i) => {
        if (!field.rect) return null
        const [x1, y1, x2, y2] = field.rect
        const pdfW  = field._pdfW || 595
        const pdfH  = field._pdfH || 842
        const scaleX = size.w / pdfW
        const scaleY = size.h / pdfH
        const left   = x1 * scaleX
        const top    = size.h - y2 * scaleY   // PDF y=0 is bottom; CSS y=0 is top
        const width  = (x2 - x1) * scaleX
        const height = (y2 - y1) * scaleY
        const key    = field.fieldName || String(i)
        const isCheckbox = field.fieldType === 'Btn' && !field.radioButton
        // Reading-order tab index, offset per page so Tab crosses page
        // boundaries into the topmost field of the next page (pages already
        // mount in DOM order 1..N). 1000 is safe headroom per page for any
        // realistic form field count.
        const tabIndex = pageNum * 1000 + i
        return (
          <div key={key} className="absolute z-20" style={{ left, top, width, height }}>
            {field.fieldType === 'Tx' && (
              <input
                value={formValues[key] || ''}
                onChange={e => setFormValue(key, e.target.value)}
                placeholder={field.alternativeText || ''}
                tabIndex={tabIndex}
                className="w-full h-full px-1 outline outline-2 outline-blue-400/70 bg-blue-50/80 text-gray-900"
                style={{ fontSize: Math.max(8, Math.min(height * 0.6, 14)) }}
              />
            )}
            {isCheckbox && (
              <input type="checkbox"
                checked={!!formValues[key]}
                onChange={e => setFormValue(key, e.target.checked)}
                tabIndex={tabIndex}
                className="w-full h-full accent-clover-500 cursor-pointer"
              />
            )}
          </div>
        )
      })}

      {/* 8. Page badge */}
      <div className={`absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full pointer-events-none select-none
        ${isDark ? 'bg-black/40 text-zinc-400' : 'bg-black/10 text-gray-500'}`}>
        {pageNum}
      </div>
    </div>
  )
}

// Shared drag-to-move / right-click-to-delete wrapper for sticky notes and
// text boxes — both only ever differ in their own className/style/content.
function DraggableAnnotationMarker({ activeTool, className, style, title, onDragStart, onRemove, children }) {
  return (
    <div className={className} style={style} title={title}
      onMouseDown={activeTool === 'hand' ? (e) => {
        e.preventDefault(); e.stopPropagation()
        onDragStart(e)
      } : undefined}
      onContextMenu={activeTool === 'hand' ? (e) => { e.preventDefault(); onRemove() } : undefined}>
      {children}
    </div>
  )
}

// ── Inline input widget (replaces prompt()) ────────────────────────────────
function InlineInput({ type, x, y, isDark, onConfirm, onCancel }) {
  const [value, setValue] = useState('')
  const ref = useRef(null)

  useEffect(() => { ref.current?.focus() }, [])

  const isNote = type === 'note'

  return (
    <div
      className="absolute z-30"
      style={{ left: Math.min(x, 400), top: y, minWidth: 200 }}
      // Prevent mousedown from bubbling to overlay (which would start drawing)
      onMouseDown={e => e.stopPropagation()}>
      <div className={`rounded-xl overflow-hidden shadow-2xl border
        ${isNote
          ? 'bg-yellow-50 border-yellow-300'
          : isDark ? 'bg-zinc-800 border-zinc-600' : 'bg-white border-gray-300'
        }`}>
        {/* Header */}
        <div className={`px-2.5 py-1.5 text-[11px] font-semibold border-b
          ${isNote
            ? 'bg-yellow-100 border-yellow-200 text-yellow-800'
            : isDark ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}>
          {isNote ? '📌 Notiz' : '📝 Textfeld'}
        </div>
        {/* Textarea */}
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onCancel()
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onConfirm(value)
          }}
          className={`block w-full p-2.5 text-sm resize-none outline-none bg-transparent
            ${isNote ? 'text-yellow-900 placeholder-yellow-500' : isDark ? 'text-zinc-100 placeholder-zinc-500' : 'text-gray-800 placeholder-gray-400'}`}
          placeholder={isNote ? 'Notiz eingeben …' : 'Text eingeben …'}
          rows={3}
          style={{ minWidth: 200 }}
        />
        {/* Footer hint + buttons */}
        <div className={`flex items-center justify-between px-2.5 py-1.5 border-t
          ${isNote ? 'bg-yellow-100 border-yellow-200' : isDark ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-50 border-gray-100'}`}>
          <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
            Strg+↵ speichern · Esc abbrechen
          </span>
          <div className="flex gap-1">
            <button onClick={onCancel}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors
                ${isDark ? 'text-zinc-400 hover:bg-zinc-600' : 'text-gray-500 hover:bg-gray-200'}`}>
              ✕
            </button>
            <button onClick={() => onConfirm(value)}
              className="px-2 py-0.5 rounded text-[11px] bg-clover-600 hover:bg-clover-700 text-white transition-colors">
              ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
