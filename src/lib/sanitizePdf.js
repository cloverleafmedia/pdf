import { PDFDocument, PDFName } from 'pdf-lib'
import { removeJavaScript } from './pdfCompliance'
import { garbageCollectDocument } from './pdfGarbageCollect'

// Runs the checks/removals and returns a short report of what was actually
// found & removed — so the user sees what the tool did, not just a spinner.
export async function sanitizePdf(pdfBytes, opts) {
  const doc = await PDFDocument.load(pdfBytes)
  const report = []

  if (opts.metadata) {
    const had = doc.getTitle() || doc.getAuthor() || doc.getSubject() || doc.getCreator() || doc.getProducer() || (doc.getKeywords() || '')
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer(''); doc.setCreator('')
    const hadXmp = !!doc.catalog.get(PDFName.of('Metadata'))
    doc.catalog.delete(PDFName.of('Metadata'))
    report.push(had || hadXmp ? 'Metadaten gefunden und entfernt' : 'Keine Metadaten gefunden')
  }
  if (opts.javascript) {
    const hadJs = removeJavaScript(doc)
    report.push(hadJs ? 'JavaScript gefunden und entfernt' : 'Kein JavaScript gefunden')
  }
  if (opts.attachments) {
    // Attachments can be reachable two ways: the classic Names/EmbeddedFiles
    // name tree, and the PDF 2.0 / PDF/A-3 catalog-level /AF array that
    // pdf-lib's own doc.attach() populates alongside it (and that some other
    // producers use *instead* of the name tree). Clearing only one leaves
    // the file spec - and its actual embedded bytes - fully reachable via
    // the other, so both have to go for "removed" to be true. /AF can also
    // appear per-page, so that's cleared too.
    const namesDict = doc.catalog.lookup(PDFName.of('Names'))
    const hadNamesAttachments = !!(namesDict && namesDict.lookup(PDFName.of('EmbeddedFiles')))
    const hadCatalogAF = !!doc.catalog.lookup(PDFName.of('AF'))
    const hadPageAF = doc.getPages().some(p => !!p.node.lookup(PDFName.of('AF')))
    if (namesDict) namesDict.delete(PDFName.of('EmbeddedFiles'))
    doc.catalog.delete(PDFName.of('AF'))
    for (const p of doc.getPages()) p.node.delete(PDFName.of('AF'))
    const hadAttachments = hadNamesAttachments || hadCatalogAF || hadPageAF
    report.push(hadAttachments ? 'Anhänge gefunden und entfernt' : 'Keine Anhänge gefunden')
  }
  if (opts.hiddenLayers) {
    const hadOCG = !!doc.catalog.get(PDFName.of('OCProperties'))
    doc.catalog.delete(PDFName.of('OCProperties'))
    report.push(hadOCG ? 'Ebenen-Konfiguration gefunden und entfernt' : 'Keine Ebenen-Konfiguration gefunden')
  }

  // Every removal above only unlinks a reference - pdf-lib's save() writes
  // every indirect object it has ever registered regardless of whether
  // anything still points to it (see pdfGarbageCollect.js), so the actual
  // bytes of what was "removed" (JS action strings, the XMP metadata
  // stream, attached files, OCG config) would otherwise still be sitting in
  // the saved file, fully recoverable with any tool that walks the raw
  // object table instead of just following the document tree.
  garbageCollectDocument(doc)

  const bytes = await doc.save()
  return { bytes, report }
}
