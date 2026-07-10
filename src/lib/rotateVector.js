// Un-rotates a screen-space vector (dx, dy) by `rotationDeg` to recover the
// vector in a coordinate frame that has itself been CSS-rotated by
// `rotate(${-rotationDeg}deg)` — used by the stamp resize handle in
// PDFViewer.jsx, whose parent div carries exactly that preview transform, so
// a raw mouse delta no longer lines up with the box's own width/height axes
// once the stamp is rotated.
export function unrotateDelta(dx, dy, rotationDeg) {
  if (!rotationDeg) return { dx, dy }
  const rad = (rotationDeg * Math.PI) / 180
  return {
    dx: dx * Math.cos(rad) - dy * Math.sin(rad),
    dy: dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

// pdf-lib's drawImage/drawRectangle/drawText rotate around the given {x,y}
// origin, not the shape's own center - fine for a tiny mark where the origin
// and center are nearly the same point, but wrong wherever the origin is
// meant to be a specific corner of a box that should visually spin in place
// (a stamp) or wherever the box is large enough that the corner/center gap
// itself is large (e.g. a big diagonal watermark - rotating a wide text run
// around its own bottom-left corner swings its true center noticeably off
// the intended point, easily far enough to clip off the page). Standard
// rotation-around-a-pivot formula: given a shape's own drawing origin,
// compute where that origin ends up if the whole shape is rotated by
// `rotation` degrees around a shared pivot (typically the shape's own
// intended center) - so everything that makes up one visual unit (a
// rectangle and its centered label, or multiple watermark lines) rotates
// together around that single point instead of each spinning around its own
// unrotated origin.
export function rotatePointAroundPivot(x, y, cx, cy, rotation) {
  if (!rotation) return { x, y }
  const rad = (rotation * Math.PI) / 180
  const dx = x - cx, dy = y - cy
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad)
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad)
  return { x: cx + rx, y: cy + ry }
}
