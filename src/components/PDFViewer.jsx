import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import MagnifierLens from './MagnifierLens'
import { flattenAnnotations } from '../lib/annotationFlatten'
import { findPIIRedactions, findTextRedactions } from '../lib/piiDetection'
import { chunk } from '../lib/chunk'
import { sortFieldsReadingOrder } from '../lib/formFieldOrder'
import { renderPageToCanvas } from '../lib/renderPage'
import { rectToPdfPoints, pdfPointRectToRasterPixels, isTextContentEmpty } from '../lib/redactionRects'
import { reloadPdfDoc } from '../lib/reloadPdfDoc'
import { unrotateDelta } from '../lib/rotateVector'
import { saveAsNewFile } from '../lib/saveAsNewFile'
import { useEraserTool } from './pdf-tools/useEraserTool'
import { useRedactTool } from './pdf-tools/useRedactTool'
import { useFormFieldTool } from './pdf-tools/useFormFieldTool'
import { useShapeTool } from './pdf-tools/useShapeTool'
import { useDrawTool } from './pdf-tools/useDrawTool'
import { REDACTION_FILL, SHAPE_STROKE } from './pdf-tools/constants'

// DPI redacted pages are rasterized at before being flattened into the PDF -
// high enough to stay legible/printable, matching ExportImagesModal's top DPI option.
const REDACTION_RASTER_DPI = 300

// Tool-id groups checked in multiple places below (text-selection annotations
// vs. freehand-drag tools) — kept as single constants so both checks can't drift.
const HIGHLIGHT_TOOLS = ['highlight', 'underline', 'strikethrough']
const DRAW_TOOLS = ['draw', 'note', 'text', 'redact', 'eraser', 'newfield', 'shape', 'stamp']
const STAMP_DEFAULT_W = 150

// Opacity for freehand-drawn/highlight annotation strokes when rendered and
// when flattened into the saved PDF. No settings UI exposes this - it is a
// fixed value, not user-configurable state.
const ANNOTATION_OPACITY = 0.4

// Draws a line with a small 2-stroke arrowhead at (x2,y2), angle derived via atan2.
// Used for both the live 2-click arrow preview and the committed arrow annotation.
function drawArrowOnCanvas(ctx, x1, y1, x2, y2) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  const angle    = Math.atan2(y2 - y1, x2 - x1)
  const headLen  = 12
  const headAngle = Math.PI / 7
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle - headAngle), y2 - headLen * Math.sin(angle - headAngle))
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle + headAngle), y2 - headLen * Math.sin(angle + headAngle))
  ctx.stroke()
}

