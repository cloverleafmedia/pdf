import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, PDFString, PDFBool } from 'pdf-lib'
import {
  checkFontEmbedding,
  checkStructure,
  checkImageAltText,
  listImagesForAltText,
  setImageAltText,
  checkFormFieldLabels,
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
  it('reports unsupported when there is no StructTreeRoot at all', async () => {
    const doc = await makeDoc()
    expect(checkImageAltText(doc)).toEqual({ supported: false, total: 0, withAlt: 0 })
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
})
