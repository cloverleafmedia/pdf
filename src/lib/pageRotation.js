// Combines a page's own native /Rotate value with this app's in-session
// rotate-button delta (the store's pageRotations[n], always a relative ±90
// accumulation - see rotatePageLeft/rotatePageRight in useStore.js) into the
// single absolute rotation that should actually be used to render/interpret
// that page right now.
//
// Passing the delta alone straight into pdf.js's page.getViewport({rotation})
// silently discards the page's own native rotation: that parameter is
// absolute, not additive, and pdf.js only falls back to the page's native
// rotation when the parameter is omitted entirely (default `rotation =
// this.rotate`). Any PDF page with a non-zero native /Rotate - common for
// scanned documents and phone-camera photos turned into PDFs - would
// therefore render un-rotated the moment `{ rotation: delta }` is passed
// explicitly, even though delta is 0 (meaning "no additional rotation"), not
// "ignore the page's own rotation".
export function effectiveRotation(nativeDeg, deltaDeg) {
  const sum = (nativeDeg || 0) + (deltaDeg || 0)
  return ((sum % 360) + 360) % 360
}
