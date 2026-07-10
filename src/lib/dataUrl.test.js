import { describe, it, expect } from 'vitest'
import { dataUrlToBytes } from './dataUrl.js'

describe('dataUrlToBytes', () => {
  it('decodes a base64 data URL back to the original bytes', () => {
    const original = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    const base64 = Buffer.from(original).toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`
    expect(Array.from(dataUrlToBytes(dataUrl))).toEqual(Array.from(original))
  })

  it('handles an empty payload', () => {
    expect(dataUrlToBytes('data:image/png;base64,').length).toBe(0)
  })
})
