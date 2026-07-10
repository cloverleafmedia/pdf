import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, PDFString, PDFBool } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {
  checkFontEmbedding,
  checkStructure,
  checkDisplayDocTitle,
  checkTransparencyAndColorSpace,
  checkImageAltText,
  listImagesForAltText,
  setImageAltText,
  checkFormFieldLabels,
  setDocumentLang,
  setFormFieldLabelsFallback,
  findJavaScriptLocations,
  removeJavaScript,
} from './pdfCompliance.js'

async function makeDoc() {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  return doc
}

describe('checkFontEmbedding', () => {
  it('reports a standard (non-embedded) font as unembedded', async () => {
    const doc = await makeDoc()
    const font = await doc.embedFont('Helvetica')
    doc.getPage(0).drawText('hi', { font })
    await doc.save() // pdf-lib only writes the font dict into the context on save()

    const result = checkFontEmbedding(doc)
    expect(result.total).toBe(1)
    expect(result.embedded).toBe(0)
    expect(result.unembedded).toEqual(['Helvetica'])
  })

  it('reports a font with a FontFile2 descriptor as embedded', async () => {
    const doc = await makeDoc()
    const page = doc.getPage(0)

    const descriptorRef = doc.context.register(
      doc.context.obj({ Type: PDFName.of('FontDescriptor'), FontFile2: doc.context.register(doc.context.stream('')) })
    )
    const fontRef = doc.context.register(
      doc.context.obj({ Type: PDFName.of('Font'), BaseFont: PDFName.of('CustomFont'), FontDescriptor: descriptorRef })
    )
    const resources = page.node.Resources()
    resources.set(PDFName.of('Font'), doc.context.obj({ F1: fontRef }))

    const result = checkFontEmbedding(doc)
    expect(result.total).toBe(1)
    expect(result.embedded).toBe(1)
    expect(result.unembedded).toEqual([])
  })

  it('reports a Type0 composite font as embedded via its DescendantFonts FontDescriptor', async () => {
    // pdf-lib/fontkit always produces a Type0 composite font for an embedded
    // TrueType font (to support full Unicode) - its FontDescriptor lives on
    // the descendant CIDFontType2 dict, not on the Type0 dict itself.
    const doc = await makeDoc()
    const page = doc.getPage(0)

    const descriptorRef = doc.context.register(
      doc.context.obj({ Type: PDFName.of('FontDescriptor'), FontFile2: doc.context.register(doc.context.stream('')) })
    )
    const descendantRef = doc.context.register(
      doc.context.obj({ Type: PDFName.of('Font'), Subtype: PDFName.of('CIDFontType2'), BaseFont: PDFName.of('CustomFont'), FontDescriptor: descriptorRef })
    )
    const fontRef = doc.context.register(
      doc.context.obj({
        Type: PDFName.of('Font'), Subtype: PDFName.of('Type0'), BaseFont: PDFName.of('CustomFont'),
        DescendantFonts: doc.context.obj([descendantRef]),
      })
    )
    const resources = page.node.Resources()
    resources.set(PDFName.of('Font'), doc.context.obj({ F1: fontRef }))

    const result = checkFontEmbedding(doc)
    expect(result.total).toBe(1)
    expect(result.embedded).toBe(1)
    expect(result.unembedded).toEqual([])
  })

  it('reports the bundled Liberation Sans font (used by embedAppFont) as embedded', async () => {
    // Exercises the real font file + fontkit, not a synthetic FontFile2 stub -
    // this is the actual asset embedAppFont() (embeddedFont.js) embeds in
    // place of pdf-lib's un-embeddable StandardFonts.Helvetica.
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const fontBytes = fs.readFileSync(path.join(__dirname, '../assets/LiberationSans-Regular.ttf'))

    const doc = await makeDoc()
    doc.registerFontkit(fontkit)
    const font = await doc.embedFont(fontBytes)
    doc.getPage(0).drawText('hi', { font })
    await doc.save()

    const result = checkFontEmbedding(doc)
    expect(result.total).toBe(1)
    expect(result.embedded).toBe(1)
    expect(result.unembedded).toEqual([])
  })

  it('dedupes the same font referenced across multiple pages', async () => {
    const doc = await makeDoc()
    doc.addPage([200, 200])
    const font = await doc.embedFont('Helvetica')
    doc.getPage(0).drawText('a', { font })
    doc.getPage(1).drawText('b', { font })
    await doc.save()

    const result = checkFontEmbedding(doc)
    expect(result.total).toBe(1)
  })
})

