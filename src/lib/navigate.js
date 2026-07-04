import { useStore } from '../store/useStore'

// Scrolls the main PDF viewer to the given page. Most callers (page-number
// field, bookmarks, outline, search results, thumbnail rail) also want the
// store's currentPage updated immediately; Toolbar's prev/next/first/last
// buttons and the annotations list instead rely on the scroll-sync
// IntersectionObserver in PDFViewer.jsx to update currentPage as a side
// effect of the scroll itself, so they pass `setPage: false`.
export function navigateToPage(n, { setPage = true } = {}) {
  if (setPage) useStore.getState().setCurrentPage(n)
  document.getElementById(`page-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
