import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream } from 'pdf-lib'
import { sanitizePdf } from './sanitizePdf.js'

// Builds a document carrying one instance of everything Sanitize claims to
// remove: visible + XMP metadata, a JS action hidden behind an annotation's
// /A (the gap that used to make "JavaScript entfernen" silently miss Link
// click-actions), a real attachment (which pdf-lib registers both in
// Names/EmbeddedFiles *and* the PDF/A-3 catalog /AF array via its lazy,
// save()-time embed flush), and an OCG (layers) config.
async function buildDirtyPdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([200, 200])

  doc.setTitle('Secret Title')
  doc.setAuthor('Secret Author')

  const xmpStream = doc.context.stream('XMP-MARKER-CONTENT', { Type: PDFName.of('Metadata'), Subtype: PDFName.of('XML') })
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmpStream))

  const jsAction = doc.context.obj({ S: PDFName.of('JavaScript'), JS: doc.context.obj('app.alert("hi")') })
  const linkAnnot = doc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect: doc.context.obj([0, 0, 50, 50]),
    A: doc.context.register(jsAction),
  })
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(linkAnnot)]))

  doc.catalog.set(PDFName.of('OCProperties'), doc.context.obj({ OCGs: doc.context.obj([]) }))

  await doc.attach(Buffer.from('ATTACHMENT-CONTENT'), 'secret.txt', { mimeType: 'text/plain' })

  return doc.save()
}

// Recursively counts every indirect object reachable from a freshly loaded
// document's trailer - a proxy for "how much stuff is actually still in the
// file", independent of how pdf-lib chose to renumber/compress on save.
function countReachableObjects(doc) {
  const visited = new Set()
  const queue = [doc.context.trailerInfo.Root]
  const walk = (obj) => {
    if (obj && obj.constructor && obj.constructor.name === 'PDFRef') {
      if (visited.has(obj)) return
      visited.add(obj)
      queue.push(obj)
      return
    }
    if (obj instanceof PDFStream) {
      for (const [, v] of obj.dict.entries()) walk(v)
    } else if (obj instanceof PDFDict) {
      for (const [, v] of obj.entries()) walk(v)
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) walk(obj.get(i))
    }
  }
  while (queue.length) walk(doc.context.lookup(queue.pop()))
  return visited.size
}

describe('sanitizePdf', () => {
  it('reports everything as found and removed, and clears it from the reloaded document', async () => {
    const bytes = await buildDirtyPdf()
    const { bytes: outBytes, report } = await sanitizePdf(bytes, { metadata: true, javascript: true, attachments: true, hiddenLayers: true })

    expect(report).toEqual([
      'Metadaten gefunden und entfernt',
      'JavaScript gefunden und entfernt',
      'Anhänge gefunden und entfernt',
      'Ebenen-Konfiguration gefunden und entfernt',
    ])

    const out = await PDFDocument.load(outBytes)
    expect(out.getTitle()).toBe('')
    expect(out.getAuthor()).toBe('')
    expect(out.catalog.lookup(PDFName.of('Metadata'))).toBeUndefined()
    expect(out.catalog.lookup(PDFName.of('OCProperties'))).toBeUndefined()
    expect(out.catalog.lookup(PDFName.of('AF'))).toBeUndefined()
    const namesDict = out.catalog.lookup(PDFName.of('Names'))
    expect(namesDict?.lookup(PDFName.of('EmbeddedFiles'))).toBeUndefined()

    const annots = out.getPage(0).node.Annots()
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const annot = out.context.lookup(annots.get(i))
      expect(annot.lookup(PDFName.of('A'))).toBeUndefined()
    }
  })

  it('actually purges the removed content from the object graph, not just its references', async () => {
    const bytes = await buildDirtyPdf()
    const dirty = await PDFDocument.load(bytes)
    const dirtyCount = countReachableObjects(dirty)

    const { bytes: outBytes } = await sanitizePdf(bytes, { metadata: true, javascript: true, attachments: true, hiddenLayers: true })
    const clean = await PDFDocument.load(outBytes)
    const cleanCount = countReachableObjects(clean)

    // metadata's XMP stream, the JS action dict, the attachment's file-spec
    // + embedded-file stream, and the OCG dict are all gone - a handful of
    // objects at minimum, not merely their references unlinked.
    expect(cleanCount).toBeLessThan(dirtyCount - 3)
  })

  it('reports nothing found for JS/attachments/layers on a clean document, and leaves the object graph untouched', async () => {
    // Metadata is deliberately excluded from this fixture's expectations:
    // pdf-lib's own PDFDocument.load()/.create() constructor unconditionally
    // re-stamps Producer (and ModDate, and Creator if empty) via its default
    // updateMetadata:true - see updateInfoDict() in pdf-lib's PDFDocument -
    // so sanitizePdf() always observes a non-empty Producer the instant it
    // loads the bytes, before its own opts.metadata branch even runs. That
    // makes "Keine Metadaten gefunden" practically unreachable for any real
    // input and isn't something this fix controls; it's pdf-lib's own
    // save/load side effect, present on every PDF operation in this app.
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const bytes = await doc.save()

    const clean = await PDFDocument.load(bytes)
    const beforeCount = countReachableObjects(clean)

    const { bytes: outBytes, report } = await sanitizePdf(bytes, { metadata: false, javascript: true, attachments: true, hiddenLayers: true })
    expect(report).toEqual([
      'Kein JavaScript gefunden',
      'Keine Anhänge gefunden',
      'Keine Ebenen-Konfiguration gefunden',
    ])

    const out = await PDFDocument.load(outBytes)
    expect(countReachableObjects(out)).toBe(beforeCount)
  })

  // Regression: every existing "metadata found" case above sets an explicit
  // Title/Author, which short-circuits the had-detection at the very first
  // field - never exercising the later Subject/Creator/Producer/Keywords
  // checks at all. A document with none of those explicitly set still isn't
  // "clean": pdf-lib's own PDFDocument.create()/load() unconditionally
  // stamps Producer (see the "clean document" test below), so the very last
  // fallback in the chain must still catch it.
  it('reports metadata found based on the auto-stamped Producer alone, with no Title/Author/Subject/Creator ever set', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const bytes = await doc.save()

    const { report } = await sanitizePdf(bytes, { metadata: true, javascript: false, attachments: false, hiddenLayers: false })
    expect(report).toEqual(['Metadaten gefunden und entfernt'])
  })

  it('only removes the options the user actually selected', async () => {
    const bytes = await buildDirtyPdf()
    const { report } = await sanitizePdf(bytes, { metadata: false, javascript: true, attachments: false, hiddenLayers: false })
    expect(report).toEqual(['JavaScript gefunden und entfernt'])
  })
})
