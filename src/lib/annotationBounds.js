// Half the sticky-note icon's rendered size (see the 📌 marker in
// PDFViewer.jsx, which positions itself at `a.x - NOTE_ICON_HALF, a.y -
// NOTE_ICON_HALF` since a note annotation's x/y is its visual center, not a
// corner). Shared here so align math and the render position can't drift.
export const NOTE_ICON_HALF = 10

// Returns { left, top, width, height } for an annotation in the same CSS
// pixel space as its stored x/y (and w/h for stamps). Stamps use their own
// unrotated box - rotation is treated as a pure visual decoration around
// that box everywhere else in this codebase (see rotateVector.js), so align
// math ignores it too, consistent with resize. Text boxes have no stored
// size (content-sized), so they need the live rendered DOM node.
export function getAnnotationBounds(a, domEl) {
  if (a.type === 'stamp') return { left: a.x, top: a.y, width: a.w, height: a.h }
  if (a.type === 'note') {
    return { left: a.x - NOTE_ICON_HALF, top: a.y - NOTE_ICON_HALF, width: 2 * NOTE_ICON_HALF, height: 2 * NOTE_ICON_HALF }
  }
  return { left: a.x, top: a.y, width: domEl?.offsetWidth || 0, height: domEl?.offsetHeight || 0 }
}