describe('checkStructure', () => {
  it('reports an untagged, unencrypted document with no flags set', async () => {
    const doc = await makeDoc()
    const result = checkStructure(doc)
    expect(result).toEqual({ isMarked: false, hasStructTree: false, lang: '', hasEncryption: false })
  })

  it('detects MarkInfo/Marked, Lang and a StructTreeRoot once set', async () => {
    const doc = await makeDoc()
    doc.catalog.set(PDFName.of('MarkInfo'), doc.context.obj({ Marked: PDFBool.True }))
    doc.catalog.set(PDFName.of('Lang'), PDFString.of('de'))
    doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.register(doc.context.obj({ Type: PDFName.of('StructTreeRoot') })))

    const result = checkStructure(doc)
    expect(result.isMarked).toBe(true)
    expect(result.hasStructTree).toBe(true)
    expect(result.lang).toBe('de')
  })
})

describe('checkDisplayDocTitle', () => {
  it('returns false when no ViewerPreferences are set', async () => {
    const doc = await makeDoc()
    expect(checkDisplayDocTitle(doc)).toBe(false)
  })

  it('returns false when DisplayDocTitle is explicitly false', async () => {
    const doc = await makeDoc()
    doc.catalog.set(PDFName.of('ViewerPreferences'), doc.context.obj({ DisplayDocTitle: PDFBool.False }))
    expect(checkDisplayDocTitle(doc)).toBe(false)
  })

  it('returns true once DisplayDocTitle is set to true', async () => {
    const doc = await makeDoc()
    doc.catalog.set(PDFName.of('ViewerPreferences'), doc.context.obj({ DisplayDocTitle: PDFBool.True }))
    expect(checkDisplayDocTitle(doc)).toBe(true)
  })
})

describe('checkTransparencyAndColorSpace', () => {
  it('reports no transparency/colorspace risk for a plain document', async () => {
    const doc = await makeDoc()
    const result = checkTransparencyAndColorSpace(doc)
    expect(result).toEqual({ hasTransparency: false, nonStandardColorSpaces: [], colorSpaceRisk: false })
  })

  it('detects a real (non-/None) soft mask as transparency', async () => {
    const doc = await makeDoc()
    const page = doc.getPage(0)
    const gsRef = doc.context.register(doc.context.obj({ Type: PDFName.of('ExtGState'), SMask: doc.context.obj({ Type: PDFName.of('Mask') }) }))
    page.node.Resources().set(PDFName.of('ExtGState'), doc.context.obj({ GS0: gsRef }))

    const result = checkTransparencyAndColorSpace(doc)
    expect(result.hasTransparency).toBe(true)
  })

  it('does not flag an explicit /None soft mask as transparency', async () => {
    const doc = await makeDoc()
    const page = doc.getPage(0)
    const gsRef = doc.context.register(doc.context.obj({ Type: PDFName.of('ExtGState'), SMask: PDFName.of('None') }))
    page.node.Resources().set(PDFName.of('ExtGState'), doc.context.obj({ GS0: gsRef }))

    const result = checkTransparencyAndColorSpace(doc)
    expect(result.hasTransparency).toBe(false)
  })

  it('flags a non-standard color space as a risk when no OutputIntent is present', async () => {
    const doc = await makeDoc()
    const page = doc.getPage(0)
    const csRef = doc.context.register(doc.context.obj([PDFName.of('Separation')]))
    page.node.Resources().set(PDFName.of('ColorSpace'), doc.context.obj({ CS0: csRef }))

    const result = checkTransparencyAndColorSpace(doc)
    expect(result.nonStandardColorSpaces).toEqual(['Separation'])
    expect(result.colorSpaceRisk).toBe(true)
  })

  it('does not flag the risk once an OutputIntent is present, even with a non-standard color space', async () => {
    const doc = await makeDoc()
    const page = doc.getPage(0)
    const csRef = doc.context.register(doc.context.obj([PDFName.of('Separation')]))
    page.node.Resources().set(PDFName.of('ColorSpace'), doc.context.obj({ CS0: csRef }))
    doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([]))

    const result = checkTransparencyAndColorSpace(doc)
    expect(result.colorSpaceRisk).toBe(false)
  })

  it('does not flag DeviceRGB/DeviceGray/ICCBased as non-standard', async () => {
    const doc = await makeDoc()
    const page = doc.getPage(0)
    const csRef = doc.context.register(doc.context.obj([PDFName.of('ICCBased'), doc.context.register(doc.context.stream(''))]))
    page.node.Resources().set(PDFName.of('ColorSpace'), doc.context.obj({ CS0: PDFName.of('DeviceRGB'), CS1: csRef }))

    const result = checkTransparencyAndColorSpace(doc)
    expect(result.nonStandardColorSpaces).toEqual([])
  })
})

