// Shared "render a pdf.js page to a canvas at a given scale" helper. This
// exact pattern used to be duplicated across OCRModal.jsx, ExportImagesModal.jsx
// and PDFViewer.jsx's live page rendering — extracted here so redaction
// rasterization (which needs the identical rendering path) doesn't become a
// fourth copy.
export async function renderPageToCanvas(pdfDoc, pageNum, scale) {
  const page = await pdfDoc.getPage(pageNum)
  const vp = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = vp.width
  canvas.height = vp.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
  return canvas
}
