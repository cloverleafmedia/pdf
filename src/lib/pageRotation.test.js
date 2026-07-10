import { describe, it, expect } from 'vitest'
import { effectiveRotation } from './pageRotation.js'

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
