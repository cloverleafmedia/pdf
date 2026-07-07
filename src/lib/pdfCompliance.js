import { PDFName, PDFDict, PDFArray, PDFString, PDFBool } from 'pdf-lib'

// Low-level dict walks shared by the PDF/A export readiness report and the
// PDF/UA accessibility checker — both need to poke at catalog-level structure
// that pdf-lib's high-level API doesn't expose helpers for.

function hasFontFile(descriptor) {
  return descriptor instanceof PDFDict &&
    !!(descriptor.lookup(PDFName.of('FontFile')) || descriptor.lookup(PDFName.of('FontFile2')) || descriptor.lookup(PDFName.of('FontFile3')))
}

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
      // A Type0 composite font (which is what pdf-lib/fontkit always produces
      // for an embedded TrueType font, to support full Unicode) carries its
      // FontDescriptor on the descendant CIDFontType2 dict, not on itself -
      // fall back to that before concluding there's no embedded font data.
      let descriptor = fd.lookup(PDFName.of('FontDescriptor'))
      if (!(descriptor instanceof PDFDict)) {
        const descendants = fd.lookup(PDFName.of('DescendantFonts'))
        const descendantDict = descendants instanceof PDFArray ? doc.context.lookup(descendants.get(0)) : null
        if (descendantDict instanceof PDFDict) descriptor = descendantDict.lookup(PDFName.of('FontDescriptor'))
      }
      const isEmbedded = hasFontFile(descriptor)
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

// PDF/UA (ISO 14289) requires /ViewerPreferences/DisplayDocTitle true so
// compliant viewers show the document's actual /Title instead of the
// filename - a document can have a perfectly good title set and still fail
// this because nothing tells the viewer to prefer it.
export function checkDisplayDocTitle(doc) {
  const prefs = doc.catalog.lookup(PDFName.of('ViewerPreferences'))
  const flag = prefs instanceof PDFDict ? prefs.lookup(PDFName.of('DisplayDocTitle')) : undefined
  return !!(flag && flag.asBoolean && flag.asBoolean())
}

