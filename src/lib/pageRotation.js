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

// Size a page appears to be once its own native /Rotate is applied - 90/270
// swap width and height, 0/180 don't.
export function visualPageSize(rawW, rawH, nativeRotation) {
  const rot = ((nativeRotation || 0) % 360 + 360) % 360
  return (rot === 90 || rot === 270) ? { width: rawH, height: rawW } : { width: rawW, height: rawH }
}

// Maps a point given in "visual" page space (y-up, origin bottom-left, sized
// per visualPageSize - i.e. how the page LOOKS once a viewer applies its own
// native /Rotate) into raw PDF content space (y-up, origin bottom-left,
// sized to page.getSize() - what pdf-lib's drawText/drawImage/drawRectangle
// actually place content into). Features that reason about a page in visual
// terms ("put this at the visual top-right") but draw via pdf-lib - which
// always draws in raw, pre-rotation space - need this, or their content
// silently lands on the wrong edge (even the wrong AXIS, for 90°/270°) the
// moment the target page has a non-zero native /Rotate. Same rotation
// formula as screenPointToRawPoint in annotationFlatten.js, just without
// that function's extra pixel/y-down-screen layer (this operates purely in
// PDF's own y-up point space on both sides).
export function visualPointToRawPoint(vx, vy, rawW, rawH, nativeRotation) {
  const rot = ((nativeRotation || 0) % 360 + 360) % 360
  if (rot === 90) return { x: rawW - vy, y: vx }
  if (rot === 180) return { x: rawW - vx, y: rawH - vy }
  if (rot === 270) return { x: vy, y: rawH - vx }
  return { x: vx, y: vy }
}
