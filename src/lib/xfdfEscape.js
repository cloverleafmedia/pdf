// XML entity escaping for XFDF text content/attribute values - kept separate
// from piiDetection.js's escapeRegExp, which escapes for a completely
// different purpose (regex metacharacters, not XML entities).
export function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
