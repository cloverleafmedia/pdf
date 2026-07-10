import { describe, it, expect } from 'vitest'
import { normalizeImageOrientation } from './normalizeImageOrientation.js'

// The canvas-based re-encode path needs a real browser (Image/canvas) and is
// exercised in the real Electron renderer instead - see the e2e suite. This
// covers the pure-logic passthrough branches: a non-JPEG, or a JPEG that
// doesn't need correction, must be returned completely untouched (no canvas
// round-trip, no accidental re-encode/quality loss) without ever touching
// DOM APIs that don't exist in the plain Node test environment.
describe('normalizeImageOrientation', () => {
  it('returns a PNG unchanged', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 1, 2, 3])
    const result = await normalizeImageOrientation(bytes, 'png')
    expect(result).toEqual({ bytes, ext: 'png' })
  })

  it('returns a JPEG with no EXIF/orientation-1 unchanged', async () => {
    const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA])
    const result = await normalizeImageOrientation(bytes, 'jpg')
    expect(result).toEqual({ bytes, ext: 'jpg' })
  })

  it('recognizes the "jpeg" extension spelling too', async () => {
    const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA])
    const result = await normalizeImageOrientation(bytes, 'jpeg')
    expect(result).toEqual({ bytes, ext: 'jpeg' })
  })
})
