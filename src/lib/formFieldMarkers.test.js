import { describe, it, expect } from 'vitest'
import { DATE_FIELD_MARKER, SIGNATURE_FIELD_MARKER } from './formFieldMarkers.js'

describe('form field markers', () => {
  it('are distinct from each other', () => {
    expect(DATE_FIELD_MARKER).not.toBe(SIGNATURE_FIELD_MARKER)
  })

  it('are wrapped in U+2063 invisible separators', () => {
    for (const marker of [DATE_FIELD_MARKER, SIGNATURE_FIELD_MARKER]) {
      expect(marker.codePointAt(0)).toBe(0x2063)
      expect(marker.codePointAt(marker.length - 1)).toBe(0x2063)
    }
  })
})