// Builds a minimal StructTreeRoot -> Document -> Figure(s) tree by hand, the
// same shape setImageAltText() itself produces - lets checkImageAltText and
// listImagesForAltText be tested independently of that writer function.
function attachFigure(doc, { alt, imgRef, pageRef } = {}) {
  const kids = []
  const figureDict = {
    Type: PDFName.of('StructElem'),
    S: PDFName.of('Figure'),
  }
  if (alt !== undefined) figureDict.Alt = PDFString.of(alt)
  if (imgRef) figureDict.K = doc.context.obj({ Type: PDFName.of('OBJR'), Pg: pageRef, Obj: imgRef })
  kids.push(doc.context.register(doc.context.obj(figureDict)))

  const docElem = doc.context.obj({ Type: PDFName.of('StructElem'), S: PDFName.of('Document'), K: doc.context.obj(kids) })
  const structTreeRoot = doc.context.obj({ Type: PDFName.of('StructTreeRoot'), K: doc.context.obj([doc.context.register(docElem)]) })
  doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.register(structTreeRoot))
}

describe('checkImageAltText', () => {
  it('reports unsupported when there is no StructTreeRoot at all and no images either', async () => {
    const doc = await makeDoc()
    expect(checkImageAltText(doc)).toEqual({ supported: false, total: 0, withAlt: 0 })
  })

  it('reports a real failure (not "unsupported") when images exist but there is no StructTreeRoot', async () => {
    const doc = await makeDoc()
    const imgRef = doc.context.register(doc.context.obj({ Type: PDFName.of('XObject'), Subtype: PDFName.of('Image') }))
    doc.getPage(0).node.Resources().set(PDFName.of('XObject'), doc.context.obj({ Im1: imgRef }))

    // The single most common real case - an ordinary PDF with images and no
    // tagging at all - used to surface as "not checkable" rather than a fail.
    expect(checkImageAltText(doc)).toEqual({ supported: true, total: 1, withAlt: 0 })
  })

  it('counts Figure elements with and without Alt text', async () => {
    const doc = await makeDoc()
    attachFigure(doc, { alt: 'a logo' })
    const result = checkImageAltText(doc)
    expect(result.supported).toBe(true)
    expect(result.total).toBe(1)
    expect(result.withAlt).toBe(1)
  })

  it('does not count a Figure with an empty Alt string as having alt text', async () => {
    const doc = await makeDoc()
    attachFigure(doc, { alt: '   ' })
    const result = checkImageAltText(doc)
    expect(result.total).toBe(1)
    expect(result.withAlt).toBe(0)
  })
})

