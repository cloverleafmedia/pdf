import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { setFormFieldValue } from './formFieldValue.js'

async function makeForm() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([200, 200])
  return { doc, page, form: doc.getForm() }
}

describe('setFormFieldValue', () => {
  it('sets text on a PDFTextField', async () => {
    const { page, form } = await makeForm()
    form.createTextField('name').addToPage(page)
    setFormFieldValue(form, 'name', 'Alice')
    expect(form.getTextField('name').getText()).toBe('Alice')
  })

  it('checks/unchecks a PDFCheckBox based on a plain boolean', async () => {
    const { page, form } = await makeForm()
    form.createCheckBox('agree').addToPage(page)
    setFormFieldValue(form, 'agree', true)
    expect(form.getCheckBox('agree').isChecked()).toBe(true)
    setFormFieldValue(form, 'agree', false)
    expect(form.getCheckBox('agree').isChecked()).toBe(false)
  })

  it('selects an option on a PDFDropdown', async () => {
    const { page, form } = await makeForm()
    const dd = form.createDropdown('country')
    dd.addOptions(['DE', 'AT', 'CH'])
    dd.addToPage(page)
    setFormFieldValue(form, 'country', 'AT')
    expect(form.getDropdown('country').getSelected()).toEqual(['AT'])
  })

  it('selects an option on a PDFOptionList', async () => {
    const { page, form } = await makeForm()
    const list = form.createOptionList('fruit')
    list.addOptions(['Apfel', 'Birne'])
    list.addToPage(page)
    setFormFieldValue(form, 'fruit', 'Birne')
    expect(form.getOptionList('fruit').getSelected()).toEqual(['Birne'])
  })

  it('selects an option on a PDFRadioGroup', async () => {
    const { page, form } = await makeForm()
    const rg = form.createRadioGroup('wahl')
    rg.addOptionToPage('Ja', page, { x: 10, y: 10, width: 14, height: 14 })
    rg.addOptionToPage('Nein', page, { x: 30, y: 10, width: 14, height: 14 })
    setFormFieldValue(form, 'wahl', 'Nein')
    expect(form.getRadioGroup('wahl').getSelected()).toBe('Nein')
  })

  it('does nothing when the field does not exist', () => {
    expect(async () => {
      const { form } = await makeForm()
      setFormFieldValue(form, 'missing', 'x')
    }).not.toThrow()
  })
})
