import { PDFDocument, rgb } from 'pdf-lib'

// ── Flatten all UI annotations + form field values + newly-created form fields into PDF bytes via pdf-lib ──
// newFields: [{ page, type: 'text'|'checkbox', name, x, y, w, h, pageW, pageH }]
// in the same CSS-pixel space as `annotations` (name is expected to already
// be unique - the caller dedupes against known field names when the draft is
// placed; a stale collision here is simply skipped, same tolerance as formValues).
// embedFont is injectable so tests can substitute a StandardFonts-based
// embedder (no network fetch) instead of the real embedAppFont(). Loaded via
// dynamic import (not a static top-level one) when not injected, since this
// module sits on the core, non-lazy save path (PDFViewer.jsx) - a static
// import would pull fontkit + the bundled font asset into the main chunk for
// every save, not just the ones that actually draw a note/text annotation.
export async function flattenAnnotations(pdfBytes, annotations, formValues = {}, highlightOpacity = 0.35, newFields = [], embedFont = null) {
  const hasFormValues = Object.keys(formValues).length > 0
  const hasNewFields  = newFields.length > 0
  if (!annotations.length && !hasFormValues && !hasNewFields) return pdfBytes
  const doc  = await PDFDocument.load(pdfBytes)
  let   font = null
  const getFont = async () => {
    if (!font) {
      const embed = embedFont || (await import('./embeddedFont.js')).embedAppFont
      font = await embed(doc)
    }
    return font
  }

  const hexRgb = (hex) => {
    const c = (hex || '#f59e0b').replace('#', '').padEnd(6, '0')
    return rgb(parseInt(c.slice(0,2),16)/255, parseInt(c.slice(2,4),16)/255, parseInt(c.slice(4,6),16)/255)
  }

  const byPage = {}
  for (const a of annotations) (byPage[a.page] = byPage[a.page] || []).push(a)

  for (const [pgStr, anns] of Object.entries(byPage)) {
    const pageIndex = Number(pgStr) - 1
    // doc.getPage() throws for an out-of-range index rather than returning
    // null, so the page count must be checked first — this guards against an
    // annotation left pointing at a page that was since deleted from the document.
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue
    const page = doc.getPage(pageIndex)
    const { width: pw, height: ph } = page.getSize()

    for (const a of anns) {
      const sx    = pw / (a.pageW || pw)
      const sy    = ph / (a.pageH || ph)
      const color = hexRgb(a.color)

      if (a.rects?.length) {
        for (const rect of a.rects) {
          const x = rect.x * sx,  w = rect.w * sx,  h = rect.h * sy
          const y = ph - (rect.y + rect.h) * sy
          if (a.type === 'highlight') {
            page.drawRectangle({ x, y, width: w, height: h, color, opacity: highlightOpacity, borderWidth: 0 })
          } else if (a.type === 'underline') {
            page.drawLine({ start: { x, y: y + 1 }, end: { x: x + w, y: y + 1 }, thickness: 1.2, color })
          } else if (a.type === 'strikethrough') {
            const ly = ph - (rect.y + rect.h * 0.55) * sy
            page.drawLine({ start: { x, y: ly }, end: { x: x + w, y: ly }, thickness: 1.2, color })
          }
        }
      } else if (a.path?.length >= 2) {
        const lw = Math.max((a.width || 3) * sx, 0.5)
        for (let i = 1; i < a.path.length; i++)
          page.drawLine({ start: { x: a.path[i-1].x*sx, y: ph-a.path[i-1].y*sy }, end: { x: a.path[i].x*sx, y: ph-a.path[i].y*sy }, thickness: lw, color })
      } else if ((a.type === 'note' || a.type === 'text') && a.text) {
        const f   = await getFont()
        const tx  = (a.x || 0) * sx,  ty = ph - (a.y || 0) * sy
        const fSz = 9
        if (a.type === 'note') {
          page.drawRectangle({ x: tx, y: ty - 14, width: 14, height: 14, color: rgb(1,0.8,0), borderWidth: 0 })
          page.drawText(a.text.slice(0, 60), { x: tx + 16, y: ty - 10, size: fSz, font: f, color: rgb(0,0,0) })
        } else {
          const lines = a.text.split('\n').slice(0, 5)
          const boxW  = Math.max(...lines.map(l => f.widthOfTextAtSize(l.slice(0,35), fSz)), 40) + 8
          const boxH  = lines.length * (fSz * 1.4) + 6
          page.drawRectangle({ x: tx, y: ty-boxH, width: boxW, height: boxH, color: rgb(1,1,1), borderColor: rgb(0.5,0.5,0.5), borderWidth: 0.7, opacity: 0.95 })
          lines.forEach((line, i) => page.drawText(line.slice(0,35), { x: tx+4, y: ty - fSz*1.4*(i+1)+2, size: fSz, font: f, color: rgb(0,0,0) }))
        }
      } else if (a.type === 'rectangle' || a.type === 'circle') {
        const x  = a.x * sx,  w = a.w * sx,  h = a.h * sy
        const y  = ph - (a.y + a.h) * sy
        const bw = Math.max((a.width || 2) * sx, 0.75)
        if (a.type === 'rectangle') {
          page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: bw })
        } else {
          page.drawEllipse({ x: x + w / 2, y: y + h / 2, xScale: Math.abs(w) / 2, yScale: Math.abs(h) / 2, borderColor: color, borderWidth: bw })
        }
      } else if (a.type === 'arrow') {
        const x1 = a.x1 * sx,  y1 = ph - a.y1 * sy
        const x2 = a.x2 * sx,  y2 = ph - a.y2 * sy
        const lw = Math.max((a.width || 2) * sx, 0.75)
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: lw, color })
        // Arrowhead: two short lines back from the tip, angled off the shaft's direction.
        const angle     = Math.atan2(y2 - y1, x2 - x1)
        const headLen   = 10
        const headAngle = Math.PI / 7
        page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 - headLen * Math.cos(angle - headAngle), y: y2 - headLen * Math.sin(angle - headAngle) }, thickness: lw, color })
        page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 - headLen * Math.cos(angle + headAngle), y: y2 - headLen * Math.sin(angle + headAngle) }, thickness: lw, color })
      } else if (a.type === 'stamp') {
        const x = a.x * sx, w = a.w * sx, h = a.h * sy
        const y = ph - (a.y + a.h) * sy
        if (a.kind === 'custom' && a.imageBytes) {
          const isJpg = a.imageExt === 'jpg' || a.imageExt === 'jpeg'
          const image = isJpg ? await doc.embedJpg(a.imageBytes) : await doc.embedPng(a.imageBytes)
          page.drawImage(image, { x, y, width: w, height: h })
        } else {
          const f = await getFont()
          const bw = Math.max(3 * sx, 1)
          page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: bw })
          const text = a.text || ''
          const fSz = Math.min(h * 0.4, 24)
          const textW = f.widthOfTextAtSize(text, fSz)
          page.drawText(text, { x: x + (w - textW) / 2, y: y + h / 2 - fSz * 0.35, size: fSz, font: f, color })
        }
      }
    }
  }

  if (hasFormValues || hasNewFields) {
    try {
      const form = doc.getForm() // auto-creates an empty AcroForm if the PDF doesn't have one yet

      if (hasFormValues) {
        for (const [key, value] of Object.entries(formValues)) {
          try {
            if (typeof value === 'boolean') {
              const cb = form.getCheckBox(key)
              if (value) cb.check(); else cb.uncheck()
            } else {
              const tf = form.getTextField(key)
              tf.setText(String(value ?? ''))
            }
          } catch (_) { /* field not found on this document, or wrong widget type — skip */ }
        }
      }

      if (hasNewFields) {
        for (const nf of newFields) {
          const pageIndex = nf.page - 1
          if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue
          try {
            const page = doc.getPage(pageIndex)
            const { width: pw, height: ph } = page.getSize()
            const sx = pw / (nf.pageW || pw)
            const sy = ph / (nf.pageH || ph)
            const x = nf.x * sx
            const w = nf.w * sx
            const h = nf.h * sy
            const y = ph - (nf.y + nf.h) * sy
            const field = nf.type === 'checkbox' ? form.createCheckBox(nf.name) : form.createTextField(nf.name)
            field.addToPage(page, { x, y, width: w, height: h })
          } catch (_) { /* name collision, out-of-range page, or other pdf-lib error — skip */ }
        }
      }
    } catch (_) { /* unexpected AcroForm error */ }
  }

  return doc.save()
}