describe('listImagesForAltText', () => {
  it('lists a distinct image XObject once per document, with all pages it appears on', async () => {
    const doc = await makeDoc()
    doc.addPage([200, 200])
    const imgDict = doc.context.obj({ Type: PDFName.of('XObject'), Subtype: PDFName.of('Image') })
    const imgRef = doc.context.register(imgDict)
    for (const page of doc.getPages()) {
      page.node.Resources().set(PDFName.of('XObject'), doc.context.obj({ Im1: imgRef }))
    }

    const images = listImagesForAltText(doc)
    expect(images).toHaveLength(1)
    expect(images[0].pages).toEqual([0, 1])
    expect(images[0].alt).toBe('')
  })

  it('merges in Alt text already present from a previous setImageAltText() run', async () => {
    const doc = await makeDoc()
    const imgDict = doc.context.obj({ Type: PDFName.of('XObject'), Subtype: PDFName.of('Image') })
    const imgRef = doc.context.register(imgDict)
    doc.getPage(0).node.Resources().set(PDFName.of('XObject'), doc.context.obj({ Im1: imgRef }))
    attachFigure(doc, { alt: 'existing alt', imgRef, pageRef: doc.getPage(0).ref })

    const images = listImagesForAltText(doc)
    expect(images).toHaveLength(1)
    expect(images[0].alt).toBe('existing alt')
  })

  it('finds an image nested one level inside a Form XObject', async () => {
    const doc = await makeDoc()
    const imgRef = doc.context.register(doc.context.obj({ Type: PDFName.of('XObject'), Subtype: PDFName.of('Image') }))
    const formRef = doc.context.register(doc.context.obj({
      Type: PDFName.of('XObject'), Subtype: PDFName.of('Form'),
      Resources: doc.context.obj({ XObject: doc.context.obj({ Im1: imgRef }) }),
    }))
    doc.getPage(0).node.Resources().set(PDFName.of('XObject'), doc.context.obj({ Fm1: formRef }))

    const images = listImagesForAltText(doc)
    expect(images).toHaveLength(1)
    expect(images[0].ref.toString()).toBe(imgRef.toString())
    expect(images[0].pages).toEqual([0])
  })

  it('does not recurse two levels deep into nested Form XObjects', async () => {
    const doc = await makeDoc()
    const imgRef = doc.context.register(doc.context.obj({ Type: PDFName.of('XObject'), Subtype: PDFName.of('Image') }))
    const innerFormRef = doc.context.register(doc.context.obj({
      Type: PDFName.of('XObject'), Subtype: PDFName.of('Form'),
      Resources: doc.context.obj({ XObject: doc.context.obj({ Im1: imgRef }) }),
    }))
    const outerFormRef = doc.context.register(doc.context.obj({
      Type: PDFName.of('XObject'), Subtype: PDFName.of('Form'),
      Resources: doc.context.obj({ XObject: doc.context.obj({ Fm2: innerFormRef }) }),
    }))
    doc.getPage(0).node.Resources().set(PDFName.of('XObject'), doc.context.obj({ Fm1: outerFormRef }))

    const images = listImagesForAltText(doc)
    expect(images).toHaveLength(0)
  })
})

