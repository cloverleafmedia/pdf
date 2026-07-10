import { readJpegOrientation } from './exifOrientation.js'

// Stamp/Watermark/header-footer-logo images are picked once and then handed
// straight to pdf-lib's embedJpg/embedPng, which - unlike every EXIF-aware
// viewer (and unlike the browser <img> preview these modals already show) -
// reads only the raw encoded pixel grid and ignores the EXIF Orientation
// tag entirely. A phone photo (the common case for "use my signature/logo
// photo") shot in portrait but stored with orientation 6/8/3 would embed
// sideways or upside-down, while the modal's own size calculations (which
// use the browser-decoded, already-correct img.naturalWidth/Height for the
// aspect ratio) would still assume the correct aspect - stretching the
// wrong-orientation pixels into a box shaped for the right one.
//
// Rather than replicate EXIF-aware rotation at every pdf-lib draw call (and
// have it compose with each feature's own independent rotation setting),
// this re-renders the image through a canvas once at pick-time: the same
// browser decode path that already orients the `<img>` preview correctly
// also orients a canvas drawImage() the same way, so the exported PNG bytes
// are correctly oriented with no EXIF tag at all - nothing downstream needs
// to know this ever happened.
export async function normalizeImageOrientation(bytes, ext) {
  const isJpg = ext === 'jpg' || ext === 'jpeg'
  if (!isJpg || readJpegOrientation(bytes) === 1) {
    return { bytes, ext }
  }

  const blob = new Blob([bytes], { type: 'image/jpeg' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    const normalizedBytes = await new Promise((resolve, reject) => {
      canvas.toBlob(async (b) => {
        if (!b) { reject(new Error('Bild konnte nicht normalisiert werden')); return }
        resolve(new Uint8Array(await b.arrayBuffer()))
      }, 'image/png')
    })
    return { bytes: normalizedBytes, ext: 'png' }
  } finally {
    URL.revokeObjectURL(url)
  }
}
