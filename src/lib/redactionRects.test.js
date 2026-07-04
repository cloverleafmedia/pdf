import { describe, it, expect } from 'vitest'
import { rectToPdfPoints, pdfPointRectToRasterPixels, isTextContentEmpty } from './redactionRects.js'

describe('rectToPdfPoints', () => {
  it('maps a full-page on-screen rect to a full-page PDF-point rect', () => {
    const rect = { x: 0, y: 0, w: 600, h: 800, logicalW: 600, logicalH: 800 }
    const result = rectToPdfPoints(rect, 300, 400)
    expect(result).toEqual({ x: 0, y: 0, width: 300, height: 400 })
  })

  it('flips a rect near the top of the on-screen page to near the top of the PDF page (high y)', () => {
    // Drawn near y=0 on-screen (top) -> should land near the page's height in PDF points (bottom-left origin)
    const rect = { x: 0, y: 0, w: 100, h: 20, logicalW: 600, logicalH: 800 }
    const result = rectToPdfPoints(rect, 300, 400)
    expect(result.y).toBeCloseTo(390) // 400 - (20/800)*400
    expect(result.y).toBeGreaterThan(300)
  })

  it('flips a rect near the bottom of the on-screen page to near y=0 in PDF points', () => {
    const rect = { x: 0, y: 780, w: 100, h: 20, logicalW: 600, logicalH: 800 }
    const result = rectToPdfPoints(rect, 300, 400)
    expect(result.y).toBeCloseTo(0)
  })
})

describe('pdfPointRectToRasterPixels', () => {
  it('is the exact inverse of rectToPdfPoints when rendered at the same scale the rect was drawn at', () => {
    const pw = 300, ph = 400
    const rect = { x: 37, y: 112, w: 140, h: 25, logicalW: 600, logicalH: 800 }
    const scale = rect.logicalW / pw // == rect.logicalH / ph, same uniform zoom

    const pdfRect = rectToPdfPoints(rect, pw, ph)
    const roundTripped = pdfPointRectToRasterPixels(pdfRect, ph, scale)

    expect(roundTripped.x).toBeCloseTo(rect.x)
    expect(roundTripped.y).toBeCloseTo(rect.y)
    expect(roundTripped.width).toBeCloseTo(rect.w)
    expect(roundTripped.height).toBeCloseTo(rect.h)
  })

  it('scales up correctly when rasterizing at a higher DPI than the on-screen zoom', () => {
    const pdfRect = { x: 10, y: 10, width: 50, height: 20 }
    const result = pdfPointRectToRasterPixels(pdfRect, 100, 2) // scale=2 -> 144 DPI equivalent
    expect(result).toEqual({ x: 20, y: (100 - 10 - 20) * 2, width: 100, height: 40 })
  })
})

describe('isTextContentEmpty', () => {
  it('is true for an empty items array', () => {
    expect(isTextContentEmpty([])).toBe(true)
  })

  it('is true for null/undefined', () => {
    expect(isTextContentEmpty(null)).toBe(true)
    expect(isTextContentEmpty(undefined)).toBe(true)
  })

  it('is true when every item is whitespace-only', () => {
    expect(isTextContentEmpty([{ str: '  ' }, { str: '\n' }, { str: '' }])).toBe(true)
  })

  it('is false when at least one item has real leftover text', () => {
    expect(isTextContentEmpty([{ str: '  ' }, { str: 'geheim' }])).toBe(false)
  })
})
