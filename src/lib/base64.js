// Byte array <-> base64 conversion for persisting binary data (e.g. a custom
// stamp image) through window.api.saveSettings(), which JSON.stringifies its
// payload (electron/main.js) - a raw Uint8Array would serialize as an
// inflated {"0":137,"1":80,...} object instead. The bytes->base64 direction
// builds the binary string via a loop rather than spreading into
// String.fromCharCode(...bytes), which can hit the call-stack limit for
// larger images. The base64->bytes direction mirrors the exact idiom already
// used elsewhere in this codebase (QRCodeModal.jsx) for decoding a data URL.
export function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}
