import { PDFName, PDFDict, PDFRawStream, PDFArray, PDFRef } from 'pdf-lib'

// Finds embedded page images safe to re-encode at a lower JPEG quality to
// shrink scan-/photo-heavy PDFs. Deliberately narrow scope: only images
// already stored as /DCTDecode (baseline JPEG) with no /SMask (alpha) -
// CCITT/JBIG2 (common for B/W scans), CMYK JPEGs, and anything with
// transparency are left untouched, since there's no safe browser-native
// decoder for the former and naive re-encoding would drop the alpha channel
// for the latter. This covers the most common/valuable case (color scans,
// photos) without risking corrupting the less common ones.
//
// The same XObject can be referenced from multiple pages' own Resources
// dicts (shared image) - each is deduplicated by its underlying ref, but
// every page location that references it is tracked so a later swap can
// update all of them, not just the first one found.
export function findCompressibleImages(doc) {
  const byRef = new Map() // refKey -> { ref, bytes, locations: [{xObjectDict, name}] }

  for (const page of doc.getPages()) {
    const resources = page.node.Resources()
    const xObjectDict = resources?.lookup(PDFName.of('XObject'))
    if (!(xObjectDict instanceof PDFDict)) continue

    for (const [name, value] of xObjectDict.entries()) {
      if (!(value instanceof PDFRef)) continue
      const stream = doc.context.lookup(value)
      if (!(stream instanceof PDFRawStream)) continue

      const subtype = stream.dict.lookup(PDFName.of('Subtype'))
      if (!(subtype instanceof PDFName) || subtype.asString() !== '/Image') continue

      const filterObj = stream.dict.lookup(PDFName.of('Filter'))
      const filters = filterObj instanceof PDFArray
        ? filterObj.asArray().map(f => (f instanceof PDFName ? f.asString() : ''))
        : filterObj instanceof PDFName ? [filterObj.asString()] : []
      if (!filters.includes('/DCTDecode')) continue
      if (stream.dict.lookup(PDFName.of('SMask'))) continue // has alpha - skip, JPEG can't represent it

      const refKey = value.toString()
      if (!byRef.has(refKey)) {
        byRef.set(refKey, { ref: value, bytes: stream.getContents(), locations: [] })
      }
      byRef.get(refKey).locations.push({ xObjectDict, name })
    }
  }

  return [...byRef.values()]
}

// Embeds newJpegBytes (already re-encoded at the desired quality) and swaps
// every page location that referenced the original image over to it - the
// content stream itself is untouched, since only the resource name -> ref
// mapping changes, not the `Do` operator that uses the name.
export async function replaceImage(doc, entry, newJpegBytes) {
  const newImage = await doc.embedJpg(newJpegBytes)
  for (const { xObjectDict, name } of entry.locations) {
    xObjectDict.set(name, newImage.ref)
  }
}
