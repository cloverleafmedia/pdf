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

// Inserts every page of `srcBytes` (a second PDF's raw bytes) into the
// current document right after `insertAfterPageNum` (0 = insert at the very
// top, before page 1). Same rebuild pattern as the other ops here — used by
// the Sidebar's drag-and-drop-a-PDF-into-a-specific-spot feature, as the
// position-aware counterpart to the dialog-based `window._mergePDF` (which
// only ever appends at the end).
export async function insertPagesAt(pdfBytes, order, insertAfterPageNum, srcBytes) {
  const src = await PDFDocument.load(pdfBytes)
  const out = await PDFDocument.create()
  const insertAt = insertAfterPageNum <= 0 ? 0 : order.indexOf(insertAfterPageNum) + 1
  const allCopied = await out.copyPages(src, order.map(n => n - 1))
  const newDoc = await PDFDocument.load(srcBytes)
  const newCopied = await out.copyPages(newDoc, newDoc.getPageIndices())
  for (let i = 0; i <= allCopied.length; i++) {
    if (i === insertAt) newCopied.forEach(p => out.addPage(p))
    if (i < allCopied.length) out.addPage(allCopied[i])
  }
  const bytes = await out.save()
  return {
    bytes,
    insertedCount: newCopied.length,
    newOrder: Array.from({ length: allCopied.length + newCopied.length }, (_, i) => i + 1),
  }
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
