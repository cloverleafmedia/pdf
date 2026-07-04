import { describe, it, expect } from 'vitest'
import { PII_PATTERNS, findTextMatches, findPIIRedactions, escapeRegExp, findTextRedactions } from './piiDetection.js'

// Minimal fake of the subset of the pdf.js page/document API findTextMatches()
// actually touches - avoids needing a real rendered PDF for pure pattern-matching tests.
function fakePdfDoc(pagesText) {
  return {
    numPages: pagesText.length,
    getPage: async (pageNum) => {
      const str = pagesText[pageNum - 1]
      return {
        getViewport: () => ({
          width: 200, height: 200,
          convertToViewportPoint: (x, y) => [x, y],
        }),
        getTextContent: async () => ({
          items: [{ str, width: str.length * 6, height: 10, transform: [1, 0, 0, 1, 0, 100] }],
        }),
      }
    },
  }
}

describe('escapeRegExp', () => {
  it('escapes every regex-special character so it is matched literally', () => {
    expect(escapeRegExp('a.b*c?d')).toBe('a\\.b\\*c\\?d')
    expect(escapeRegExp('(test)')).toBe('\\(test\\)')
    expect(escapeRegExp('a+b')).toBe('a\\+b')
  })

  it('leaves ordinary characters untouched', () => {
    expect(escapeRegExp('hello world 123')).toBe('hello world 123')
  })
})

describe('findTextMatches / findPIIRedactions', () => {
  it('finds an IBAN and reports its label and matched text', async () => {
    const doc = fakePdfDoc(['Kontonummer: DE89370400440532013000 danke'])
    const matches = await findPIIRedactions(doc, {})
    expect(matches).toHaveLength(1)
    expect(matches[0].label).toBe('IBAN')
    expect(matches[0].text).toBe('DE89370400440532013000')
    expect(matches[0].pageNum).toBe(1)
  })

  it('finds an email address', async () => {
    const doc = fakePdfDoc(['Kontakt: max.mustermann@example.com bei Fragen'])
    const matches = await findPIIRedactions(doc, {})
    expect(matches.some(m => m.label === 'E-Mail' && m.text === 'max.mustermann@example.com')).toBe(true)
  })

  it('finds a German phone number with at least 7 digits', async () => {
    const doc = fakePdfDoc(['Rufen Sie an: 0151 12345678'])
    const matches = await findPIIRedactions(doc, {})
    expect(matches.some(m => m.label === 'Telefonnummer')).toBe(true)
  })

  it('rejects a short digit run that looks like a phone number but has under 7 digits', async () => {
    const doc = fakePdfDoc(['Menge: 012345 Stueck'])
    const matches = await findPIIRedactions(doc, {})
    expect(matches.some(m => m.label === 'Telefonnummer')).toBe(false)
  })

  it('finds independent matches across multiple pages', async () => {
    const doc = fakePdfDoc(['a@b.com', 'c@d.com'])
    const matches = await findPIIRedactions(doc, {})
    expect(matches.map(m => m.pageNum)).toEqual([1, 2])
  })

  it('skips whitespace-only or zero-width text items without hanging', async () => {
    const doc = fakePdfDoc(['   '])
    const matches = await findPIIRedactions(doc, {})
    expect(matches).toEqual([])
  })

  it('does not mutate the shared PII_PATTERNS regexes between calls (lastIndex reset)', async () => {
    const doc = fakePdfDoc(['a@b.com'])
    await findPIIRedactions(doc, {})
    await findPIIRedactions(doc, {}) // would find nothing on the second call if lastIndex leaked
    const matches = await findPIIRedactions(doc, {})
    expect(matches).toHaveLength(1)
    expect(PII_PATTERNS.find(p => p.label === 'E-Mail').re.lastIndex).toBeGreaterThanOrEqual(0)
  })
})

describe('findTextRedactions', () => {
  it('finds a literal, case-insensitive search term by default', async () => {
    const doc = fakePdfDoc(['Der Vertrag mit ACME GmbH laeuft weiter'])
    const matches = await findTextRedactions(doc, {}, 'acme gmbh')
    expect(matches).toHaveLength(1)
    expect(matches[0].text.toLowerCase()).toBe('acme gmbh')
  })

  it('treats special characters in the query literally when regex mode is off', async () => {
    const doc = fakePdfDoc(['Preis: 12.50 (netto)'])
    const matches = await findTextRedactions(doc, {}, '12.50 (netto)')
    expect(matches).toHaveLength(1)
  })

  it('honors caseSensitive: true', async () => {
    const doc = fakePdfDoc(['ACME and acme'])
    const matches = await findTextRedactions(doc, {}, 'acme', { caseSensitive: true })
    expect(matches).toHaveLength(1)
    expect(matches[0].text).toBe('acme')
  })

  it('supports an explicit regex pattern when regex: true', async () => {
    const doc = fakePdfDoc(['order #123 and order #456'])
    const matches = await findTextRedactions(doc, {}, 'order #\\d+', { regex: true })
    expect(matches).toHaveLength(2)
  })
})
