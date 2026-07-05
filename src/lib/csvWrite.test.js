import { describe, it, expect } from 'vitest'
import { csvEscapeField, csvRow, writeCSV } from './csvWrite.js'

describe('csvEscapeField', () => {
  it('passes a plain alphanumeric field through unquoted', () => {
    expect(csvEscapeField('Hallo123')).toBe('Hallo123')
  })

  it('quotes a field containing a comma', () => {
    expect(csvEscapeField('Muster, Max')).toBe('"Muster, Max"')
  })

  it('quotes and doubles an embedded quote', () => {
    expect(csvEscapeField('Der "Beste"')).toBe('"Der ""Beste"""')
  })

  it('quotes a field containing a newline', () => {
    expect(csvEscapeField('Zeile1\nZeile2')).toBe('"Zeile1\nZeile2"')
  })

  it('coerces null/undefined to an empty field', () => {
    expect(csvEscapeField(null)).toBe('')
    expect(csvEscapeField(undefined)).toBe('')
  })

  it('coerces numbers to strings', () => {
    expect(csvEscapeField(42)).toBe('42')
  })

  it('guards against formula injection for =, +, -, @ prefixes', () => {
    expect(csvEscapeField('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
    expect(csvEscapeField('+1234567')).toBe("'+1234567")
    expect(csvEscapeField('-1234567')).toBe("'-1234567")
    expect(csvEscapeField('@cmd|calc')).toBe("'@cmd|calc")
  })

  it('does not guard values that merely contain, but do not start with, those characters', () => {
    expect(csvEscapeField('Preis = 5€')).toBe('Preis = 5€')
    expect(csvEscapeField('a+b')).toBe('a+b')
  })

  it('quotes a formula-guarded field that also contains a comma', () => {
    expect(csvEscapeField('=A1,A2')).toBe('"\'=A1,A2"')
  })
})

describe('csvRow', () => {
  it('joins escaped fields with commas', () => {
    expect(csvRow(['a', 'b, c', 'd'])).toBe('a,"b, c",d')
  })
})

describe('writeCSV', () => {
  it('includes the header row when provided', () => {
    const result = writeCSV(['Name', 'Betrag'], [['Max', '10'], ['Anna', '20']])
    expect(result).toBe('Name,Betrag\r\nMax,10\r\nAnna,20')
  })

  it('omits the header line when headerRow is null', () => {
    const result = writeCSV(null, [['a', 'b'], ['c', 'd']])
    expect(result).toBe('a,b\r\nc,d')
  })

  it('omits the header line when headerRow is an empty array', () => {
    const result = writeCSV([], [['a', 'b']])
    expect(result).toBe('a,b')
  })

  it('round-trips a quoted field distinguishably from an unquoted one', () => {
    const result = writeCSV(null, [['plain', 'has,comma'], ['plain2', 'noComma']])
    const lines = result.split('\r\n')
    expect(lines[0]).toBe('plain,"has,comma"')
    expect(lines[1]).toBe('plain2,noComma')
  })
})
