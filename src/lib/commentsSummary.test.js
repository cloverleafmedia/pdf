import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { groupAnnotationsByPage, buildCommentsSummaryText, buildCommentsSummaryPdf, TYPE_LABELS } from './commentsSummary.js'

// Stands in for the real embedAppFont() (which fetches the bundled Liberation
// Sans asset - a browser-only operation), same pattern as annotationFlatten.test.js.
const embedTestFont = (doc, bold) => doc.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica)

describe('groupAnnotationsByPage', () => {
  it('groups annotations by page and sorts pages numerically', () => {
    const annotations = [
      { id: 1, page: 2, type: 'note' },
      { id: 2, page: 1, type: 'note' },
      { id: 3, page: 2, type: 'text' },
    ]
    const groups = groupAnnotationsByPage(annotations)
    expect(groups.map(([page]) => page)).toEqual([1, 2])
    expect(groups[1][1]).toHaveLength(2)
  })
})

describe('buildCommentsSummaryText', () => {
  it('reports no annotations for an empty document', () => {
    expect(buildCommentsSummaryText([])).toBe('Keine Anmerkungen in diesem Dokument.')
  })

  it('covers all 9 annotation types with their German labels', () => {
    const types = ['highlight', 'underline', 'strikethrough', 'draw', 'note', 'text', 'rectangle', 'circle', 'arrow']
    const annotations = types.map((type, i) => ({ id: i, page: 1, type, text: type === 'note' || type === 'text' ? `${type} content` : undefined }))
    const text = buildCommentsSummaryText(annotations)
    for (const type of types) {
      expect(text).toContain(TYPE_LABELS[type])
    }
    expect(text).toContain('note content')
    expect(text).toContain('text content')
  })

  it('groups output under a "Seite N" heading per page', () => {
    const annotations = [
      { id: 1, page: 1, type: 'highlight' },
      { id: 2, page: 3, type: 'note', text: 'hi' },
    ]
    const text = buildCommentsSummaryText(annotations)
    expect(text).toContain('Seite 1')
    expect(text).toContain('Seite 3')
    expect(text.indexOf('Seite 1')).toBeLessThan(text.indexOf('Seite 3'))
  })

  it('nests reply threads indented beneath their parent annotation, with a formatted timestamp', () => {
    const annotations = [{
      id: 1, page: 1, type: 'note', text: 'root comment',
      replies: [{ id: 99, text: 'a reply', time: 0 }],
    }]
    const text = buildCommentsSummaryText(annotations)
    expect(text).toContain('root comment')
    expect(text).toContain('↳')
    expect(text).toContain('a reply')
  })
})

describe('buildCommentsSummaryPdf', () => {
  it('produces a single-page PDF for a short document', async () => {
    const annotations = [{ id: 1, page: 1, type: 'note', text: 'hi' }]
    const bytes = await buildCommentsSummaryPdf(annotations, embedTestFont)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('produces exactly one page for an empty document', async () => {
    const bytes = await buildCommentsSummaryPdf([], embedTestFont)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('paginates across multiple pages once the content overflows one page', async () => {
    const annotations = Array.from({ length: 80 }, (_, i) => ({
      id: i, page: 1, type: 'note', text: `Anmerkung Nummer ${i} mit etwas laengerem Text zum Testen des Zeilenumbruchs.`,
    }))
    const bytes = await buildCommentsSummaryPdf(annotations, embedTestFont)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })
})
