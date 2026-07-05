import * as pdfjsLib from 'pdfjs-dist'

// pdfjsLib.getDocument() transfers ownership of the buffer it's given to its
// worker, detaching it — always pass a copy so the original bytes stay
// intact for the caller to store/save.
export async function reloadPdfDoc(bytes) {
  return pdfjsLib.getDocument({ data: bytes.slice() }).promise
}
