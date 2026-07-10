import { describe, it, expect } from 'vitest'
import { effectiveRotation, visualPageSize, visualPointToRawPoint } from './pageRotation.js'
import { screenPointToRawPoint } from './annotationFlatten.js'

describe('effectiveRotation', () => {
  it('is just the native rotation when there is no in-session delta', () => {
    expect(effectiveRotation(90, 0)).toBe(90)
    expect(effectiveRotation(90, undefined)).toBe(90)
    expect(effectiveRotation(270, null)).toBe(270)
  })

  it('is just the delta when the page has no native rotation', () => {
    expect(effectiveRotation(0, 90)).toBe(90)
    expect(effectiveRotation(undefined, 180)).toBe(180)
  })

  it('adds native and delta together', () => {
    expect(effectiveRotation(90, 90)).toBe(180)
    expect(effectiveRotation(180, 180)).toBe(0)
  })

  it('wraps into the 0-359 range', () => {
    expect(effectiveRotation(270, 180)).toBe(90)
    expect(effectiveRotation(0, 360)).toBe(0)
  })

  it('handles a negative delta (rotate-left accumulation) correctly', () => {
    expect(effectiveRotation(90, -90)).toBe(0)
    expect(effectiveRotation(0, -90)).toBe(270)
  })

  it('is 0 when both are absent', () => {
    expect(effectiveRotation(undefined, undefined)).toBe(0)
  })
})

describe('visualPageSize', () => {
  it('is unchanged at 0 and 180', () => {
    expect(visualPageSize(400, 600, 0)).toEqual({ width: 400, height: 600 })
    expect(visualPageSize(400, 600, 180)).toEqual({ width: 400, height: 600 })
  })

  it('swaps width/height at 90 and 270', () => {
    expect(visualPageSize(400, 600, 90)).toEqual({ width: 600, height: 400 })
    expect(visualPageSize(400, 600, 270)).toEqual({ width: 600, height: 400 })
  })
})

describe('visualPointToRawPoint', () => {
  it('is the identity at rotation 0', () => {
    expect(visualPointToRawPoint(50, 80, 400, 600, 0)).toEqual({ x: 50, y: 80 })
  })

  it('agrees with the already-proven screenPointToRawPoint used for on-screen placement', () => {
    // screenPointToRawPoint solves the same rotation problem for a y-down
    // pixel "screen" space - feeding it a 1:1-scaled, y-flipped visual point
    // must produce exactly the same raw point this function returns,
    // otherwise the two independently-used rotation transforms in this app
    // would disagree about where things end up.
    const rawW = 400, rawH = 600
    for (const rot of [0, 90, 180, 270]) {
      const { width: vw, height: vh } = visualPageSize(rawW, rawH, rot)
      for (const [vx, vy] of [[10, 20], [vw - 5, vh - 5], [vw / 2, vh / 2]]) {
        const viaVisual = visualPointToRawPoint(vx, vy, rawW, rawH, rot)
        const viaScreen = screenPointToRawPoint(vx, vh - vy, vw, vh, rawW, rawH, rot)
        expect(viaVisual.x).toBeCloseTo(viaScreen.x)
        expect(viaVisual.y).toBeCloseTo(viaScreen.y)
      }
    }
  })

  it('maps the visual bottom-left corner to the correct raw corner for each rotation', () => {
    const rawW = 400, rawH = 600
    // rot=180: visual bottom-left is raw top-right
    expect(visualPointToRawPoint(0, 0, rawW, rawH, 180)).toEqual({ x: rawW, y: rawH })
    // rot=90: visual space is 600x400 (swapped) - visual bottom-left maps to raw bottom-left
    expect(visualPointToRawPoint(0, 0, rawW, rawH, 90)).toEqual({ x: rawW, y: 0 })
    // rot=270
    expect(visualPointToRawPoint(0, 0, rawW, rawH, 270)).toEqual({ x: 0, y: rawH })
  })
})
