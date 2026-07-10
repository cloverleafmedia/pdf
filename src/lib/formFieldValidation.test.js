import { describe, it, expect } from 'vitest'
import { findEmptyRequiredFieldNames } from './formFieldValidation.js'

describe('findEmptyRequiredFieldNames', () => {
  it('flags a required text field with no value', () => {
    const widgets = [{ fieldName: 'vorname', fieldType: 'Tx', required: true }]
    expect(findEmptyRequiredFieldNames(widgets, [], {})).toEqual(['vorname'])
  })

  it('does not flag a required text field that has a value', () => {
    const widgets = [{ fieldName: 'vorname', fieldType: 'Tx', required: true }]
    expect(findEmptyRequiredFieldNames(widgets, [], { vorname: 'Max' })).toEqual([])
  })

  it('a value of only whitespace still counts as empty', () => {
    const widgets = [{ fieldName: 'vorname', fieldType: 'Tx', required: true }]
    expect(findEmptyRequiredFieldNames(widgets, [], { vorname: '   ' })).toEqual(['vorname'])
  })

  it('ignores a non-required field regardless of value', () => {
    const widgets = [{ fieldName: 'notiz', fieldType: 'Tx', required: false }]
    expect(findEmptyRequiredFieldNames(widgets, [], {})).toEqual([])
  })

  it('a required checkbox counts as empty only when unchecked', () => {
    const widgets = [{ fieldName: 'agree', fieldType: 'Btn', required: true }]
    expect(findEmptyRequiredFieldNames(widgets, [], {})).toEqual(['agree'])
    expect(findEmptyRequiredFieldNames(widgets, [], { agree: true })).toEqual([])
    expect(findEmptyRequiredFieldNames(widgets, [], { agree: false })).toEqual(['agree'])
  })

  it('skips radio-group widgets even when required and no option selected', () => {
    const widgets = [{ fieldName: 'gender', fieldType: 'Btn', radioButton: true, required: true }]
    expect(findEmptyRequiredFieldNames(widgets, [], {})).toEqual([])
  })

  it('skips a plain pushbutton', () => {
    const widgets = [{ fieldName: 'reset', fieldType: 'Btn', pushButton: true, required: true }]
    expect(findEmptyRequiredFieldNames(widgets, [], {})).toEqual([])
  })

  it('a required dropdown/listbox with an empty array selection counts as empty', () => {
    const widgets = [{ fieldName: 'country', fieldType: 'Ch', required: true }]
    expect(findEmptyRequiredFieldNames(widgets, [], { country: [] })).toEqual(['country'])
    expect(findEmptyRequiredFieldNames(widgets, [], { country: ['DE'] })).toEqual([])
    expect(findEmptyRequiredFieldNames(widgets, [], { country: 'DE' })).toEqual([])
  })

  it('flags an empty required not-yet-saved newfield draft', () => {
    const pending = [{ name: 'email', type: 'text', required: true }]
    expect(findEmptyRequiredFieldNames([], pending, {})).toEqual(['email'])
    expect(findEmptyRequiredFieldNames([], pending, { email: 'x@y.de' })).toEqual([])
  })

  it('skips a required radio draft (group validity is not modeled per-widget)', () => {
    const pending = [{ name: 'gender', type: 'radio', required: true }]
    expect(findEmptyRequiredFieldNames([], pending, {})).toEqual([])
  })

  it('a required signature field counts as empty until it has a __signatureDataUrl', () => {
    const widgets = [{ fieldName: 'unterschrift', fieldType: 'Tx', required: true }]
    expect(findEmptyRequiredFieldNames(widgets, [], {})).toEqual(['unterschrift'])
    expect(findEmptyRequiredFieldNames(widgets, [], { unterschrift: { __signatureDataUrl: 'data:image/png;base64,x', page: 1, rect: [0, 0, 10, 10] } })).toEqual([])
  })

  it('deduplicates when the same field name appears as both a widget and a pending draft', () => {
    const widgets = [{ fieldName: 'vorname', fieldType: 'Tx', required: true }]
    const pending = [{ name: 'vorname', type: 'text', required: true }]
    expect(findEmptyRequiredFieldNames(widgets, pending, {})).toEqual(['vorname'])
  })
})
