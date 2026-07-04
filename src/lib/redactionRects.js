// Pure coordinate math for turning an on-screen redaction rect (canvas pixels
// at whatever zoom it was drawn at) into PDF point-space, and from there into
// raster pixel-space at whatever DPI a page gets rasterized at for true
// redaction. Kept separate from PDFViewer.jsx so the math is unit-testable
// without a DOM/pdf.js render pipeline.

// rect: { x, y, w, h, logicalW, logicalH } — x/y/w/h are on-screen canvas
// pixels (top-left origin); logicalW/logicalH are the rendered page's pixel
// size at that same zoom. Returns { x, y, width, height } in PDF points
// (bottom-left origin) — identical math to what PDFViewer.jsx used inline.
export function rectToPdfPoints(rect, pageWidthPt, pageHeightPt) {
  return {
    x:      (rect.x / rect.logicalW) * pageWidthPt,
    y:      pageHeightPt - ((rect.y + rect.h) / rect.logicalH) * pageHeightPt,
    width:  (rect.w / rect.logicalW) * pageWidthPt,
    height: (rect.h / rect.logicalH) * pageHeightPt,
  }
}

// Inverse of rectToPdfPoints's origin/axis flip, mapping a PDF-point rect
// into raster pixel-space (top-left origin, y-down — what a canvas expects)
// at the given scale (raster pixels per PDF point).
export function pdfPointRectToRasterPixels(pdfRect, pageHeightPt, scale) {
  return {
    x:      pdfRect.x * scale,
    y:      (pageHeightPt - pdfRect.y - pdfRect.height) * scale,
    width:  pdfRect.width * scale,
    height: pdfRect.height * scale,
  }
}

// pdf.js getTextContent() items — true if none carry any non-whitespace text.
export function isTextContentEmpty(items) {
  return !items || items.every(i => !i.str || !i.str.trim())
}
