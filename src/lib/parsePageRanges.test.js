import { describe, it, expect } from 'vitest'
import { parsePageRanges } from './parsePageRanges.js'

describe('parsePageRanges', () => {
  it('parses a mix of single pages and ranges, sorted and deduplicated', () => {
    expect(parsePageRanges('1-3, 5, 2, 7-9', 10)).toEqual([1, 2, 3, 5, 7, 8, 9])
  })

  it('clamps a range to the document length', () => {
    expect(parsePageRanges('8-20', 10)).toEqual([8, 9, 10])
  })

  it('treats "N-" (no end) as running to the last page', () => {
    expect(parsePageRanges('8-', 10)).toEqual([8, 9, 10])
  })

  it('ignores out-of-range single page numbers', () => {
    expect(parsePageRanges('0, 5, 999', 10)).toEqual([5])
  })

  it('returns an empty array for empty/whitespace-only input', () => {
    expect(parsePageRanges('', 10)).toEqual([])
    expect(parsePageRanges('   ', 10)).toEqual([])
  })
})
