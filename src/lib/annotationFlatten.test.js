import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, PDFDict, PDFNumber, StandardFonts } from 'pdf-lib'
import { flattenAnnotations } from './annotationFlatten.js'

// Stands in for the real embedAppFont() (which fetches the bundled Liberation
// Sans asset - a browser-only operation) so text-drawing tests can run
// against a plain StandardFont with no network/asset dependency.
const embedTestFont = (doc) => doc.embedFont(StandardFonts.Helvetica)

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
    const result = await flattenAnnotations(bytes, annotations, {}, 0.35, [], embedTestFont)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('draws a text-box annotation with a custom font size and color', async () => {
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'text', page: 1, x: 40, y: 60, text: 'big red text', fontSize: 20, color: '#ef4444' },
    ]
    const result = await flattenAnnotations(bytes, annotations, {}, 0.35, [], embedTestFont)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('produces different bytes for a text-box annotation with a custom font size/color than the default', async () => {
    const bytes = await makePdfBytes()
    const plain = [{ type: 'text', page: 1, x: 40, y: 60, text: 'sample' }]
    const styled = [{ type: 'text', page: 1, x: 40, y: 60, text: 'sample', fontSize: 20, color: '#ef4444' }]
    const plainResult  = await flattenAnnotations(bytes, plain, {}, 0.35, [], embedTestFont)
    const styledResult = await flattenAnnotations(bytes, styled, {}, 0.35, [], embedTestFont)
    expect(Buffer.from(styledResult).equals(Buffer.from(plainResult))).toBe(false)
  })

  it('ignores annotations that target a page number beyond the document', async () => {
    const bytes = await makePdfBytes()
    const annotations = [{ type: 'highlight', page: 5, color: '#000000', rects: [{ x: 0, y: 0, w: 10, h: 10 }] }]
    await expect(flattenAnnotations(bytes, annotations, {})).resolves.toBeTruthy()
  })

  it('draws rectangle and circle shape annotations', async () => {
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'rectangle', page: 1, color: '#8b5cf6', x: 10, y: 10, w: 50, h: 30, pageW: 200, pageH: 200 },
      { type: 'circle',    page: 1, color: '#8b5cf6', x: 20, y: 60, w: 40, h: 40, pageW: 200, pageH: 200 },
    ]
    const result = await flattenAnnotations(bytes, annotations, {})
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('draws an arrow annotation with a shaft and arrowhead', async () => {
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'arrow', page: 1, color: '#8b5cf6', width: 2, x1: 10, y1: 10, x2: 100, y2: 80, pageW: 200, pageH: 200 },
    ]
    const result = await flattenAnnotations(bytes, annotations, {})
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('does not crash or produce NaN geometry for a degenerate zero-length arrow', async () => {
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'arrow', page: 1, color: '#8b5cf6', width: 2, x1: 50, y1: 50, x2: 50, y2: 50, pageW: 200, pageH: 200 },
    ]
    await expect(flattenAnnotations(bytes, annotations, {})).resolves.toBeTruthy()
  })

  it('draws a text-preset stamp as a bordered rectangle with centered text', async () => {
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'stamp', page: 1, kind: 'approved', text: 'GENEHMIGT', color: '#10b981', x: 10, y: 10, w: 150, h: 50, pageW: 200, pageH: 200 },
    ]
    const result = await flattenAnnotations(bytes, annotations, {}, 0.35, [], embedTestFont)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('draws a custom-image stamp by embedding the given PNG bytes', async () => {
    // Minimal valid 1x1 transparent PNG.
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const imageBytes = new Uint8Array(Buffer.from(pngBase64, 'base64'))
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'stamp', page: 1, kind: 'custom', imageBytes, imageExt: 'png', x: 10, y: 10, w: 60, h: 60, pageW: 200, pageH: 200 },
    ]
    const result = await flattenAnnotations(bytes, annotations, {})
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('draws a rotated text-preset stamp without throwing, rectangle and text rotating around the same pivot', async () => {
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'stamp', page: 1, kind: 'draft', text: 'ENTWURF', color: '#f59e0b', x: 10, y: 10, w: 150, h: 50, rotation: 45, pageW: 200, pageH: 200 },
    ]
    const result = await flattenAnnotations(bytes, annotations, {}, 0.35, [], embedTestFont)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('draws a rotated custom-image stamp without throwing', async () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const imageBytes = new Uint8Array(Buffer.from(pngBase64, 'base64'))
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'stamp', page: 1, kind: 'custom', imageBytes, imageExt: 'png', x: 10, y: 10, w: 60, h: 60, rotation: -30, pageW: 200, pageH: 200 },
    ]
    await expect(flattenAnnotations(bytes, annotations, {})).resolves.toBeTruthy()
  })

  it('produces the same output for rotation: 0 as for an omitted rotation (no regression for existing stamps)', async () => {
    const bytes = await makePdfBytes()
    const withZero = [{ type: 'stamp', page: 1, kind: 'approved', text: 'GENEHMIGT', color: '#10b981', x: 10, y: 10, w: 150, h: 50, rotation: 0, pageW: 200, pageH: 200 }]
    const withoutField = [{ type: 'stamp', page: 1, kind: 'approved', text: 'GENEHMIGT', color: '#10b981', x: 10, y: 10, w: 150, h: 50, pageW: 200, pageH: 200 }]
    const resultA = await flattenAnnotations(bytes, withZero, {}, 0.35, [], embedTestFont)
    const resultB = await flattenAnnotations(bytes, withoutField, {}, 0.35, [], embedTestFont)
    expect(Buffer.from(resultA).equals(Buffer.from(resultB))).toBe(true)
  })

  it('silently skips shape annotations targeting a page number beyond the document', async () => {
    const bytes = await makePdfBytes()
    const annotations = [
      { type: 'rectangle', page: 5, color: '#8b5cf6', x: 0, y: 0, w: 10, h: 10, pageW: 200, pageH: 200 },
      { type: 'arrow', page: 5, color: '#8b5cf6', x1: 0, y1: 0, x2: 10, y2: 10, pageW: 200, pageH: 200 },
    ]
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

  it('creates a new dropdown field with the given options from newFields', async () => {
    const bytes = await makePdfBytes()
    const newFields = [{ page: 1, type: 'dropdown', name: 'Land', options: ['DE', 'AT', 'CH'], x: 10, y: 10, w: 80, h: 20, pageW: 200, pageH: 200 }]
    const result = await flattenAnnotations(bytes, [], {}, 0.35, newFields)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getForm().getDropdown('Land').getOptions()).toEqual(['DE', 'AT', 'CH'])
  })

  it('creates a new listbox field with the given options from newFields', async () => {
    const bytes = await makePdfBytes()
    const newFields = [{ page: 1, type: 'listbox', name: 'Obst', options: ['Apfel', 'Birne'], x: 10, y: 10, w: 80, h: 40, pageW: 200, pageH: 200 }]
    const result = await flattenAnnotations(bytes, [], {}, 0.35, newFields)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getForm().getOptionList('Obst').getOptions()).toEqual(['Apfel', 'Birne'])
  })

  it('creates a dropdown with no options when none were configured yet', async () => {
    const bytes = await makePdfBytes()
    const newFields = [{ page: 1, type: 'dropdown', name: 'Leer', x: 10, y: 10, w: 80, h: 20, pageW: 200, pageH: 200 }]
    await expect(flattenAnnotations(bytes, [], {}, 0.35, newFields)).resolves.toBeTruthy()
  })

  it('fills a dropdown and a listbox via formValues, dispatched by field type not value type', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    const form = doc.getForm()
    const dd = form.createDropdown('country'); dd.addOptions(['DE', 'AT']); dd.addToPage(page)
    const list = form.createOptionList('fruit'); list.addOptions(['Apfel', 'Birne']); list.addToPage(page)
    const bytes = await doc.save()

    const result = await flattenAnnotations(bytes, [], { country: 'AT', fruit: 'Birne' })
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getForm().getDropdown('country').getSelected()).toEqual(['AT'])
    expect(reloaded.getForm().getOptionList('fruit').getSelected()).toEqual(['Birne'])
  })

  it('groups radio-button drafts sharing a groupId into one radio-group field with one widget per option', async () => {
    const bytes = await makePdfBytes()
    const newFields = [
      { page: 1, type: 'radio', name: 'Farbe', groupId: 'g1', optionValue: 'Rot',  x: 10, y: 10, w: 14, h: 14, pageW: 200, pageH: 200 },
      { page: 1, type: 'radio', name: 'Farbe', groupId: 'g1', optionValue: 'Grün', x: 30, y: 10, w: 14, h: 14, pageW: 200, pageH: 200 },
      { page: 1, type: 'radio', name: 'Farbe', groupId: 'g1', optionValue: 'Blau', x: 50, y: 10, w: 14, h: 14, pageW: 200, pageH: 200 },
    ]
    const result = await flattenAnnotations(bytes, [], {}, 0.35, newFields)
    const reloaded = await PDFDocument.load(result)
    const fields = reloaded.getForm().getFields().filter(f => f.getName() === 'Farbe')
    expect(fields).toHaveLength(1)
    expect(reloaded.getForm().getRadioGroup('Farbe').getOptions().sort()).toEqual(['Blau', 'Grün', 'Rot'])
  })

  it('creates two independent radio groups from two different groupIds', async () => {
    const bytes = await makePdfBytes()
    const newFields = [
      { page: 1, type: 'radio', name: 'Farbe',  groupId: 'g1', optionValue: 'Rot',  x: 10, y: 10, w: 14, h: 14, pageW: 200, pageH: 200 },
      { page: 1, type: 'radio', name: 'Farbe',  groupId: 'g1', optionValue: 'Blau', x: 30, y: 10, w: 14, h: 14, pageW: 200, pageH: 200 },
      { page: 1, type: 'radio', name: 'Größe',  groupId: 'g2', optionValue: 'S',    x: 10, y: 40, w: 14, h: 14, pageW: 200, pageH: 200 },
      { page: 1, type: 'radio', name: 'Größe',  groupId: 'g2', optionValue: 'M',    x: 30, y: 40, w: 14, h: 14, pageW: 200, pageH: 200 },
    ]
    const result = await flattenAnnotations(bytes, [], {}, 0.35, newFields)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getForm().getRadioGroup('Farbe').getOptions().sort()).toEqual(['Blau', 'Rot'])
    expect(reloaded.getForm().getRadioGroup('Größe').getOptions().sort()).toEqual(['M', 'S'])
  })

  it('fills a radio group via formValues using its export value', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    const form = doc.getForm()
    const rg = form.createRadioGroup('wahl')
    rg.addOptionToPage('Ja', page, { x: 10, y: 10, width: 14, height: 14 })
    rg.addOptionToPage('Nein', page, { x: 30, y: 10, width: 14, height: 14 })
    const bytes = await doc.save()

    const result = await flattenAnnotations(bytes, [], { wahl: 'Nein' })
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getForm().getRadioGroup('wahl').getSelected()).toBe('Nein')
  })
})
