import { PDFName, PDFDict, PDFArray, PDFString, PDFBool } from 'pdf-lib'

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
  return { isMarked, hasStructTree, lang, hasEncryption }
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

// Enumerates every distinct image XObject across all pages, grouped by
// object reference — a repeated logo/header image gets one entry (with the
// list of pages it appears on) instead of one prompt per occurrence.
export function listImagesForAltText(doc) {
  const byKey = new Map() // refString -> { ref, pages: number[], alt: string }
  doc.getPages().forEach((page, pageIndex) => {
    const res = page.node.Resources()
    const xobjDict = res?.lookup(PDFName.of('XObject'))
    if (!(xobjDict instanceof PDFDict)) return
    for (const [, ref] of xobjDict.entries()) {
      const obj = doc.context.lookup(ref)
      const dict = obj?.dict instanceof PDFDict ? obj.dict : (obj instanceof PDFDict ? obj : null)
      if (!dict) continue
      const subtype = dict.lookup(PDFName.of('Subtype'))
      const subtypeName = subtype instanceof PDFName ? subtype.asString().replace(/^\//, '') : ''
      if (subtypeName !== 'Image') continue
      const key = ref.toString()
      if (!byKey.has(key)) byKey.set(key, { ref, pages: [], alt: '' })
      byKey.get(key).pages.push(pageIndex)
    }
  })

  // Merge in Alt text already present from a previous run of this editor —
  // matched by which object each Figure struct element's OBJR points at.
  const structTreeRoot = doc.catalog.lookup(PDFName.of('StructTreeRoot'))
  if (structTreeRoot instanceof PDFDict) {
    const visited = new Set()
    const walk = (node) => {
      if (node instanceof PDFArray) { for (let i = 0; i < node.size(); i++) walk(node.lookup(i)); return }
      if (!(node instanceof PDFDict) || visited.has(node)) return
      visited.add(node)
      const s = node.lookup(PDFName.of('S'))
      const sName = s instanceof PDFName ? s.asString().replace(/^\//, '') : ''
      if (sName === 'Figure') {
        const k = node.lookup(PDFName.of('K'))
        if (k instanceof PDFDict) {
          const objRef = k.get(PDFName.of('Obj'))
          const key = objRef?.toString?.()
          const altObj = node.lookup(PDFName.of('Alt'))
          const alt = altObj?.decodeText ? altObj.decodeText().trim() : ''
          if (key && alt && byKey.has(key)) byKey.get(key).alt = alt
        }
      }
      walk(node.lookup(PDFName.of('K')))
    }
    walk(structTreeRoot.lookup(PDFName.of('K')))
  }

  return [...byKey.values()]
}

// Writes Alt text via minimal flat structure tagging: MarkInfo/Marked=true,
// StructTreeRoot -> Document -> one Figure per (image, page) pair. Figures
// reference their image directly via an OBJR ("object reference") entry
// rather than a marked-content span, so the page content streams never need
// to be touched — the safer of the two spec-sanctioned tagging mechanisms
// for objects that are already their own indirect object (ISO 32000-1,
// 14.7.4.3). Rebuilds the tree from scratch each save rather than patching
// an existing one, since this editor is the only thing expected to write it.
// Known limitation (documented, not hidden): no ParentTree is built, so this
// is enough for our own checker and for Alt text to be associated with the
// right image, but not a full PDF/UA-certified tag tree.
export function setImageAltText(doc, images) {
  const withAlt = images.filter(img => img.alt && img.alt.trim())
  doc.catalog.set(PDFName.of('MarkInfo'), doc.context.obj({ Marked: PDFBool.True }))

  const docElemRef = doc.context.nextRef()
  const figureRefs = []
  for (const img of withAlt) {
    for (const pageIndex of img.pages) {
      const pageRef = doc.getPage(pageIndex).ref
      const figureDict = doc.context.obj({
        Type: PDFName.of('StructElem'),
        S: PDFName.of('Figure'),
        P: docElemRef,
        Pg: pageRef,
        Alt: PDFString.of(img.alt.trim()),
        K: doc.context.obj({ Type: PDFName.of('OBJR'), Pg: pageRef, Obj: img.ref }),
      })
      figureRefs.push(doc.context.register(figureDict))
    }
  }

  const docElem = doc.context.obj({
    Type: PDFName.of('StructElem'),
    S: PDFName.of('Document'),
    K: doc.context.obj(figureRefs),
  })
  doc.context.assign(docElemRef, docElem)

  const structTreeRoot = doc.context.obj({
    Type: PDFName.of('StructTreeRoot'),
    K: doc.context.obj([docElemRef]),
  })
  doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.register(structTreeRoot))
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
