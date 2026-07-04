import { describe, it, expect } from 'vitest'
import { extractPageWords, buildPageAttributedDiff } from './textDiff.js'

// Minimal fake of the pdf.js page/document API this module actually touches -
// mirrors the same fakePdfDoc pattern already used in piiDetection.test.js.
function fakePdfDoc(pagesText) {
  return {
    numPages: pagesText.length,
    getPage: async (pageNum) => ({
      getTextContent: async () => ({ items: [{ str: pagesText[pageNum - 1] }] }),
    }),
  }
}

async function diffTexts(textsA, textsB) {
  const pagesA = await extractPageWords(fakePdfDoc(textsA))
  const pagesB = await extractPageWords(fakePdfDoc(textsB))
  return buildPageAttributedDiff(pagesA, pagesB)
}

describe('extractPageWords', () => {
  it('tokenizes each page into a whitespace-split word list', async () => {
    const pages = await extractPageWords(fakePdfDoc(['hello world', 'second page']))
    expect(pages).toEqual([
      { pageNum: 1, words: ['hello', 'world'] },
      { pageNum: 2, words: ['second', 'page'] },
    ])
  })
})

describe('buildPageAttributedDiff', () => {
  it('reports everything as common for identical documents', async () => {
    const chunks = await diffTexts(['the quick fox'], ['the quick fox'])
    expect(chunks.every(c => c.type === 'common')).toBe(true)
    expect(chunks.map(c => c.text).join(' ')).toBe('the quick fox')
  })

  it('attributes a change on page 2 to page 2, not page 1 or 3', async () => {
    const before = ['first page text', 'second page original', 'third page text']
    const after  = ['first page text', 'second page CHANGED', 'third page text']
    const chunks = await diffTexts(before, after)
    const changed = chunks.filter(c => c.type !== 'common')
    expect(changed.length).toBeGreaterThan(0)
    expect(changed.every(c => c.page === 2)).toBe(true)
  })

  it('handles documents with different page counts without crashing, with reasonable attribution', async () => {
    const docA = ['page one', 'page two', 'page three']
    const docB = ['page one', 'page two modified']
    const chunks = await diffTexts(docA, docB)
    expect(chunks.length).toBeGreaterThan(0)
    // "page three" only exists in docA -> removed chunk attributed to docA's page 3
    const removed = chunks.filter(c => c.type === 'removed')
    expect(removed.some(c => c.page === 3)).toBe(true)
  })

  it('attributes a word added exactly at a page boundary to the starting page (documented rule)', async () => {
    const before = ['alpha beta', 'gamma delta']
    const after  = ['alpha beta', 'INSERTED gamma delta']
    const chunks = await diffTexts(before, after)
    const added = chunks.filter(c => c.type === 'added')
    expect(added).toHaveLength(1)
    expect(added[0].text).toBe('INSERTED')
    expect(added[0].page).toBe(2)
  })

  it('reports no differences (all common) when both documents are truly empty', async () => {
    const chunks = await diffTexts([''], [''])
    expect(chunks.every(c => c.type === 'common')).toBe(true)
  })

  it('marks entirely different documents as fully removed+added, not common', async () => {
    const chunks = await diffTexts(['completely different content here'], ['totally unrelated words instead'])
    expect(chunks.some(c => c.type === 'removed')).toBe(true)
    expect(chunks.some(c => c.type === 'added')).toBe(true)
    expect(chunks.some(c => c.type === 'common')).toBe(false)
  })
})
