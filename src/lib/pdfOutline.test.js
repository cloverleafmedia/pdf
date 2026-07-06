import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, PDFHexString, PDFDict, PDFArray } from 'pdf-lib'
import { writeOutline } from './pdfOutline.js'

async function makePdfBytes(pageCount = 3) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200])
  return doc.save()
}

describe('writeOutline', () => {
  it('builds a loadable outline tree with the given marks, in order', async () => {
    const bytes = await makePdfBytes(3)
    const marks = [
      { page: 2, label: 'Kapitel 1' },
      { page: 1, label: 'Deckblatt' },
      { page: 3, label: 'Anhang' },
    ]
    const result = await writeOutline(bytes, marks)
    const doc = await PDFDocument.load(result)
    expect(doc.getPageCount()).toBe(3)

    const outlinesRef = doc.catalog.get(PDFName.of('Outlines'))
    expect(outlinesRef).toBeDefined()
    const outlines = doc.context.lookup(outlinesRef, PDFDict)
    expect(outlines.lookup(PDFName.of('Count')).asNumber()).toBe(3)

    // Walk the /First -> /Next linked list and confirm titles come back in
    // the same order the caller supplied them (not re-sorted by page).
    const titles = []
    let itemRef = outlines.get(PDFName.of('First'))
    while (itemRef) {
      const item = doc.context.lookup(itemRef, PDFDict)
      titles.push(item.lookup(PDFName.of('Title'), PDFHexString).decodeText())
      itemRef = item.get(PDFName.of('Next'))
    }
    expect(titles).toEqual(['Kapitel 1', 'Deckblatt', 'Anhang'])
  })

  it('points each item\'s destination at the correct page', async () => {
    const bytes = await makePdfBytes(3)
    const result = await writeOutline(bytes, [{ page: 3, label: 'Anhang' }])
    const doc = await PDFDocument.load(result)
    const outlines = doc.context.lookup(doc.catalog.get(PDFName.of('Outlines')), PDFDict)
    const item = doc.context.lookup(outlines.get(PDFName.of('First')), PDFDict)
    const dest = item.lookup(PDFName.of('Dest'), PDFArray)
    const destPageRef = dest.get(0)
    expect(destPageRef).toBe(doc.getPage(2).ref)
  })

  it('round-trips a non-Latin1 title via PDFHexString', async () => {
    const bytes = await makePdfBytes(1)
    const result = await writeOutline(bytes, [{ page: 1, label: '日本語 Übersicht' }])
    const doc = await PDFDocument.load(result)
    const outlines = doc.context.lookup(doc.catalog.get(PDFName.of('Outlines')), PDFDict)
    const item = doc.context.lookup(outlines.get(PDFName.of('First')), PDFDict)
    expect(item.lookup(PDFName.of('Title'), PDFHexString).decodeText()).toBe('日本語 Übersicht')
  })

  it('removes the outline entirely when given an empty list', async () => {
    const bytes = await makePdfBytes(1)
    const withMarks = await writeOutline(bytes, [{ page: 1, label: 'Temp' }])
    const cleared   = await writeOutline(withMarks, [])
    const doc = await PDFDocument.load(cleared)
    expect(doc.catalog.get(PDFName.of('Outlines'))).toBeUndefined()
  })

  it('clamps an out-of-range page number to the last page instead of throwing', async () => {
    const bytes = await makePdfBytes(2)
    const result = await writeOutline(bytes, [{ page: 99, label: 'Zu weit' }])
    const doc = await PDFDocument.load(result)
    expect(doc.getPageCount()).toBe(2)
  })
})
