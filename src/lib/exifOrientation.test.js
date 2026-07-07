import { describe, it, expect } from 'vitest'
import { readJpegOrientation, exifCorrectedPlacement } from './exifOrientation.js'

// Builds a minimal, syntactically valid JPEG byte sequence: SOI, an APP1
// segment carrying a one-entry TIFF/EXIF IFD0 with just the Orientation tag
// (0x0112), then SOS. Real cameras emit far more IFD entries/segments, but
// this is exactly what the parser needs to walk.
function makeJpegWithOrientation(orientation, { littleEndian = true } = {}) {
  const bytes = []
  bytes.push(0xFF, 0xD8) // SOI

  const tiff = []
  if (littleEndian) {
    tiff.push(0x49, 0x49, 0x2A, 0x00) // "II", 42
    tiff.push(0x08, 0x00, 0x00, 0x00) // IFD0 offset = 8
    tiff.push(0x01, 0x00) // 1 entry
    tiff.push(0x12, 0x01) // tag 0x0112
    tiff.push(0x03, 0x00) // type SHORT
    tiff.push(0x01, 0x00, 0x00, 0x00) // count 1
    tiff.push(orientation & 0xFF, (orientation >> 8) & 0xFF, 0x00, 0x00) // value
    tiff.push(0x00, 0x00, 0x00, 0x00) // next IFD offset
  } else {
    tiff.push(0x4D, 0x4D, 0x00, 0x2A) // "MM", 42
    tiff.push(0x00, 0x00, 0x00, 0x08) // IFD0 offset = 8
    tiff.push(0x00, 0x01) // 1 entry
    tiff.push(0x01, 0x12) // tag 0x0112
    tiff.push(0x00, 0x03) // type SHORT
    tiff.push(0x00, 0x00, 0x00, 0x01) // count 1
    tiff.push((orientation >> 8) & 0xFF, orientation & 0xFF, 0x00, 0x00) // value
    tiff.push(0x00, 0x00, 0x00, 0x00) // next IFD offset
  }

  const exifPrefix = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
  const segmentLength = 2 + exifPrefix.length + tiff.length
  bytes.push(0xFF, 0xE1, (segmentLength >> 8) & 0xFF, segmentLength & 0xFF)
  bytes.push(...exifPrefix, ...tiff)
  bytes.push(0xFF, 0xDA) // SOS

  return new Uint8Array(bytes)
}

describe('readJpegOrientation', () => {
  it('reads a little-endian ("II") EXIF orientation tag', () => {
    expect(readJpegOrientation(makeJpegWithOrientation(6))).toBe(6)
  })

  it('reads a big-endian ("MM") EXIF orientation tag', () => {
    expect(readJpegOrientation(makeJpegWithOrientation(8, { littleEndian: false }))).toBe(8)
  })

  it('returns 1 for a JPEG with no APP1/EXIF segment at all', () => {
    const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA])
    expect(readJpegOrientation(bytes)).toBe(1)
  })

  it('returns 1 for a non-JPEG buffer', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]) // PNG signature
    expect(readJpegOrientation(bytes)).toBe(1)
  })
})

describe('exifCorrectedPlacement', () => {
  it('places an orientation-1 (normal) image unrotated at the page origin', () => {
    expect(exifCorrectedPlacement(1, 300, 200)).toEqual({ pageWidth: 300, pageHeight: 200, x: 0, y: 0, rotate: 0 })
  })

  it('swaps the page dimensions for orientation 6', () => {
    const p = exifCorrectedPlacement(6, 300, 200)
    expect(p.pageWidth).toBe(200)
    expect(p.pageHeight).toBe(300)
  })

  it('swaps the page dimensions for orientation 8', () => {
    const p = exifCorrectedPlacement(8, 300, 200)
    expect(p.pageWidth).toBe(200)
    expect(p.pageHeight).toBe(300)
  })

  it('keeps the page dimensions unswapped for a 180° orientation 3', () => {
    const p = exifCorrectedPlacement(3, 300, 200)
    expect(p.pageWidth).toBe(300)
    expect(p.pageHeight).toBe(200)
  })

  it('falls back to unrotated placement for an unknown/mirrored orientation value', () => {
    expect(exifCorrectedPlacement(2, 300, 200)).toEqual({ pageWidth: 300, pageHeight: 200, x: 0, y: 0, rotate: 0 })
  })
})
