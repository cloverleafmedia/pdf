// Pure formatting/summary helpers for the signature-verification feature -
// operate on plain-object shapes (not forge's live Certificate class) so they
// stay testable without real crypto material.

// byteRange = [s1, l1, s2, l2] per the PDF spec: the signed content is
// bytes [s1, s1+l1) followed by [s2, s2+l2) (the gap in between is the
// /Contents placeholder itself, which is excluded from what was hashed).
// If the second chunk doesn't reach the end of the file, something was
// appended after this signature was made (a later incremental update/second
// signature, or tampering).
export function byteRangeCoverage(byteRange, fileLength) {
  const [, , s2, l2] = byteRange
  const coveredEnd = s2 + l2
  const trailingBytes = Math.max(0, fileLength - coveredEnd)
  return { coveredEnd, coversToEnd: trailingBytes === 0, trailingBytes }
}

export function formatCertificateInfo({ subjectCN, issuerCN, notBefore, notAfter } = {}, now = new Date()) {
  const nb = notBefore ? new Date(notBefore) : null
  const na = notAfter ? new Date(notAfter) : null
  return {
    subjectCN: subjectCN || '',
    issuerCN: issuerCN || '',
    notBefore: nb,
    notAfter: na,
    expired: !!(na && now > na),
    notYetValid: !!(nb && now < nb),
  }
}

// sig: { valid, supported, certificate: {expired}, coverage: {coversToEnd} }
export function summarizeSignatureResult(sig) {
  if (!sig.supported) return 'unsupported'
  if (!sig.valid) return 'invalid'
  if (sig.coverage && !sig.coverage.coversToEnd) return 'valid-but-modified-after'
  if (sig.certificate?.expired) return 'valid-but-expired-cert'
  return 'valid'
}
