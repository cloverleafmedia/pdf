import { describe, it, expect } from 'vitest'
import { byteRangeCoverage, formatCertificateInfo, summarizeSignatureResult } from './signatureVerifyFormat.js'

describe('byteRangeCoverage', () => {
  it('reports full coverage when the second chunk reaches exactly to the end of the file', () => {
    const result = byteRangeCoverage([0, 100, 200, 50], 250)
    expect(result).toEqual({ coveredEnd: 250, coversToEnd: true, trailingBytes: 0 })
  })

  it('reports trailing bytes when the file is longer than the signed range (appended after signing)', () => {
    const result = byteRangeCoverage([0, 100, 200, 50], 300)
    expect(result).toEqual({ coveredEnd: 250, coversToEnd: false, trailingBytes: 50 })
  })

  it('never reports negative trailing bytes even with a malformed/oversized ByteRange', () => {
    const result = byteRangeCoverage([0, 100, 200, 999], 250)
    expect(result.trailingBytes).toBe(0)
  })
})

describe('formatCertificateInfo', () => {
  const now = new Date('2026-06-01')

  it('marks a certificate within its validity window as neither expired nor not-yet-valid', () => {
    const info = formatCertificateInfo({ subjectCN: 'Max Mustermann', issuerCN: 'Test CA', notBefore: '2026-01-01', notAfter: '2027-01-01' }, now)
    expect(info.expired).toBe(false)
    expect(info.notYetValid).toBe(false)
    expect(info.subjectCN).toBe('Max Mustermann')
  })

  it('flags an expired certificate', () => {
    const info = formatCertificateInfo({ notBefore: '2020-01-01', notAfter: '2025-01-01' }, now)
    expect(info.expired).toBe(true)
  })

  it('flags a not-yet-valid certificate', () => {
    const info = formatCertificateInfo({ notBefore: '2030-01-01', notAfter: '2031-01-01' }, now)
    expect(info.notYetValid).toBe(true)
  })

  it('handles missing dates gracefully', () => {
    const info = formatCertificateInfo({}, now)
    expect(info.expired).toBe(false)
    expect(info.notYetValid).toBe(false)
    expect(info.notBefore).toBeNull()
  })
})

describe('summarizeSignatureResult', () => {
  it('returns "unsupported" for an unsupported algorithm regardless of other fields', () => {
    expect(summarizeSignatureResult({ supported: false, valid: true })).toBe('unsupported')
  })

  it('returns "invalid" when the signature does not verify', () => {
    expect(summarizeSignatureResult({ supported: true, valid: false })).toBe('invalid')
  })

  it('returns "valid-but-modified-after" when bytes were appended after signing', () => {
    expect(summarizeSignatureResult({
      supported: true, valid: true,
      coverage: { coversToEnd: false },
      certificate: { expired: false },
    })).toBe('valid-but-modified-after')
  })

  it('returns "valid-but-expired-cert" when the cert is expired but everything else checks out', () => {
    expect(summarizeSignatureResult({
      supported: true, valid: true,
      coverage: { coversToEnd: true },
      certificate: { expired: true },
    })).toBe('valid-but-expired-cert')
  })

  it('returns "valid" when everything checks out', () => {
    expect(summarizeSignatureResult({
      supported: true, valid: true,
      coverage: { coversToEnd: true },
      certificate: { expired: false },
    })).toBe('valid')
  })
})
