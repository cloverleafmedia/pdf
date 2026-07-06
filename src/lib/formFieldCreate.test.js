import { describe, it, expect } from 'vitest'
import { defaultFieldName, dedupeFieldName, nextRadioOptionValue } from './formFieldCreate.js'

describe('defaultFieldName', () => {
  it('builds a German default name for a text field', () => {
    expect(defaultFieldName('text', 1)).toBe('Textfeld 1')
  })

  it('builds a German default name for a checkbox', () => {
    expect(defaultFieldName('checkbox', 3)).toBe('Kontrollkästchen 3')
  })

  it('builds a German default name for a dropdown', () => {
    expect(defaultFieldName('dropdown', 1)).toBe('Dropdown-Liste 1')
  })

  it('builds a German default name for a listbox', () => {
    expect(defaultFieldName('listbox', 1)).toBe('Listenfeld 1')
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

describe('nextRadioOptionValue', () => {
  it('starts at "Option 1" for an empty group', () => {
    expect(nextRadioOptionValue([])).toBe('Option 1')
  })

  it('picks the next free number, skipping already-used values', () => {
    expect(nextRadioOptionValue(['Option 1', 'Option 2'])).toBe('Option 3')
  })

  it('only needs uniqueness within the given group, not globally - does not backfill lower gaps', () => {
    // Starts counting from length+1 (3) and increments past collisions -
    // it does not go back and reuse a freed-up lower number like "Option 2".
    expect(nextRadioOptionValue(['Option 1', 'Option 3'])).toBe('Option 4')
  })
})
