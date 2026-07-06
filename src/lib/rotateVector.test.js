import { describe, it, expect } from 'vitest'
import { unrotateDelta } from './rotateVector'

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
