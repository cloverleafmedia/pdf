import { describe, it, expect } from 'vitest'
import { buildXfdf } from './xfdfExport.js'

const PAGE_DIMS = [{ width: 400, height: 500 }] // single page, 0-indexed

describe('buildXfdf', () => {
  it('wraps output in a valid XFDF envelope', () => {
    const xml = buildXfdf([], PAGE_DIMS)
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<xfdf xmlns="http://ns.adobe.com/xfdf/"')
    expect(xml).toContain('<annots>')
    expect(xml).toContain('</xfdf>')
  })

  it('emits a highlight with rescaled, Y-flipped rect and coords, using page point-space (pageW/pageH match page size, no rescale)', () => {
    const annotations = [{
      id: 1, type: 'highlight', page: 1, color: '#f59e0b', pageW: 400, pageH: 500,
      rects: [{ x: 10, y: 20, w: 100, h: 30 }],
    }]
    const xml = buildXfdf(annotations, PAGE_DIMS)
    // y = ph - (rect.y + rect.h) = 500 - 50 = 450; rect = "10,450,110,480"
    expect(xml).toMatch(/<highlight page="0" rect="10,450,110,480" color="#f59e0b" coords="10,480,110,480,10,450,110,450"/)
  })

  it('applies the rescale when pageW/pageH differ from the page point size', () => {
    const annotations = [{
      id: 2, type: 'highlight', page: 1, color: '#000000', pageW: 800, pageH: 1000, // 2x the PDF's point size
      rects: [{ x: 10, y: 20, w: 100, h: 30 }],
    }]
    const xml = buildXfdf(annotations, PAGE_DIMS)
    // sx = sy = 0.5: x=5, w=50, h=15, y = 500 - (20+30)*0.5 = 500-25 = 475
    expect(xml).toMatch(/<highlight page="0" rect="5,475,55,490"/)
  })

  it('maps underline -> <underline> and strikethrough -> <strikeout> (XFDF spelling)', () => {
    const annotations = [
      { id: 3, type: 'underline', page: 1, color: '#111111', pageW: 400, pageH: 500, rects: [{ x: 0, y: 0, w: 10, h: 10 }] },
      { id: 4, type: 'strikethrough', page: 1, color: '#222222', pageW: 400, pageH: 500, rects: [{ x: 0, y: 0, w: 10, h: 10 }] },
    ]
    const xml = buildXfdf(annotations, PAGE_DIMS)
    expect(xml).toContain('<underline ')
    expect(xml).toContain('<strikeout ')
    expect(xml).not.toContain('<strikethrough')
  })

  it('emits ink for a freehand draw annotation with a gesture point list', () => {
    const annotations = [{
      id: 5, type: 'draw', page: 1, color: '#ff0000', pageW: 400, pageH: 500, width: 3,
      path: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    }]
    const xml = buildXfdf(annotations, PAGE_DIMS)
    expect(xml).toContain('<ink ')
    expect(xml).toContain('<inklist><gesture>0,500,10,490</gesture></inklist>')
  })

  it('emits a note as <text icon="Comment"> with escaped contents', () => {
    const annotations = [{ id: 6, type: 'note', page: 1, color: '#f59e0b', pageW: 400, pageH: 500, x: 10, y: 20, text: 'a <note> & "quote"' }]
    const xml = buildXfdf(annotations, PAGE_DIMS)
    expect(xml).toContain('icon="Comment"')
    expect(xml).toContain('<contents>a &lt;note&gt; &amp; &quot;quote&quot;</contents>')
  })

  it('emits a text box as <freetext>', () => {
    const annotations = [{ id: 7, type: 'text', page: 1, color: '#000000', pageW: 400, pageH: 500, x: 10, y: 20, text: 'hello' }]
    const xml = buildXfdf(annotations, PAGE_DIMS)
    expect(xml).toContain('<freetext ')
    expect(xml).not.toContain('icon="Comment"')
  })

  it('includes replies nested inside their parent element, not dropped', () => {
    const annotations = [{
      id: 8, type: 'note', page: 1, color: '#f59e0b', pageW: 400, pageH: 500, x: 10, y: 20, text: 'root',
      replies: [{ id: 99, text: 'a reply', time: 0 }],
    }]
    const xml = buildXfdf(annotations, PAGE_DIMS)
    expect(xml).toContain('inreplyto="ann-8"')
    expect(xml).toContain('replytype="R"')
    expect(xml).toContain('<contents>a reply</contents>')
  })

  it('skips annotations whose page has no known dimensions', () => {
    const annotations = [{ id: 9, type: 'highlight', page: 5, color: '#000', pageW: 400, pageH: 500, rects: [{ x: 0, y: 0, w: 10, h: 10 }] }]
    expect(() => buildXfdf(annotations, PAGE_DIMS)).not.toThrow()
    expect(buildXfdf(annotations, PAGE_DIMS)).not.toContain('<highlight')
  })
})
