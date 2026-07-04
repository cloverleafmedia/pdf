import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { reorderPages, deletePage, duplicatePage, insertBlankPageAfter } from './pdfPageOps.js'

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
