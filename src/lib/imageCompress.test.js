import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName } from 'pdf-lib'
import { findCompressibleImages, replaceImage } from './imageCompress.js'

// Minimal valid 1x1 white JPEG, widely used as a tiny fixture in test suites.
const TINY_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='

function tinyJpegBytes() {
  return new Uint8Array(Buffer.from(TINY_JPEG_BASE64, 'base64'))
}

// pdf-lib defers actually registering an embedded image's bytes as an
// indirect object until doc.save() (embedJpg() eagerly returns a PDFImage
// handle with a pre-allocated ref, but that ref isn't resolvable via
// doc.context.lookup() until the save pipeline writes it) - so tests build a
// document, save it, and reload it, exactly mirroring how CompressModal.jsx
// actually receives pdfBytes (already-saved file bytes), rather than
// inspecting a freshly-built, never-saved in-memory document.
async function saveAndReload(doc) {
  const bytes = await doc.save()
  return PDFDocument.load(bytes)
}

describe('findCompressibleImages', () => {
  it('finds a plain embedded JPEG (DCTDecode, no SMask)', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    const image = await doc.embedJpg(tinyJpegBytes())
    page.drawImage(image, { x: 0, y: 0, width: 50, height: 50 })
    const reloaded = await saveAndReload(doc)

    const found = findCompressibleImages(reloaded)
    expect(found.length).toBe(1)
    expect(found[0].bytes.length).toBeGreaterThan(0)
    expect(found[0].locations.length).toBe(1)
  })

  it('skips an image that has an /SMask (alpha channel)', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    const image = await doc.embedJpg(tinyJpegBytes())
    page.drawImage(image, { x: 0, y: 0, width: 50, height: 50 })
    const reloaded = await saveAndReload(doc)

    // Simulate a transparency mask by tagging the embedded image's own stream
    // dict with a (dummy) /SMask reference - real ones come from embedPng
    // with an alpha channel, but for this unit test only the dict flag matters.
    const xObjectDict = reloaded.getPage(0).node.Resources().lookup(PDFName.of('XObject'))
    const [[, imageRef]] = xObjectDict.entries()
    const imageStream = reloaded.context.lookup(imageRef)
    imageStream.dict.set(PDFName.of('SMask'), imageRef)

    const found = findCompressibleImages(reloaded)
    expect(found.length).toBe(0)
  })

  it('deduplicates an image shared across multiple pages into one entry with multiple locations', async () => {
    const doc = await PDFDocument.create()
    const image = await doc.embedJpg(tinyJpegBytes())
    const page1 = doc.addPage([200, 200])
    const page2 = doc.addPage([200, 200])
    page1.drawImage(image, { x: 0, y: 0, width: 50, height: 50 })
    page2.drawImage(image, { x: 0, y: 0, width: 50, height: 50 })
    const reloaded = await saveAndReload(doc)

    const found = findCompressibleImages(reloaded)
    expect(found.length).toBe(1)
    expect(found[0].locations.length).toBe(2)
  })

  it('returns an empty array for a page with no images', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const reloaded = await saveAndReload(doc)
    expect(findCompressibleImages(reloaded)).toEqual([])
  })
})

describe('replaceImage', () => {
  it('swaps every location referencing the original image over to the new one', async () => {
    const doc = await PDFDocument.create()
    const image = await doc.embedJpg(tinyJpegBytes())
    const page1 = doc.addPage([200, 200])
    const page2 = doc.addPage([200, 200])
    page1.drawImage(image, { x: 0, y: 0, width: 50, height: 50 })
    page2.drawImage(image, { x: 0, y: 0, width: 50, height: 50 })
    const reloaded = await saveAndReload(doc)

    const [entry] = findCompressibleImages(reloaded)
    await replaceImage(reloaded, entry, tinyJpegBytes())

    for (const { xObjectDict, name } of entry.locations) {
      const newRef = xObjectDict.get(name)
      expect(newRef.toString()).not.toBe(entry.ref.toString())
    }
  })
})
