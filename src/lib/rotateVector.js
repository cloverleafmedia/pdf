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
