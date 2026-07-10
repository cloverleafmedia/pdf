// Converts a `data:...;base64,....` URL (e.g. from HTMLCanvasElement.toDataURL())
// into raw bytes - pdf-lib's embedPng/embedJpg need a Uint8Array, not a data URL.
export function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
