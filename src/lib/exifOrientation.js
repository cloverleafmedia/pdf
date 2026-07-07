// Reads a JPEG's EXIF Orientation tag (values 1-8 per the EXIF spec).
// Returns 1 ("normal", no correction needed) for anything else - not a
// JPEG, no EXIF/APP1 segment, or no Orientation tag found. Deliberately
// stops walking segments at the first Start-of-Scan (0xFFDA) marker, since
// EXIF always precedes the actual entropy-coded image data.
export function readJpegOrientation(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xFF) break
    const marker = bytes[offset + 1]
    if (marker === 0xDA) break // Start of Scan - image data follows, stop

    const segmentLength = view.getUint16(offset + 2, false)
    if (marker === 0xE1) {
      const exifStart = offset + 4
      const isExif = bytes[exifStart] === 0x45 && bytes[exifStart + 1] === 0x78 &&
        bytes[exifStart + 2] === 0x69 && bytes[exifStart + 3] === 0x66 &&
        bytes[exifStart + 4] === 0x00 && bytes[exifStart + 5] === 0x00
      if (isExif) {
        const tiffStart = exifStart + 6
        const little = bytes[tiffStart] === 0x49 // 'I' = "II" little-endian, else "MM" big-endian
        const ifd0Offset = view.getUint32(tiffStart + 4, little)
        const ifdStart = tiffStart + ifd0Offset
        const numEntries = view.getUint16(ifdStart, little)
        for (let i = 0; i < numEntries; i++) {
          const entryOffset = ifdStart + 2 + i * 12
          if (view.getUint16(entryOffset, little) === 0x0112) {
            return view.getUint16(entryOffset + 8, little)
          }
        }
      }
      return 1
    }
    offset += 2 + segmentLength
  }
  return 1
}

// For the four axis-aligned EXIF orientations (1/3/6/8 - the only ones a
// camera/phone actually produces in practice; 2/4/5/7 involve a mirror flip
// and are treated as "no correction", a documented, extremely rare gap),
// returns the page size and pdf-lib drawImage() placement that displays the
// image right-side up. Derived from pdf-lib's actual `rotate` content-stream
// matrix (api/operators.ts rotateRadians: a standard mathematical,
// counterclockwise-for-positive-angle rotation around the given {x,y} in
// PDF's y-up space) - NOT the same sign convention as a page's own /Rotate.
export function exifCorrectedPlacement(orientation, widthPt, heightPt) {
  switch (orientation) {
    case 3:
      return { pageWidth: widthPt, pageHeight: heightPt, x: widthPt, y: heightPt, rotate: 180 }
    case 6:
      return { pageWidth: heightPt, pageHeight: widthPt, x: 0, y: widthPt, rotate: -90 }
    case 8:
      return { pageWidth: heightPt, pageHeight: widthPt, x: heightPt, y: 0, rotate: 90 }
    default:
      return { pageWidth: widthPt, pageHeight: heightPt, x: 0, y: 0, rotate: 0 }
  }
}
