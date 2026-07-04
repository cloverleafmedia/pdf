// Hand-rolled visual page-diff: block-averaged RGBA comparison (not true
// per-pixel) so anti-aliasing jitter between two independently-rendered
// canvases of otherwise-identical content doesn't get flagged as "different"
// at every glyph edge. Operates on plain {width, height, data} objects with
// the same shape as a DOM ImageData (but not requiring a real one), so this
// is fully testable in Vitest's Node environment with plain fixtures.

export function computeDiffMask(imgDataA, imgDataB, { blockSize = 4, threshold = 24 } = {}) {
  const { width, height } = imgDataA
  const dataA = imgDataA.data, dataB = imgDataB.data
  const cols = Math.ceil(width / blockSize)
  const rows = Math.ceil(height / blockSize)
  const diffs = new Uint8Array(cols * rows)

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const x0 = bx * blockSize, y0 = by * blockSize
      const x1 = Math.min(x0 + blockSize, width), y1 = Math.min(y0 + blockSize, height)
      let sumAR = 0, sumAG = 0, sumAB = 0, sumBR = 0, sumBG = 0, sumBB = 0, count = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          sumAR += dataA[i]; sumAG += dataA[i + 1]; sumAB += dataA[i + 2]
          sumBR += dataB[i]; sumBG += dataB[i + 1]; sumBB += dataB[i + 2]
          count++
        }
      }
      if (!count) continue
      const dr = sumAR / count - sumBR / count
      const dg = sumAG / count - sumBG / count
      const db = sumAB / count - sumBB / count
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)
      diffs[by * cols + bx] = dist > threshold ? 1 : 0
    }
  }
  return { cols, rows, blockSize, diffs }
}

// Differing blocks get a red tint; unchanged regions are faded toward white
// (grayscale, then blended toward white by dimFactor) so the flagged areas
// stand out clearly against a deliberately unobtrusive backdrop.
export function renderDiffOverlay(imgDataA, imgDataB, mask, { dimFactor = 0.35 } = {}) {
  const { width, height } = imgDataA
  const dataA = imgDataA.data
  const { cols, blockSize, diffs } = mask
  const out = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const bx = Math.floor(x / blockSize), by = Math.floor(y / blockSize)
      const flagged = diffs[by * cols + bx] === 1
      if (flagged) {
        out[i]     = Math.min(255, dataA[i] * 0.5 + 255 * 0.5)
        out[i + 1] = dataA[i + 1] * 0.3
        out[i + 2] = dataA[i + 2] * 0.3
      } else {
        const gray = 0.3 * dataA[i] + 0.59 * dataA[i + 1] + 0.11 * dataA[i + 2]
        const faded = gray * dimFactor + 255 * (1 - dimFactor)
        out[i] = out[i + 1] = out[i + 2] = faded
      }
      out[i + 3] = 255
    }
  }
  return { width, height, data: out }
}

export function pagesComparable(sizeA, sizeB, tolerancePt = 1) {
  return Math.abs(sizeA.width - sizeB.width) <= tolerancePt && Math.abs(sizeA.height - sizeB.height) <= tolerancePt
}