// Post-redaction confirmation: reload the freshly-redacted bytes and confirm
// the pages we just rasterized really carry no extractable text anymore.
async function verifyNoResidualText(newBytes, redactedPages) {
  const doc = await reloadPdfDoc(newBytes)
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
    pdfDoc, pdfBytes, filePath, fileName, totalPages, zoom, pageRotations, theme, twoPageView, openDocument, setPdfBytes, setDirty, setZoom, setStatus, clearRedactions,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, pdfBytes: state.pdfBytes, filePath: state.filePath, fileName: state.fileName, totalPages: state.totalPages, zoom: state.zoom, pageRotations: state.pageRotations, theme: state.theme, twoPageView: state.twoPageView, openDocument: state.openDocument, setPdfBytes: state.setPdfBytes, setDirty: state.setDirty, setZoom: state.setZoom, setStatus: state.setStatus, clearRedactions: state.clearRedactions })))

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
      const { pdfBytes: b, filePath: fp, fileName: fn, annotations, formValues, pendingFormFields } = useStore.getState()
      if (!b) return
      try {
        setStatus('Speichern …')
        // Embed all UI annotations + filled form field values + newly-created
        // form fields permanently into PDF bytes before writing. newFields
        // drafts are NOT cleared after saving - every save re-derives from the
        // same pristine pdfBytes (below), so a repeated save re-creates the
        // exact same fields on top of the same base rather than duplicating them.
        const newFields = pendingFormFields.map(f => ({
          page: f.pageNum, type: f.type, name: f.name,
          x: f.x, y: f.y, w: f.w, h: f.h, pageW: f.logicalW, pageH: f.logicalH,
        }))
        const bytes = await flattenAnnotations(b, annotations, formValues, ANNOTATION_OPACITY, newFields)
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
        const reloaded = await reloadPdfDoc(merged)
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
        const savedPath = await saveAsNewFile(fn, result.bytes)
        if (!savedPath) { setStatus(''); return }
        setStatus('Repariert gespeichert: ' + savedPath.split(/[\\/]/).pop())
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
  // Known, accepted tradeoff (document-wide, not just redacted pages): outDoc
  // is a fresh PDFDocument built via outDoc.copyPages(srcDoc, ...) once per
  // page, each call getting its own internal PDFObjectCopier - the source
  // document's StructTreeRoot (accessibility tags, including Alt-Text set via
  // the Alt-Text editor), Outline/bookmarks, and AcroForm catalog dict are
  // never carried over, so ANY redaction silently un-tags/un-bookmarks the
  // whole document. Investigated re-attaching the AcroForm dict after the
  // page loop: pdf-lib's own docs concede copyPages-based rebuilds don't
  // preserve AcroForm/Outlines, and copying it with a *second*, separate
  // PDFObjectCopier would produce a disconnected duplicate of each Widget
  // annotation - unlinked from the (correctly rendering) copy the page's own
  // copier already made - likely worse than today's honest "no AcroForm"
  // state. A correct fix means bypassing copyPages() entirely to share one
  // copier across the whole rebuild; too large/risky for a maintenance
  // release. Users are warned via the Toolbar.jsx banner instead.
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

        const reloaded = await reloadPdfDoc(newB)
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
          label: m.label, text: m.text, source: 'pii',
        }))
        if (matches.length) useStore.getState().setSidebarTab('redact')
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
          label: m.label, text: m.text, source: 'search',
        }))
        if (matches.length) useStore.getState().setSidebarTab('redact')
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
    pdfDoc, zoom, pageRotations, theme, activeTool, nightMode, drawColor, drawWidth, textFontSize, textBold, annotations, pendingRedactions, addAnnotation, addRedaction, removeAnnotation, updateAnnotation, formValues, setFormValue, seedFormValues, pendingFormFields, newFieldType, addFormFieldDraft, updateFormFieldDraft, removeFormFieldDraft, shapeType, pendingStampConfig, setPendingStampConfig, setActiveTool, setNewFieldType, setActiveRadioGroupId,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, zoom: state.zoom, pageRotations: state.pageRotations, theme: state.theme, activeTool: state.activeTool, nightMode: state.nightMode, drawColor: state.drawColor, drawWidth: state.drawWidth, textFontSize: state.textFontSize, textBold: state.textBold, annotations: state.annotations, pendingRedactions: state.pendingRedactions, addAnnotation: state.addAnnotation, addRedaction: state.addRedaction, removeAnnotation: state.removeAnnotation, updateAnnotation: state.updateAnnotation, formValues: state.formValues, setFormValue: state.setFormValue, seedFormValues: state.seedFormValues, pendingFormFields: state.pendingFormFields, newFieldType: state.newFieldType, addFormFieldDraft: state.addFormFieldDraft, updateFormFieldDraft: state.updateFormFieldDraft, removeFormFieldDraft: state.removeFormFieldDraft, shapeType: state.shapeType, pendingStampConfig: state.pendingStampConfig, setPendingStampConfig: state.setPendingStampConfig, setActiveTool: state.setActiveTool, setNewFieldType: state.setNewFieldType, setActiveRadioGroupId: state.setActiveRadioGroupId })))

  const canvasRef     = useRef(null)
  const textLayerRef  = useRef(null)
  const overlayRef    = useRef(null)
  const renderTaskRef = useRef(null)
  const textLayerInst = useRef(null)

  const [size, setSize]           = useState({ w: 0, h: 0 })
  const [inlineInput, setInline]  = useState(null)
  // Dragging a placed annotation (hand tool)
  const [annotDrag, setAnnotDrag] = useState(null) // { id, sx, sy, ox, oy }
  // Resizing a placed stamp annotation (hand tool) - other annotation types
  // either have no explicit w/h (note/text are content-sized) or weren't
  // asked to support resize (shapes)
  const [annotResize, setAnnotResize] = useState(null) // { id, sx, sy, ow, oh, rotation }
  // Dragging / resizing a pending new-field draft (hand tool)
  const [fieldDrag, setFieldDrag]     = useState(null) // { id, sx, sy, ox, oy }
  const [fieldResize, setFieldResize] = useState(null) // { id, sx, sy, ow, oh }

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

      // Seed formValues from the PDF's own pre-existing field values (e.g. a
      // form someone already partly filled in) so they actually show up in
      // the fill overlay - previously only radio groups had this fallback
      // (`formValues[key] ?? field.fieldValue` at render time); Tx/checkbox/Ch
      // silently ignored any value already present in the source PDF.
      const key = (f) => f.fieldName || ''
      const entries = {}
      for (const f of widgets) {
        if (!key(f)) continue
        if (f.fieldType === 'Tx' && f.fieldValue) entries[key(f)] = f.fieldValue
        else if (f.fieldType === 'Btn' && !f.radioButton) entries[key(f)] = f.fieldValue === f.exportValue
        else if (f.fieldType === 'Ch' && f.fieldValue != null) entries[key(f)] = f.fieldValue
      }
      if (Object.keys(entries).length) seedFormValues(entries)
    }).catch(() => {})
  }, [pdfDoc, pageNum, activeTool, seedFormValues])

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

  // ── Stamp resize (hand tool) ─────────────────────────────────────────────
  useEffect(() => {
    if (!annotResize) return
    const onMove = (e) => {
      const dx = e.clientX - annotResize.sx
      const dy = e.clientY - annotResize.sy
      // The handle is a child of the stamp's own div, which carries the CSS
      // `rotate(${-a.rotation}deg)` preview transform (see the stamp overlay
      // below) - so a raw screen-space mouse delta no longer lines up with
      // the box's own width/height axes once rotated.
      const { dx: ldx, dy: ldy } = unrotateDelta(dx, dy, annotResize.rotation)
      updateAnnotation(annotResize.id, { w: Math.max(20, annotResize.ow + ldx), h: Math.max(14, annotResize.oh + ldy) })
    }
    const onUp = () => setAnnotResize(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [annotResize, updateAnnotation])

  // ── New-field draft drag (hand tool) ─────────────────────────────────────
  useEffect(() => {
    if (!fieldDrag) return
    const onMove = (e) => {
      const dx = e.clientX - fieldDrag.sx
      const dy = e.clientY - fieldDrag.sy
      updateFormFieldDraft(fieldDrag.id, { x: fieldDrag.ox + dx, y: fieldDrag.oy + dy })
    }
    const onUp = () => setFieldDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [fieldDrag, updateFormFieldDraft])

  // ── New-field draft resize (hand tool) ───────────────────────────────────
  useEffect(() => {
    if (!fieldResize) return
    const onMove = (e) => {
      const dx = e.clientX - fieldResize.sx
      const dy = e.clientY - fieldResize.sy
      updateFormFieldDraft(fieldResize.id, { w: Math.max(20, fieldResize.ow + dx), h: Math.max(14, fieldResize.oh + dy) })
    }
    const onUp = () => setFieldResize(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [fieldResize, updateFormFieldDraft])

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
              ctx.globalAlpha = ANNOTATION_OPACITY
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
      } else if (a.type === 'rectangle' || a.type === 'circle') {
        ctx.globalAlpha = 1
        ctx.strokeStyle = a.color || SHAPE_STROKE
        ctx.lineWidth = a.width || 2
        if (a.type === 'rectangle') {
          ctx.strokeRect(a.x, a.y, a.w, a.h)
        } else {
          ctx.beginPath()
          ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, Math.abs(a.w) / 2, Math.abs(a.h) / 2, 0, 0, Math.PI * 2)
          ctx.stroke()
        }
      } else if (a.type === 'arrow') {
        ctx.globalAlpha = 1
        ctx.strokeStyle = a.color || SHAPE_STROKE
        ctx.lineWidth = a.width || 2
        ctx.lineCap = 'round'
        drawArrowOnCanvas(ctx, a.x1, a.y1, a.x2, a.y2)
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
  }, [annotations, pendingRedactions, pageNum, size])

  useEffect(() => { redraw() }, [redraw])

  // ── Mouse helpers ────────────────────────────────────────────────────────
  const getPos = (e) => {
    const rect = overlayRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const eraserTool = useEraserTool({ annotations, pageNum, getPos, removeAnnotation })
  const redactTool = useRedactTool({ pageNum, size, getPos, overlayRef, redraw, addRedaction })
  const formFieldTool = useFormFieldTool({ pageNum, size, getPos, overlayRef, redraw, newFieldType, addFormFieldDraft })
  const shapeTool = useShapeTool({ pageNum, size, getPos, overlayRef, redraw, shapeType, drawColor, drawWidth, addAnnotation })
  const drawTool = useDrawTool({ pageNum, size, getPos, overlayRef, redraw, drawColor, drawWidth, addAnnotation })

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
      eraserTool.onMouseDown(e)
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
      redactTool.onMouseDown(e)
      return
    }

    // ── New form field → start rect ───────────────────────────────────
    if (tool === 'newfield') {
      formFieldTool.onMouseDown(e)
      return
    }

    // ── Shape: rectangle/circle drag, or arrow's 2-click gesture ───────
    if (tool === 'shape') {
      shapeTool.onMouseDown(e)
      return
    }

    // ── Stamp: single click places it at default size, then hands back
    // to the hand tool so drag-to-reposition (DraggableAnnotationMarker,
    // already generic for note/text) works immediately ─────────────────
    if (tool === 'stamp') {
      if (!pendingStampConfig) { setActiveTool('hand'); return }
      const pos = getPos(e)
      const w = STAMP_DEFAULT_W
      const h = pendingStampConfig.kind === 'custom' ? w * (pendingStampConfig.aspect || 1) : w / 3
      addAnnotation({ type: 'stamp', page: pageNum, x: pos.x - w / 2, y: pos.y - h / 2, w, h, pageW: size.w, pageH: size.h, ...pendingStampConfig })
      setPendingStampConfig(null)
      setActiveTool('hand')
      return
    }

    // ── Freehand drawing ──────────────────────────────────────────────
    drawTool.onMouseDown(e)
  }

  const onMouseMove = (e) => {
    if (!overlayRef.current) return

    if (activeTool === 'redact') { redactTool.onMouseMove(e); return }
    if (activeTool === 'newfield') { formFieldTool.onMouseMove(e); return }
    if (activeTool === 'shape') { shapeTool.onMouseMove(e); return }
    if (activeTool === 'draw') { drawTool.onMouseMove(e); return }
  }

  const onMouseUp = (e) => {
    if (activeTool === 'redact') { redactTool.onMouseUp(e); return }
    if (activeTool === 'newfield') { formFieldTool.onMouseUp(e); return }
    if (activeTool === 'shape') { shapeTool.onMouseUp(e); return }
    if (activeTool === 'draw') { drawTool.onMouseUp(e); return }
  }

  const isDrawTool     = DRAW_TOOLS.includes(activeTool)
  const isTextAnnotTool = HIGHLIGHT_TOOLS.includes(activeTool)
  const isSelectTool   = activeTool === 'select'
  const isFormTool     = activeTool === 'form'

  const confirmInline = (text) => {
    if (text?.trim()) {
      const extra = inlineInput.type === 'text' ? { color: drawColor, fontSize: textFontSize, bold: textBold } : {}
      addAnnotation({ type: inlineInput.type, page: pageNum, x: inlineInput.x, y: inlineInput.y, text, pageW: size.w, pageH: size.h, ...extra })
    }
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
          className={`absolute px-2.5 py-1.5 rounded border shadow-sm max-w-[260px] min-w-[60px] break-words leading-relaxed z-10
            ${activeTool === 'hand' ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none select-none'}
            ${isDark ? 'bg-zinc-800/95 border-zinc-500' : 'bg-white border-gray-400'}
            ${a.color ? '' : (isDark ? 'text-zinc-100' : 'text-gray-900')}`}
          style={{ left: a.x, top: a.y, userSelect: 'none', fontSize: a.fontSize || 12, color: a.color || undefined, fontWeight: a.bold ? 'bold' : undefined }}
          title={activeTool === 'hand' ? 'Ziehen zum Verschieben · Rechtsklick zum Löschen' : undefined}
          onDragStart={(e) => setAnnotDrag({ id: a.id, sx: e.clientX, sy: e.clientY, ox: a.x, oy: a.y })}
          onRemove={() => removeAnnotation(a.id)}>
          {a.text}
        </DraggableAnnotationMarker>
      ))}

      {/* 6b. Stamp overlays */}
      {annotations.filter(a => a.page === pageNum && a.type === 'stamp').map(a => (
        <DraggableAnnotationMarker key={a.id} activeTool={activeTool}
          className={`absolute select-none z-10 flex items-center justify-center overflow-hidden
            ${activeTool === 'hand' ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
          style={{
            left: a.x, top: a.y, width: a.w, height: a.h, userSelect: 'none',
            transform: a.rotation ? `rotate(${-a.rotation}deg)` : undefined,
            ...(a.kind !== 'custom' ? {
              border: `3px solid ${a.color}`, borderRadius: 4,
              color: a.color, fontWeight: 'bold', letterSpacing: 1,
              fontSize: Math.max(10, a.h * 0.32),
            } : {}),
          }}
          title={activeTool === 'hand' ? 'Ziehen zum Verschieben · Rechtsklick zum Löschen' : (a.text || undefined)}
          onDragStart={(e) => setAnnotDrag({ id: a.id, sx: e.clientX, sy: e.clientY, ox: a.x, oy: a.y })}
          onRemove={() => removeAnnotation(a.id)}>
          {a.kind === 'custom'
            ? <img src={a.imageUrl} alt="Stempel" className="w-full h-full object-contain pointer-events-none" draggable={false}/>
            : a.text}
          {activeTool === 'hand' && (
            <div
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setAnnotResize({ id: a.id, sx: e.clientX, sy: e.clientY, ow: a.w, oh: a.h, rotation: a.rotation || 0 }) }}
              className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-blue-500 cursor-nwse-resize pointer-events-auto"
            />
          )}
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
          // Radio-button widgets share `key` (their common fieldName) across
          // multiple widgets - the React list key needs the map index too so
          // sibling radio buttons don't collide.
          <div key={`${key}-${i}`} className="absolute z-20" style={{ left, top, width, height }}>
            {field.fieldType === 'Tx' && (field.multiLine ? (
              <textarea
                value={formValues[key] || ''}
                onChange={e => setFormValue(key, e.target.value)}
                placeholder={field.alternativeText || ''}
                tabIndex={tabIndex}
                className="w-full h-full px-1 py-0.5 resize-none outline outline-2 outline-blue-400/70 bg-blue-50/80 text-gray-900"
                style={{ fontSize: Math.max(8, Math.min(height * 0.3, 14)) }}
              />
            ) : (
              <input
                value={formValues[key] || ''}
                onChange={e => setFormValue(key, e.target.value)}
                placeholder={field.alternativeText || ''}
                tabIndex={tabIndex}
                className="w-full h-full px-1 outline outline-2 outline-blue-400/70 bg-blue-50/80 text-gray-900"
                style={{ fontSize: Math.max(8, Math.min(height * 0.6, 14)) }}
              />
            ))}
            {isCheckbox && (
              <input type="checkbox"
                checked={!!formValues[key]}
                onChange={e => setFormValue(key, e.target.checked)}
                tabIndex={tabIndex}
                className="w-full h-full accent-clover-500 cursor-pointer"
              />
            )}
            {field.fieldType === 'Btn' && field.radioButton && (
              <input type="radio"
                name={`radio-${key}`}
                checked={(formValues[key] ?? field.fieldValue) === field.buttonValue}
                onChange={() => setFormValue(key, field.buttonValue)}
                tabIndex={tabIndex}
                className="w-full h-full accent-clover-500 cursor-pointer"
              />
            )}
            {field.fieldType === 'Ch' && (() => {
              // Real multi-selection for listboxes (field.multiSelect) - dropdowns
              // stay single-select regardless, since PDF readers only ever render
              // one selected value for a combo box even if pdf-lib technically
              // allows more (see PDFDropdown.select()'s own doc comment).
              const isMulti = !field.combo && field.multiSelect
              return (
                <select
                  multiple={isMulti}
                  value={isMulti ? (formValues[key] || []) : (formValues[key] ?? '')}
                  onChange={e => setFormValue(key, isMulti
                    ? Array.from(e.target.selectedOptions).map(o => o.value)
                    : e.target.value)}
                  tabIndex={tabIndex}
                  size={!field.combo ? Math.min(field.options?.length || 1, 4) : undefined}
                  className="w-full h-full px-1 outline outline-2 outline-blue-400/70 bg-blue-50/80 text-gray-900"
                  style={{ fontSize: Math.max(8, Math.min(height * 0.6, 14)) }}>
                  {field.combo && <option value="">—</option>}
                  {(field.options || []).map((opt, oi) => (
                    <option key={oi} value={opt.exportValue}>{opt.displayValue}</option>
                  ))}
                </select>
              )
            })()}
          </div>
        )
      })}

      {/* 7b. Pending new-field drafts (visible whenever pending, like sticky notes) */}
      {pendingFormFields.filter(f => f.pageNum === pageNum).map(f => {
        // Radio-group members all share one field name (needed once flattened
        // into a single pdf-lib radio-group field) - only the group's first
        // member gets an editable name input, later members show a read-only
        // label instead, so renaming one option can't silently desync the
        // group's actual field name from what the box displays.
        const groupSiblings = f.groupId ? pendingFormFields.filter(x => x.groupId === f.groupId) : []
        const isFirstInGroup = f.type !== 'radio' || groupSiblings[0]?.id === f.id
        const optionIndex = f.groupId ? groupSiblings.findIndex(x => x.id === f.id) + 1 : 0
        return (
          <DraggableFieldBox key={f.id} field={f} activeTool={activeTool} isDark={isDark}
            isFirstInGroup={isFirstInGroup} optionIndex={optionIndex}
            onDragStart={(e) => setFieldDrag({ id: f.id, sx: e.clientX, sy: e.clientY, ox: f.x, oy: f.y })}
            onResizeStart={(e) => setFieldResize({ id: f.id, sx: e.clientX, sy: e.clientY, ow: f.w, oh: f.h })}
            onRename={(name) => updateFormFieldDraft(f.id, { name })}
            onRemove={() => removeFormFieldDraft(f.id)}
            onUpdateOptions={(options) => updateFormFieldDraft(f.id, { options })}
            onUpdateOptionValue={(optionValue) => updateFormFieldDraft(f.id, { optionValue })}
            onAddRadioOption={() => { setActiveRadioGroupId(f.groupId); setNewFieldType('radio'); setActiveTool('newfield') }}
          />
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

// A pending new-field draft: a positioned, draggable/resizable/renameable box
// (not canvas-painted like the redaction preview, since it must stay editable
// until the document is saved). Visible whenever pending, draggable/resizable
// only with the hand tool active - same convention as sticky notes/text boxes.
function DraggableFieldBox({ field, activeTool, isDark, onDragStart, onResizeStart, onRename, onRemove, onUpdateOptions, onUpdateOptionValue, onAddRadioOption, isFirstInGroup = true, optionIndex = 0 }) {
  const isHand = activeTool === 'hand'
  const hasOptions = field.type === 'dropdown' || field.type === 'listbox'
  const isRadio = field.type === 'radio'
  const options = field.options || []

  const updateOption = (i, value) => onUpdateOptions?.(options.map((o, oi) => oi === i ? value : o))
  const removeOption = (i) => onUpdateOptions?.(options.filter((_, oi) => oi !== i))
  const addOption = () => onUpdateOptions?.([...options, `Option ${options.length + 1}`])

  return (
    <div className="absolute z-20 border-2 border-dashed border-blue-500 bg-blue-500/10"
      style={{ left: field.x, top: field.y, width: field.w, height: field.h,
        cursor: isHand ? 'grab' : 'default' }}
      onMouseDown={isHand ? (e) => { e.preventDefault(); e.stopPropagation(); onDragStart(e) } : undefined}
      onContextMenu={isHand ? (e) => { e.preventDefault(); onRemove() } : undefined}
      title={isHand ? 'Ziehen zum Verschieben · Rechtsklick zum Löschen' : undefined}>
      {isRadio && !isFirstInGroup ? (
        <div className={`absolute -top-6 left-0 w-full text-[11px] px-1 py-0.5 rounded truncate
          ${isDark ? 'bg-zinc-800/70 text-zinc-400' : 'bg-gray-100 text-gray-500'}`}>
          Teil von: {field.name}
        </div>
      ) : (
        <input
          value={field.name}
          onChange={(e) => onRename(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          className={`absolute -top-6 left-0 w-full text-[11px] px-1 py-0.5 rounded outline-none border
            ${isDark ? 'bg-zinc-800 text-zinc-100 border-zinc-600' : 'bg-white text-gray-900 border-gray-300'}`}
        />
      )}
      {field.type === 'checkbox' && (
        <div className="absolute inset-1 border border-blue-400 rounded-sm"/>
      )}
      {isRadio && (
        <>
          <div className="absolute inset-1 border-2 border-blue-400 rounded-full pointer-events-none"/>
          <div onMouseDown={(e) => e.stopPropagation()}
            className={`absolute left-0 z-30 w-48 rounded-lg border shadow-lg text-[11px] p-1.5 space-y-1
              ${isDark ? 'bg-zinc-800 border-zinc-600' : 'bg-white border-gray-300'}`}
            style={{ top: field.h + 6 }}>
            <div className={isDark ? 'text-zinc-400' : 'text-gray-500'}>Gruppe · Option {optionIndex}</div>
            <div className="flex items-center gap-1">
              <span className={isDark ? 'text-zinc-500' : 'text-gray-400'}>Wert:</span>
              <input value={field.optionValue || ''} onChange={(e) => onUpdateOptionValue?.(e.target.value)}
                className={`flex-1 min-w-0 px-1 py-0.5 rounded outline-none border
                  ${isDark ? 'bg-zinc-900 text-zinc-100 border-zinc-700' : 'bg-gray-50 text-gray-900 border-gray-200'}`}/>
            </div>
            <button onClick={onAddRadioOption}
              className={`w-full px-1 py-0.5 rounded text-center transition-colors
                ${isDark ? 'text-blue-400 hover:bg-zinc-700' : 'text-blue-600 hover:bg-gray-100'}`}>
              + Option
            </button>
          </div>
        </>
      )}
      {hasOptions && (
        <div className="absolute inset-0 flex items-center justify-center text-blue-500 text-xs pointer-events-none select-none">
          {field.type === 'dropdown' ? '▾' : '☰'}
        </div>
      )}
      {hasOptions && (
        <div onMouseDown={(e) => e.stopPropagation()}
          className={`absolute left-0 z-30 w-56 max-h-40 overflow-y-auto rounded-lg border shadow-lg text-[11px] p-1.5 space-y-1
            ${isDark ? 'bg-zinc-800 border-zinc-600' : 'bg-white border-gray-300'}`}
          style={{ top: field.h + 6 }}>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1">
              <input value={opt} onChange={(e) => updateOption(i, e.target.value)}
                className={`flex-1 min-w-0 px-1 py-0.5 rounded outline-none border
                  ${isDark ? 'bg-zinc-900 text-zinc-100 border-zinc-700' : 'bg-gray-50 text-gray-900 border-gray-200'}`}/>
              <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-300 flex-shrink-0 leading-none px-0.5">
                ×
              </button>
            </div>
          ))}
          <button onClick={addOption}
            className={`w-full px-1 py-0.5 rounded text-center transition-colors
              ${isDark ? 'text-blue-400 hover:bg-zinc-700' : 'text-blue-600 hover:bg-gray-100'}`}>
            + Option
          </button>
        </div>
      )}
      {isHand && (
        <div
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(e) }}
          className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-blue-500 cursor-nwse-resize"
        />
      )}
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
