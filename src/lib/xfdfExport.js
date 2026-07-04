import { escapeXml } from './xfdfEscape.js'

// Builds an XFDF (Acrobat-compatible annotation interchange) document from
// this app's internal annotation shape. Mirrors the exact rescale/Y-flip
// math already used by annotationFlatten.js when baking annotations into a
// saved PDF - PDF/XFDF coordinate space is bottom-left-origin in points,
// while the UI records rects in top-left-origin canvas-pixel space.
//
// `pageDimensions` is an array indexed by 0-based page index, each entry
// `{width, height}` in PDF points (obtained by the caller from the loaded
// document, e.g. via pdf-lib `page.getSize()`).
export function buildXfdf(annotations, pageDimensions) {
  const byPage = {}
  for (const a of annotations) (byPage[a.page] = byPage[a.page] || []).push(a)

  const elements = []
  for (const [pgStr, anns] of Object.entries(byPage)) {
    const pageIndex = Number(pgStr) - 1
    const dims = pageDimensions[pageIndex]
    if (!dims) continue
    const { width: pw, height: ph } = dims

    for (const a of anns) {
      const sx = pw / (a.pageW || pw)
      const sy = ph / (a.pageH || ph)
      const name = `ann-${a.id}`
      const color = a.color || '#f59e0b'

      if (a.rects?.length && ['highlight', 'underline', 'strikethrough'].includes(a.type)) {
        const tag = a.type === 'highlight' ? 'highlight' : a.type === 'underline' ? 'underline' : 'strikeout'
        for (const rect of a.rects) {
          const x = rect.x * sx, w = rect.w * sx, h = rect.h * sy
          const y = ph - (rect.y + rect.h) * sy
          // QuadPoints order per PDF spec: top-left, top-right, bottom-left, bottom-right.
          const coords = [x, y + h, x + w, y + h, x, y, x + w, y].join(',')
          elements.push(
            `<${tag} page="${pageIndex}" rect="${x},${y},${x + w},${y + h}" color="${color}" coords="${coords}" name="${name}">` +
            replyElements(a, pageIndex) +
            `</${tag}>`
          )
        }
      } else if (a.path?.length >= 2) {
        const points = a.path.map(p => `${p.x * sx},${ph - p.y * sy}`).join(',')
        const minX = Math.min(...a.path.map(p => p.x * sx)), maxX = Math.max(...a.path.map(p => p.x * sx))
        const minY = Math.min(...a.path.map(p => ph - p.y * sy)), maxY = Math.max(...a.path.map(p => ph - p.y * sy))
        elements.push(
          `<ink page="${pageIndex}" rect="${minX},${minY},${maxX},${maxY}" color="${color}" name="${name}">` +
          `<inklist><gesture>${points}</gesture></inklist>` +
          replyElements(a, pageIndex) +
          `</ink>`
        )
      } else if ((a.type === 'note' || a.type === 'text') && a.text) {
        const tx = (a.x || 0) * sx, ty = ph - (a.y || 0) * sy
        const tag = a.type === 'note' ? 'text' : 'freetext'
        const size = a.type === 'note' ? 20 : 100 // approximate footprint, exact size isn't reconstructible from stored data
        const rect = `${tx},${ty - size},${tx + size},${ty}`
        const iconAttr = a.type === 'note' ? ' icon="Comment"' : ''
        elements.push(
          `<${tag} page="${pageIndex}" rect="${rect}" color="${color}"${iconAttr} name="${name}">` +
          `<contents>${escapeXml(a.text)}</contents>` +
          replyElements(a, pageIndex) +
          `</${tag}>`
        )
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">\n` +
    `<annots>\n${elements.join('\n')}\n</annots>\n` +
    `</xfdf>\n`
}

// Reply threads (addReply/deleteReply in useStore.js) aren't baked into the
// saved PDF today (annotationFlatten.js has no code path for them), but
// XFDF has a native reply mechanism (inreplyto/replytype="R"), so exporting
// them here is straightforward and avoids silently dropping user data.
function replyElements(annotation, pageIndex) {
  if (!annotation.replies?.length) return ''
  const parentName = `ann-${annotation.id}`
  return annotation.replies.map(r =>
    `<text page="${pageIndex}" name="reply-${r.id}" inreplyto="${parentName}" replytype="R">` +
    `<contents>${escapeXml(r.text)}</contents>` +
    `</text>`
  ).join('')
}