describe('setImageAltText', () => {
  it('writes a MarkInfo + StructTreeRoot that checkImageAltText/listImagesForAltText can read back', async () => {
    const doc = await makeDoc()
    const imgDict = doc.context.obj({ Type: PDFName.of('XObject'), Subtype: PDFName.of('Image') })
    const imgRef = doc.context.register(imgDict)
    doc.getPage(0).node.Resources().set(PDFName.of('XObject'), doc.context.obj({ Im1: imgRef }))

    const images = listImagesForAltText(doc)
    expect(images[0].alt).toBe('')
    images[0].alt = 'a round-tripped description'

    setImageAltText(doc, images)

    expect(checkStructure(doc).isMarked).toBe(true)
    const altCheck = checkImageAltText(doc)
    expect(altCheck.supported).toBe(true)
    expect(altCheck.total).toBe(1)
    expect(altCheck.withAlt).toBe(1)

    const roundTripped = listImagesForAltText(doc)
    expect(roundTripped[0].alt).toBe('a round-tripped description')
  })

  it('skips images left without alt text - no Figure is written for them', async () => {
    const doc = await makeDoc()
    const imgDict = doc.context.obj({ Type: PDFName.of('XObject'), Subtype: PDFName.of('Image') })
    const imgRef = doc.context.register(imgDict)
    doc.getPage(0).node.Resources().set(PDFName.of('XObject'), doc.context.obj({ Im1: imgRef }))

    const images = listImagesForAltText(doc)
    setImageAltText(doc, images) // alt is still '' for every image

    expect(checkImageAltText(doc)).toEqual({ supported: true, total: 0, withAlt: 0 })
  })

  it('preserves a pre-existing tag tree instead of rebuilding it from scratch', async () => {
    const doc = await makeDoc()
    const imgARef = doc.context.register(doc.context.obj({ Type: PDFName.of('XObject'), Subtype: PDFName.of('Image') }))
    const imgBRef = doc.context.register(doc.context.obj({ Type: PDFName.of('XObject'), Subtype: PDFName.of('Image') }))
    doc.getPage(0).node.Resources().set(PDFName.of('XObject'), doc.context.obj({ ImA: imgARef, ImB: imgBRef }))

    // Pre-existing tree: an unrelated Heading + a Figure already tagging imgA.
    const headingRef = doc.context.register(doc.context.obj({ Type: PDFName.of('StructElem'), S: PDFName.of('H1') }))
    const figureARef = doc.context.register(doc.context.obj({
      Type: PDFName.of('StructElem'), S: PDFName.of('Figure'), Alt: PDFString.of('existing alt'),
      K: doc.context.obj({ Type: PDFName.of('OBJR'), Pg: doc.getPage(0).ref, Obj: imgARef }),
    }))
    const docElemRef = doc.context.register(doc.context.obj({
      Type: PDFName.of('StructElem'), S: PDFName.of('Document'), K: doc.context.obj([headingRef, figureARef]),
    }))
    doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.register(doc.context.obj({
      Type: PDFName.of('StructTreeRoot'), K: doc.context.obj([docElemRef]),
    })))

    const images = listImagesForAltText(doc)
    expect(images).toHaveLength(2)
    const imgA = images.find(i => i.ref.toString() === imgARef.toString())
    const imgB = images.find(i => i.ref.toString() === imgBRef.toString())
    expect(imgA.alt).toBe('existing alt') // already merged in by listImagesForAltText

    imgA.alt = 'updated alt'
    imgB.alt = 'brand new alt'
    setImageAltText(doc, images)

    // The unrelated pre-existing Heading must still be there.
    const docElem = doc.context.lookup(docElemRef)
    const kAfter = docElem.lookup(PDFName.of('K'))
    const kRefs = Array.from({ length: kAfter.size() }, (_, i) => kAfter.get(i).toString())
    expect(kRefs).toContain(headingRef.toString())

    const roundTripped = listImagesForAltText(doc)
    expect(roundTripped.find(i => i.ref.toString() === imgARef.toString()).alt).toBe('updated alt')
    expect(roundTripped.find(i => i.ref.toString() === imgBRef.toString()).alt).toBe('brand new alt')

    // Exactly one Figure per image (imgA updated in place, not duplicated).
    expect(checkImageAltText(doc).total).toBe(2)
  })
})

