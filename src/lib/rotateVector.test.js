import { describe, it, expect } from 'vitest'
import { unrotateDelta, rotatePointAroundPivot } from './rotateVector'

describe('unrotateDelta', () => {
  it('passes the delta through unchanged at rotation 0', () => {
    expect(unrotateDelta(10, -4, 0)).toEqual({ dx: 10, dy: -4 })
  })

  it('passes the delta through unchanged when rotation is omitted/falsy', () => {
    expect(unrotateDelta(7, 3, undefined)).toEqual({ dx: 7, dy: 3 })
  })

  it('maps a straight-down drag to a pure width change at 90deg', () => {
    // At rotation 90, the local width axis (+x) maps to the screen's
    // upward direction, so a straight-down screen delta un-rotates to a
    // pure negative-x (shrink-width) local delta, with no height component.
    const { dx, dy } = unrotateDelta(0, 10, 90)
    expect(dx).toBeCloseTo(-10)
    expect(dy).toBeCloseTo(0)
  })

  it('maps a straight-right drag to a pure height change at 90deg', () => {
    const { dx, dy } = unrotateDelta(10, 0, 90)
    expect(dx).toBeCloseTo(0)
    expect(dy).toBeCloseTo(10)
  })

  it('splits a straight-down drag evenly between width and height at 45deg', () => {
    const { dx, dy } = unrotateDelta(0, 10, 45)
    expect(dx).toBeCloseTo(-7.0711, 3)
    expect(dy).toBeCloseTo(7.0711, 3)
  })

  it('is the exact inverse of a 90deg-then-back-90deg round trip', () => {
    const once = unrotateDelta(6, -3, 30)
    const back = unrotateDelta(once.dx, once.dy, -30)
    expect(back.dx).toBeCloseTo(6)
    expect(back.dy).toBeCloseTo(-3)
  })
})

describe('rotatePointAroundPivot', () => {
  it('leaves the point untouched at rotation 0 or falsy rotation', () => {
    expect(rotatePointAroundPivot(10, 20, 0, 0, 0)).toEqual({ x: 10, y: 20 })
    expect(rotatePointAroundPivot(10, 20, 0, 0, undefined)).toEqual({ x: 10, y: 20 })
  })

  it('leaves the pivot itself untouched at any rotation', () => {
    const { x, y } = rotatePointAroundPivot(5, 5, 5, 5, 73)
    expect(x).toBeCloseTo(5)
    expect(y).toBeCloseTo(5)
  })

  it('swings a point 90deg CCW around the origin', () => {
    const { x, y } = rotatePointAroundPivot(10, 0, 0, 0, 90)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(10)
  })

  it('keeps a box centered on a pivot after rotation - the bug this exists to fix', () => {
    // A box drawn with its bottom-left corner at the naive "center the
    // unrotated box" origin swings its true center away from the pivot once
    // rotated (see WatermarkModal.jsx) - rotatePointAroundPivot finds the
    // corrected origin so the box's center lands back on the pivot.
    const pivot = { x: 100, y: 100 }
    const w = 60, h = 20
    for (const rotation of [15, 45, 90, -45, 137]) {
      const naiveOrigin = { x: pivot.x - w / 2, y: pivot.y - h / 2 }
      const origin = rotatePointAroundPivot(naiveOrigin.x, naiveOrigin.y, pivot.x, pivot.y, rotation)
      const rad = (rotation * Math.PI) / 180
      // the box's own center, in its local (unrotated) frame, is (w/2, h/2)
      // above its origin - rotate that local offset by the same amount and
      // add it to the corrected origin to get where the center actually lands.
      const localCx = w / 2, localCy = h / 2
      const actualCenter = {
        x: origin.x + localCx * Math.cos(rad) - localCy * Math.sin(rad),
        y: origin.y + localCx * Math.sin(rad) + localCy * Math.cos(rad),
      }
      expect(actualCenter.x).toBeCloseTo(pivot.x)
      expect(actualCenter.y).toBeCloseTo(pivot.y)
    }
  })
})
