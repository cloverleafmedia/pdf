import { PDFName, PDFDict, PDFArray } from 'pdf-lib'

// Low-level dict walks shared by the PDF/A export readiness report and the
// PDF/UA accessibility checker — both need to poke at catalog-level structure
// that pdf-lib's high-level API doesn't expose helpers for.

export function checkFontEmbedding(doc) {
  const seen = new Set()
  let total = 0, embedded = 0
  const unembedded = []
  for (const page of doc.getPages()) {
    const res = page.node.Resources()
    const fontDict = res?.lookup(PDFName.of('Font'))
    if (!(fontDict instanceof PDFDict)) continue
    for (const [key, ref] of fontDict.entries()) {
      const uniq = ref.toString()
      if (seen.has(uniq)) continue
      seen.add(uniq)
      const fd = doc.context.lookup(ref)
      if (!(fd instanceof PDFDict)) continue
      const baseFont = fd.lookup(PDFName.of('BaseFont'))
      const descriptor = fd.lookup(PDFName.of('FontDescriptor'))
      const isEmbedded = descriptor instanceof PDFDict &&
        !!(descriptor.lookup(PDFName.of('FontFile')) || descriptor.lookup(PDFName.of('FontFile2')) || descriptor.lookup(PDFName.of('FontFile3')))
      total++
      if (isEmbedded) embedded++
      else unembedded.push(baseFont ? baseFont.asString().replace(/^\//, '') : key.asString().replace(/^\//, ''))
    }
  }
  return { total, embedded, unembedded: [...new Set(unembedded)] }
}

export function checkStructure(doc) {
  const catalog = doc.catalog
  const markInfo = catalog.lookup(PDFName.of('MarkInfo'))
  const marked = markInfo instanceof PDFDict ? markInfo.lookup(PDFName.of('Marked')) : undefined
  const isMarked = !!(marked && marked.asBoolean && marked.asBoolean())
  const hasStructTree = !!catalog.lookup(PDFName.of('StructTreeRoot'))
  const langObj = catalog.lookup(PDFName.of('Lang'))
  const lang = langObj?.decodeText ? langObj.decodeText() : (langObj?.asString ? langObj.asString() : '')
  const hasEncryption = !!catalog.context.trailerInfo?.Encrypt
  const hasJavaScript = (() => {
    const names = catalog.lookup(PDFName.of('Names'))
    return !!(names instanceof PDFDict && names.lookup(PDFName.of('JavaScript')))
  })()
  return { isMarked, hasStructTree, lang, hasEncryption, hasJavaScript }
}

// Walks the struct tree (not the page content) because image alt text lives
// on the /Figure struct element's /Alt entry, not on the image XObject itself.
export function checkImageAltText(doc) {
  const structTreeRoot = doc.catalog.lookup(PDFName.of('StructTreeRoot'))
  if (!(structTreeRoot instanceof PDFDict)) return { supported: false, total: 0, withAlt: 0 }

  let total = 0, withAlt = 0
  const visited = new Set()

  const walk = (node) => {
    if (node instanceof PDFArray) {
      for (let i = 0; i < node.size(); i++) walk(node.lookup(i))
      return
    }
    if (!(node instanceof PDFDict) || visited.has(node)) return
    visited.add(node)

    const type = node.lookup(PDFName.of('Type'))
    const typeName = type instanceof PDFName ? type.asString().replace(/^\//, '') : ''
    if (typeName === 'MCR' || typeName === 'OBJR') return

    const s = node.lookup(PDFName.of('S'))
    const sName = s instanceof PDFName ? s.asString().replace(/^\//, '') : ''
    if (sName === 'Figure') {
      total++
      const altObj = node.lookup(PDFName.of('Alt'))
      const alt = altObj?.decodeText ? altObj.decodeText().trim() : ''
      if (alt) withAlt++
    }

    walk(node.lookup(PDFName.of('K')))
  }

  walk(structTreeRoot.lookup(PDFName.of('K')))
  return { supported: true, total, withAlt }
}

export function checkFormFieldLabels(doc) {
  try {
    const fields = doc.getForm().getFields()
    const withLabel = fields.filter(f => {
      try { return !!f.acroField.dict.lookup(PDFName.of('TU')) } catch { return false }
    }).length
    return { total: fields.length, withLabel }
  } catch {
    return { total: 0, withLabel: 0 }
  }
}
