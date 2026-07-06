import { describe, it, expect } from 'vitest'
import { bytesToBase64, base64ToBytes } from './base64.js'

describe('bytesToBase64 / base64ToBytes', () => {
  it('round-trips an empty array', () => {
    const bytes = new Uint8Array([])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('round-trips arbitrary byte values, including 0 and 255', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 137, 80, 78, 71])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('round-trips a larger byte array without hitting a call-stack limit', () => {
    const bytes = new Uint8Array(200000).map((_, i) => i % 256)
    const roundTripped = base64ToBytes(bytesToBase64(bytes))
    expect(roundTripped).toEqual(bytes)
  })
})
