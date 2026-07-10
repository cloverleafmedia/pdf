import { PDFDict, PDFArray, PDFStream, PDFRef } from 'pdf-lib'

// pdf-lib's save() serializes every indirect object ever registered on the
// context (PDFWriter.computeBufferSize() calls context.enumerateIndirectObjects(),
// which returns the raw object map with no reachability check) - deleting a
// dict key such as Sanitize's "remove attachments/JavaScript/metadata"
// options do only unlinks the *reference*, it does not remove the
// underlying object's bytes from the saved file. Anyone who walks the raw
// object table directly (qpdf --qdf, mutool, or just grepping decompressed
// streams) can still recover content the app just told the user was removed.
//
// This is a generic mark-and-sweep: walk everything reachable from the
// trailer (Root/Info/Encrypt) and delete every other registered object from
// the context before save(). It fixes today's Sanitize checkboxes and any
// future one without needing per-feature bookkeeping of what became orphaned.
export function garbageCollectDocument(doc) {
  const context = doc.context
  const visited = new Set()
  const queue = []

  const pushRef = (ref) => {
    if (ref instanceof PDFRef && !visited.has(ref)) {
      visited.add(ref)
      queue.push(ref)
    }
  }

  const walk = (obj) => {
    if (obj instanceof PDFRef) {
      pushRef(obj)
    } else if (obj instanceof PDFStream) {
      for (const [, value] of obj.dict.entries()) walk(value)
    } else if (obj instanceof PDFDict) {
      for (const [, value] of obj.entries()) walk(value)
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) walk(obj.get(i))
    }
  }

  const { Root, Info, Encrypt } = context.trailerInfo
  ;[Root, Info, Encrypt].forEach(pushRef)

  while (queue.length) {
    walk(context.lookup(queue.pop()))
  }

  let removed = 0
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!visited.has(ref)) {
      context.delete(ref)
      removed++
    }
  }
  return removed
}
