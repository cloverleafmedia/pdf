import { describe, it, expect } from 'vitest'
import { getAnnotationBounds, NOTE_ICON_HALF } from './annotationBounds.js'

describe('getAnnotationBounds', () => {
  it('stamp: uses the stored unrotated x/y/w/h regardless of rotation', () => {
    const a = { type: 'stamp', x: 10, y: 20, w: 100, h: 40, rotation: 45 }
    expect(getAnnotationBounds(a)).toEqual({ left: 10, top: 20, width: 100, height: 40 })
  })

  it('note: expands the icon-center x/y into a fixed-size box', () => {
    const a = { type: 'note', x: 50, y: 60 }
    expect(getAnnotationBounds(a)).toEqual({
      left: 50 - NOTE_ICON_HALF, top: 60 - NOTE_ICON_HALF,
      width: 2 * NOTE_ICON_HALF, height: 2 * NOTE_ICON_HALF,
    })
  })

  it('text: measures the live DOM node when given', () => {
    const a = { type: 'text', x: 5, y: 8 }
    const domEl = { offsetWidth: 120, offsetHeight: 30 }
    expect(getAnnotationBounds(a, domEl)).toEqual({ left: 5, top: 8, width: 120, height: 30 })
  })

  it('text: falls back to zero size without a DOM node', () => {
    const a = { type: 'text', x: 5, y: 8 }
    expect(getAnnotationBounds(a, null)).toEqual({ left: 5, top: 8, width: 0, height: 0 })
  })
})
