import { PDFDocument } from 'pdf-lib'

// Pure pdf-lib page-mutation operations shared by the Sidebar's reorder/
// delete/duplicate/insert-blank actions. Each takes the current `pdfBytes` +
// `order` (1-based page numbers in display order) and returns the rebuilt
// document bytes plus the new order — no pdfjsLib, no store/UI side effects,
// so these are safe to unit test directly.

export async function reorderPages(pdfBytes, order, fromPage, toPage) {
  if (fromPage === toPage) return null
  const newOrder = [...order]
  const fi = newOrder.indexOf(fromPage)
  newOrder.splice(fi, 1)
  const ti = newOrder.indexOf(toPage)
  newOrder.splice(ti, 0, fromPage)

  const src = await PDFDocument.load(pdfBytes)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, newOrder.map(n => n - 1))
  copied.forEach(p => out.addPage(p))
  const bytes = await out.save()
  return { bytes, newOrder: newOrder.map((_, i) => i + 1) }
}

export async function deletePage(pdfBytes, order, pageNum) {
  const src = await PDFDocument.load(pdfBytes)
  const out = await PDFDocument.create()
  const indices = order.filter(n => n !== pageNum).map(n => n - 1)
  const copied = await out.copyPages(src, indices)
  copied.forEach(p => out.addPage(p))
  const bytes = await out.save()
  return { bytes, newOrder: order.filter(n => n !== pageNum).map((_, i) => i + 1) }
}

export async function duplicatePage(pdfBytes, order, pageNum) {
  const src = await PDFDocument.load(pdfBytes)
  const out = await PDFDocument.create()
  const insertAt = order.indexOf(pageNum) + 1
  const newOrder = [...order]
  newOrder.splice(insertAt, 0, pageNum)
  const copied = await out.copyPages(src, newOrder.map(n => n - 1))
  copied.forEach(p => out.addPage(p))
  const bytes = await out.save()
  return { bytes, newOrder: newOrder.map((_, i) => i + 1) }
}

export async function insertBlankPageAfter(pdfBytes, order, pageNum) {
  const src = await PDFDocument.load(pdfBytes)
  const out = await PDFDocument.create()
  const insertAt = order.indexOf(pageNum) + 1
  const allCopied = await out.copyPages(src, order.map(n => n - 1))
  const refPage = src.getPage(pageNum - 1)
  const { width, height } = refPage.getSize()
  for (let i = 0; i < allCopied.length; i++) {
    out.addPage(allCopied[i])
    if (i === insertAt - 1) out.addPage([width, height])
  }
  const bytes = await out.save()
  // The returned order always just reflects the new (N+1) sequential page
  // count, same as after any other rebuild here - see reorderPages/deletePage/
  // duplicatePage, which renumber to 1..N for the same reason.
  return { bytes, newOrder: Array.from({ length: order.length + 1 }, (_, i) => i + 1) }
}
