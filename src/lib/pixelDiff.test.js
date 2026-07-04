import { describe, it, expect } from 'vitest'
import { computeDiffMask, renderDiffOverlay, pagesComparable } from './pixelDiff.js'

function makeImage(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fillFn(x, y)
      const i = (y * width + x) * 4
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a ?? 255
    }
  }
  return { width, height, data }
}

function solid(width, height, r, g, b) {
  return makeImage(width, height, () => [r, g, b])
}

describe('computeDiffMask', () => {
  it('returns an all-zero mask for identical images', () => {
    const a = solid(8, 8, 100, 100, 100)
    const b = solid(8, 8, 100, 100, 100)
    const { diffs } = computeDiffMask(a, b, { blockSize: 4 })
    expect([...diffs]).toEqual([0, 0, 0, 0])
  })

  it('flags only the one block that actually differs', () => {
    const a = solid(8, 8, 0, 0, 0)
    const b = makeImage(8, 8, (x, y) => (x < 4 && y < 4) ? [255, 255, 255] : [0, 0, 0])
    const { cols, diffs } = computeDiffMask(a, b, { blockSize: 4 })
    expect(cols).toBe(2)
    // block (0,0) is index 0, should be flagged; the other 3 blocks should not be
    expect(diffs[0]).toBe(1)
    expect(diffs[1]).toBe(0)
    expect(diffs[2]).toBe(0)
    expect(diffs[3]).toBe(0)
  })

  it('does not flag uniform sub-threshold noise (proves block-averaging absorbs jitter)', () => {
    const a = solid(8, 8, 100, 100, 100)
    const b = solid(8, 8, 105, 103, 102) // small uniform difference everywhere
    const { diffs } = computeDiffMask(a, b, { blockSize: 4, threshold: 24 })
    expect([...diffs].every(d => d === 0)).toBe(true)
  })

  it('flags a genuinely large uniform difference', () => {
    const a = solid(8, 8, 0, 0, 0)
    const b = solid(8, 8, 200, 200, 200)
    const { diffs } = computeDiffMask(a, b, { blockSize: 4, threshold: 24 })
    expect([...diffs].every(d => d === 1)).toBe(true)
  })
})

describe('renderDiffOverlay', () => {
  it('renders a flagged block distinctly (reddish) from an unflagged block (grayscale/faded), given the same source pixel value', () => {
    const a = solid(8, 8, 150, 150, 150) // uniform gray source
    const b = solid(8, 8, 150, 150, 150)
    const mask = { cols: 2, rows: 2, blockSize: 4, diffs: new Uint8Array([1, 0, 0, 0]) } // only block (0,0) flagged
    const result = renderDiffOverlay(a, b, mask)

    expect(result.width).toBe(8)
    expect(result.height).toBe(8)

    // Pixel inside the flagged block (0,0): red channel should dominate
    const flaggedIdx = (1 * 8 + 1) * 4 // (x=1,y=1) is in block (0,0)
    const fr = result.data[flaggedIdx], fg = result.data[flaggedIdx + 1], fb = result.data[flaggedIdx + 2]
    expect(fr).toBeGreaterThan(fg)
    expect(fr).toBeGreaterThan(fb)

    // Pixel inside an unflagged block (1,1): should stay grayscale (R≈G≈B)
    const unflaggedIdx = (5 * 8 + 5) * 4 // (x=5,y=5) is in block (1,1)
    const ur = result.data[unflaggedIdx], ug = result.data[unflaggedIdx + 1], ub = result.data[unflaggedIdx + 2]
    expect(Math.abs(ur - ug)).toBeLessThan(2)
    expect(Math.abs(ug - ub)).toBeLessThan(2)
  })
})

describe('pagesComparable', () => {
  it('returns true for identical sizes', () => {
    expect(pagesComparable({ width: 595, height: 842 }, { width: 595, height: 842 })).toBe(true)
  })

  it('returns false when a dimension differs well beyond tolerance', () => {
    expect(pagesComparable({ width: 595, height: 842 }, { width: 612, height: 792 })).toBe(false)
  })

  it('returns true for a difference within tolerance (rounding noise)', () => {
    expect(pagesComparable({ width: 595, height: 842 }, { width: 595.3, height: 841.8 }, 1)).toBe(true)
  })
})
