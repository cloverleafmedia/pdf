import { PDFDocument, PDFName, PDFHexString } from 'pdf-lib'

// Hand-builds the PDF's native /Outlines (bookmarks) tree - pdf-lib has no
// outline convenience API (unlike forms/radio groups), so this constructs
// the classic PDF outline linked list (/First/Last/Next/Prev per sibling)
// directly via the low-level context API, the same way annotationFlatten.js
// hand-builds radio-group widgets where pdf-lib itself has no helper.
//
// Deliberately flat and user-ordered (no nesting): marks is the display
// order the caller wants (drag-reordered in the UI), not necessarily sorted
// by page number. This REPLACES the whole /Outlines - see Sidebar.jsx's
// "Eigene Lesezeichen" panel, the only caller, for the scope decision that
// a document's own pre-existing native outline is left untouched/read-only
// unless the user explicitly adds their own bookmarks.
export async function writeOutline(pdfBytes, marks) {
  const doc = await PDFDocument.load(pdfBytes)
  const { context, catalog } = doc

  if (!marks.length) {
    catalog.delete(PDFName.of('Outlines'))
    return doc.save()
  }

  const rootRef  = context.nextRef()
  const itemRefs = marks.map(() => context.nextRef())
  const pageCount = doc.getPageCount()

  marks.forEach((mark, i) => {
    const pageIndex = Math.min(Math.max(mark.page - 1, 0), pageCount - 1)
    const pageRef   = doc.getPage(pageIndex).ref
    const dict = context.obj({
      Title:  PDFHexString.fromText(mark.label),
      Parent: rootRef,
      Dest:   [pageRef, 'Fit'],
    })
    if (i > 0)                  dict.set(PDFName.of('Prev'), itemRefs[i - 1])
    if (i < marks.length - 1)   dict.set(PDFName.of('Next'), itemRefs[i + 1])
    context.assign(itemRefs[i], dict)
  })

  const rootDict = context.obj({
    Type:  'Outlines',
    First: itemRefs[0],
    Last:  itemRefs[itemRefs.length - 1],
    Count: marks.length,
  })
  context.assign(rootRef, rootDict)
  catalog.set(PDFName.of('Outlines'), rootRef)

  return doc.save()
}
