// Parses a page-range string like "1-5, 8, 10-12" into a sorted, deduplicated
// array of page numbers within [1, total]. Shared by SplitModal.jsx and
// WatermarkModal.jsx so both use identical range syntax/behavior.
export function parsePageRanges(input, total) {
  const pages = new Set()
  const parts = input.split(',').map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      for (let i = Math.max(1, a); i <= Math.min(total, b || total); i++) pages.add(i)
    } else {
      const n = Number(part)
      if (n >= 1 && n <= total) pages.add(n)
    }
  }
  return [...pages].sort((a, b) => a - b)
}
