import { describe, it, expect } from 'vitest'
import { resolveOutlineBookmarks, bookmarksToRanges } from './resolveOutlineDest.js'

function makeFakePdfDoc({ destinations = {}, pageIndices = {} } = {}) {
  return {
    getDestination: async (name) => destinations[name],
    getPageIndex: async (ref) => pageIndices[ref],
  }
}

describe('resolveOutlineBookmarks', () => {
  it('resolves already-array dest entries to sorted start page indices', async () => {
    const pdfDoc = makeFakePdfDoc({ pageIndices: { p1: 4, p0: 0, p2: 9 } })
    const outline = [
      { title: 'Kapitel 2', dest: ['p1'] },
      { title: 'Deckblatt', dest: ['p0'] },
      { title: 'Anhang',    dest: ['p2'] },
    ]
    const result = await resolveOutlineBookmarks(pdfDoc, outline)
    expect(result).toEqual([
      { title: 'Deckblatt', startPageIndex: 0 },
      { title: 'Kapitel 2', startPageIndex: 4 },
      { title: 'Anhang',    startPageIndex: 9 },
    ])
  })

  it('resolves string (named) dest entries via getDestination first', async () => {
    const pdfDoc = makeFakePdfDoc({ destinations: { chap1: ['ref-a'] }, pageIndices: { 'ref-a': 2 } })
    const outline = [{ title: 'Kapitel 1', dest: 'chap1' }]
    const result = await resolveOutlineBookmarks(pdfDoc, outline)
    expect(result).toEqual([{ title: 'Kapitel 1', startPageIndex: 2 }])
  })

  it('skips entries with no dest, an unresolvable named dest, or a getPageIndex that throws', async () => {
    const pdfDoc = {
      getDestination: async (name) => { if (name === 'missing') return undefined; throw new Error('boom') },
      getPageIndex: async (ref) => { if (ref === 'bad-ref') throw new Error('not found'); return 3 },
    }
    const outline = [
      { title: 'No dest' },
      { title: 'Unresolvable named dest', dest: 'missing' },
      { title: 'Throwing named dest', dest: 'throws' },
      { title: 'Bad page ref', dest: ['bad-ref'] },
      { title: 'Good one', dest: ['ok-ref'] },
    ]
    const result = await resolveOutlineBookmarks(pdfDoc, outline)
    expect(result).toEqual([{ title: 'Good one', startPageIndex: 3 }])
  })

  it('returns an empty array for an empty or missing outline', async () => {
    const pdfDoc = makeFakePdfDoc()
    expect(await resolveOutlineBookmarks(pdfDoc, [])).toEqual([])
    expect(await resolveOutlineBookmarks(pdfDoc, null)).toEqual([])
  })
})

describe('bookmarksToRanges', () => {
  it('derives non-overlapping ranges, last one running to the end of the document', () => {
    const bookmarks = [
      { title: 'Deckblatt', startPageIndex: 0 },
      { title: 'Kapitel 1', startPageIndex: 1 },
      { title: 'Anhang',    startPageIndex: 8 },
    ]
    expect(bookmarksToRanges(bookmarks, 10)).toEqual([
      { title: 'Deckblatt', startPageIndex: 0, endPageIndex: 0 },
      { title: 'Kapitel 1', startPageIndex: 1, endPageIndex: 7 },
      { title: 'Anhang',    startPageIndex: 8, endPageIndex: 9 },
    ])
  })

  it('collapses a range to a single page instead of going negative when two bookmarks share a start page', () => {
    const bookmarks = [
      { title: 'A', startPageIndex: 2 },
      { title: 'B', startPageIndex: 2 },
    ]
    const ranges = bookmarksToRanges(bookmarks, 5)
    expect(ranges[0]).toEqual({ title: 'A', startPageIndex: 2, endPageIndex: 2 })
  })

  it('returns an empty array for an empty bookmark list', () => {
    expect(bookmarksToRanges([], 10)).toEqual([])
  })
})
