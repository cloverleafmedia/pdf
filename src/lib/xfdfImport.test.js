import { describe, it, expect } from 'vitest'
import { buildXfdf } from './xfdfExport.js'
import { parseXfdf } from './xfdfImport.js'

const PAGE_DIMS = [{ width: 400, height: 500 }]

describe('parseXfdf - round trip through buildXfdf', () => {
  it('round-trips a highlight annotation', () => {
    const original = [{
      id: 1, type: 'highlight', page: 1, color: '#f59e0b', pageW: 400, pageH: 500,
      rects: [{ x: 10, y: 20, w: 100, h: 30 }],
    }]
    const parsed = parseXfdf(buildXfdf(original, PAGE_DIMS), PAGE_DIMS)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe('highlight')
    expect(parsed[0].page).toBe(1)
    expect(parsed[0].color).toBe('#f59e0b')
    expect(parsed[0].rects[0].x).toBeCloseTo(10)
    expect(parsed[0].rects[0].y).toBeCloseTo(20)
    expect(parsed[0].rects[0].w).toBeCloseTo(100)
    expect(parsed[0].rects[0].h).toBeCloseTo(30)
  })

  it('round-trips underline and strikethrough, preserving type names', () => {
    const original = [
      { id: 2, type: 'underline', page: 1, color: '#111111', pageW: 400, pageH: 500, rects: [{ x: 1, y: 2, w: 3, h: 4 }] },
      { id: 3, type: 'strikethrough', page: 1, color: '#222222', pageW: 400, pageH: 500, rects: [{ x: 5, y: 6, w: 7, h: 8 }] },
    ]
    const parsed = parseXfdf(buildXfdf(original, PAGE_DIMS), PAGE_DIMS)
    expect(parsed.map(a => a.type).sort()).toEqual(['strikethrough', 'underline'])
  })

  it('round-trips a freehand draw (ink) annotation', () => {
    const original = [{
      id: 4, type: 'draw', page: 1, color: '#ff0000', pageW: 400, pageH: 500, width: 3,
      path: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 5 }],
    }]
    const parsed = parseXfdf(buildXfdf(original, PAGE_DIMS), PAGE_DIMS)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe('draw')
    expect(parsed[0].path).toHaveLength(3)
    expect(parsed[0].path[0]).toEqual({ x: 0, y: 0 })
    expect(parsed[0].path[1].x).toBeCloseTo(10)
    expect(parsed[0].path[1].y).toBeCloseTo(10)
  })

  it('round-trips a sticky note, recovering text and anchor position', () => {
    const original = [{ id: 5, type: 'note', page: 2, color: '#f59e0b', pageW: 400, pageH: 500, x: 15, y: 25, text: 'a <note> & "quote"' }]
    const dims = [PAGE_DIMS[0], { width: 400, height: 500 }]
    const parsed = parseXfdf(buildXfdf(original, dims), dims)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe('note')
    expect(parsed[0].page).toBe(2)
    expect(parsed[0].text).toBe('a <note> & "quote"')
    expect(parsed[0].x).toBeCloseTo(15)
    expect(parsed[0].y).toBeCloseTo(25)
  })

  it('round-trips a text box as type "text", distinguishing it from a note', () => {
    const original = [{ id: 6, type: 'text', page: 1, color: '#000000', pageW: 400, pageH: 500, x: 1, y: 2, text: 'box' }]
    const parsed = parseXfdf(buildXfdf(original, PAGE_DIMS), PAGE_DIMS)
    expect(parsed[0].type).toBe('text')
  })

  it('does not reconstruct reply threads on import (out of scope), but does not crash on them either', () => {
    const original = [{
      id: 7, type: 'note', page: 1, color: '#f59e0b', pageW: 400, pageH: 500, x: 10, y: 20, text: 'root',
      replies: [{ id: 99, text: 'a reply', time: 0 }],
    }]
    const parsed = parseXfdf(buildXfdf(original, PAGE_DIMS), PAGE_DIMS)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].text).toBe('root')
    expect(parsed[0].replies).toBeUndefined()
  })

  it('parses a hand-written literal XFDF snippet not produced by this app\'s own writer', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
<annots>
<highlight page="0" rect="10,10,50,30" color="#00ff00">
<contents>manual highlight</contents>
</highlight>
</annots>
</xfdf>`
    const parsed = parseXfdf(xml, PAGE_DIMS)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe('highlight')
    expect(parsed[0].color).toBe('#00ff00')
  })

  it('skips malformed/unrecognized elements without throwing', () => {
    expect(() => parseXfdf('<xfdf><annots><bogus>oops</bogus></annots></xfdf>', PAGE_DIMS)).not.toThrow()
    expect(parseXfdf('<xfdf><annots><bogus>oops</bogus></annots></xfdf>', PAGE_DIMS)).toEqual([])
  })
})
