import { diffArrays } from 'diff'

// Reuses the same pdf.js page/getTextContent access pattern already used by
// piiDetection.js's findTextMatches() - one flat, whitespace-tokenized word
// list per page (simpler than the per-text-item positional data PII
// detection needs, since a document diff doesn't highlight exact on-canvas
// positions, just which page a change falls on).
export async function extractPageWords(pdfDoc) {
  const pages = []
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const content = await page.getTextContent()
    const text = content.items.map(i => i.str).join(' ')
    const words = text.split(/\s+/).filter(Boolean)
    pages.push({ pageNum, words })
  }
  return pages
}

// Flattens per-page word lists into one array plus a lookup table of which
// index range belongs to which page - lets the diff run on a single flat
// array (needed for a real cross-page diff) while still being able to
// attribute each resulting chunk back to a page afterward.
function flattenWithPageOffsets(pages) {
  const words = []
  const offsets = []
  for (const p of pages) {
    const start = words.length
    words.push(...p.words)
    offsets.push({ pageNum: p.pageNum, start, end: words.length })
  }
  return { words, offsets }
}

function pageForIndex(offsets, index) {
  for (const o of offsets) {
    if (index >= o.start && index < o.end) return o.pageNum
  }
  return offsets.length ? offsets[offsets.length - 1].pageNum : 1
}

// Word-level diff between two documents' page-word-lists (from
// extractPageWords), attributing each resulting chunk to a page number.
// Documents may have different page counts - each side's page-offset table
// is built independently, so this falls out naturally with no special-casing.
// Attribution rule: a chunk is attributed to the page it *starts* on in
// whichever document actually contains it (the "from" document for a
// removed chunk, the "to" document for an added chunk, either for a common
// chunk since both sides have identical content there) - a chunk spanning a
// page boundary is NOT split further, it just takes the starting page.
export function buildPageAttributedDiff(pagesA, pagesB) {
  const { words: wordsA, offsets: offsetsA } = flattenWithPageOffsets(pagesA)
  const { words: wordsB, offsets: offsetsB } = flattenWithPageOffsets(pagesB)

  const chunks = diffArrays(wordsA, wordsB)
  const result = []
  let idxA = 0, idxB = 0
  for (const chunk of chunks) {
    const type = chunk.added ? 'added' : chunk.removed ? 'removed' : 'common'
    const page = chunk.removed ? pageForIndex(offsetsA, idxA) : pageForIndex(offsetsB, idxB)
    result.push({ type, text: chunk.value.join(' '), page })
    if (!chunk.added) idxA += chunk.value.length
    if (!chunk.removed) idxB += chunk.value.length
  }
  return result
}
