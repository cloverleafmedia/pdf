import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { parseCSV, setFieldValue, resolveFilename, fillMailMergeRow } from './mailMerge.js'

describe('parseCSV', () => {
  it('parses a simple header + data rows', () => {
    const { headers, rows } = parseCSV('Name,Ort\nAnna,Berlin\nBen,München\n')
    expect(headers).toEqual(['Name', 'Ort'])
    expect(rows).toEqual([{ Name: 'Anna', Ort: 'Berlin' }, { Name: 'Ben', Ort: 'München' }])
  })

  it('handles quoted fields with embedded commas', () => {
    const { rows } = parseCSV('Name,Adresse\nAnna,"Musterstr. 1, 12345 Berlin"\n')
    expect(rows).toEqual([{ Name: 'Anna', Adresse: 'Musterstr. 1, 12345 Berlin' }])
  })

  it('handles doubled quotes as an escaped literal quote', () => {
    const { rows } = parseCSV('Name,Zitat\nAnna,"Sie sagte ""Hallo"""\n')
    expect(rows[0].Zitat).toBe('Sie sagte "Hallo"')
  })

  it('handles a newline embedded inside a quoted field', () => {
    const { rows } = parseCSV('Name,Notiz\nAnna,"Zeile 1\nZeile 2"\n')
    expect(rows[0].Notiz).toBe('Zeile 1\nZeile 2')
  })

  it('tolerates CRLF line endings', () => {
    const { headers, rows } = parseCSV('Name,Ort\r\nAnna,Berlin\r\n')
    expect(headers).toEqual(['Name', 'Ort'])
    expect(rows).toEqual([{ Name: 'Anna', Ort: 'Berlin' }])
  })

  it('does not require a trailing newline on the last row', () => {
    const { rows } = parseCSV('Name\nAnna')
    expect(rows).toEqual([{ Name: 'Anna' }])
  })

  it('fills a missing trailing field with an empty string for a ragged row', () => {
    const { rows } = parseCSV('Name,Ort,Land\nAnna,Berlin\n')
    expect(rows).toEqual([{ Name: 'Anna', Ort: 'Berlin', Land: '' }])
  })

  it('returns empty headers/rows for an empty or whitespace-only input', () => {
    expect(parseCSV('')).toEqual({ headers: [], rows: [] })
  })

  it('skips blank lines between rows', () => {
    const { rows } = parseCSV('Name,Ort\nAnna,Berlin\n\nBen,Köln\n')
    expect(rows).toEqual([{ Name: 'Anna', Ort: 'Berlin' }, { Name: 'Ben', Ort: 'Köln' }])
  })
})

describe('resolveFilename', () => {
  it('substitutes {index} as a 1-based number', () => {
    expect(resolveFilename('Datensatz_{index}', {}, 0)).toBe('Datensatz_1')
    expect(resolveFilename('Datensatz_{index}', {}, 4)).toBe('Datensatz_5')
  })

  it('substitutes a column placeholder from the row', () => {
    expect(resolveFilename('{Name}_{index}', { Name: 'Anna' }, 0)).toBe('Anna_1')
  })

  it('resolves an unknown placeholder to an empty string', () => {
    expect(resolveFilename('{Unbekannt}', {}, 0)).toBe('Datensatz_1') // empty template -> fallback
  })

  it('strips filesystem-illegal characters', () => {
    expect(resolveFilename('{Name}', { Name: 'A/B:C*D?E' }, 0)).toBe('A_B_C_D_E')
  })

  it('falls back to Datensatz_N when the resolved name is blank', () => {
    expect(resolveFilename('   ', {}, 2)).toBe('Datensatz_3')
  })
})

async function makeFormTemplate() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  const form = doc.getForm()
  const name = form.createTextField('Name')
  name.addToPage(page, { x: 10, y: 200, width: 100, height: 20 })
  const attended = form.createCheckBox('Anwesend')
  attended.addToPage(page, { x: 10, y: 150, width: 20, height: 20 })
  const category = form.createDropdown('Kategorie')
  category.addOptions(['A', 'B', 'C'])
  category.addToPage(page, { x: 10, y: 100, width: 100, height: 20 })
  return doc.save()
}

