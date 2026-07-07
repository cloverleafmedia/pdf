// ── Scan every page's text for IBAN / E-Mail / Telefonnummer patterns ──────
// Matching is per text-item (pdf.js groups contiguous same-line runs into one
// item in most machine-generated PDFs) — patterns split across separate items
// won't be caught, which is an acceptable trade-off for a suggestion feature
// the user reviews before applying.
export const PII_PATTERNS = [
  // Allows the standard 4-char-grouped display format (e.g. the German
  // "DE44 5001 0517 5407 3249 31") in addition to the unspaced form - a
  // printed invoice/letter almost always shows an IBAN grouped like this.
  { label: 'IBAN',           re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g },
  // Domain part allows any number of dot-separated segments before the final
  // one (subdomains, co.uk/com.au-style multi-part TLDs) - a single-dot-only
  // pattern stops matching right before the last segment for any address
  // with more than one domain dot, leaving that trailing part unredacted.
  { label: 'E-Mail',         re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-zA-Z]{2,}\b/g },
  { label: 'Telefonnummer',  re: /(?:\+49[\s\-/]?|\b0)[1-9][0-9\s\-/()]{5,14}[0-9]\b/g },
]

// Shared by PII auto-detection and free-text "Suchen & Schwärzen" — scans
// every page's text items against a list of {label, re} patterns and returns
// viewport-space boxes for each match.
export async function findTextMatches(pdfDoc, pageRotations, patterns) {
  const found = []
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const vp = page.getViewport({ scale: 1, rotation: pageRotations[pageNum] || 0 })
    const textContent = await page.getTextContent()

    for (const item of textContent.items) {
      const str = item.str
      if (!str || !str.trim() || !item.width) continue

      for (const pattern of patterns) {
        pattern.re.lastIndex = 0
        let m
        while ((m = pattern.re.exec(str))) {
          const matched = m[0]
          if (!matched.length) break // zero-width match (e.g. empty regex group) would loop forever
          if (pattern.label === 'Telefonnummer' && (matched.match(/\d/g) || []).length < 7) continue

          // Equal-width char estimate is imprecise for proportional fonts — pad
          // outward a bit rather than risk leaving a sliver of the match exposed.
          const charW = item.width / str.length
          const pad = charW * 0.6
          const x0 = item.transform[4] + charW * m.index - pad
          const x1 = item.transform[4] + charW * (m.index + matched.length) + pad
          const y0 = item.transform[5]
          const y1 = item.transform[5] + (item.height || 10)
          const [vx0, vy0] = vp.convertToViewportPoint(x0, y0)
          const [vx1, vy1] = vp.convertToViewportPoint(x1, y1)

          found.push({
            pageNum,
            x: Math.min(vx0, vx1), y: Math.min(vy0, vy1),
            w: Math.abs(vx1 - vx0), h: Math.abs(vy1 - vy0),
            logicalW: vp.width, logicalH: vp.height,
            label: pattern.label, text: matched,
          })
        }
      }
    }
  }
  return found
}

export function findPIIRedactions(pdfDoc, pageRotations) {
  return findTextMatches(pdfDoc, pageRotations, PII_PATTERNS)
}

// Escapes regex metacharacters so a literal search term can't be
// misinterpreted as a pattern unless the user explicitly asked for regex mode.
export function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export function findTextRedactions(pdfDoc, pageRotations, query, { regex = false, caseSensitive = false } = {}) {
  const source = regex ? query : escapeRegExp(query)
  const re = new RegExp(source, caseSensitive ? 'g' : 'gi')
  return findTextMatches(pdfDoc, pageRotations, [{ label: 'Suchtreffer', re }])
}
