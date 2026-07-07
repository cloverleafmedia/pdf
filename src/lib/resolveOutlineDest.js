// Resolves each top-level PDF outline entry (from pdf.js's `pdfDoc.getOutline()`)
// to a 0-based start page index — the same dest-resolution steps as
// src/components/Sidebar.jsx's `OutlineItem.navigate()` (string dest ->
// `getDestination()`, `dest[0]` -> `getPageIndex()`), extracted here so
// SplitModal.jsx's "split by bookmarks" mode doesn't duplicate it. Entries
// whose dest can't be resolved are skipped rather than aborting the whole list.
export async function resolveOutlineBookmarks(pdfDoc, outline) {
  const results = []
  for (const item of outline || []) {
    try {
      if (!item.dest) continue
      let dest = item.dest
      if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest)
      if (!Array.isArray(dest) || !dest[0]) continue
      const pageIndex = await pdfDoc.getPageIndex(dest[0])
      results.push({ title: item.title || '', startPageIndex: pageIndex })
    } catch (_) { /* unresolvable dest (e.g. dangling named destination) - skip */ }
  }
  return results.sort((a, b) => a.startPageIndex - b.startPageIndex)
}

// Turns a resolved, sorted bookmark list into non-overlapping page ranges -
// each bookmark runs up to (but not including) the next one's start, the
// last one runs to the end of the document.
export function bookmarksToRanges(bookmarks, totalPages) {
  return bookmarks.map((b, i) => {
    const end = i < bookmarks.length - 1 ? bookmarks[i + 1].startPageIndex - 1 : totalPages - 1
    return { title: b.title, startPageIndex: b.startPageIndex, endPageIndex: Math.max(b.startPageIndex, end) }
  })
}