describe('findJavaScriptLocations / removeJavaScript', () => {
  it('finds catalog Names/JavaScript, OpenAction, and catalog-level AA', async () => {
    const doc = await makeDoc()
    doc.catalog.set(PDFName.of('Names'), doc.context.obj({ JavaScript: doc.context.obj({}) }))
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('app.alert(1)') }))
    doc.catalog.set(PDFName.of('AA'), doc.context.obj({ WC: doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('1') }) }))

    const kinds = findJavaScriptLocations(doc).map(l => l.kind).sort()
    expect(kinds).toEqual(['catalogAA', 'namesJavaScript', 'openAction'])
  })

  it('finds JavaScript hidden in a page-level AA', async () => {
    const doc = await makeDoc()
    doc.getPage(0).node.set(PDFName.of('AA'), doc.context.obj({ O: doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('1') }) }))
    expect(findJavaScriptLocations(doc).map(l => l.kind)).toEqual(['pageAA'])
  })

  it('finds JavaScript hidden in an annotation/AcroForm-field-level AA (the gap a catalog-only check misses)', async () => {
    const doc = await makeDoc()
    const widgetRef = doc.context.register(doc.context.obj({
      Type: PDFName.of('Annot'), Subtype: PDFName.of('Widget'),
      AA: doc.context.obj({ K: doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('1') }) }),
    }))
    doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([widgetRef]))

    expect(findJavaScriptLocations(doc).map(l => l.kind)).toEqual(['annotAA'])
  })

  it('reports nothing found on a clean document', async () => {
    const doc = await makeDoc()
    expect(findJavaScriptLocations(doc)).toEqual([])
  })

  it('removeJavaScript deletes every location it finds and reports that something was removed', async () => {
    const doc = await makeDoc()
    doc.catalog.set(PDFName.of('Names'), doc.context.obj({ JavaScript: doc.context.obj({}) }))
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('1') }))
    doc.getPage(0).node.set(PDFName.of('AA'), doc.context.obj({ O: doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('1') }) }))
    const widgetRef = doc.context.register(doc.context.obj({
      Type: PDFName.of('Annot'), Subtype: PDFName.of('Widget'),
      AA: doc.context.obj({ K: doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('1') }) }),
    }))
    doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([widgetRef]))

    expect(removeJavaScript(doc)).toBe(true)
    expect(findJavaScriptLocations(doc)).toEqual([])
  })

  it('removeJavaScript reports false when there is nothing to remove', async () => {
    const doc = await makeDoc()
    expect(removeJavaScript(doc)).toBe(false)
  })
})

describe('checkFormFieldLabels', () => {
  it('returns zero totals when the document has no AcroForm', async () => {
    const doc = await makeDoc()
    expect(checkFormFieldLabels(doc)).toEqual({ total: 0, withLabel: 0 })
  })

  it('counts fields with a /TU tooltip label separately from those without', async () => {
    const doc = await makeDoc()
    const form = doc.getForm()
    const labeled = form.createTextField('labeled')
    labeled.addToPage(doc.getPage(0))
    labeled.acroField.dict.set(PDFName.of('TU'), PDFString.of('Enter your name'))

    const unlabeled = form.createTextField('unlabeled')
    unlabeled.addToPage(doc.getPage(0))

    const result = checkFormFieldLabels(doc)
    expect(result.total).toBe(2)
    expect(result.withLabel).toBe(1)
  })

  // Regression: pdf-lib's createTextField()+addToPage() creates the field
  // dict and its widget annotation dict as two SEPARATE objects (linked via
  // the widget's /Parent) even for the ordinary single-widget case - a /TU
  // set only on the widget (which is what real-world tools, and this app's
  // own newfield marker/fill-mode placeholder, actually read via pdf.js's
  // non-inheriting `dict.get("TU")`) must still count as "has a label", not
  // just one set on field.acroField.dict.
  it('counts a field as labeled when /TU is set only on its widget dict, not the field dict', async () => {
    const doc = await makeDoc()
    const form = doc.getForm()
    const field = form.createTextField('widgetLabeled')
    field.addToPage(doc.getPage(0))
    for (const widget of field.acroField.getWidgets()) {
      widget.dict.set(PDFName.of('TU'), PDFString.of('Widget-level label'))
    }
    // Deliberately NOT set on field.acroField.dict - proves the checker
    // doesn't only look there.
    expect(field.acroField.dict.lookup(PDFName.of('TU'))).toBeUndefined()

    expect(checkFormFieldLabels(doc)).toEqual({ total: 1, withLabel: 1 })
  })
})

