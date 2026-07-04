import { describe, it, expect } from 'vitest'
import { defaultFieldName, dedupeFieldName } from './formFieldCreate.js'

describe('defaultFieldName', () => {
  it('builds a German default name for a text field', () => {
    expect(defaultFieldName('text', 1)).toBe('Textfeld 1')
  })

  it('builds a German default name for a checkbox', () => {
    expect(defaultFieldName('checkbox', 3)).toBe('Kontrollkästchen 3')
  })
})

describe('dedupeFieldName', () => {
  it('leaves a name unchanged when it is already unique', () => {
    expect(dedupeFieldName('Textfeld 1', [])).toBe('Textfeld 1')
  })

  it('appends " (2)" when the name already exists once', () => {
    expect(dedupeFieldName('Textfeld 1', ['Textfeld 1'])).toBe('Textfeld 1 (2)')
  })

  it('appends " (3)" when both the plain name and " (2)" already exist', () => {
    expect(dedupeFieldName('Textfeld 1', ['Textfeld 1', 'Textfeld 1 (2)'])).toBe('Textfeld 1 (3)')
  })

  it('is exact-match only - does not over-match unrelated names containing the same substring', () => {
    expect(dedupeFieldName('Textfeld 1', ['Textfeld 10', 'Textfeld 1 Kopie'])).toBe('Textfeld 1')
  })
})
