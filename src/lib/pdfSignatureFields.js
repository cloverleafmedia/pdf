import { PDFName, PDFDict, PDFArray, PDFHexString, PDFString } from 'pdf-lib'

// Low-level catalog walk (same style as pdfCompliance.js) to find every
// digital-signature field in a PDF's AcroForm - pdf-lib's high-level
// doc.getForm() API doesn't surface /Sig fields (they aren't a form widget
// type it models), so this reads the field tree directly.

function decodeText(obj) {
  if (!obj) return ''
  if (obj.decodeText) return obj.decodeText()
  if (obj.asString) return obj.asString().replace(/^\((.*)\)$/, '$1')
  return ''
}

// Walks AcroForm/Fields (and each field's /Kids, for fields nested under a
// non-terminal parent) collecting every terminal field whose /FT is /Sig and
// which has a /V (value) dict actually set - an unsigned signature field
// (present but not yet signed) has no /V and is skipped.
export function findSignatureDicts(doc) {
  const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'))
  if (!(acroForm instanceof PDFDict)) return []
  const fields = acroForm.lookup(PDFName.of('Fields'))
  if (!(fields instanceof PDFArray)) return []

  const results = []

  const walk = (fieldDict, inheritedFT) => {
    if (!(fieldDict instanceof PDFDict)) return
    const ftObj = fieldDict.lookup(PDFName.of('FT'))
    const ft = ftObj instanceof PDFName ? ftObj.asString().replace(/^\//, '') : inheritedFT

    const kids = fieldDict.lookup(PDFName.of('Kids'))
    if (kids instanceof PDFArray) {
      for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i), ft)
    }

    if (ft !== 'Sig') return
    const sigDict = fieldDict.lookup(PDFName.of('V'))
    if (!(sigDict instanceof PDFDict)) return

    const byteRangeObj = sigDict.lookup(PDFName.of('ByteRange'))
    const contentsObj = sigDict.lookup(PDFName.of('Contents'))
    if (!(byteRangeObj instanceof PDFArray) || !(contentsObj instanceof PDFHexString)) return

    const byteRange = []
    for (let i = 0; i < byteRangeObj.size(); i++) {
      const n = byteRangeObj.lookup(i)
      byteRange.push(n?.asNumber ? n.asNumber() : 0)
    }

    const tObj = fieldDict.lookup(PDFName.of('T'))
    const subFilterObj = sigDict.lookup(PDFName.of('SubFilter'))

    results.push({
      fieldName:     tObj instanceof PDFString ? decodeText(tObj) : '',
      byteRange,
      contentsBytes: contentsObj.asBytes(),
      subFilter:     subFilterObj instanceof PDFName ? subFilterObj.asString().replace(/^\//, '') : '',
      signerName:    decodeText(sigDict.lookup(PDFName.of('Name'))),
      reason:        decodeText(sigDict.lookup(PDFName.of('Reason'))),
      location:      decodeText(sigDict.lookup(PDFName.of('Location'))),
      m:             decodeText(sigDict.lookup(PDFName.of('M'))),
    })
  }

  for (let i = 0; i < fields.size(); i++) walk(fields.lookup(i))
  return results
}