describe('setDocumentLang', () => {
  it('sets /Lang so checkStructure reads it back', async () => {
    const doc = await makeDoc()
    expect(checkStructure(doc).lang).toBe('')
    setDocumentLang(doc, 'de')
    expect(checkStructure(doc).lang).toBe('de')
  })

  it('defaults to "de" when no language is given', async () => {
    const doc = await makeDoc()
    setDocumentLang(doc)
    expect(checkStructure(doc).lang).toBe('de')
  })
})

describe('setImageAltText with an empty image list (the a11y-autofix minimal-tagging path)', () => {
  it('produces a Marked MarkInfo + an empty StructTreeRoot when the document had neither', async () => {
    const doc = await makeDoc()
    expect(checkStructure(doc).isMarked).toBe(false)
    expect(checkStructure(doc).hasStructTree).toBe(false)

    setImageAltText(doc, [])

    const structure = checkStructure(doc)
    expect(structure.isMarked).toBe(true)
    expect(structure.hasStructTree).toBe(true)
  })
})

describe('setFormFieldLabelsFallback', () => {
  it('sets /TU to the field name on every unlabeled field, leaving labeled fields untouched', async () => {
    const doc = await makeDoc()
    const form = doc.getForm()
    const labeled = form.createTextField('labeled')
    labeled.addToPage(doc.getPage(0))
    labeled.acroField.dict.set(PDFName.of('TU'), PDFString.of('Enter your name'))

    const unlabeled = form.createTextField('unlabeled')
    unlabeled.addToPage(doc.getPage(0))

    setFormFieldLabelsFallback(doc)

    const result = checkFormFieldLabels(doc)
    expect(result.total).toBe(2)
    expect(result.withLabel).toBe(2)
    expect(labeled.acroField.dict.lookup(PDFName.of('TU')).decodeText()).toBe('Enter your name')
    expect(unlabeled.acroField.dict.lookup(PDFName.of('TU')).decodeText()).toBe('unlabeled')
  })

  // Regression: the fallback used to write /TU only to field.acroField.dict,
  // which pdf.js's own (non-inheriting) annotation parsing never sees - the
  // autofix looked successful (checkFormFieldLabels agreed, since it made
  // the same mistake) while producing a label invisible to real readers,
  // including this app's own fill-mode placeholder. Must land on the
  // widget's own dict too.
  it('writes the label to the widget dict as well, not just the field dict', async () => {
    const doc = await makeDoc()
    const form = doc.getForm()
    const field = form.createTextField('unlabeled')
    field.addToPage(doc.getPage(0))

    setFormFieldLabelsFallback(doc)

    const widgetTU = field.acroField.getWidgets()[0].dict.lookup(PDFName.of('TU'))
    expect(widgetTU?.decodeText()).toBe('unlabeled')
  })

  it('does not touch a field whose label already exists only on the widget dict', async () => {
    const doc = await makeDoc()
    const form = doc.getForm()
    const field = form.createTextField('field')
    field.addToPage(doc.getPage(0))
    for (const widget of field.acroField.getWidgets()) {
      widget.dict.set(PDFName.of('TU'), PDFString.of('Already labeled'))
    }

    setFormFieldLabelsFallback(doc)

    expect(field.acroField.getWidgets()[0].dict.lookup(PDFName.of('TU')).decodeText()).toBe('Already labeled')
  })
})
