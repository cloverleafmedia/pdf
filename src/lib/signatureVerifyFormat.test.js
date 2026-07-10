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
  const now = new Date('2026-06-01')

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
      certificate: { notAfter: '2027-01-01' },
    }, now)).toBe('valid-but-modified-after')
  })

  // Regression: pkcs7Verify.js's real return shape only ever has
  // certificate.notBefore/notAfter, never a pre-computed `.expired` boolean
  // - this function used to check `certificate.expired` directly, which was
  // always undefined for every real signature the app ever verified, so
  // "valid-but-expired-cert" was permanently unreachable outside of a
  // hand-crafted test fixture that assumed a field nothing ever set.
  it('returns "valid-but-expired-cert" derived from notAfter, not a pre-computed flag', () => {
    expect(summarizeSignatureResult({
      supported: true, valid: true,
      coverage: { coversToEnd: true },
      certificate: { notBefore: '2020-01-01', notAfter: '2025-01-01' },
    }, now)).toBe('valid-but-expired-cert')
  })

  it('returns "valid-untrusted-cert" when the chain does not resolve to a trusted root', () => {
    expect(summarizeSignatureResult({
      supported: true, valid: true,
      coverage: { coversToEnd: true },
      certificate: { notAfter: '2027-01-01' },
      chainTrust: { trusted: false, selfSigned: true },
    }, now)).toBe('valid-untrusted-cert')
  })

  it('prioritizes "expired" over "untrusted" when both apply', () => {
    expect(summarizeSignatureResult({
      supported: true, valid: true,
      coverage: { coversToEnd: true },
      certificate: { notBefore: '2020-01-01', notAfter: '2025-01-01' },
      chainTrust: { trusted: false },
    }, now)).toBe('valid-but-expired-cert')
  })

  it('treats a missing chainTrust as trusted, for callers/fixtures that predate chain checking', () => {
    expect(summarizeSignatureResult({
      supported: true, valid: true,
      coverage: { coversToEnd: true },
      certificate: { notAfter: '2027-01-01' },
    }, now)).toBe('valid')
  })

  it('returns "valid" when everything checks out, including a trusted chain', () => {
    expect(summarizeSignatureResult({
      supported: true, valid: true,
      coverage: { coversToEnd: true },
      certificate: { notAfter: '2027-01-01' },
      chainTrust: { trusted: true },
    }, now)).toBe('valid')
  })
})
