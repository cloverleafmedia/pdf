import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// ── Flatten all UI annotations + form field values into PDF bytes via pdf-lib ──
export async function flattenAnnotations(pdfBytes, annotations, formValues = {}, highlightOpacity = 0.35) {
  const hasFormValues = Object.keys(formValues).length > 0
  if (!annotations.length && !hasFormValues) return pdfBytes
  const doc  = await PDFDocument.load(pdfBytes)
  let   font = null
  const getFont = async () => { if (!font) font = await doc.embedFont(StandardFonts.Helvetica); return font }

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
      }
    }
  }

  if (hasFormValues) {
    try {
      const form = doc.getForm()
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
    } catch (_) { /* PDF has no AcroForm */ }
  }

  return doc.save()
}
