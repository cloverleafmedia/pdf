import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib'
import { findSignatureDicts } from './pdfSignatureFields.js'

async function makeDoc() {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  return doc
}

function addSigField(doc, { fieldName = 'Signature1', byteRange = [0, 100, 200, 50], contentsHex = 'DEADBEEF', signerName = 'Max Mustermann', reason = 'Freigabe' } = {}) {
  const sigDict = doc.context.obj({
    Type: PDFName.of('Sig'),
    Filter: PDFName.of('Adobe.PPKLite'),
    SubFilter: PDFName.of('adbe.pkcs7.detached'),
    ByteRange: byteRange,
    Contents: PDFHexString.of(contentsHex),
    Name: PDFString.of(signerName),
    Reason: PDFString.of(reason),
  })
  const sigDictRef = doc.context.register(sigDict)

  const fieldDict = doc.context.obj({
    FT: PDFName.of('Sig'),
    T: PDFString.of(fieldName),
    V: sigDictRef,
  })
  return doc.context.register(fieldDict)
}

describe('findSignatureDicts', () => {
  it('returns an empty array when there is no AcroForm at all', async () => {
    const doc = await makeDoc()
    expect(findSignatureDicts(doc)).toEqual([])
  })

  it('returns an empty array for an AcroForm with only ordinary (non-Sig) fields', async () => {
    const doc = await makeDoc()
    const textField = doc.context.obj({ FT: PDFName.of('Tx'), T: PDFString.of('Name') })
    const textFieldRef = doc.context.register(textField)
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [textFieldRef] }))
    expect(findSignatureDicts(doc)).toEqual([])
  })

  it('skips a Sig field that exists but has not actually been signed yet (no /V)', async () => {
    const doc = await makeDoc()
    const emptySigField = doc.context.obj({ FT: PDFName.of('Sig'), T: PDFString.of('Signature1') })
    const ref = doc.context.register(emptySigField)
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [ref] }))
    expect(findSignatureDicts(doc)).toEqual([])
  })

  it('extracts a signed field\'s ByteRange, Contents and metadata', async () => {
    const doc = await makeDoc()
    const ref = addSigField(doc)
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [ref] }))

    const result = findSignatureDicts(doc)
    expect(result).toHaveLength(1)
    expect(result[0].fieldName).toBe('Signature1')
    expect(result[0].byteRange).toEqual([0, 100, 200, 50])
    expect(result[0].subFilter).toBe('adbe.pkcs7.detached')
    expect(result[0].signerName).toBe('Max Mustermann')
    expect(result[0].reason).toBe('Freigabe')
    expect([...result[0].contentsBytes]).toEqual([0xDE, 0xAD, 0xBE, 0xEF])
  })

  it('finds a Sig field nested under a non-terminal parent via /Kids', async () => {
    const doc = await makeDoc()
    const kidRef = addSigField(doc, { fieldName: 'NestedSig' })
    const parent = doc.context.obj({ Kids: [kidRef] })
    const parentRef = doc.context.register(parent)
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [parentRef] }))

    const result = findSignatureDicts(doc)
    expect(result).toHaveLength(1)
    expect(result[0].fieldName).toBe('NestedSig')
  })

  it('finds multiple independent signatures (e.g. a document signed twice)', async () => {
    const doc = await makeDoc()
    const ref1 = addSigField(doc, { fieldName: 'Signature1', byteRange: [0, 100, 200, 20] })
    const ref2 = addSigField(doc, { fieldName: 'Signature2', byteRange: [0, 150, 250, 20] })
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [ref1, ref2] }))

    const result = findSignatureDicts(doc)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.fieldName)).toEqual(['Signature1', 'Signature2'])
  })
})
