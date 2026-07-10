// Shared "render a pdf.js page to a canvas at a given scale" helper. This
// exact pattern used to be duplicated across OCRModal.jsx, ExportImagesModal.jsx
// and PDFViewer.jsx's live page rendering — extracted here so redaction
// rasterization (which needs the identical rendering path) doesn't become a
// fourth copy.
// `rotation` is optional and defaults to the page's own native rotation
// (pdf.js's own getViewport default) - callers that need to match a specific
// on-screen orientation (e.g. redaction rasterization, which must render at
// the exact rotation the user drew their boxes under - see effectiveRotation()
// in pageRotation.js) pass it explicitly.
export async function renderPageToCanvas(pdfDoc, pageNum, scale, rotation) {
  const page = await pdfDoc.getPage(pageNum)
  const vp = rotation === undefined ? page.getViewport({ scale }) : page.getViewport({ scale, rotation })
  const canvas = document.createElement('canvas')
  canvas.width = vp.width
  canvas.height = vp.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
  return canvas
}
