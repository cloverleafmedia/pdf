import { describe, it, expect } from 'vitest'
import { computeAlignDeltas } from './alignAnnotations.js'

const boxes = [
  { id: 'a', left: 0,   top: 0,  width: 20, height: 10 },
  { id: 'b', left: 50,  top: 30, width: 40, height: 40 },
  { id: 'c', left: 100, top: 5,  width: 10, height: 10 },
]

function apply(box, delta) {
  return { left: box.left + delta.dx, top: box.top + delta.dy, right: box.left + box.width + delta.dx, bottom: box.top + box.height + delta.dy }
}

describe('computeAlignDeltas', () => {
  it('left: moves every box to the minimum left edge', () => {
    const deltas = computeAlignDeltas(boxes, 'left')
    for (const box of boxes) {
      const d = deltas.find(x => x.id === box.id)
      expect(apply(box, d).left).toBe(0)
      expect(d.dy).toBe(0)
    }
  })

  it('right: moves every box to the maximum right edge', () => {
    const deltas = computeAlignDeltas(boxes, 'right')
    const maxRight = Math.max(...boxes.map(b => b.left + b.width))
    for (const box of boxes) {
      const d = deltas.find(x => x.id === box.id)
      expect(apply(box, d).right).toBe(maxRight)
    }
  })

  it('top: moves every box to the minimum top edge', () => {
    const deltas = computeAlignDeltas(boxes, 'top')
    for (const box of boxes) {
      const d = deltas.find(x => x.id === box.id)
      expect(apply(box, d).top).toBe(0)
      expect(d.dx).toBe(0)
    }
  })

  it('bottom: moves every box to the maximum bottom edge', () => {
    const deltas = computeAlignDeltas(boxes, 'bottom')
    const maxBottom = Math.max(...boxes.map(b => b.top + b.height))
    for (const box of boxes) {
      const d = deltas.find(x => x.id === box.id)
      expect(apply(box, d).bottom).toBe(maxBottom)
    }
  })

  it('centerX: aligns every box center to the union bounding box center', () => {
    const deltas = computeAlignDeltas(boxes, 'centerX')
    const lo = Math.min(...boxes.map(b => b.left))
    const hi = Math.max(...boxes.map(b => b.left + b.width))
    const expectedCenter = (lo + hi) / 2
    for (const box of boxes) {
      const d = deltas.find(x => x.id === box.id)
      const newCenter = box.left + d.dx + box.width / 2
      expect(newCenter).toBeCloseTo(expectedCenter)
      expect(d.dy).toBe(0)
    }
  })

  it('centerY: aligns every box center to the union bounding box center', () => {
    const deltas = computeAlignDeltas(boxes, 'centerY')
    const lo = Math.min(...boxes.map(b => b.top))
    const hi = Math.max(...boxes.map(b => b.top + b.height))
    const expectedCenter = (lo + hi) / 2
    for (const box of boxes) {
      const d = deltas.find(x => x.id === box.id)
      const newCenter = box.top + d.dy + box.height / 2
      expect(newCenter).toBeCloseTo(expectedCenter)
      expect(d.dx).toBe(0)
    }
  })

  it('is a no-op (zero deltas) for a single box, on every edge', () => {
    const single = [boxes[0]]
    for (const edge of ['left', 'right', 'top', 'bottom', 'centerX', 'centerY']) {
      const [d] = computeAlignDeltas(single, edge)
      expect(d.dx).toBe(0)
      expect(d.dy).toBe(0)
    }
  })
})
