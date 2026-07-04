import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, PDFDict, PDFNumber } from 'pdf-lib'
import { flattenAnnotations } from './annotationFlatten.js'

async function makePdfBytes() {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  return doc.save()
}

// pdf-lib registers each drawRectangle({opacity}) call as a `{Type: ExtGState, ca: opacity}`
// dict under page.Resources.ExtGState (keyed GS0, GS1, ...) - read every `ca` value
// back out so the opacity actually baked into the PDF can be asserted directly.
function extGStateOpacities(page) {
  const extGState = page.node.Resources()?.lookup(PDFName.of('ExtGState'))
  if (!(extGState instanceof PDFDict)) return []
  return extGState.entries()
    .map(([, ref]) => page.doc.context.lookup(ref))
    .filter((dict) => dict instanceof PDFDict)
    .map((dict) => dict.lookup(PDFName.of('ca')))
    .filter((ca) => ca instanceof PDFNumber)
    .map((ca) => ca.asNumber())
}

describe('flattenAnnotations', () => {
  it('returns the original bytes unchanged when there is nothing to flatten', async () => {
    const bytes = await makePdfBytes()
    const result = await flattenAnnotations(bytes, [], {})
    expect(result).toBe(bytes)
  })

  it('bakes a highlight annotation using the given opacity, not the 0.35 default', async () => {
    const bytes = await makePdfBytes()
    const annotations = [{
      type: 'highlight', page: 1, color: '#f59e0b',
      rects: [{ x: 10, y: 10, w: 50, h: 12 }],
    }]

    const result = await flattenAnnotations(bytes, annotations, {}, 0.8)
    const reloaded = await PDFDocument.load(result)
    expect(extGStateOpacities(reloaded.getPage(0))).toEqual([0.8])
  })

  it('defaults to 0.35 opacity when no opacity argument is passed', async () => {
    const bytes = await makePdfBytes()
    const annotations = [{
      type: 'highlight', page: 1, color: '#f59e0b',
      rects: [{ x: 10, y: 10, w: 50, h: 12 }],
    }]
    const result = await flattenAnnotations(bytes, annotations, {})
    const reloaded = await PDFDocument.load(result)
    expect(extGStateOpacities(reloaded.getPage(0))).toEqual([0.35])
  })

  it('draws underline/strikethrough as lines and does not throw', async () => {
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'underline', page: 1, color: '#000000', rects: [{ x: 5, y: 5, w: 40, h: 10 }] },
      { type: 'strikethrough', page: 1, color: '#000000', rects: [{ x: 5, y: 20, w: 40, h: 10 }] },
    ]
    const result = await flattenAnnotations(bytes, annotations, {})
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('draws a freehand path annotation', async () => {
    const bytes = await makePdfBytes()
    const annotations = [{
      type: 'draw', page: 1, color: '#ff0000', width: 3,
      path: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 5 }],
    }]
    const result = await flattenAnnotations(bytes, annotations, {})
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('draws a sticky note and a text-box annotation', async () => {
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'note', page: 1, x: 20, y: 20, text: 'a short note' },
      { type: 'text', page: 1, x: 40, y: 60, text: 'line one\nline two' },
    ]
    const result = await flattenAnnotations(bytes, annotations, {})
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('ignores annotations that target a page number beyond the document', async () => {
    const bytes = await makePdfBytes()
    const annotations = [{ type: 'highlight', page: 5, color: '#000000', rects: [{ x: 0, y: 0, w: 10, h: 10 }] }]
    await expect(flattenAnnotations(bytes, annotations, {})).resolves.toBeTruthy()
  })

  it('fills in text form fields and toggles checkboxes', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    const form = doc.getForm()
    const textField = form.createTextField('name')
    textField.addToPage(page)
    const checkbox = form.createCheckBox('agree')
    checkbox.addToPage(page)
    const bytes = await doc.save()

    const result = await flattenAnnotations(bytes, [], { name: 'Alice', agree: true })
    const reloaded = await PDFDocument.load(result)
    const reloadedForm = reloaded.getForm()
    expect(reloadedForm.getTextField('name').getText()).toBe('Alice')
    expect(reloadedForm.getCheckBox('agree').isChecked()).toBe(true)
  })

  it('silently skips a form value for a field that does not exist', async () => {
    const bytes = await makePdfBytes()
    await expect(flattenAnnotations(bytes, [], { doesNotExist: 'x' })).resolves.toBeTruthy()
  })

  it('creates a new, blank text field from newFields', async () => {
    const bytes = await makePdfBytes()
    const newFields = [{ page: 1, type: 'text', name: 'Neues Textfeld', x: 10, y: 10, w: 80, h: 20, pageW: 200, pageH: 200 }]
    const result = await flattenAnnotations(bytes, [], {}, 0.35, newFields)
    const reloaded = await PDFDocument.load(result)
    const field = reloaded.getForm().getTextField('Neues Textfeld')
    expect(field).toBeTruthy()
    expect(field.getText() || '').toBe('')
  })

  it('creates a new, unchecked checkbox from newFields', async () => {
    const bytes = await makePdfBytes()
    const newFields = [{ page: 1, type: 'checkbox', name: 'Neue Checkbox', x: 10, y: 10, w: 14, h: 14, pageW: 200, pageH: 200 }]
    const result = await flattenAnnotations(bytes, [], {}, 0.35, newFields)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getForm().getCheckBox('Neue Checkbox').isChecked()).toBe(false)
  })

  it('silently skips a newFields entry targeting an out-of-range page', async () => {
    const bytes = await makePdfBytes()
    const newFields = [{ page: 5, type: 'text', name: 'X', x: 0, y: 0, w: 10, h: 10, pageW: 200, pageH: 200 }]
    await expect(flattenAnnotations(bytes, [], {}, 0.35, newFields)).resolves.toBeTruthy()
  })

  it('does not crash when two newFields entries share the same name (second is skipped)', async () => {
    const bytes = await makePdfBytes()
    const newFields = [
      { page: 1, type: 'text', name: 'Dupe', x: 0, y: 0, w: 40, h: 20, pageW: 200, pageH: 200 },
      { page: 1, type: 'text', name: 'Dupe', x: 50, y: 0, w: 40, h: 20, pageW: 200, pageH: 200 },
    ]
    const result = await flattenAnnotations(bytes, [], {}, 0.35, newFields)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getForm().getFields().filter(f => f.getName() === 'Dupe')).toHaveLength(1)
  })

  it('bakes newFields and formValues together in the same save', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    const form = doc.getForm()
    const existing = form.createTextField('vorhanden')
    existing.addToPage(page)
    const bytes = await doc.save()

    const newFields = [{ page: 1, type: 'checkbox', name: 'Neu', x: 10, y: 10, w: 14, h: 14, pageW: 200, pageH: 200 }]
    const result = await flattenAnnotations(bytes, [], { vorhanden: 'Wert' }, 0.35, newFields)
    const reloaded = await PDFDocument.load(result)
    const reloadedForm = reloaded.getForm()
    expect(reloadedForm.getTextField('vorhanden').getText()).toBe('Wert')
    expect(reloadedForm.getCheckBox('Neu').isChecked()).toBe(false)
  })
})
