import { PDFName, PDFDict } from 'pdf-lib'

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
