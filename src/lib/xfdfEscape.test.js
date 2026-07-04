import { describe, it, expect } from 'vitest'
import { escapeXml } from './xfdfEscape.js'

describe('escapeXml', () => {
  it('escapes all five reserved XML characters', () => {
    expect(escapeXml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &apos;')
  })

  it('escapes a string containing all five at once, in order', () => {
    expect(escapeXml(`<tag a="b" c='d'>&amp already</tag>`))
      .toBe('&lt;tag a=&quot;b&quot; c=&apos;d&apos;&gt;&amp;amp already&lt;/tag&gt;')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeXml('Hallo Welt 123')).toBe('Hallo Welt 123')
  })

  it('coerces non-string input via String()', () => {
    expect(escapeXml(42)).toBe('42')
  })
})