describe('setFieldValue', () => {
  it('sets a text field', async () => {
    const bytes = await makeFormTemplate()
    const doc = await PDFDocument.load(bytes)
    const form = doc.getForm()
    expect(setFieldValue(form, 'Name', 'Anna')).toBe(true)
    expect(form.getTextField('Name').getText()).toBe('Anna')
  })

  it('checks a checkbox for a truthy-looking CSV value', async () => {
    const bytes = await makeFormTemplate()
    const doc = await PDFDocument.load(bytes)
    const form = doc.getForm()
    expect(setFieldValue(form, 'Anwesend', 'Ja')).toBe(true)
    expect(form.getCheckBox('Anwesend').isChecked()).toBe(true)
  })

  it('unchecks a checkbox for a non-truthy value', async () => {
    const bytes = await makeFormTemplate()
    const doc = await PDFDocument.load(bytes)
    const form = doc.getForm()
    form.getCheckBox('Anwesend').check()
    expect(setFieldValue(form, 'Anwesend', 'nein')).toBe(true)
    expect(form.getCheckBox('Anwesend').isChecked()).toBe(false)
  })

  it('selects a valid dropdown option', async () => {
    const bytes = await makeFormTemplate()
    const doc = await PDFDocument.load(bytes)
    const form = doc.getForm()
    expect(setFieldValue(form, 'Kategorie', 'B')).toBe(true)
    expect(form.getDropdown('Kategorie').getSelected()).toEqual(['B'])
  })

  it('returns false (not throw) for a dropdown value that is not one of its options - the CSV-typo case', async () => {
    const bytes = await makeFormTemplate()
    const doc = await PDFDocument.load(bytes)
    const form = doc.getForm()
    expect(setFieldValue(form, 'Kategorie', 'Z-does-not-exist')).toBe(false)
  })

  it('returns false (not throw) for a CSV column that matches no field name - the header-typo case', async () => {
    const bytes = await makeFormTemplate()
    const doc = await PDFDocument.load(bytes)
    const form = doc.getForm()
    expect(setFieldValue(form, 'Nichtvorhanden', 'irgendwas')).toBe(false)
  })

  it('does not silently flip a non-editable dropdown to editable in the output for a bad value', async () => {
    const bytes = await makeFormTemplate()
    const doc = await PDFDocument.load(bytes)
    const form = doc.getForm()
    setFieldValue(form, 'Kategorie', 'Z-does-not-exist')
    expect(form.getDropdown('Kategorie').isEditable()).toBe(false)
  })

  it('still accepts a custom value when the template dropdown was already made editable by its designer', async () => {
    const bytes = await makeFormTemplate()
    const doc = await PDFDocument.load(bytes)
    const form = doc.getForm()
    form.getDropdown('Kategorie').enableEditing()
    expect(setFieldValue(form, 'Kategorie', 'Freitext-Wert')).toBe(true)
  })
})

describe('fillMailMergeRow', () => {
  it('fills every matching column and reports none failed on a clean row', async () => {
    const bytes = await makeFormTemplate()
    const { bytes: out, failedHeaders } = await fillMailMergeRow(bytes, ['Name', 'Anwesend', 'Kategorie'], { Name: 'Anna', Anwesend: 'ja', Kategorie: 'A' }, false)
    expect(failedHeaders).toEqual([])
    const filled = await PDFDocument.load(out)
    expect(filled.getForm().getTextField('Name').getText()).toBe('Anna')
  })

  it('reports the specific columns that failed, without failing the whole row', async () => {
    const bytes = await makeFormTemplate()
    const { bytes: out, failedHeaders } = await fillMailMergeRow(
      bytes,
      ['Name', 'Kategorie', 'Spalte_ohne_Feld'],
      { Name: 'Anna', Kategorie: 'nicht-existent', Spalte_ohne_Feld: 'x' },
      false,
    )
    expect(failedHeaders.sort()).toEqual(['Kategorie', 'Spalte_ohne_Feld'])
    // the field that DID match still got set despite the other two failing
    const filled = await PDFDocument.load(out)
    expect(filled.getForm().getTextField('Name').getText()).toBe('Anna')
  })

  it('flattens the form when flatten=true', async () => {
    const bytes = await makeFormTemplate()
    const { bytes: out } = await fillMailMergeRow(bytes, ['Name'], { Name: 'Anna' }, true)
    const filled = await PDFDocument.load(out)
    expect(filled.getForm().getFields().length).toBe(0)
  })
})
