// Computes per-item {id, dx, dy} deltas that align a set of annotation
// bounding boxes to a shared edge/center. Center variants align to the
// center of the union bounding box across the whole selection (standard
// Figma/PowerPoint "align center" semantics), not to one arbitrary item.
// `boundsList` entries are { id, left, top, width, height }.
export function computeAlignDeltas(boundsList, edge) {
  switch (edge) {
    case 'left': {
      const t = Math.min(...boundsList.map(b => b.left))
      return boundsList.map(b => ({ id: b.id, dx: t - b.left, dy: 0 }))
    }
    case 'right': {
      const t = Math.max(...boundsList.map(b => b.left + b.width))
      return boundsList.map(b => ({ id: b.id, dx: t - (b.left + b.width), dy: 0 }))
    }
    case 'top': {
      const t = Math.min(...boundsList.map(b => b.top))
      return boundsList.map(b => ({ id: b.id, dx: 0, dy: t - b.top }))
    }
    case 'bottom': {
      const t = Math.max(...boundsList.map(b => b.top + b.height))
      return boundsList.map(b => ({ id: b.id, dx: 0, dy: t - (b.top + b.height) }))
    }
    case 'centerX': {
      const lo = Math.min(...boundsList.map(b => b.left))
      const hi = Math.max(...boundsList.map(b => b.left + b.width))
      const c = (lo + hi) / 2
      return boundsList.map(b => ({ id: b.id, dx: c - (b.left + b.width / 2), dy: 0 }))
    }
    case 'centerY': {
      const lo = Math.min(...boundsList.map(b => b.top))
      const hi = Math.max(...boundsList.map(b => b.top + b.height))
      const c = (lo + hi) / 2
      return boundsList.map(b => ({ id: b.id, dx: 0, dy: c - (b.top + b.height / 2) }))
    }
    default:
      return boundsList.map(b => ({ id: b.id, dx: 0, dy: 0 }))
  }
}
