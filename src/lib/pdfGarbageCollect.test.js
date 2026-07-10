import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, StandardFonts, PDFString } from 'pdf-lib'
import { garbageCollectDocument } from './pdfGarbageCollect.js'

describe('garbageCollectDocument', () => {
  it('leaves a normal document with content, a font, and a form field untouched', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([200, 200])
    page.drawText('hello', { x: 10, y: 100, size: 12, font })
    const form = doc.getForm()
    form.createTextField('name').addToPage(page, { x: 10, y: 10, width: 80, height: 20 })

    const before = doc.context.enumerateIndirectObjects().length
    const removed = garbageCollectDocument(doc)
    expect(removed).toBe(0)
    expect(doc.context.enumerateIndirectObjects().length).toBe(before)

    // and the document still round-trips correctly after GC
    const bytes = await doc.save()
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBe(1)
    expect(reloaded.getForm().getFields().map(f => f.getName())).toEqual(['name'])
  })

  it('deletes an object that is registered on the context but unreachable from the trailer', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const orphan = doc.context.obj({ Marker: PDFString.of('should be swept') })
    const orphanRef = doc.context.register(orphan)

    expect(doc.context.enumerateIndirectObjects().some(([ref]) => ref === orphanRef)).toBe(true)
    const removed = garbageCollectDocument(doc)
    expect(removed).toBeGreaterThanOrEqual(1)
    expect(doc.context.enumerateIndirectObjects().some(([ref]) => ref === orphanRef)).toBe(false)
  })

  it('actually removes the orphaned bytes from the saved file, not just the reference to it', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const secretRef = doc.context.register(doc.context.obj({ S: PDFString.of('TOP-SECRET-MARKER') }))
    // simulate "the app unlinked a reference to this object" without ever having pointed the trailer/catalog at it in the first place
    void secretRef

    garbageCollectDocument(doc)
    const bytes = await doc.save({ useObjectStreams: false })
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('TOP-SECRET-MARKER')
  })

  it('preserves the document Info dictionary (reachable via the trailer, not the catalog)', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    doc.setTitle('Kept Title')

    garbageCollectDocument(doc)
    const bytes = await doc.save()
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getTitle()).toBe('Kept Title')
  })

  it('preserves objects reachable only through an action /Next chain', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const tailAction = doc.context.obj({ S: PDFName.of('Named'), N: PDFName.of('Print') })
    const tailRef = doc.context.register(tailAction)
    const headAction = doc.context.obj({ S: PDFName.of('GoTo'), Next: tailRef })
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.register(headAction))

    garbageCollectDocument(doc)
    expect(doc.context.enumerateIndirectObjects().some(([ref]) => ref === tailRef)).toBe(true)
  })
})