// Best-effort heuristic, not a conformance check: PDF/A-1 forbids transparency
// groups and requires every color space to resolve unambiguously against the
// declared OutputIntent. This walks each page's ExtGState for a real (non-
// /None) soft mask and its ColorSpace resources for anything other than
// DeviceGray/DeviceRGB/ICCBased when no OutputIntent is present - a decent
// proxy for the two most common PDF/A-1 violations in this category. Real
// conformance is the bundled veraPDF's job (see PdfaExportModal.jsx); this
// exists so a lighter-weight warning can surface without a full veraPDF run.
export function checkTransparencyAndColorSpace(doc) {
  const hasOutputIntent = !!doc.catalog.lookup(PDFName.of('OutputIntents'))
  let hasTransparency = false
  const nonStandardColorSpaces = new Set()

  for (const page of doc.getPages()) {
    const res = page.node.Resources()
    if (!res) continue

    const extGState = res.lookup(PDFName.of('ExtGState'))
    if (extGState instanceof PDFDict) {
      for (const [, ref] of extGState.entries()) {
        const gs = doc.context.lookup(ref)
        if (!(gs instanceof PDFDict)) continue
        const smask = gs.lookup(PDFName.of('SMask'))
        const smaskName = smask instanceof PDFName ? smask.asString().replace(/^\//, '') : ''
        if (smask && smaskName !== 'None') hasTransparency = true
      }
    }

    const colorSpace = res.lookup(PDFName.of('ColorSpace'))
    if (colorSpace instanceof PDFDict) {
      for (const [, ref] of colorSpace.entries()) {
        const cs = doc.context.lookup(ref)
        const csName = cs instanceof PDFName ? cs.asString().replace(/^\//, '')
          : (cs instanceof PDFArray && cs.size() > 0 && cs.lookup(0) instanceof PDFName ? cs.lookup(0).asString().replace(/^\//, '') : 'unknown')
        if (!['DeviceGray', 'DeviceRGB', 'ICCBased', 'CalRGB', 'CalGray'].includes(csName)) {
          nonStandardColorSpaces.add(csName)
        }
      }
    }
  }

  return {
    hasTransparency,
    nonStandardColorSpaces: [...nonStandardColorSpaces],
    colorSpaceRisk: !hasOutputIntent && nonStandardColorSpaces.size > 0,
  }
}

// Walks the struct tree (not the page content) because image alt text lives
// on the /Figure struct element's /Alt entry, not on the image XObject itself.
export function checkImageAltText(doc) {
  const structTreeRoot = doc.catalog.lookup(PDFName.of('StructTreeRoot'))
  if (!(structTreeRoot instanceof PDFDict)) {
    // No tag tree at all is the overwhelming majority of ordinary PDFs - and
    // exactly the case that most needs flagging, not waved through as merely
    // "not checkable". Only report it as a real failure if the document
    // actually has images to tag; a text-only document with no StructTreeRoot
    // genuinely has nothing to check here.
    const imageCount = listImagesForAltText(doc).length
    return imageCount > 0
      ? { supported: true, total: imageCount, withAlt: 0 }
      : { supported: false, total: 0, withAlt: 0 }
  }

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
// Recurses one level into Form XObjects (common for vector diagrams/grouped
// content that embed a raster image via their own nested /Resources) - not
// attempted: images referenced only via an annotation's appearance stream
// (e.g. a Stamp's /AP /N) or inline images (BI/ID/EI content-stream
// operators, which have no XObject dict entry at all and would need a full
// content-stream parser) - documented known limitations, not detectable by
// walking resource dictionaries the way this function does.
export function listImagesForAltText(doc) {
  const byKey = new Map() // refString -> { ref, pages: number[], alt: string }

  const collectImages = (xobjDict, pageIndex, recurseIntoForms) => {
    if (!(xobjDict instanceof PDFDict)) return
    for (const [, ref] of xobjDict.entries()) {
      const obj = doc.context.lookup(ref)
      const dict = obj?.dict instanceof PDFDict ? obj.dict : (obj instanceof PDFDict ? obj : null)
      if (!dict) continue
      const subtype = dict.lookup(PDFName.of('Subtype'))
      const subtypeName = subtype instanceof PDFName ? subtype.asString().replace(/^\//, '') : ''
      if (subtypeName === 'Image') {
        const key = ref.toString()
        if (!byKey.has(key)) byKey.set(key, { ref, pages: [], alt: '' })
        const entry = byKey.get(key)
        if (!entry.pages.includes(pageIndex)) entry.pages.push(pageIndex)
      } else if (subtypeName === 'Form' && recurseIntoForms) {
        const nestedRes = dict.lookup(PDFName.of('Resources'))
        const nestedXObj = nestedRes instanceof PDFDict ? nestedRes.lookup(PDFName.of('XObject')) : null
        collectImages(nestedXObj, pageIndex, false) // one level deep only
      }
    }
  }

  doc.getPages().forEach((page, pageIndex) => {
    const res = page.node.Resources()
    collectImages(res?.lookup(PDFName.of('XObject')), pageIndex, true)
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
// 14.7.4.3). If a StructTreeRoot already exists (e.g. from a Word/InDesign
// export with real Heading/Paragraph/List structure), it is preserved and
// only extended with new/updated Figure elements - only a document with NO
// pre-existing tag tree gets this flat skeleton built from scratch.
// Known limitation (documented, not hidden): no ParentTree is built, so this
// is enough for our own checker and for Alt text to be associated with the
// right image, but not a full PDF/UA-certified tag tree.
export function setImageAltText(doc, images) {
  const withAlt = images.filter(img => img.alt && img.alt.trim())
  const existingRootRef = doc.catalog.get(PDFName.of('StructTreeRoot'))
  const existingRoot = existingRootRef ? doc.context.lookup(existingRootRef) : null

  if (existingRoot instanceof PDFDict) {
    // A real, pre-existing tag tree (e.g. a Word/InDesign export with actual
    // Heading/Paragraph/List structure) - never rebuild it from scratch (that
    // used to silently discard the whole thing the moment a user added Alt
    // text to a single image). Only ADD a Figure for an image that doesn't
    // already have one, and UPDATE /Alt in place for one that does - matched
    // by which image object each existing Figure's OBJR points at, same
    // matching listImagesForAltText() already does when merging Alt text
    // back for display.
    const byObjKey = new Map() // refString -> existing Figure StructElem dict
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
          if (key) byObjKey.set(key, node)
        }
      }
      walk(node.lookup(PDFName.of('K')))
    }
    walk(existingRoot.lookup(PDFName.of('K')))

    const newFigureRefs = []
    for (const img of withAlt) {
      const existingFigure = byObjKey.get(img.ref.toString())
      if (existingFigure) {
        existingFigure.set(PDFName.of('Alt'), PDFString.of(img.alt.trim()))
        continue
      }
      for (const pageIndex of img.pages) {
        const pageRef = doc.getPage(pageIndex).ref
        const figureDict = doc.context.obj({
          Type: PDFName.of('StructElem'),
          S: PDFName.of('Figure'),
          P: existingRootRef,
          Pg: pageRef,
          Alt: PDFString.of(img.alt.trim()),
          K: doc.context.obj({ Type: PDFName.of('OBJR'), Pg: pageRef, Obj: img.ref }),
        })
        newFigureRefs.push(doc.context.register(figureDict))
      }
    }

    if (newFigureRefs.length) {
      // Preserve whatever was already in /K exactly as-is (raw ref/dict/array
      // entries, via .get() not .lookup()) and just append the new figures -
      // never inline/replace the existing subtree by value.
      const rawK = existingRoot.get(PDFName.of('K'))
      const kArray = doc.context.obj([])
      if (rawK instanceof PDFArray) { for (let i = 0; i < rawK.size(); i++) kArray.push(rawK.get(i)) }
      else if (rawK) kArray.push(rawK)
      for (const ref of newFigureRefs) kArray.push(ref)
      existingRoot.set(PDFName.of('K'), kArray)
    }
    return
  }

  // No pre-existing tag tree - build the minimal flat skeleton as before.
  // Known limitation (documented, not hidden): no ParentTree is built, so
  // this is enough for our own checker and for Alt text to be associated
  // with the right image, but not a full PDF/UA-certified tag tree.
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

// Finds every place a PDF can carry a JavaScript/auto-run action: catalog
// /Names/JavaScript, catalog /OpenAction, catalog /AA (document actions),
// every page's own /AA, and every annotation's /AA - this last one is where
// AcroForm field Keystroke/Format/Validate/Calculate JS lives, since a
// terminal field's widget annotation dict is the same dict as the field
// itself for the common (merged Field/Widget) case. Shared by the
// JavaScript-removal option in SanitizeModal.jsx, PdfaExportModal.jsx's
// export cleanup, and the "contains JavaScript" detection badge in App.jsx -
// previously each had its own (differently incomplete) check, so a document
// could trip the warning badge while "Bereinigen" reported nothing found.
export function findJavaScriptLocations(doc) {
  const AA = PDFName.of('AA')
  const locations = []

  const namesDict = doc.catalog.lookup(PDFName.of('Names'))
  if (namesDict instanceof PDFDict && namesDict.lookup(PDFName.of('JavaScript'))) {
    locations.push({ kind: 'namesJavaScript' })
  }
  if (doc.catalog.get(PDFName.of('OpenAction'))) {
    locations.push({ kind: 'openAction' })
  }
  if (doc.catalog.lookup(AA)) {
    locations.push({ kind: 'catalogAA' })
  }
  for (const page of doc.getPages()) {
    if (page.node.lookup(AA)) locations.push({ kind: 'pageAA', page })
    const annots = page.node.Annots()
    if (annots instanceof PDFArray) {
      for (let i = 0; i < annots.size(); i++) {
        const annotDict = doc.context.lookup(annots.get(i))
        if (annotDict instanceof PDFDict && annotDict.lookup(AA)) {
          locations.push({ kind: 'annotAA', dict: annotDict })
        }
      }
    }
  }
  return locations
}

// Removes every location findJavaScriptLocations() finds. Returns whether
// anything was actually present, so callers can report "found and removed"
// vs. "nothing found" without a second traversal.
export function removeJavaScript(doc) {
  const locations = findJavaScriptLocations(doc)
  const AA = PDFName.of('AA')

  const namesDict = doc.catalog.lookup(PDFName.of('Names'))
  if (namesDict instanceof PDFDict) namesDict.delete(PDFName.of('JavaScript'))
  doc.catalog.delete(PDFName.of('OpenAction'))
  doc.catalog.delete(AA)
  for (const loc of locations) {
    if (loc.kind === 'pageAA') loc.page.node.delete(AA)
    else if (loc.kind === 'annotAA') loc.dict.delete(AA)
  }

  return locations.length > 0
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

// --- Autofix writers (v1.8.0) ------------------------------------------
// Deliberately limited to the three checks cheap/unambiguous enough to fix
// without any user input: a missing document language, a completely absent
// tag tree (the MarkInfo/StructTreeRoot writer already exists above as
// setImageAltText - calling it with an empty image list produces exactly
// this minimal skeleton, so no separate writer is needed for that case),
// and missing form-field tooltips falling back to the field's own name.
// Font embedding and real accessibility tagging are NOT autofixable here -
// they require re-encoding fonts or genuine manual structure work.

export function setDocumentLang(doc, lang = 'de') {
  doc.catalog.set(PDFName.of('Lang'), PDFString.of(lang))
}

export function setFormFieldLabelsFallback(doc) {
  for (const field of doc.getForm().getFields()) {
    try {
      if (!field.acroField.dict.lookup(PDFName.of('TU')))
        field.acroField.dict.set(PDFName.of('TU'), PDFString.of(field.getName()))
    } catch {
      // Malformed field dict - skip rather than abort the whole autofix.
    }
  }
}
