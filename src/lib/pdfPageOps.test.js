import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { reorderPages, deletePage, duplicatePage, insertBlankPageAfter, insertPagesAt } from './pdfPageOps.js'

// Builds an N-page PDF where each page has a distinct size (100+i x 100+i),
// so operations can be verified by page count *and* by which physical page
// ended up where, not just by count alone.
async function makePdfBytes(n) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < n; i++) doc.addPage([100 + i, 100 + i])
  return doc.save()
}

async function pageSizes(bytes) {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map(p => p.getWidth())
}

describe('reorderPages', () => {
  it('returns null as a no-op when fromPage === toPage', async () => {
    const bytes = await makePdfBytes(3)
    const result = await reorderPages(bytes, [1, 2, 3], 2, 2)
    expect(result).toBeNull()
  })

  it('moves a page to a later position, dropping it right before the target (not after)', async () => {
    const bytes = await makePdfBytes(3) // widths 100, 101, 102
    const result = await reorderPages(bytes, [1, 2, 3], 1, 3)
    expect(result.newOrder).toEqual([1, 2, 3])
    // page 1 removed -> [2,3]; index of page 3 is 1; page 1 re-inserted at
    // that index -> [2,1,3], i.e. dropped immediately before the target page.
    expect(await pageSizes(result.bytes)).toEqual([101, 100, 102])
  })

  it('moves a page to an earlier position', async () => {
    const bytes = await makePdfBytes(3)
    const result = await reorderPages(bytes, [1, 2, 3], 3, 1)
    expect(await pageSizes(result.bytes)).toEqual([102, 100, 101])
  })
})

describe('deletePage', () => {
  it('removes exactly the targeted page and keeps the others in order', async () => {
    const bytes = await makePdfBytes(3) // widths 100, 101, 102
    const result = await deletePage(bytes, [1, 2, 3], 2)
    expect(result.newOrder).toEqual([1, 2])
    expect(await pageSizes(result.bytes)).toEqual([100, 102])
  })

  it('can delete the first or last page', async () => {
    const bytes = await makePdfBytes(3)
    expect(await pageSizes((await deletePage(bytes, [1, 2, 3], 1)).bytes)).toEqual([101, 102])
    expect(await pageSizes((await deletePage(bytes, [1, 2, 3], 3)).bytes)).toEqual([100, 101])
  })
})

describe('duplicatePage', () => {
  it('inserts a copy of the page immediately after the source page', async () => {
    const bytes = await makePdfBytes(3) // widths 100, 101, 102
    const result = await duplicatePage(bytes, [1, 2, 3], 2)
    expect(result.newOrder).toEqual([1, 2, 3, 4])
    expect(await pageSizes(result.bytes)).toEqual([100, 101, 101, 102])
  })

  it('duplicating the last page appends the copy at the end', async () => {
    const bytes = await makePdfBytes(2)
    const result = await duplicatePage(bytes, [1, 2], 2)
    expect(await pageSizes(result.bytes)).toEqual([100, 101, 101])
  })
})

describe('insertBlankPageAfter', () => {
  it('inserts a blank page sized like the reference page, right after it', async () => {
    const bytes = await makePdfBytes(3) // widths 100, 101, 102
    const result = await insertBlankPageAfter(bytes, [1, 2, 3], 2)
    expect(result.newOrder).toEqual([1, 2, 3, 4])
    expect(await pageSizes(result.bytes)).toEqual([100, 101, 101, 102])

    const doc = await PDFDocument.load(result.bytes)
    // the inserted blank page (index 2) should have no content beyond an empty page
    expect(doc.getPage(2).getWidth()).toBe(101)
  })

  it('inserting after the last page appends a blank page at the end', async () => {
    const bytes = await makePdfBytes(2)
    const result = await insertBlankPageAfter(bytes, [1, 2], 2)
    expect(await pageSizes(result.bytes)).toEqual([100, 101, 101])
  })
})

describe('insertPagesAt', () => {
  it('inserts all pages of a second PDF right after the given page', async () => {
    const bytes    = await makePdfBytes(3)  // widths 100, 101, 102
    const srcBytes = await makePdfBytes(2)  // widths 100, 101 (own document, same sizes on purpose)
    const result = await insertPagesAt(bytes, [1, 2, 3], 2, srcBytes)
    expect(result.insertedCount).toBe(2)
    expect(result.newOrder).toEqual([1, 2, 3, 4, 5])
    expect(await pageSizes(result.bytes)).toEqual([100, 101, 100, 101, 102])
  })

  it('insertAfterPageNum = 0 inserts at the very top', async () => {
    const bytes    = await makePdfBytes(2) // widths 100, 101
    const srcBytes = await makePdfBytes(1) // width 100 - collides on purpose to prove position, not identity
    const doc = await PDFDocument.load(srcBytes)
    doc.getPage(0).setWidth(999)
    const distinctSrc = await doc.save()
    const result = await insertPagesAt(bytes, [1, 2], 0, distinctSrc)
    expect(await pageSizes(result.bytes)).toEqual([999, 100, 101])
  })

  it('inserting after the last page appends at the end', async () => {
    const bytes    = await makePdfBytes(2) // widths 100, 101
    const srcBytes = await makePdfBytes(1) // width 100
    const doc = await PDFDocument.load(srcBytes)
    doc.getPage(0).setWidth(999)
    const distinctSrc = await doc.save()
    const result = await insertPagesAt(bytes, [1, 2], 2, distinctSrc)
    expect(await pageSizes(result.bytes)).toEqual([100, 101, 999])
  })

  it('supports inserting a multi-page source multiple times in sequence (simulating multi-file drop)', async () => {
    let bytes = await makePdfBytes(2) // widths 100, 101
    let order = [1, 2]
    const srcA = await makePdfBytes(1) // width 100
    const r1 = await insertPagesAt(bytes, order, 1, srcA)
    bytes = r1.bytes; order = r1.newOrder
    const r2 = await insertPagesAt(bytes, order, 1 + r1.insertedCount, srcA)
    expect(r2.newOrder).toEqual([1, 2, 3, 4])
    expect(await pageSizes(r2.bytes)).toEqual([100, 100, 100, 101])
  })
})
