// Parses XFDF back into this app's internal annotation shape.
//
// Uses a hand-rolled regex parser rather than DOMParser: DOMParser isn't
// available in the Node-only Vitest environment this project deliberately
// uses (no jsdom, see project test conventions), and this app fully controls
// both writer (xfdfExport.js) and reader, so a purpose-built parser for the
// specific, fixed element set produced there is sufficient. Known limitation:
// arbitrary third-party XFDF with unusual structure may not parse correctly.
//
// Reply threads (inreplyto/replytype="R") are recognized and stripped out
// before parsing but not reconstructed as replies on import - reattaching
// them to a freshly re-created parent annotation id is out of scope here.
//
// Returns imported annotations with pageW/pageH set to the page's own PDF
// point dimensions (so the rescale in annotationFlatten.js becomes a no-op,
// sx=sy=1) - the caller supplies `pageDimensions` (0-indexed array of
// {width, height}, same shape xfdfExport.js's buildXfdf expects) so imported
// geometry lands in the correct place regardless of the current PDF's size.

function unescapeXml(str) {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseAttrs(attrsStr) {
  const attrs = {}
  const re = /(\w[\w-]*)="([^"]*)"/g
  let m
  while ((m = re.exec(attrsStr))) attrs[m[1]] = m[2]
  return attrs
}

function parseRect(rectStr) {
  if (!rectStr) return null
  const [x1, y1, x2, y2] = rectStr.split(',').map(Number)
  if ([x1, y1, x2, y2].some(Number.isNaN)) return null
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 }
}

export function parseXfdf(xmlString, pageDimensions) {
  // Strip reply elements first so the top-level regex below never has to
  // reason about same-tag-name nesting (only replies nest <text> in <text>).
  const withoutReplies = xmlString.replace(/<text([^>]*\breplytype="R"[^>]*)>[\s\S]*?<\/text>/g, '')

  const annotations = []
  const elementRe = /<(highlight|underline|strikeout|ink|text|freetext)([^>]*)>([\s\S]*?)<\/\1>/g
  let m
  while ((m = elementRe.exec(withoutReplies))) {
    const [, tag, attrsStr, inner] = m
    const attrs = parseAttrs(attrsStr)
    const pageIndex = Number(attrs.page || 0)
    const dims = pageDimensions[pageIndex]
    if (!dims) continue
    const { width: pw, height: ph } = dims
    const page = pageIndex + 1
    const color = attrs.color || '#f59e0b'
    const id = Date.now() + Math.random()

    if (tag === 'highlight' || tag === 'underline' || tag === 'strikeout') {
      const rect = parseRect(attrs.rect)
      if (!rect) continue
      const type = tag === 'strikeout' ? 'strikethrough' : tag
      annotations.push({
        id, type, page, color, pageW: pw, pageH: ph,
        rects: [{ x: rect.x1, y: ph - rect.y1 - rect.h, w: rect.w, h: rect.h }],
      })
    } else if (tag === 'ink') {
      const gestureMatch = /<gesture>([\s\S]*?)<\/gesture>/.exec(inner)
      if (!gestureMatch) continue
      const nums = gestureMatch[1].split(',').map(Number)
      const path = []
      for (let i = 0; i + 1 < nums.length; i += 2) path.push({ x: nums[i], y: ph - nums[i + 1] })
      if (path.length < 2) continue
      annotations.push({ id, type: 'draw', page, color, pageW: pw, pageH: ph, path, width: 3 })
    } else if (tag === 'text' || tag === 'freetext') {
      const contentsMatch = /<contents>([\s\S]*?)<\/contents>/.exec(inner)
      const rect = parseRect(attrs.rect)
      if (!contentsMatch || !rect) continue
      annotations.push({
        id, type: tag === 'text' ? 'note' : 'text', page, color, pageW: pw, pageH: ph,
        x: rect.x1, y: ph - rect.y2, text: unescapeXml(contentsMatch[1]),
      })
    }
  }

  return annotations
}
