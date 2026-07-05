// Shortest distance from point p to segment a-b - used to hit-test arrow
// annotations (a single anchor/bounding-box check doesn't fit a line).
function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// Hit-tests annotations near the click point and removes the first match -
// no drag/move behavior, a single click either hits something or not.
export function useEraserTool({ annotations, pageNum, getPos, removeAnnotation }) {
  const onMouseDown = (e) => {
    const pos = getPos(e)
    for (const ann of annotations.filter(a => a.page === pageNum)) {
      const hitRect = ann.rects?.some(r =>
        pos.x >= r.x - 8 && pos.x <= r.x + r.w + 8 &&
        pos.y >= r.y - 8 && pos.y <= r.y + r.h + 8)
      const hitPath = ann.path?.some(pt => Math.hypot(pt.x - pos.x, pt.y - pos.y) < 18)
      const hitAnchor = typeof ann.x === 'number' && ann.type !== 'rectangle' && ann.type !== 'circle' &&
        Math.hypot(ann.x - pos.x, ann.y - pos.y) < 24
      const hitShapeBox = (ann.type === 'rectangle' || ann.type === 'circle') &&
        pos.x >= ann.x - 8 && pos.x <= ann.x + ann.w + 8 &&
        pos.y >= ann.y - 8 && pos.y <= ann.y + ann.h + 8
      const hitArrow = ann.type === 'arrow' &&
        distToSegment(pos, { x: ann.x1, y: ann.y1 }, { x: ann.x2, y: ann.y2 }) < 12
      if (hitRect || hitPath || hitAnchor || hitShapeBox || hitArrow) { removeAnnotation(ann.id); return }
    }
  }

  return { onMouseDown }
}
